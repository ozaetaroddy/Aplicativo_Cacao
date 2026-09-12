// backend/utils/backup.js
const zlib = require('zlib');
const { ObjectId } = require('mongodb');

// Colecciones que se incluyen en el backup
const COLECCIONES_INCLUIDAS = [
  'usuarios',
  'clientes',
  'proveedores',
  'productos',
  'categorias',
  'ventas_v2',
  'compras_v2',
  'kardex',
  'retenciones',
  'contadores',
  'secuencias',
  'periodos_cerrados',
  'configuracion',
  'certificados',
  'auditoria',
  'backup_config'
];

// ===== REVIVIR BSON =====
// Serializa ObjectId y Date a un formato recuperable
function serializarBSON(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof ObjectId) return { __bsonType: 'ObjectId', value: value.toString() };
  if (value instanceof Date) return { __bsonType: 'Date', value: value.toISOString() };
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
    const out = {};
    for (const k of Object.keys(value)) out[k] = revivirBSON(value[k]);
    return out;
  }
  return value;
}

/**
 * Genera un objeto con todas las colecciones y sus documentos.
 */
async function generarBackup(db) {
  const snapshot = {
    version: '2.0',
    fecha: new Date().toISOString(),
    db: db.databaseName,
    colecciones: {}
  };

  for (const nombre of COLECCIONES_INCLUIDAS) {
    try {
      const docs = await db.collection(nombre).find({}).toArray();
      // Serializar respetando ObjectId/Date
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
  return zlib.gzipSync(Buffer.from(json, 'utf-8'));
}

function descomprimirBackup(buffer) {
  const decompressed = zlib.gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Aplica un backup a la base de datos (destructivo: borra y reinserta).
 */
async function restaurarBackup(db, snapshot, coleccionesARestaurar = null) {
  const resultados = [];
  const colecciones = coleccionesARestaurar || Object.keys(snapshot.colecciones || {});

  // ⚠️ No restaurar backups/auditoria completos para no perder los actuales
  const EXCLUIR = new Set(['backups']);

  for (const nombre of colecciones) {
    if (EXCLUIR.has(nombre)) continue;

    const docsRaw = snapshot.colecciones?.[nombre];
    if (!Array.isArray(docsRaw)) continue;

    try {
      // ⚠️ Revivir ObjectId/Date antes de insertar
      const docs = docsRaw.map(revivirBSON);

      await db.collection(nombre).deleteMany({});
      if (docs.length > 0) {
        // ordered: false para no detenerse si un doc falla por índice duplicado
        await db.collection(nombre).insertMany(docs, { ordered: false });
      }
      resultados.push({ coleccion: nombre, restaurados: docs.length, ok: true });
    } catch (err) {
      resultados.push({ coleccion: nombre, restaurados: 0, ok: false, error: err.message });
    }
  }

  return resultados;
}

function calcularTamano(data) {
  return Buffer.byteLength(JSON.stringify(data), 'utf-8');
}

module.exports = {
  COLECCIONES_INCLUIDAS,
  generarBackup,
  comprimirBackup,
  descomprimirBackup,
  restaurarBackup,
  calcularTamano
};