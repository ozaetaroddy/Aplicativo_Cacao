// backend/scripts/sincronizar-contadores.js
// ============================================================
// Reconcilia contadores con el máximo secuencial real.
// ------------------------------------------------------------
// ⚠️  Solo considera secuenciales que respetan el patrón exacto
//     PREFIJO-NNNNNN (con N dígitos esperados por tipo).
//
// Uso:
//   node scripts/sincronizar-contadores.js
//   node scripts/sincronizar-contadores.js --dry-run
//   node scripts/sincronizar-contadores.js --confirm
//   node scripts/sincronizar-contadores.js --only=factura,compra
// ============================================================
'use strict';

const { run, log, ok, warn, confirmar, auditar, pad } = require('./_utils');

const TIPOS = [
  'factura', 'compra', 'guia_remision', 'retencion', 'liquidacion',
  'nota_credito', 'nota_debito', 'proforma', 'exportacion', 'reembolso'
];

const LONGITUD_SECUENCIAL = {
  factura: 6, compra: 6, guia_remision: 6, retencion: 6,
  liquidacion: 6, nota_credito: 6, nota_debito: 6, proforma: 6,
  exportacion: 6, reembolso: 6
};

// ============================================================
// HELPERS
// ============================================================
/**
 * Extrae el secuencial SOLO si respeta el patrón PREFIJO-NNNNNN.
 * @returns {number|null}
 */
function extraerSecuencialValido(venta, tipo) {
  if (venta.secuencial_sri) {
    const s = String(venta.secuencial_sri).trim();
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      if (Number.isFinite(n) && n > 0 && n < 1_000_000_000) return n;
    }
  }

  if (typeof venta.numero_factura !== 'string') return null;
  const nf = venta.numero_factura.trim();
  if (!nf) return null;

  const len = LONGITUD_SECUENCIAL[tipo] || 6;
  const match = nf.match(new RegExp(`^[A-Z]+-(\\d{1,${len}})$`, 'i'));
  if (!match) return null;

  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 100_000_000) return null;
  return n;
}

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { dryRun, confirmado, only } = args;
  const tipos = only && only.length > 0
    ? TIPOS.filter(t => only.includes(t))
    : TIPOS;

  if (tipos.length === 0) {
    warn('Ningún tipo seleccionado');
    return;
  }

  log(`🔎 Analizando ${tipos.length} tipos`);
  log('');

  const planes = []; // { tipo, valorActual, maxReal, accion }
  let totalIgnorados = 0;

  for (const tipo of tipos) {
    const col = tipo === 'compra' ? 'compras_v2' : 'ventas_v2';
    const filtro = col === 'ventas_v2' ? { tipo_documento: tipo } : {};

    const docs = await db.collection(col)
      .find(filtro, { projection: { numero_factura: 1, secuencial_sri: 1 } })
      .toArray();

    let max = 0;
    let ignoradosTipo = 0;
    for (const d of docs) {
      const n = extraerSecuencialValido(d, tipo);
      if (n === null) { ignoradosTipo++; continue; }
      if (n > max) max = n;
    }
    totalIgnorados += ignoradosTipo;

    const actual = await db.collection('contadores').findOne({ _id: tipo });
    const valorActual = actual?.valor || 0;

    const accion = max > valorActual ? 'subir' : 'mantener';
    planes.push({ tipo, valorActual, maxReal: max, accion, ignorados: ignoradosTipo });
  }

  // ---- Vista previa ----
  for (const p of planes) {
    const flecha = p.accion === 'subir'
      ? `${pad(p.valorActual, 8)} → ${p.maxReal}`
      : `${pad(p.valorActual, 8)} (sin cambio)`;
    const extra = p.ignorados > 0
      ? `   (${p.ignorados} docs con formato desconocido, ignorados)`
      : '';
    const icono = p.accion === 'subir' ? '⬆️ ' : '   ';
    log(`${icono}${pad(p.tipo, 16)} ${flecha}${extra}`);
  }

  const cambios = planes.filter(p => p.accion === 'subir').length;

  log('');
  log(`📊 ${cambios} contador(es) a actualizar · ${totalIgnorados} docs ignorados`);

  if (dryRun || cambios === 0) {
    if (dryRun) warn('Dry-run: no se escribió nada');
    if (cambios === 0 && !dryRun) ok('Nada que sincronizar');
    return;
  }

  const ok = await confirmar(`¿Aplicar los ${cambios} cambios?`, { confirmado });
  if (!ok) {
    warn('Cancelado');
    return;
  }

  // ---- Aplicar ----
  let aplicados = 0;
  for (const p of planes) {
    if (p.accion !== 'subir') continue;
    await db.collection('contadores').updateOne(
      { _id: p.tipo },
      { $set: { valor: p.maxReal, updatedAt: new Date() } },
      { upsert: true }
    );
    aplicados++;
  }

  ok(`🎉 ${aplicados} contadores actualizados`);

  await auditar(db, {
    accion: 'sincronizar-contadores',
    detalle: `${aplicados} contadores actualizados`,
    meta: { planes, ignorados: totalIgnorados }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });