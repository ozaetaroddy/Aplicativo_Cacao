// backend/utils/backup.js
// ============================================================
// Backup y restauración de colecciones MongoDB
// ------------------------------------------------------------
// 🆕 REFACTOR 2025-XX — STREAMING + GRIDFS
// ------------------------------------------------------------
// Este módulo ahora soporta DOS modos de operación:
//
//   1. IN-MEMORY (legacy, OK para BDs pequeñas <50 MB)
//        const snap = await generarBackup(db);
//        const buf  = await comprimirBackupAsync(snap);
//
//   2. STREAMING (recomendado para BDs medianas/grandes)
//        await generarBackupStream(db, writeStream, opts);
//        // escribe directo, memoria constante
//        await generarBackupAGridFS(db, opts);
//        // escribe a GridFS, sin Buffer intermedio
//
// ¿Cuándo usar cada uno?
//   - BD <50 MB → in-memory (más simple)
//   - BD >50 MB → streaming a GridFS / HTTP / disco
//
// `routes/backups.js` decide automáticamente:
//   1. Intenta in-memory.
//   2. Si el buffer resultante supera `limiteBackupBytes`,
//      reintenta con streaming a GridFS y guarda `gridfs_id`.
//   3. Al descargar/restaurar, `obtenerBufferBackup(db, doc)`
//      detecta si el backup está en `contenido` (inline) o en
//      `gridfs_id` (GridFS) y lo resuelve.
//
// ⚠️  FORMATO DEL DOC EN `backups`:
//   - Backups pequeños: `{ contenido: Binary(Buffer), ... }`
//   - Backups grandes:  `{ gridfs_id: ObjectId, tamano_comprimido, ... }`
//     (el contenido real vive en la colección `backups_fs.files` /
//      `backups_fs.chunks` de GridFS)
//
// El formato del snapshot JSON es IDÉNTICO en ambos modos:
//   {
//     schemaVersion: 3,
//     version: '3.0',                // compat clientes viejos
//     fecha: ISO,
//     db: string,
//     colecciones: { [nombre]: [docs serializados] }
//   }
// ============================================================
'use strict';

const zlib = require('zlib');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const {
  ObjectId,
  Binary,
  Long,
  Decimal128,
  Int32,
  Double,
  Timestamp,
  MinKey,
  MaxKey,
  Code,
  BSONRegExp,
  GridFSBucket
} = require('mongodb');
const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  /** Tamaño de batch al leer del cursor Mongo. */
  batchSize: envNum('BACKUP_BATCH_SIZE', 1000),

  /**
   * Límite de seguridad para el JSON serializado completo.
   * Previene OOM catastrófico si alguien fuerza el modo in-memory
   * con una BD gigante. Aplica SOLO al path in-memory.
   */
  maxJsonBytes: envNum('BACKUP_MAX_JSON_BYTES', 512 * 1024 * 1024),

  /** Nivel de compresión gzip (1 = rápido, 9 = máximo). */
  gzipLevel: Math.min(9, Math.max(1, envNum('BACKUP_GZIP_LEVEL', 6))),

  /** Versión del esquema actual. */
  schemaVersion: 3,

  /**
   * Umbral de "BD grande" para emitir warning en modo in-memory.
   * Si `generarBackup` recolecta >este número de docs totales,
   * loggea un warning sugiriendo migrar a streaming.
   */
  umbralDocsInMemory: envNum('BACKUP_UMBRAL_DOCS_INMEMORY', 50_000),

  /** Umbral de bytes comprimidos antes de sugerir GridFS. */
  umbralBytesGridFS: envNum('BACKUP_UMBRAL_BYTES_GRIDFS', 8 * 1024 * 1024),

  /** Bucket name de GridFS. */
  gridFsBucket: process.env.BACKUP_GRIDFS_BUCKET || 'backups_fs',

  /** Tamaño de chunk de GridFS (default de Mongo es 255 KB). */
  gridFsChunkSizeBytes: envNum('BACKUP_GRIDFS_CHUNK_SIZE', 255 * 1024),

  /** Regex de nombres de colección válidos. */
  nombreColeccionRegex: /^[a-zA-Z][a-zA-Z0-9_-]{0,119}$/,

  /** Colecciones que NUNCA se restauran. */
  excluidasRestore: Object.freeze(new Set([
    'backups',
    'backups_fs.files',
    'backups_fs.chunks',
    'backup_config',
    'cache_consultas',
    'sessions',
    'auditoria',
    'backup_lock'
  ]))
});

