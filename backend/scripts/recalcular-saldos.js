// backend/scripts/recalcular-saldos.js
// ============================================================
// Recalcula `monto_pagado` y `estado_pago` de ventas y compras
// a partir de la colección `pagos`.
// ------------------------------------------------------------
// Útil cuando:
//   - Importaste datos sin recalcular.
//   - Hubo pagos anulados sin reflejar en el documento.
//   - Detrás de un bug de transacción.
//
// Uso:
//   node scripts/recalcular-saldos.js
//   node scripts/recalcular-saldos.js --dry-run
//   node scripts/recalcular-saldos.js --only=ventas    (ventas | compras | ambas)
//   node scripts/recalcular-saldos.js --limit=100
// ============================================================
'use strict';

const { run, log, ok, warn, err, pad, round2, auditar } = require('./_utils');
const { ObjectId } = require('mongodb');

const UMBRAL = 0.01;

/** Calcula el estado en función de total y pagado. */
function calcularEstado(total, pagado) {
  if (total > 0 && pagado >= total - UMBRAL) return 'pagado';
  if (pagado > UMBRAL) return 'parcial';
  return 'pendiente';
}

/**
 * Recalcula los saldos de una colección de documentos (ventas o compras).
 * @param {object} opts
 * @param {object} opts.db
 * @param {string} opts.coleccion      'ventas_v2' | 'compras_v2'
 * @param {string} opts.campoIdPago    'ventaId' | 'compraId'
 * @param {string} opts.tipoPago       'cobro' | 'pago'
 * @param {boolean} opts.dryRun
 * @param {number} [opts.limit]
 */
async function recalcularColeccion({ db, coleccion, campoIdPago, tipoPago, dryRun, limit }) {
  log(`📂 ${coleccion} (vía pagos tipo=${tipoPago})`);

  // 1) Agregado de pagos activos agrupado por documento.
  const pagosAgg = await db.collection('pagos').aggregate([
    { $match: { tipo: tipoPago, anulado: { $ne: true }, [campoIdPago]: { $ne: null } } },
    { $group: { _id: `$${campoIdPago}`, total: { $sum: '$monto' } } }
  ]).toArray();
  const pagosPorDoc = new Map(pagosAgg.map(p => [String(p._id), Number(p.total) || 0]));

  // 2) Recorrer documentos y comparar.
  const cursor = db.collection(coleccion).find(
    { [campoIdPago === 'ventaId' ? '_id' : '_id']: { $exists: true } },
    { projection: { _id: 1, numero_factura: 1, total: 1, estado_pago: 1, monto_pagado: 1 } }
  );
  if (limit) cursor.limit(limit);

  let procesados = 0;
  let actualizados = 0;
  let sinCambio = 0;
  const cambios = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    procesados++;

    const pagado = round2(pagosPorDoc.get(String(doc._id)) || 0);
    const total = Number(doc.total) || 0;
    const estadoNuevo = calcularEstado(total, pagado);

    const cambioEstado = doc.estado_pago !== estadoNuevo;
    const cambioMonto = round2(Number(doc.monto_pagado) || 0) !== pagado;

    if (!cambioEstado && !cambioMonto) {
      sinCambio++;
      continue;
    }

    cambios.push({
      _id: doc._id,
      numero_factura: doc.numero_factura || '',
      total,
      monto_pagado: pagado,
      estado_pago: estadoNuevo
    });

    if (!dryRun) {
      await db.collection(coleccion).updateOne(
        { _id: doc._id },
        { $set: { monto_pagado: pagado, estado_pago: estadoNuevo, updatedAt: new Date() } }
      );
    }
    actualizados++;

    if (actualizados <= 20) {
      const flag = dryRun ? '🔍' : '✅';
      log(`  ${flag} ${pad(doc.numero_factura, 20)} ` +
          `${pad(doc.estado_pago || '-', 10)} → ${pad(estadoNuevo, 10)} ` +
          `pagado=${pagado}`);
    }
  }

  if (actualizados > 20) {
    log(`  … y ${actualizados - 20} más`);
  }

  log(`  📊 ${procesados} revisados · ${actualizados} con cambio · ${sinCambio} sin cambio`);
  return { procesados, actualizados, sinCambio, cambios };
}

async function main({ db, args }) {
  const { dryRun, limit, only } = args;

  const recalcularVentas = !only || only.includes('ventas') || only.includes('all');
  const recalcularCompras = !only || only.includes('compras') || only.includes('all');

  if (!recalcularVentas && !recalcularCompras) {
    warn('Nada que hacer. Usa --only=ventas|compras|all');
    return;
  }

  const resultado = { ventas: null, compras: null };

  if (recalcularVentas) {
    resultado.ventas = await recalcularColeccion({
      db,
      coleccion: 'ventas_v2',
      campoIdPago: 'ventaId',
      tipoPago: 'cobro',
      dryRun,
      limit
    });
  }

  if (recalcularCompras) {
    resultado.compras = await recalcularColeccion({
      db,
      coleccion: 'compras_v2',
      campoIdPago: 'compraId',
      tipoPago: 'pago',
      dryRun,
      limit
    });
  }

  log('');
  log('─'.repeat(60));
  if (resultado.ventas) {
    log(`Ventas:   ${resultado.ventas.actualizados} actualizadas de ${resultado.ventas.procesados}`);
  }
  if (resultado.compras) {
    log(`Compras:  ${resultado.compras.actualizados} actualizadas de ${resultado.compras.procesados}`);
  }
  if (dryRun) log('(Dry-run: no se escribió nada)');

  if (!dryRun) {
    await auditar(db, {
      accion: 'recalcular-saldos',
      detalle: 'Saldos recalculados desde pagos',
      meta: resultado
    });
  }
}

run(main).catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });