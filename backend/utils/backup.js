// backend/utils/backup.js
// ============================================================
// Backup y restauración de colecciones MongoDB
// ------------------------------------------------------------
// Formato de snapshot:
//   {
//     schemaVersion: 3,
//     version: '3.0',           // compatibilidad con clientes viejos
//     fecha: ISO,
//     db: string,
//     colecciones: { [nombre]: [docs serializados] }
//   }
//
// API pública:
//   generarBackup(db, opts)         → snapshot (objeto)
//   comprimirBackup(snapshot)       → Buffer .gz
//   comprimirBackupAsync(snapshot)  → Promise<Buffer>
//   descomprimirBackup(buffer)      → snapshot
//   descomprimirBackupAsync(buf)    → Promise<snapshot>
//   restaurarBackup(db, snap, cols) → resultados
//   calcularTamano(snapshot)        → número (bytes UTF-8)
//   serializarBSON / revivirBSON    → (helpers expuestos)
//   extraerBufferContenido(x)       → Buffer | null
//
// Estrategia de restauración (por colección):
//   1. Insertar todo en `staging_<col>_<ts>`.
//   2. Renombrar `<col>` → `old_<col>_<ts>`.
//   3. Renombrar `staging_*` → `<col>`.
//   4. Borrar `old_*`.
//   Si algo falla antes del paso 3, la colección original queda intacta.
// ============================================================
'use strict';