// ============================================================
// COLECCIONES POR DEFECTO
// ============================================================
const COLECCIONES_INCLUIDAS = Object.freeze([
  'usuarios', 'clientes', 'proveedores', 'productos', 'categorias',
  'ventas_v2', 'compras_v2', 'kardex', 'retenciones', 'pagos',
  'contadores', 'secuencias', 'periodos_cerrados',
  'configuracion', 'certificados', 'backup_config'
]);

// Alias de compatibilidad — `routes/backups.js` lo importa así.
const COLECCIONES_EXCLUIDAS_RESTORE = CONFIG.excluidasRestore;

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 500) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// VALIDACIÓN DE NOMBRES
// ============================================================
function validarNombreColeccion(nombre) {
  if (typeof nombre !== 'string' || nombre.length === 0) {
    throw errorTipado(
      `Nombre de colección inválido: ${JSON.stringify(nombre)}`,
      'NOMBRE_COLECCION_INVALIDO',
      400
    );
  }
  if (
    nombre.startsWith('$') ||
    nombre.startsWith('system.') ||
    nombre.includes('\0') ||
    nombre.includes('/') ||
    !CONFIG.nombreColeccionRegex.test(nombre)
  ) {
    throw errorTipado(
      `Nombre de colección no permitido: "${nombre}"`,
      'NOMBRE_COLECCION_INVALIDO',
      400
    );
  }
  return nombre;
}

// ============================================================
// SERIALIZACIÓN BSON (sin cambios respecto a la versión previa)
// ============================================================
function serializarBSON(value, opts = {}) {
  const vistos = opts.vistos || new WeakSet();

  if (value === null || value === undefined) return value;

  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') {
    return { __bsonType: 'BigInt', value: value.toString() };
  }
  if (typeof value === 'function') return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { __bsonType: 'InvalidDate' }
      : { __bsonType: 'Date', value: value.toISOString() };
  }
  if (value instanceof RegExp) {
    return { __bsonType: 'RegExp', source: value.source, flags: value.flags };
  }
  if (Buffer.isBuffer(value)) {
    return { __bsonType: 'Buffer', value: value.toString('base64') };
  }

  if (value instanceof ObjectId || value?._bsontype === 'ObjectID') {
    return { __bsonType: 'ObjectId', value: value.toString() };
  }
  if (value instanceof Binary || value?._bsontype === 'Binary') {
    return {
      __bsonType: 'Buffer',
      value: Buffer.from(value.buffer || value.value() || []).toString('base64')
    };
  }
  // ⚠️  Timestamp DEBE ir ANTES que Long: Timestamp extiende Long en BSON v5.
  if (value instanceof Timestamp || value?._bsontype === 'Timestamp') {
    const t = Number(value.t ?? value.high ?? 0);
    const i = Number(value.i ?? value.low ?? 0);
    return { __bsonType: 'Timestamp', t, i };
  }
  if (value instanceof Long || value?._bsontype === 'Long') {
    return { __bsonType: 'Long', value: value.toString() };
  }
  if (value instanceof Decimal128 || value?._bsontype === 'Decimal128') {
    return { __bsonType: 'Decimal128', value: value.toString() };
  }
  if (value instanceof Int32 || value?._bsontype === 'Int32') {
    return { __bsonType: 'Int32', value: Number(value.valueOf()) };
  }
  if (value instanceof Double || value?._bsontype === 'Double') {
    return { __bsonType: 'Double', value: Number(value.valueOf()) };
  }
  if (value instanceof MinKey || value?._bsontype === 'MinKey') {
    return { __bsonType: 'MinKey' };
  }
  if (value instanceof MaxKey || value?._bsontype === 'MaxKey') {
    return { __bsonType: 'MaxKey' };
  }
  if (value instanceof Code || value?._bsontype === 'Code') {
    return {
      __bsonType: 'Code',
      value: value.code || value.value,
      scope: value.scope || null
    };
  }
  if (value instanceof BSONRegExp || value?._bsontype === 'BSONRegExp') {
    return {
      __bsonType: 'BSONRegExp',
      pattern: value.pattern || value.source,
      options: value.options || value.flags || ''
    };
  }

  if (typeof value === 'object') {
    if (vistos.has(value)) return { __bsonType: 'Circular' };
    vistos.add(value);
  }

  if (Array.isArray(value)) {
    return value.map(v => serializarBSON(v, { vistos }));
  }

  const out = {};
  for (const k of Object.keys(value)) {
    const serializado = serializarBSON(value[k], { vistos });
    if (serializado !== undefined) out[k] = serializado;
  }
  return out;
}

