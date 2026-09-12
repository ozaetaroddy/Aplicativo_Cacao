// backend/scripts/revertir-claves.js
// Revierte las claves generadas por migrate:claves.
// Deja los documentos sin clave para que puedas reintentar.

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

    const TIPOS = ['factura', 'liquidacion', 'nota_credito', 'nota_debito',
                   'guia_remision', 'retencion', 'exportacion', 'reembolso'];

    const filtro = {
      tipo_documento: { $in: TIPOS },
      estado_sri: 'PENDIENTE',  // solo los que acabamos de tocar
      clave_acceso: { $ne: '' }
    };

    const docs = await db.collection('ventas_v2').find(filtro, {
      projection: { numero_factura: 1, clave_acceso: 1, fecha_emision: 1 }
    }).toArray();

    console.log(`Documentos con clave y estado PENDIENTE: ${docs.length}`);
    docs.forEach(d => console.log(`  ${JSON.stringify(d.numero_factura)} → ${d.clave_acceso.slice(0,20)}...`));
    console.log('');

    const r = await db.collection('ventas_v2').updateMany(
      filtro,
      { $set: {
        clave_acceso: '',
        serie: '',
        secuencial_sri: '',
        xml_generado: '',
        xml_firmado: '',
        estado_sri: 'NO_APLICA'
      }}
    );

    console.log(`✅ ${r.modifiedCount} documentos revertidos a sin-clave`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();