// backend/scripts/limpiar-indices.js
// Ejecutar UNA VEZ para eliminar índices obsoletos.
// Uso: node scripts/limpiar-indices.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) {
    console.error('❌ Falta MONGODB_URI en .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = dbName ? client.db(dbName) : client.db();
  console.log('✅ Conectado a:', db.databaseName);

  // Lista de índices a eliminar: { coleccion, nombreIndice }
  const indicesAEliminar = [
    { coleccion: 'productos', nombreIndice: 'nombre_1' } // el único viejo
  ];

  for (const { coleccion, nombreIndice } of indicesAEliminar) {
    try {
      const indices = await db.collection(coleccion).indexes();
      const existe = indices.find(i => i.name === nombreIndice);

      if (!existe) {
        console.log(`ℹ️  ${coleccion}.${nombreIndice} no existe, se omite`);
        continue;
      }

      // Verificar que efectivamente es el único viejo
      if (!existe.unique) {
        console.log(`ℹ️  ${coleccion}.${nombreIndice} ya no es único, se omite`);
        continue;
      }

      await db.collection(coleccion).dropIndex(nombreIndice);
      console.log(`🗑️  Eliminado índice único: ${coleccion}.${nombreIndice}`);
    } catch (err) {
      console.error(`❌ Error con ${coleccion}.${nombreIndice}:`, err.message);
    }
  }

  await client.close();
  console.log('✅ Listo. Reinicia el servidor para recrear los índices correctos.');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});