function revivirBSON(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(revivirBSON);
  if (typeof value !== 'object') return value;

  const tipo = value.__bsonType;
  if (tipo) {
    switch (tipo) {
      case 'ObjectId':
        try { return new ObjectId(value.value); } catch { return value.value; }
      case 'Date':
        return new Date(value.value);
      case 'InvalidDate':
        return new Date(NaN);
      case 'Buffer':
        return Buffer.from(value.value, 'base64');
      case 'Timestamp': {
        const t = Number(value.t ?? value.high ?? 0);
        const i = Number(value.i ?? value.low ?? 0);
        let ts;
        try {
          const packed = (BigInt(t >>> 0) << 32n) | BigInt(i >>> 0);
          ts = new Timestamp(packed);
        } catch {
          try { ts = new Timestamp({ t, i }); }
          catch { ts = new Timestamp(i, t); }
        }
        try {
          if (ts.t !== t) {
            Object.defineProperty(ts, 't', { value: t, enumerable: true, configurable: true });
          }
          if (ts.i !== i) {
            Object.defineProperty(ts, 'i', { value: i, enumerable: true, configurable: true });
          }
        } catch { /* noop */ }
        return ts;
      }
      case 'Long':
        try { return Long.fromString(value.value); } catch { return value.value; }
      case 'Decimal128':
        try { return Decimal128.fromString(value.value); } catch { return value.value; }
      case 'Int32':
        return new Int32(value.value);
      case 'Double':
        return new Double(value.value);
      case 'MinKey':
        return new MinKey();
      case 'MaxKey':
        return new MaxKey();
      case 'Code':
        return new Code(value.value, value.scope || undefined);
      case 'BSONRegExp':
        return new BSONRegExp(value.pattern, value.options);
      case 'BigInt':
        try { return BigInt(value.value); } catch { return value.value; }
      case 'RegExp':
        try { return new RegExp(value.source, value.flags); } catch { return value.source; }
      case 'Circular':
        return '[circular]';
      default:
        return value;
    }
  }

  const out = {};
  for (const k of Object.keys(value)) out[k] = revivirBSON(value[k]);
  return out;
}

// ============================================================
// HELPERS INTERNOS
// ============================================================

/**
 * Calcula la lista efectiva de colecciones a exportar.
 * @private
 */
function _resolverColecciones({ incluirAuditoria = false, coleccionesExtra = [] } = {}) {
  const cols = new Set([...COLECCIONES_INCLUIDAS]);

  for (const extra of coleccionesExtra) {
    try {
      validarNombreColeccion(extra);
      // No permitir exportar las propias colecciones de backups
      if (extra === 'backups' || extra.startsWith('backups_fs.')) continue;
      cols.add(extra);
    } catch (e) {
      log.warn({ extra, err: e.message }, 'Colección extra ignorada en backup');
    }
  }
  if (incluirAuditoria) cols.add('auditoria');

  return [...cols];
}

/**
 * Devuelve un GridFSBucket configurado.
 * @private
 */
function _bucket(db) {
  return new GridFSBucket(db, {
    bucketName: CONFIG.gridFsBucket,
    chunkSizeBytes: CONFIG.gridFsChunkSizeBytes
  });
}

// ============================================================
// GENERACIÓN EN MEMORIA (legacy, OK para BDs pequeñas)
// ============================================================

/**
 * Genera un snapshot completo EN MEMORIA.
 *
 * ⚠️  Para BDs >50 MB, prefiere `generarBackupStream` o
 *     `generarBackupAGridFS`. Esta versión emite un warning
 *     automático si detecta que la BD es grande.
 *
 * @param {Db} db
 * @param {object} [opts]
 * @param {boolean} [opts.incluirAuditoria=false]
 * @param {string[]} [opts.coleccionesExtra=[]]
 * @param {number} [opts.batchSize]
 * @param {(info: {coleccion: string, cantidad: number}) => void} [opts.onProgress]
 * @param {boolean} [opts.silenciarWarningGrande=false]
 * @returns {Promise<object>} snapshot
 */
