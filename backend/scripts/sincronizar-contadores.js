// backend/scripts/sincronizar-contadores.js
// Reconcilia los contadores con el máximo secuencial real.
//
// ⚠️  IMPORTANTE: solo cuenta como secuencial válido aquel que sigue
// EXACTAMENTE el patrón PREFIJO-NNNNNN con N dígitos (por defecto 6).
// Ignora cualquier otro formato para no confundir números aleatorios
// con secuenciales reales.
//
// Uso:
//   npm run migrate:contadores

require('dotenv').config();
const { MongoClient } = require('mongodb');

const TIPOS = [
  'factura', 'compra', 'guia_remision', 'retencion', 'liquidacion',
  'nota_credito', 'nota_debito', 'proforma', 'exportacion', 'reembolso'
];

// Longitud esperada del secuencial para cada tipo (según cómo los genera el sistema)
const LONGITUD_SECUENCIAL = {
  factura: 6, compra: 6, guia_remision: 6, retencion: 6,
  liquidacion: 6, nota_credito: 6, nota_debito: 6, proforma: 6,
  exportacion: 6, reembolso: 6
};

/**
 * Extrae el secuencial de un documento SOLO si sigue el patrón esperado.
 * Devuelve null si no matchea (para ignorarlo en el cálculo del máximo).
 */
function extraerSecuencialValido(venta, tipo) {
  // 1. Preferir secuencial_sri si existe y es válido
  if (venta.secuencial_sri) {
    const s = String(venta.secuencial_sri).trim();
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      if (Number.isFinite(n) && n > 0 && n < 1000000000) return n;
    }
  }

  // 2. numero_factura solo si matchea PREFIJO-\d{N} exacto
  if (typeof venta.numero_factura !== 'string') return null;
  const nf = venta.numero_factura.trim();
  if (!nf) return null;

  const len = LONGITUD_SECUENCIAL[tipo] || 6;
  // Acepta FAC-000123, FAC-123 (con padding), y variantes con cualquier prefijo de letras
  const match = nf.match(new RegExp(`^[A-Z]+-(\\d{1,${len}})$`, 'i'));
  if (!match) return null;

  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Sanity check: rechaza valores absurdamente grandes (más de 100M)
  if (n > 100000000) return null;
  return n;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;
  if (!uri) { console.error('❌ Falta MONGODB_URI'); process.exit(1); }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    console.log(`🔌 Conectado a ${db.databaseName}`);
    console.log('─'.repeat(60));

    let cambios = 0;
    let ignorados = 0;

    for (const tipo of TIPOS) {
      const col = tipo === 'compra' ? 'compras_v2' : 'ventas_v2';
      const filtro = col === 'ventas_v2' ? { tipo_documento: tipo } : {};

      const docs = await db.collection(col).find(filtro, {
        projection: { numero_factura: 1, secuencial_sri: 1 }
      }).toArray();

      let max = 0;
      let ignoradosTipo = 0;
      for (const d of docs) {
        const n = extraerSecuencialValido(d, tipo);
        if (n === null) {
          ignoradosTipo++;
          continue;
        }
        if (n > max) max = n;
      }

      ignorados += ignoradosTipo;

      const actual = await db.collection('contadores').findOne({ _id: tipo });
      const valorActual = actual?.valor || 0;

      if (max > valorActual) {
        await db.collection('contadores').updateOne(
          { _id: tipo },
          { $set: { valor: max } },
          { upsert: true }
        );
        console.log(
          `✅ ${tipo.padEnd(16)} ${String(valorActual).padStart(8)} → ${max}` +
          (ignoradosTipo > 0 ? `   (${ignoradosTipo} docs con formato desconocido, ignorados)` : '')
        );
        cambios++;
      } else {
        console.log(
          `   ${tipo.padEnd(16)} ${String(valorActual).padStart(8)} (sin cambio)` +
          (ignoradosTipo > 0 ? `   (${ignoradosTipo} docs con formato desconocido, ignorados)` : '')
        );
      }
    }

    console.log('─'.repeat(60));
    console.log(`🏁 Contadores actualizados: ${cambios}`);
    if (ignorados > 0) {
      console.log(`ℹ️  ${ignorados} documentos tenían un formato de numero_factura`);
      console.log(`   que no sigue el patrón esperado y fueron ignorados en el cálculo.`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();