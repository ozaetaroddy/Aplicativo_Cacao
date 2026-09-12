// backend/scripts/listar-numero-factura-corruptos.js
// Lista documentos cuyo campo `numero_factura` no es un string válido.
//
// Uso:
//   node scripts/listar-numero-factura-corruptos.js

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) {
    console.error('❌ Falta MONGODB_URI');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();

    const colecciones = ['ventas_v2', 'compras_v2'];
    let total = 0;

    for (const col of colecciones) {
      const docs = await db.collection(col).find(
        { numero_factura: { $exists: true, $ne: null } },
        { projection: { numero_factura: 1, tipo_documento: 1, fecha_emision: 1, total: 1 } }
      ).toArray();

      const corruptos = docs.filter(d => typeof d.numero_factura !== 'string');

      if (corruptos.length === 0) {
        console.log(`✅ ${col}: sin registros corruptos`);
        continue;
      }

      console.log(`\n⚠️  ${col}: ${corruptos.length} registro(s) con numero_factura no-string\n`);
      for (const d of corruptos) {
        console.log(`  _id: ${d._id}`);
        console.log(`    tipo_documento: ${d.tipo_documento || '(n/a)'}`);
        console.log(`    fecha_emision:  ${d.fecha_emision}`);
        console.log(`    total:          ${d.total}`);
        console.log(`    numero_factura: ${JSON.stringify(d.numero_factura)} (${typeof d.numero_factura})`);
        console.log('');
      }
      total += corruptos.length;
    }

    console.log('─'.repeat(60));
    console.log(`Total de registros corruptos: ${total}`);

    if (total > 0) {
      console.log(`\n💡 Recomendación: corregir manualmente estos registros desde Compass`);
      console.log(`   antes de correr migrate:claves. Los docs sin numero_factura válido`);
      console.log(`   igual se procesarán, pero conviene saber cuáles son.`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();