async function generarBackup(db, opts = {}) {
  const {
    incluirAuditoria = false,
    coleccionesExtra = [],
    batchSize = CONFIG.batchSize,
    onProgress,
    silenciarWarningGrande = false
  } = opts;

  if (!db || typeof db.collection !== 'function') {
    throw errorTipado('Se requiere una instancia válida de Db', 'DB_INVALIDA', 500);
  }

  const cols = _resolverColecciones({ incluirAuditoria, coleccionesExtra });

  const snapshot = {
    schemaVersion: CONFIG.schemaVersion,
    version: '3.0',
    fecha: new Date().toISOString(),
    db: db.databaseName || '',
    colecciones: {}
  };

  let totalDocs = 0;

  for (const nombre of cols) {
    try {
      const cursor = db.collection(nombre).find({}).batchSize(batchSize);
      const docs = [];
      while (await cursor.hasNext()) {
        docs.push(serializarBSON(await cursor.next()));
      }
      snapshot.colecciones[nombre] = docs;
      totalDocs += docs.length;

      if (typeof onProgress === 'function') {
        try { onProgress({ coleccion: nombre, cantidad: docs.length }); } catch { /* noop */ }
      }
    } catch (err) {
      log.warn({ err: err.message, coleccion: nombre }, 'Fallo exportando colección');
      snapshot.colecciones[nombre] = [];
      snapshot.colecciones[`__error_${nombre}`] = err.message;
    }
  }

  // Warning si la BD es grande — sugerir streaming
  if (!silenciarWarningGrande && totalDocs > CONFIG.umbralDocsInMemory) {
    log.warn(
      { totalDocs, umbral: CONFIG.umbralDocsInMemory },
      '⚠️  Backup in-memory con muchos documentos. Considera migrar a ' +
      'generarBackupAGridFS() para evitar picos de RAM.'
    );
  }

  return snapshot;
}

// ============================================================
// GENERACIÓN STREAMING (recomendado para BDs grandes)
// ============================================================

/**
 * Generador asíncrono que emite chunks de JSON del snapshot.
 * Cada yield es un string. Se usa con `Readable.from()` + `pipeline`.
 *
 * ⚠️  NO añade gzip. El caller decide si comprimir o no.
 *
 * @private
 * @param {Db} db
 * @param {object} [opts]
 * @returns {AsyncGenerator<string>}
 */
async function* _generarChunksJSON(db, opts = {}) {
  const {
    incluirAuditoria = false,
    coleccionesExtra = [],
    batchSize = CONFIG.batchSize,
    onProgress
  } = opts;

  const cols = _resolverColecciones({ incluirAuditoria, coleccionesExtra });

  // Header del JSON
  yield '{"schemaVersion":' + CONFIG.schemaVersion;
  yield ',"version":"3.0"';
  yield ',"fecha":' + JSON.stringify(new Date().toISOString());
  yield ',"db":' + JSON.stringify(db.databaseName || '');
  yield ',"colecciones":{';

  let firstCol = true;

  for (const nombre of cols) {
    if (!firstCol) yield ',';
    firstCol = false;

    yield JSON.stringify(nombre) + ':[';

    let cantidad = 0;
    let firstDoc = true;

    try {
      const cursor = db.collection(nombre).find({}).batchSize(batchSize);
      while (await cursor.hasNext()) {
        const doc = serializarBSON(await cursor.next());
        if (!firstDoc) yield ',';
        firstDoc = false;
        yield JSON.stringify(doc);
        cantidad++;
      }
    } catch (err) {
      // Error de red a mitad de colección: cerramos el array y
      // seguimos con la próxima. La BD queda como "parcial" pero
      // el JSON sigue siendo válido.
      log.warn(
        { err: err.message, coleccion: nombre, cantidad },
        'Error de red durante streaming de colección (backup parcial)'
      );
    }

    yield ']';

    if (typeof onProgress === 'function') {
      try { onProgress({ coleccion: nombre, cantidad }); } catch { /* noop */ }
    }
  }

  yield '}}';
}

/**
 * Escribe el snapshot comprimido (gzip) directo a un writable stream.
 * Memoria constante: no importa el tamaño de la BD.
 *
 * @param {Db} db
 * @param {import('stream').Writable} writeStream
 * @param {object} [opts]  Mismas opciones que `generarBackup`.
 * @returns {Promise<{ bytes: number }>}
 */
async function generarBackupStream(db, writeStream, opts = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw errorTipado('Se requiere una instancia válida de Db', 'DB_INVALIDA', 500);
  }
  if (!writeStream || typeof writeStream.write !== 'function') {
    throw errorTipado('writeStream inválido', 'STREAM_INVALIDO', 500);
  }

  // Contamos los bytes comprimidos con un Transform intermedio.
  const { Transform } = require('node:stream');
  let bytes = 0;
  const contador = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      cb(null, chunk);
    }
  });

  await pipeline(
    Readable.from(_generarChunksJSON(db, opts)),
    zlib.createGzip({ level: CONFIG.gzipLevel }),
    contador,
    writeStream
  );

  return { bytes };
}