const zlib = require('zlib');
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
  BSONRegExp
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
  /** Tamaño de batch para inserts masivos. */
  batchSize: envNum('BACKUP_BATCH_SIZE', 1000),

  /** Límite de seguridad: un JSON > 512 MB rompe Buffer.from. */
  maxJsonBytes: envNum('BACKUP_MAX_JSON_BYTES', 512 * 1024 * 1024),

  /** Nivel de compresión gzip (1 = rápido, 9 = máximo). */
  gzipLevel: Math.min(9, Math.max(1, envNum('BACKUP_GZIP_LEVEL', 6))),

  /** Versión del esquema actual. */
  schemaVersion: 3,

  /** Regex de nombres de colección válidos. */
  nombreColeccionRegex: /^[a-zA-Z][a-zA-Z0-9_-]{0,119}$/,

  /** Colecciones que NUNCA se restauran (para no destruir la auditoría ni backups). */
  excluidasRestore: Object.freeze(new Set([
    'backups',
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

// Alias de compatibilidad — el router `backups.js` lo importa así.
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
/**
 * Valida un nombre de colección.
 * Rechaza vacíos, system.*, prefijos $, y caracteres raros.
 * @param {string} nombre
 * @returns {string} nombre tal cual (para encadenar)
 * @throws {Error} con codigo='NOMBRE_COLECCION_INVALIDO'
 */
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
// SERIALIZACIÓN BSON
// ============================================================
/**
 * Serializa un valor a JSON-friendly preservando tipos BSON.
 * Detecta referencias circulares (WeakSet).
 *
 * @param {*} value
 * @param {object} [opts]
 * @param {WeakSet<object>} [opts.vistos]
 * @returns {*}
 */
function serializarBSON(value, opts = {}) {
  const vistos = opts.vistos || new WeakSet();

  if (value === null || value === undefined) return value;

  // ---- Primitivos ----
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') {
    return { __bsonType: 'BigInt', value: value.toString() };
  }
  if (typeof value === 'function') return undefined; // se omite en JSON

  // ---- Nativos JS ----
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

  // ---- BSON types (mongodb driver) ----
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

  // ---- Referencias circulares ----
  if (typeof value === 'object') {
    if (vistos.has(value)) {
      return { __bsonType: 'Circular' };
    }
    vistos.add(value);
  }

  // ---- Array ----
  if (Array.isArray(value)) {
    return value.map(v => serializarBSON(v, { vistos }));
  }

  // ---- Objeto plano ----
  const out = {};
  for (const k of Object.keys(value)) {
    const serializado = serializarBSON(value[k], { vistos });
    if (serializado !== undefined) out[k] = serializado;
  }
  return out;
}

/**
 * Reconstruye un valor serializado a su tipo original.
 * @param {*} value
 * @returns {*}
 */
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
    // bson v5.5+/v6+: bigint con layout [t:32bit][i:32bit]
    const packed = (BigInt(t >>> 0) << 32n) | BigInt(i >>> 0);
    ts = new Timestamp(packed);
  } catch {
    try {
      // Fallback: objeto {t, i}
      ts = new Timestamp({ t, i });
    } catch {
      // Fallback clásico: (low, high)
      ts = new Timestamp(i, t);
    }
  }

  // Defensa final: si la versión de bson no expone .t/.i correctamente,
  // los forzamos como own properties.
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
// EXTRACCIÓN DE BUFFER
// ============================================================
/**
 * Extrae un Buffer desde las múltiples formas en las que un
 * `contenido` puede llegar (Buffer, Binary, subobjeto, driver v3/v4).
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

// ============================================================
// GENERAR BACKUP
// ============================================================
/**
 * Genera un snapshot de todas las colecciones.
 *
 * @param {Db} db
 * @param {object} [opts]
 * @param {boolean} [opts.incluirAuditoria=false]
 * @param {string[]} [opts.coleccionesExtra=[]]
 * @param {number} [opts.batchSize]         Tamaño de batch al leer
 * @param {(info: {coleccion: string, cantidad: number}) => void} [opts.onProgress]
 * @returns {Promise<object>} snapshot
 */
async function generarBackup(db, opts = {}) {
  const {
    incluirAuditoria = false,
    coleccionesExtra = [],
    batchSize = CONFIG.batchSize,
    onProgress
  } = opts;

  if (!db || typeof db.collection !== 'function') {
    throw errorTipado('Se requiere una instancia válida de Db', 'DB_INVALIDA', 500);
  }

  const cols = new Set([...COLECCIONES_INCLUIDAS]);

  for (const extra of coleccionesExtra) {
    try {
      validarNombreColeccion(extra);
      cols.add(extra);
    } catch (e) {
      log.warn({ extra, err: e.message }, 'Colección extra ignorada en backup');
    }
  }
  if (incluirAuditoria) cols.add('auditoria');

  const snapshot = {
    schemaVersion: CONFIG.schemaVersion,
    version: '3.0', // compatibilidad con clientes que leen `version`
    fecha: new Date().toISOString(),
    db: db.databaseName || '',
    colecciones: {}
  };

  for (const nombre of cols) {
    try {
      const cursor = db.collection(nombre).find({}).batchSize(batchSize);
      const docs = [];
      while (await cursor.hasNext()) {
        docs.push(serializarBSON(await cursor.next()));
      }
      snapshot.colecciones[nombre] = docs;

      if (typeof onProgress === 'function') {
        try { onProgress({ coleccion: nombre, cantidad: docs.length }); } catch { /* noop */ }
      }
    } catch (err) {
      // Guardamos vacío y seguimos: un fallo puntual no debe abortar todo el backup.
      log.warn({ err: err.message, coleccion: nombre }, 'Fallo exportando colección');
      snapshot.colecciones[nombre] = [];
      snapshot.colecciones[`__error_${nombre}`] = err.message;
    }
  }

  return snapshot;
}

// ============================================================
// COMPRESIÓN
// ============================================================
/**
 * Serializa y comprime un snapshot a gzip.
 * @param {object} data
 * @param {object} [opts]
 * @param {string} [opts.yaSerializado]  JSON pre-serializado (evita re-serializar)
 * @returns {Buffer}
 */
function comprimirBackup(data, opts = {}) {
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
 * Versión asíncrona (no bloquea el event loop).
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
 * Versión asíncrona.
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
/**
 * Renombra una colección. Devuelve `true` si se renombró,
 * `false` si la fuente no existía (NamespaceNotFound).
 *
 * @param {Db} db
 * @param {string} desde
 * @param {string} hasta
 * @param {object} [opts]
 * @param {boolean} [opts.dropTarget=false]
 * @returns {Promise<boolean>}
 */
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
/**
 * Restaura un snapshot.
 *
 * @param {Db} db
 * @param {object} snapshot
 * @param {string[]|null} [coleccionesARestaurar]
 * @param {object} [opts]
 * @param {'reemplazar'|'merge'} [opts.modo='reemplazar']
 *   - reemplazar: staging → swap (default, comportamiento histórico)
 *   - merge: inserte con upsert por _id (no borra docs existentes que no están en el backup)
 * @returns {Promise<Array<{coleccion: string, restaurados: number, ok: boolean, error?: string}>>}
 */
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
      resultados.push({
        coleccion: nombre,
        restaurados: 0,
        ok: false,
        error: e.message
      });
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

// ============================================================
// ESTRATEGIA: SWAP (reemplaza la colección completa)
// ============================================================
async function restaurarSwap(db, nombre, docs) {
  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const staging = `staging_${nombre}_${ts}`;
  const oldName = `old_${nombre}_${ts}`;

  let originalRenombrada = false;

  try {
    // 1. Insertar en staging
    if (docs.length > 0) {
      for (let i = 0; i < docs.length; i += CONFIG.batchSize) {
        await db
          .collection(staging)
          .insertMany(docs.slice(i, i + CONFIG.batchSize), { ordered: false });
      }
    } else {
      await db.createCollection(staging);
    }

    // 2. Mover original fuera del camino
    originalRenombrada = await renombrarColeccion(db, nombre, oldName);

    // 3. Swap atómico
    await renombrarColeccion(db, staging, nombre);

    // 4. Limpiar
    if (originalRenombrada) {
      try { await db.collection(oldName).drop(); } catch { /* noop */ }
    }

    return { coleccion: nombre, restaurados: docs.length, ok: true };
  } catch (err) {
    // Rollback best-effort
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

// ============================================================
// ESTRATEGIA: MERGE (upsert por _id, no borra faltantes)
// ============================================================
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
      nota: 'merge: los documentos con _id ya presentes fueron actualizados; los faltantes no se borraron'
    };
  }
}

// ============================================================
// TAMAÑO DEL SNAPSHOT
// ============================================================
/**
 * Calcula el tamaño del snapshot serializado en bytes UTF-8.
 * @param {object} data
 * @param {object} [opts]
 * @param {string} [opts.yaSerializado]
 * @returns {number}
 */
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
  // Constantes
  COLECCIONES_INCLUIDAS,
  COLECCIONES_EXCLUIDAS_RESTORE,

  // API principal
  generarBackup,
  comprimirBackup,
  comprimirBackupAsync,
  descomprimirBackup,
  descomprimirBackupAsync,
  restaurarBackup,
  calcularTamano,

  // Helpers BSON
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