// backend/scripts/fix-kardex-costo.js
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  console.log('🔧 Corrigiendo kardex de ventas...');

  // Cache de productos
  const productos = await db.collection('productos').find({}).toArray();
  const costoPorProducto = new Map(
    productos.map(p => [p._id.toString(), parseFloat(p.precio_compra) || 0])
  );

  const cursor = db.collection('kardex').find({
    referencia_tipo: 'venta',
    tipo_movimiento: { $in: ['venta', 'devolucion'] }
  });

  let actualizados = 0;
  while (await cursor.hasNext()) {
    const mov = await cursor.next();
    const costoReal = costoPorProducto.get(mov.productoId?.toString());
    if (costoReal === undefined) continue;
    if (mov.costo_unitario === costoReal) continue;

    await db.collection('kardex').updateOne(
      { _id: mov._id },
      { $set: { costo_unitario: costoReal, _corregido_costo: true } }
    );
    actualizados++;
  }

  console.log(`✅ ${actualizados} movimientos corregidos`);
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });