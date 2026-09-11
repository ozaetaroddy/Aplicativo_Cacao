// backend/utils/backup.js
const zlib = require('zlib');

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
  'periodos_cerrados'
];

/**
 * Genera un objeto con todas las colecciones y sus documentos.
 * @returns {Promise<object>}
 */
async function generarBackup(db) {
  const snapshot = {
    version: '1.0',
    fecha: new Date().toISOString(),
    colecciones: {}
  };

  for (const nombre of COLECCIONES_INCLUIDAS) {
    try {
      const docs = await db.collection(nombre).find({}).toArray();
      snapshot.colecciones[nombre] = docs;
    } catch (err) {
      console.error(`Error exportando ${nombre}:`, err.message);
      snapshot.colecciones[nombre] = [];
    }
  }

  return snapshot;
}

/**
 * Comprime un objeto JSON a Buffer con gzip.
 */
function comprimirBackup(data) {
  const json = JSON.stringify(data);
  return zlib.gzipSync(Buffer.from(json, 'utf-8'));
}

/**
 * Descomprime un Buffer gzip a objeto.
 */
function descomprimirBackup(buffer) {
  const decompressed = zlib.gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf-8'));
}

/**
 * Aplica un backup a la base de datos (destructivo: borra y reinserta).
 * @param {object} db
 * @param {object} snapshot
 * @param {Array<string>} coleccionesARestaurar - si se omite, restaura todas
 */
async function restaurarBackup(db, snapshot, coleccionesARestaurar = null) {
  const resultados = [];
  const collecciones = coleccionesARestaurar || Object.keys(snapshot.colecciones || {});

  for (const nombre of collecciones) {
    const docs = snapshot.colecciones?.[nombre];
    if (!Array.isArray(docs)) continue;

    try {
      // Borrar todo
      await db.collection(nombre).deleteMany({});
      // Insertar los nuevos
      if (docs.length > 0) {
        await db.collection(nombre).insertMany(docs);
      }
      resultados.push({ coleccion: nombre, restaurados: docs.length, ok: true });
    } catch (err) {
      resultados.push({ coleccion: nombre, restaurados: 0, ok: false, error: err.message });
    }
  }

  return resultados;
}

/**
 * Calcula el tamaño aproximado de un objeto (en bytes).
 */
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