/**
 * Genera un backup y lo escribe DIRECTO a GridFS.
 *
 * Ventajas vs in-memory:
 *   - Memoria constante (no importa el tamaño de la BD).
 *   - Rompe el límite de 16 MB por documento Mongo.
 *   - El gzip corre en streaming sin bloquear el event loop.
 *
 * @param {Db} db
 * @param {object} [opts]
 * @param {string} [opts.filename]  Nombre visible en GridFS.
 * @param {object} [opts.metadata]  Metadata extra para GridFS.
 * @returns {Promise<{ gridfs_id: ObjectId, filename: string, bytes: number }>}
 */
async function generarBackupAGridFS(db, opts = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw errorTipado('Se requiere una instancia válida de Db', 'DB_INVALIDA', 500);
  }

  const bucket = _bucket(db);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = opts.filename || `backup_${stamp}.json.gz`;

  const uploadStream = bucket.openUploadStream(filename, {
    contentType: 'application/gzip',
    metadata: {
      creado: new Date(),
      db: db.databaseName || '',
      schemaVersion: CONFIG.schemaVersion,
      ...(opts.metadata || {})
    }
  });

  const { bytes } = await generarBackupStream(db, uploadStream, opts);

  return {
    gridfs_id: uploadStream.id,
    filename,
    bytes
  };
}

// ============================================================
// LECTURA DESDE GRIDFS
// ============================================================

/**
 * Lee un backup de GridFS y devuelve el Buffer comprimido completo.
 * ⚠️  Carga en memoria — usa `streamearBackupAResponse` si el
 *     backup puede ser grande y lo quieres enviar por HTTP.
 *
 * @param {Db} db
 * @param {ObjectId|string} fileId
 * @returns {Promise<Buffer>}
 */
