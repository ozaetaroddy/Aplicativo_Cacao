// backend/scripts/resetear-contadores.js
// Resetea los contadores a 0 (o a valores específicos).
//
// Uso:
//   node scripts/resetear-contadores.js              # todos a 0
//   node scripts/resetear-contadores.js factura=10 compra=86   # valores específicos

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;
  if (!uri) { console.error('❌ Falta MONGODB_URI'); process.exit(1); }

  // Parsear args tipo "factura=10"
  const args = process.argv.slice(2).filter(a => a.includes('='));
  const valores = {};
  for (const a of args) {
    const [k, v] = a.split('=');
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) {
      console.error(`❌ Valor inválido para ${k}: ${v}`);
      process.exit(1);
    }
    valores[k] = n;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();

    const actuales = await db.collection('contadores').find({}).toArray();
    console.log('Contadores ANTES:');
    actuales.forEach(c => console.log(`  ${c._id.padEnd(20)} ${c.valor}`));
    console.log('');

    if (Object.keys(valores).length === 0) {
      // Resetear todos a 0
      await db.collection('contadores').updateMany({}, { $set: { valor: 0 } });
      console.log('✅ Todos los contadores reseteados a 0');
    } else {
      for (const [tipo, valor] of Object.entries(valores)) {
        await db.collection('contadores').updateOne(
          { _id: tipo },
          { $set: { valor } },
          { upsert: true }
        );
        console.log(`✅ ${tipo.padEnd(20)} → ${valor}`);
      }
    }

    console.log('');
    const despues = await db.collection('contadores').find({}).toArray();
    console.log('Contadores DESPUÉS:');
    despues.forEach(c => console.log(`  ${c._id.padEnd(20)} ${c.valor}`));
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();