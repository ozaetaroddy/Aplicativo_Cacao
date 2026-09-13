// backend/utils/backup.js
const zlib = require('zlib');
const { ObjectId, Binary } = require('mongodb');

const COLECCIONES_INCLUIDAS = [
  'usuarios', 'clientes', 'proveedores', 'productos', 'categorias',
  'ventas_v2', 'compras_v2', 'kardex', 'retenciones', 'pagos',
  'contadores', 'secuencias', 'periodos_cerrados',
  'configuracion', 'certificados', 'backup_config'
];

const COLECCIONES_EXCLUIDAS_RESTORE = new Set([
  'backups', 'backup_config', 'cache_consultas', 'sessions',
  'auditoria', 'backup_lock'
]);

const BATCH_SIZE = 1000;

// ===== Serialización BSON =====
function serializarBSON(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof ObjectId) return { __bsonType: 'ObjectId', value: value.toString() };
  if (value instanceof Date) return { __bsonType: 'Date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __bsonType: 'Buffer', value: value.toString('base64') };
  if (value instanceof Binary) return { __bsonType: 'Buffer', value: value.buffer.toString('base64') };
  if (Array.isArray(value)) return value.map(serializarBSON);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = serializarBSON(value[k]);
    return out;
  }
  return value;
}

function revivirBSON(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(revivirBSON);
  if (typeof value === 'object') {
    if (value.__bsonType === 'ObjectId') {
      try { return new ObjectId(value.value); } catch { return value.value; }
    }
    if (value.__bsonType === 'Date') return new Date(value.value);
    if (value.__bsonType === 'Buffer') return Buffer.from(value.value, 'base64');
    const out = {};
    for (const k of Object.keys(value)) out[k] = revivirBSON(value[k]);
    return out;
  }
  return value;
}

function extraerBufferContenido(contenido) {
  if (!contenido) return null;
  if (Buffer.isBuffer(contenido)) return contenido;
  if (contenido instanceof Binary) return contenido.buffer;
  if (contenido.buffer && Buffer.isBuffer(contenido.buffer)) return contenido.buffer;
  if (contenido.value && Buffer.isBuffer(contenido.value)) return contenido.value;
  if (contenido._bsontype === 'Binary' && contenido.buffer) return contenido.buffer;
  return null;
}

// ===== Generar snapshot =====
async function generarBackup(db, { incluirAuditoria = false, coleccionesExtra = [] } = {}) {
  const cols = [...COLECCIONES_INCLUIDAS, ...coleccionesExtra];
  if (incluirAuditoria) cols.push('auditoria');

  const snapshot = {
    version: '2.5',
    fecha: new Date().toISOString(),
    db: db.databaseName,
    colecciones: {}
  };

  for (const nombre of cols) {
    try {
      const docs = await db.collection(nombre).find({}).toArray();
      snapshot.colecciones[nombre] = docs.map(serializarBSON);
    } catch (err) {
      console.error(`Error exportando ${nombre}:`, err.message);
      snapshot.colecciones[nombre] = [];
    }
  }

  return snapshot;
}

function comprimirBackup(data) {
  const json = JSON.stringify(data);
  return zlib.gzipSync(Buffer.from(json, 'utf-8'), { level: 6 });
}

function descomprimirBackup(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const decompressed = zlib.gunzipSync(buf);
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Renombra una colección (atómico a nivel de metadata de MongoDB).
 * Devuelve true si se renombró, false si la fuente no existía.
 */
async function renombrarColeccion(db, desde, hasta, { dropTarget = false } = {}) {
  try {
    await db.renameCollection(desde, hasta, { dropTarget });
    return true;
  } catch (err) {
    // NamespaceNotFound: la colección origen no existe
    if (err.code === 26 || /ns not found/i.test(err.message || '')) return false;
    throw err;
  }
}

/**
 * Restaurar (staging → swap atómico vía renameCollection).
 *
 * Estrategia segura:
 *   1. Insertar TODO en colección staging `tmp_<nombre>_<ts>`.
 *      Si esto falla, la colección original NO fue tocada.
 *   2. Renombrar original → `old_<nombre>_<ts>` (si existía).
 *   3. Renombrar staging → original.
 *      Si esto falla, revertimos el paso 2.
 *   4. Eliminar `old_<nombre>_<ts>`.
 *
 * Con rename no hay ventana en la que la colección quede vacía.
 */
async function restaurarBackup(db, snapshot, coleccionesARestaurar = null) {
  const resultados = [];
  const colecciones = coleccionesARestaurar || Object.keys(snapshot.colecciones || {});

  for (const nombre of colecciones) {
    if (COLECCIONES_EXCLUIDAS_RESTORE.has(nombre)) continue;
    const docsRaw = snapshot.colecciones?.[nombre];
    if (!Array.isArray(docsRaw)) continue;

    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const staging = `staging_${nombre}_${ts}`;
    const backupNombre = `old_${nombre}_${ts}`;

    let originalRenombrada = false;

    try {
      const docs = docsRaw.map(revivirBSON);

      // 1. Staging — si falla, no tocamos la original
      if (docs.length > 0) {
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          await db.collection(staging).insertMany(docs.slice(i, i + BATCH_SIZE), { ordered: false });
        }
      } else {
        // Forzamos la creación de la colección vacía para poder renombrarla
        await db.createCollection(staging);
      }

      // 2. Mover original fuera del camino (si existe)
      originalRenombrada = await renombrarColeccion(db, nombre, backupNombre);

      // 3. Poner staging en su lugar
      await renombrarColeccion(db, staging, nombre);

      // 4. Eliminar el "viejo"
      if (originalRenombrada) {
        try { await db.collection(backupNombre).drop(); } catch (_) { /* noop */ }
      }

      // Recrear índices es responsabilidad del arranque (server.js),
      // así que no lo forzamos aquí.

      resultados.push({ coleccion: nombre, restaurados: docs.length, ok: true });
    } catch (err) {
      // Intento de rollback: si ya habíamos movido la original, la devolvemos
      if (originalRenombrada) {
        try {
          await renombrarColeccion(db, nombre, staging, { dropTarget: true });
          await renombrarColeccion(db, backupNombre, nombre);
        } catch (rollbackErr) {
          console.error(`❌ Rollback fallido para ${nombre}:`, rollbackErr.message);
        }
      }
      // Limpiamos staging residual
      try { await db.collection(staging).drop(); } catch (_) { /* noop */ }

      resultados.push({
        coleccion: nombre,
        restaurados: 0,
        ok: false,
        error: err.message,
        nota: originalRenombrada
          ? 'error durante el swap; se intentó revertir la colección original'
          : 'error en staging: la colección original NO fue modificada'
      });
    }
  }

  return resultados;
}

function calcularTamano(data) {
  return Buffer.byteLength(JSON.stringify(data), 'utf-8');
}

module.exports = {
  COLECCIONES_INCLUIDAS,
  COLECCIONES_EXCLUIDAS_RESTORE,
  generarBackup,
  comprimirBackup,
  descomprimirBackup,
  restaurarBackup,
  calcularTamano,
  serializarBSON,
  revivirBSON,
  extraerBufferContenido
};