async function leerBackupDeGridFS(db, fileId) {
  const bucket = _bucket(db);
  const id = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const downloadStream = bucket.openDownloadStream(id);

    downloadStream.on('data', c => chunks.push(c));
    downloadStream.on('error', err => {
      if (err.code === 'ENOENT' || /not found/i.test(err.message || '')) {
        reject(errorTipado('Backup no encontrado en GridFS', 'BACKUP_NOT_FOUND', 404));
      } else {
        reject(err);
      }
    });
    downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Elimina un backup de GridFS.
 * @param {Db} db
 * @param {ObjectId|string} fileId
 * @returns {Promise<boolean>}
 */
async function eliminarBackupDeGridFS(db, fileId) {
  const bucket = _bucket(db);
  const id = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
  try {
    await bucket.delete(id);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT' || /not found/i.test(err.message || '')) return false;
    log.warn({ err: err.message, fileId: String(id) }, 'Error borrando de GridFS');
    return false;
  }
}

// ============================================================
// HELPERS DE ALTO NIVEL PARA ROUTES
// ============================================================

/**
 * Extrae el Buffer desde las múltiples formas en las que un
 * `contenido` puede llegar (Buffer, Binary, subobjeto).
 *
 * ⚠️  Este helper SOLO maneja el contenido inline. Para backups
 *     guardados en GridFS, usa `obtenerBufferBackup(db, doc)`.
 *
 * @param {*} contenido
 * @returns {Buffer|null}
 */
function extraerBufferContenido(contenido) {
  if (!contenido) return null;

  if (Buffer.isBuffer(contenido)) return contenido;

  if (contenido instanceof Binary || contenido?._bsontype === 'Binary') {
    const buf = contenido.buffer ?? contenido.value?.();
    return Buffer.isBuffer(buf) ? buf : null;
  }

  if (contenido.buffer && Buffer.isBuffer(contenido.buffer)) return contenido.buffer;
  if (contenido.value && Buffer.isBuffer(contenido.value)) return contenido.value;
  if (contenido.data && Buffer.isBuffer(contenido.data)) return contenido.data;

  return null;
}

/**
 * Obtiene el Buffer comprimido de un backup, sea inline o en GridFS.
 *
 * ⚠️  Para backups grandes, esto carga TODO en memoria. Si solo
 *     necesitas enviarlo por HTTP, usa `streamearBackupAResponse`.
 *
 * @param {Db} db
 * @param {object} backupDoc  Documento de la colección `backups`.
 * @returns {Promise<Buffer|null>}
 */
async function obtenerBufferBackup(db, backupDoc) {
  if (!backupDoc) return null;

  // ---- Caso 1: contenido inline (backups pequeños, legacy) ----
  const inline = extraerBufferContenido(backupDoc.contenido);
  if (inline) return inline;

  // ---- Caso 2: referencia a GridFS (backups grandes) ----
  if (backupDoc.gridfs_id) {
    return leerBackupDeGridFS(db, backupDoc.gridfs_id);
  }

  return null;
}

/**
 * Envía el backup comprimido DIRECTO al HTTP response, sin cargar
 * en memoria si está en GridFS.
 *
 * Maneja:
 *   - Backup inline (contenido: Buffer)
 *   - Backup en GridFS (gridfs_id: ObjectId)
 *
 * @param {Db} db
 * @param {object} backupDoc
 * @param {import('express').Response} res
 * @param {object} [opts]
 * @param {string} [opts.filename]  Override del nombre de descarga.
 * @returns {Promise<void>}
 */
async function streamearBackupAResponse(db, backupDoc, res, opts = {}) {
  const filename = opts.filename || `${backupDoc.nombre || 'backup'}.json.gz`;

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // ---- Caso 1: inline ----
  const inline = extraerBufferContenido(backupDoc.contenido);
  if (inline) {
    res.setHeader('Content-Length', String(inline.length));
    res.end(inline);
    return;
  }

  // ---- Caso 2: GridFS ----
  if (backupDoc.gridfs_id) {
    const bucket = _bucket(db);

    // Buscamos el tamaño para Content-Length
    const files = await bucket.find({ _id: backupDoc.gridfs_id }).toArray();
    if (!files[0]) {
      throw errorTipado('Backup no encontrado en GridFS', 'BACKUP_NOT_FOUND', 404);
    }
    res.setHeader('Content-Length', String(files[0].length));

    await pipeline(
      bucket.openDownloadStream(backupDoc.gridfs_id),
      res
    );
    return;
  }

  throw errorTipado(
    'El backup no tiene contenido inline ni gridfs_id',
    'BACKUP_CORRUPTO',
    500
  );
}

// ============================================================
// COMPRESIÓN (compat con versiones previas)
// ============================================================

/**
 * Serializa y comprime un snapshot a gzip. VERSIÓN SÍNCRONA.
 *
 * ⚠️  DEPRECATED: bloquea el event loop. Usa `comprimirBackupAsync`.
 *     Se mantiene por compatibilidad con código legacy.
 *
 * @param {object} data
 * @param {object} [opts]
 * @param {string} [opts.yaSerializado]
 * @returns {Buffer}
 */
function comprimirBackup(data, opts = {}) {
  log.warn(
    'comprimirBackup() es síncrono y bloquea el event loop. ' +
    'Migra a comprimirBackupAsync() o generaBackupAGridFS().'
  );

  const json = opts.yaSerializado !== undefined
    ? opts.yaSerializado
    : JSON.stringify(data);

  const bytes = Buffer.byteLength(json, 'utf-8');
  if (bytes > CONFIG.maxJsonBytes) {
    throw errorTipado(
      `El snapshot es demasiado grande para comprimir (${(bytes / 1024 / 1024).toFixed(1)} MB > ${(CONFIG.maxJsonBytes / 1024 / 1024).toFixed(0)} MB)`,
      'BACKUP_DEMASIADO_GRANDE',
      413
    );
  }

  return zlib.gzipSync(Buffer.from(json, 'utf-8'), { level: CONFIG.gzipLevel });
}

/**
 * Versión asíncrona de `comprimirBackup`. No bloquea el event loop.
 * @param {object} data
 * @param {object} [opts]
 * @returns {Promise<Buffer>}
 */
function comprimirBackupAsync(data, opts = {}) {
  return new Promise((resolve, reject) => {
    const json = opts.yaSerializado !== undefined
      ? opts.yaSerializado
      : JSON.stringify(data);

    const bytes = Buffer.byteLength(json, 'utf-8');
    if (bytes > CONFIG.maxJsonBytes) {
      return reject(errorTipado(
        `El snapshot es demasiado grande para comprimir (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
        'BACKUP_DEMASIADO_GRANDE',
        413
      ));
    }

    zlib.gzip(Buffer.from(json, 'utf-8'), { level: CONFIG.gzipLevel }, (err, buf) => {
      if (err) return reject(err);
      resolve(buf);
    });
  });
}

/**
 * Descomprime un buffer gzip y devuelve el snapshot.
 * @param {Buffer|Uint8Array} buffer
 * @returns {object}
 */
function descomprimirBackup(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);

  let decompressed;
  try {
    decompressed = zlib.gunzipSync(buf);
  } catch (err) {
    throw errorTipado(
      `El backup no es un gzip válido: ${err.message}`,
      'BACKUP_CORRUPTO',
      400
    );
  }

  let snapshot;
  try {
    snapshot = JSON.parse(decompressed.toString('utf-8'));
  } catch (err) {
    throw errorTipado(
      `El backup contiene JSON inválido: ${err.message}`,
      'BACKUP_CORRUPTO',
      400
    );
  }

  if (!snapshot || typeof snapshot !== 'object') {
    throw errorTipado('El backup no tiene la estructura esperada', 'BACKUP_CORRUPTO', 400);
  }

  return snapshot;
}

/**
 * Versión asíncrona de `descomprimirBackup`.
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<object>}
 */
function descomprimirBackupAsync(buffer) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    zlib.gunzip(buf, (err, decompressed) => {
      if (err) {
        return reject(errorTipado(
          `El backup no es un gzip válido: ${err.message}`,
          'BACKUP_CORRUPTO',
          400
        ));
      }
      try {
        const snapshot = JSON.parse(decompressed.toString('utf-8'));
        if (!snapshot || typeof snapshot !== 'object') {
          return reject(errorTipado(
            'El backup no tiene la estructura esperada',
            'BACKUP_CORRUPTO',
            400
          ));
        }
        resolve(snapshot);
      } catch (e) {
        reject(errorTipado(
          `El backup contiene JSON inválido: ${e.message}`,
          'BACKUP_CORRUPTO',
          400
        ));
      }
    });
  });
}

// ============================================================
// RENOMBRAR COLECCIÓN (atómico)
// ============================================================
async function renombrarColeccion(db, desde, hasta, { dropTarget = false } = {}) {
  try {
    await db.renameCollection(desde, hasta, { dropTarget });
    return true;
  } catch (err) {
    if (
      err.code === 26 ||
      /ns not found/i.test(err.message || '') ||
      /source namespace does not exist/i.test(err.message || '')
    ) {
      return false;
    }
    throw err;
  }
}

// ============================================================
// RESTAURAR BACKUP
// ============================================================
async function restaurarBackup(db, snapshot, coleccionesARestaurar = null, opts = {}) {
  const { modo = 'reemplazar' } = opts;

  if (!snapshot || typeof snapshot !== 'object') {
    throw errorTipado('Snapshot inválido', 'SNAPSHOT_INVALIDO', 400);
  }
  if (!snapshot.colecciones || typeof snapshot.colecciones !== 'object') {
    throw errorTipado('Snapshot sin colecciones', 'SNAPSHOT_INVALIDO', 400);
  }
  if (snapshot.schemaVersion !== undefined && snapshot.schemaVersion > CONFIG.schemaVersion) {
    log.warn(
      { versionSnapshot: snapshot.schemaVersion, versionActual: CONFIG.schemaVersion },
      'Restaurando snapshot de versión superior — puede haber incompatibilidades'
    );
  }

  const disponibles = Object.keys(snapshot.colecciones).filter(
    k => !k.startsWith('__')
  );
  const colecciones = Array.isArray(coleccionesARestaurar) && coleccionesARestaurar.length > 0
    ? coleccionesARestaurar
    : disponibles;

  const resultados = [];

  for (const nombre of colecciones) {
    if (CONFIG.excluidasRestore.has(nombre)) {
      resultados.push({
        coleccion: nombre,
        restaurados: 0,
        ok: true,
        omitido: true,
        motivo: 'colección excluida de restore'
      });
      continue;
    }

    try {
      validarNombreColeccion(nombre);
    } catch (e) {
      resultados.push({ coleccion: nombre, restaurados: 0, ok: false, error: e.message });
      continue;
    }

    const docsRaw = snapshot.colecciones[nombre];
    if (!Array.isArray(docsRaw)) {
      resultados.push({
        coleccion: nombre,
        restaurados: 0,
        ok: false,
        error: 'La colección del snapshot no es un array'
      });
      continue;
    }

    let docs;
    try {
      docs = docsRaw.map(revivirBSON);
    } catch (e) {
      resultados.push({
        coleccion: nombre,
        restaurados: 0,
        ok: false,
        error: `Error reviviendo BSON: ${e.message}`
      });
      continue;
    }

    if (modo === 'merge') {
      resultados.push(await restaurarMerge(db, nombre, docs));
    } else {
      resultados.push(await restaurarSwap(db, nombre, docs));
    }
  }

  return resultados;
}

async function restaurarSwap(db, nombre, docs) {
  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const staging = `staging_${nombre}_${ts}`;
  const oldName = `old_${nombre}_${ts}`;

  let originalRenombrada = false;

  try {
    if (docs.length > 0) {
      for (let i = 0; i < docs.length; i += CONFIG.batchSize) {
        await db
          .collection(staging)
          .insertMany(docs.slice(i, i + CONFIG.batchSize), { ordered: false });
      }
    } else {
      await db.createCollection(staging);
    }

    originalRenombrada = await renombrarColeccion(db, nombre, oldName);
    await renombrarColeccion(db, staging, nombre);

    if (originalRenombrada) {
      try { await db.collection(oldName).drop(); } catch { /* noop */ }
    }

    return { coleccion: nombre, restaurados: docs.length, ok: true };
  } catch (err) {
    if (originalRenombrada) {
      try {
        await renombrarColeccion(db, nombre, staging, { dropTarget: true });
        await renombrarColeccion(db, oldName, nombre);
      } catch (rollbackErr) {
        log.error(
          { err: rollbackErr.message, coleccion: nombre },
          'Rollback fallido tras error de swap'
        );
      }
    }
    try { await db.collection(staging).drop(); } catch { /* noop */ }

    return {
      coleccion: nombre,
      restaurados: 0,
      ok: false,
      error: err.message,
      nota: originalRenombrada
        ? 'error durante el swap; se intentó revertir la colección original'
        : 'error en staging: la colección original NO fue modificada'
    };
  }
}

async function restaurarMerge(db, nombre, docs) {
  if (docs.length === 0) {
    return { coleccion: nombre, restaurados: 0, ok: true };
  }

  const col = db.collection(nombre);

  try {
    const ops = docs
      .filter(d => d && d._id !== undefined)
      .map(d => ({
        replaceOne: {
          filter: { _id: d._id },
          replacement: d,
          upsert: true
        }
      }));

    if (ops.length === 0) {
      return { coleccion: nombre, restaurados: 0, ok: true };
    }

    let total = 0;
    for (let i = 0; i < ops.length; i += CONFIG.batchSize) {
      const r = await col.bulkWrite(ops.slice(i, i + CONFIG.batchSize), { ordered: false });
      total += (r.upsertedCount || 0) + (r.modifiedCount || 0) + (r.matchedCount || 0);
    }

    return { coleccion: nombre, restaurados: total, ok: true };
  } catch (err) {
    return {
      coleccion: nombre,
      restaurados: 0,
      ok: false,
      error: err.message,
      nota: 'merge: los docs con _id ya presentes fueron actualizados; los faltantes no se borraron'
    };
  }
}

// ============================================================
// TAMAÑO
// ============================================================
function calcularTamano(data, opts = {}) {
  const json = opts.yaSerializado !== undefined
    ? opts.yaSerializado
    : JSON.stringify(data);
  return Buffer.byteLength(json, 'utf-8');
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- Constantes ----
  COLECCIONES_INCLUIDAS,
  COLECCIONES_EXCLUIDAS_RESTORE,

  // ---- In-memory (legacy, BDs pequeñas) ----
  generarBackup,
  comprimirBackup,          // deprecated, sync
  comprimirBackupAsync,
  descomprimirBackup,
  descomprimirBackupAsync,

  // ---- Streaming (recomendado BDs grandes) ----
  generarBackupStream,
  generarBackupAGridFS,
  leerBackupDeGridFS,
  eliminarBackupDeGridFS,

  // ---- Alto nivel para routes ----
  obtenerBufferBackup,
  streamearBackupAResponse,

  // ---- Restauración ----
  restaurarBackup,
  calcularTamano,

  // ---- Helpers BSON ----
  serializarBSON,
  revivirBSON,
  extraerBufferContenido
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarNombreColeccion = validarNombreColeccion;
module.exports._renombrarColeccion = renombrarColeccion;
module.exports._restaurarSwap = restaurarSwap;
module.exports._restaurarMerge = restaurarMerge;
module.exports._errorTipado = errorTipado;
module.exports._resolverColecciones = _resolverColecciones;
module.exports._generarChunksJSON = _generarChunksJSON;