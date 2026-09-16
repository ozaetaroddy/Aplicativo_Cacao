// backend/scripts/revertir-claves.js
// ============================================================
// Revierte las claves generadas por migrate:claves.
// Deja los documentos sin clave para reintentar.
// ------------------------------------------------------------
// Uso:
//   node scripts/revertir-claves.js
//   node scripts/revertir-claves.js --dry-run
//   node scripts/revertir-claves.js --confirm
//   node scripts/revertir-claves.js --tipo=factura          (solo un tipo)
//   node scripts/revertir-claves.js --limit=100
//
// 💡 Restaura el contador `factura` al máximo secuencial que
//    queda en BD (evita secuenciales saltados).
// ============================================================
'use strict';

const { run, log, ok, warn, confirmar, auditar, pad } = require('./_utils');

const TIPOS_VALIDOS = [
  'factura', 'liquidacion', 'nota_credito', 'nota_debito',
  'guia_remision', 'retencion', 'exportacion', 'reembolso'
];

// ============================================================
// HELPERS
// ============================================================
async function recalcularMaximoSecuencial(db, tipoFiltro) {
  const TIPOS = tipoFiltro ? [tipoFiltro] : TIPOS_VALIDOS;
  let maxGlobal = 0;

  for (const tipo of TIPOS) {
    const [r] = await db.collection('ventas_v2').aggregate([
      { $match: { tipo_documento: tipo, secuencial_sri: { $ne: '' } } },
      {
        $project: {
          num: { $toInt: { $ifNull: ['$secuencial_sri', 0] } }
        }
      },
      { $group: { _id: null, max: { $max: '$num' } } }
    ]).toArray();

    const max = Number(r?.max) || 0;
    if (max > maxGlobal) maxGlobal = max;
  }
  return maxGlobal;
}

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { dryRun, confirmado, limit, kv } = args;
  const tipoFiltro = kv.tipo && TIPOS_VALIDOS.includes(kv.tipo) ? kv.tipo : null;

  const filtro = {
    tipo_documento: tipoFiltro ? tipoFiltro : { $in: TIPOS_VALIDOS },
    estado_sri: 'PENDIENTE',
    clave_acceso: { $ne: '' }
  };

  // Vista previa
  let cursor = db.collection('ventas_v2')
    .find(filtro, { projection: { numero_factura: 1, clave_acceso: 1, fecha_emision: 1 } })
    .sort({ _id: 1 });
  if (limit) cursor = cursor.limit(limit);

  const docs = await cursor.toArray();
  log(`📋 Documentos con clave y estado PENDIENTE: ${docs.length}`);

  if (docs.length === 0) {
    ok('Nada por revertir');
    return;
  }

  log('');
  for (const d of docs.slice(0, 20)) {
    log(`  ${pad(d.numero_factura || '(sin nº)', 24)} ${String(d.clave_acceso).slice(0, 24)}…`);
  }
  if (docs.length > 20) log(`  … y ${docs.length - 20} más`);

  if (dryRun) {
    warn('');
    warn('Dry-run: no se escribió nada');
    return;
  }

  const ok = await confirmar(`¿Revertir ${docs.length} documentos?`, { confirmado });
  if (!ok) {
    warn('Cancelado');
    return;
  }

  // Revertir
  const r = await db.collection('ventas_v2').updateMany(
    filtro,
    {
      $set: {
        clave_acceso: '',
        serie: '',
        secuencial_sri: '',
        xml_generado: '',
        xml_firmado: '',
        estado_sri: 'NO_APLICA',
        updatedAt: new Date()
      }
    }
  );

  ok(`🎉 ${r.modifiedCount} documentos revertidos a sin-clave`);

  // 💡 Restaurar contador al máximo real (evita saltos)
  const maxReal = await recalcularMaximoSecuencial(db, tipoFiltro);
  if (maxReal > 0) {
    await db.collection('contadores').updateOne(
      { _id: tipoFiltro || 'factura' },
      { $set: { valor: maxReal, updatedAt: new Date() } },
      { upsert: true }
    );
    ok(`🔢 Contador '${tipoFiltro || 'factura'}' restaurado a ${maxReal}`);
  }

  await auditar(db, {
    accion: 'revertir-claves',
    detalle: `${r.modifiedCount} documentos revertidos`,
    meta: { total: docs.length, modificados: r.modifiedCount, tipoFiltro, maxReal }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });