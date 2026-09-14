// backend/scripts/detectar-duplicados-facturas.js
// Lista documentos que violarían el índice único (tipo_documento, numero_factura, ruc_emisor)
// Uso: node scripts/detectar-duplicados-facturas.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;
  if (!uri) { console.error('❌ Falta MONGODB_URI'); process.exit(1); }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    console.log(`🔌 Conectado a ${db.databaseName}\n`);

    const duplicados = await db.collection('ventas_v2').aggregate([
      {
        $match: {
          numero_factura: { $type: 'string', $gt: '' }
        }
      },
      {
        $group: {
          _id: {
            tipo_documento: '$tipo_documento',
            numero_factura: '$numero_factura',
            ruc_emisor: '$ruc_emisor'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    if (duplicados.length === 0) {
      console.log('✅ No hay duplicados. El índice único se puede crear sin problemas.');
      return;
    }

    console.log(`⚠️  ${duplicados.length} combinaciones duplicadas:\n`);
    for (const d of duplicados.slice(0, 50)) {
      console.log(`  tipo=${d._id.tipo_documento}  numero=${d._id.numero_factura}  ruc=${d._id.ruc_emisor}  → ${d.count} veces`);
      console.log(`     _ids: ${d.ids.join(', ')}\n`);
    }
    if (duplicados.length > 50) {
      console.log(`  ...y ${duplicados.length - 50} más`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();