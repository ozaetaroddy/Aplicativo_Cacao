// backend/scripts/fix-kardex-costo.js
// ============================================================
// Corrige `costo_unitario` en movimientos de kardex de ventas
// usando el `precio_compra` actual del producto.
// ------------------------------------------------------------
// Uso:
//   node scripts/fix-kardex-costo.js
//   node scripts/fix-kardex-costo.js --dry-run
//   node scripts/fix-kardex-costo.js --confirm
//   node scripts/fix-kardex-costo.js --limit=1000
//
// ⚠️  Este script usa el precio de compra ACTUAL. Si el producto
//     cambió de costo desde la venta, el ajuste no es histórico.
//     Úsalo solo para corregir errores obvios.
// ============================================================
'use strict';

const { run, log, ok, warn, confirmar, auditar, pad, round2 } = require('./_utils');

async function main({ db, args }) {
  const { dryRun, confirmado, limit } = args;

  log('🔍 Cargando precios de compra actuales…');
  const productos = await db.collection('productos')
    .find({}, { projection: { precio_compra: 1 } })
    .toArray();
  const costoPorProducto = new Map(
    productos.map(p => [String(p._id), round2(p.precio_compra)])
  );
  log(`  ${productos.length} productos cargados`);

  // ---- Universo ----
  let cursor = db.collection('kardex').find(
    {
      referencia_tipo: 'venta',
      tipo_movimiento: { $in: ['venta', 'devolucion'] }
    },
    { projection: { productoId: 1, costo_unitario: 1, cantidad: 1, fecha: 1 } }
  );
  if (limit) cursor = cursor.limit(limit);

  const movimientos = await cursor.toArray();
  log(`📋 ${movimientos.length} movimientos a revisar`);

  // ---- Detectar cambios ----
  const cambios = [];
  let sinProducto = 0;

  for (const mov of movimientos) {
    const costoReal = costoPorProducto.get(String(mov.productoId));
    if (costoReal === undefined) { sinProducto++; continue; }
    if (round2(mov.costo_unitario) === costoReal) continue;

    cambios.push({
      _id: mov._id,
      productoId: mov.productoId,
      antes: round2(mov.costo_unitario),
      despues: costoReal,
      cantidad: mov.cantidad,
      fecha: mov.fecha
    });
  }

  // ---- Vista previa ----
  log('');
  log(`📊 ${cambios.length} movimientos a corregir · ${sinProducto} con producto inexistente (ignorados)`);

  if (cambios.length === 0) {
    ok('Nada que corregir');
    return;
  }

  for (const c of cambios.slice(0, 10)) {
    log(`  ${pad(c.productoId, 26)} $${c.antes} → $${c.despues}  (cant=${c.cantidad})`);
  }
  if (cambios.length > 10) log(`  … y ${cambios.length - 10} más`);

  if (dryRun) {
    warn('');
    warn('Dry-run: no se escribió nada');
    return;
  }

  const ok = await confirmar(`¿Aplicar los ${cambios.length} cambios?`, { confirmado });
  if (!ok) {
    warn('Cancelado');
    return;
  }

  // ---- Aplicar ----
  let actualizados = 0;
  for (const c of cambios) {
    await db.collection('kardex').updateOne(
      { _id: c._id },
      { $set: { costo_unitario: c.despues, _corregido_costo: true } }
    );
    actualizados++;
  }

  ok(`🎉 ${actualizados} movimientos corregidos`);

  await auditar(db, {
    accion: 'fix-kardex-costo',
    detalle: `${actualizados} movimientos corregidos`,
    meta: {
      actualizados,
      sinProducto,
      revisados: movimientos.length,
      muestra: cambios.slice(0, 50)
    }
  });
}

run(main).catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });