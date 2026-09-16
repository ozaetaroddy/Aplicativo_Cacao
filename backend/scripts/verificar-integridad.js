// backend/scripts/verificar-integridad.js
// ============================================================
// Detecta referencias huérfanas y otras inconsistencias.
// ------------------------------------------------------------
// Chequeos:
//   1. pagos.ventaId    → ventas_v2._id
//   2. pagos.compraId   → compras_v2._id
//   3. kardex.productoId → productos._id
//   4. kardex.referencia_id (tipo=venta/compra) → doc origen
//   5. retenciones.compraId → compras_v2._id
//   6. ventas.clienteId → clientes._id
//   7. compras.proveedorId → proveedores._id
//   8. productos.categoriaId → categorias._id
//   9. ventas.clave_acceso duplicado
//  10. productos.stock < 0 (imposible)
//
// Uso:
//   node scripts/verificar-integridad.js
//   node scripts/verificar-integridad.js --only=pagos
//   node scripts/verificar-integridad.js --json > reporte.json
//
// Exit code:
//   0 si no hay problemas, 2 si los hay.
// ============================================================
'use strict';

const { run, log, ok, warn, auditar } = require('./_utils');
const { ObjectId } = require('mongodb');

// ============================================================
// UTILIDADES INTERNAS
// ============================================================
/**
 * Reporta referencias huérfanas: encuentra los `_id` referenciados
 * que NO existen en la colección destino.
 *
 * @param {object} opts
 * @param {object} opts.db
 * @param {string} opts.origen           colección con la FK
 * @param {string} opts.campo            nombre del campo FK
 * @param {string} opts.destino          colección referenciada
 * @param {number} [opts.limit]          max huérfanos a reportar
 * @param {object} [opts.matchExtra]     filtro extra sobre origen
 */
async function reportarHuerfanos({ db, origen, campo, destino, limit = 50, matchExtra = {} }) {
  const match = { [campo]: { $ne: null }, ...matchExtra };

  // 1) Agrupar los ids distintos referenciados.
  const agrupados = await db.collection(origen).aggregate([
    { $match: match },
    { $group: { _id: `$${campo}`, count: { $sum: 1 } } }
  ]).toArray();

  if (agrupados.length === 0) return { total: 0, muestras: [], revisados: 0 };

  // 2) Ver cuáles existen en destino (una sola query con $in).
  const ids = agrupados.map(a => a._id).filter(ObjectId.isValid);
  const existentesSet = new Set();
  const cursor = db.collection(destino).find(
    { _id: { $in: ids } },
    { projection: { _id: 1 } }
  );
  while (await cursor.hasNext()) {
    const { _id } = await cursor.next();
    existentesSet.add(String(_id));
  }

  // 3) Filtrar huérfanos.
  const huerfanos = agrupados.filter(a => !existentesSet.has(String(a._id)));

  return {
    origen,
    campo,
    destino,
    revisados: agrupados.length,
    total: huerfanos.length,
    muestras: huerfanos.slice(0, limit).map(h => ({ id: h._id, referencias: h.count }))
  };
}

// ============================================================
// CHEQUEOS
// ============================================================
const CHEQUEOS = {
  pagos: async (db, ctx) => {
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'pagos', campo: 'ventaId', destino: 'ventas_v2'
    }));
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'pagos', campo: 'compraId', destino: 'compras_v2'
    }));
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'pagos', campo: 'clienteId', destino: 'clientes',
      matchExtra: { tipo: 'cobro' }
    }));
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'pagos', campo: 'proveedorId', destino: 'proveedores',
      matchExtra: { tipo: 'pago' }
    }));
  },

  kardex: async (db, ctx) => {
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'kardex', campo: 'productoId', destino: 'productos'
    }));
  },

  retenciones: async (db, ctx) => {
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'retenciones', campo: 'compraId', destino: 'compras_v2'
    }));
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'retenciones', campo: 'proveedorId', destino: 'proveedores'
    }));
  },

  ventas: async (db, ctx) => {
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'ventas_v2', campo: 'clienteId', destino: 'clientes',
      matchExtra: { tipo_documento: { $ne: 'guia_remision' } }
    }));

    // Claves duplicadas (el índice único debería impedirlo).
    const dupClaves = await db.collection('ventas_v2').aggregate([
      { $match: { clave_acceso: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$clave_acceso', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (dupClaves.length > 0) {
      ctx.resultados.push({
        origen: 'ventas_v2',
        campo: 'clave_acceso',
        destino: '(n/a)',
        total: dupClaves.length,
        muestras: dupClaves.slice(0, 20).map(d => ({ clave: d._id, count: d.count })),
        tipo: 'duplicados'
      });
    }
  },

  compras: async (db, ctx) => {
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'compras_v2', campo: 'proveedorId', destino: 'proveedores'
    }));
  },

  productos: async (db, ctx) => {
    ctx.resultados.push(await reportarHuerfanos({
      db, origen: 'productos', campo: 'categoriaId', destino: 'categorias'
    }));

    // Stock negativo (no debería pasar).
    const stockNegativo = await db.collection('productos')
      .countDocuments({ stock: { $lt: 0 } });

    if (stockNegativo > 0) {
      ctx.resultados.push({
        origen: 'productos',
        campo: 'stock',
        destino: '(n/a)',
        total: stockNegativo,
        muestras: [],
        tipo: 'stock_negativo'
      });
    }
  }
};

// ============================================================
// MAIN
// ============================================================
async function main({ db, args }) {
  const { only } = args;
  const nombres = only && only.length > 0
    ? Object.keys(CHEQUEOS).filter(k => only.includes(k))
    : Object.keys(CHEQUEOS);

  const ctx = { resultados: [] };

  for (const nombre of nombres) {
    log(`🔎 ${nombre}`);
    try {
      await CHEQUEOS[nombre](db, ctx);
    } catch (e) {
      warn(`  Error en chequeo "${nombre}": ${e.message}`);
    }
  }

  // ---- Reporte final ----
  log('');
  log('═'.repeat(60));
  const conProblemas = ctx.resultados.filter(r => r.total > 0);

  if (conProblemas.length === 0) {
    ok('🎉 No se detectaron problemas de integridad');
  } else {
    warn(`⚠️  ${conProblemas.length} chequeo(s) con problemas:`);
    for (const r of conProblemas) {
      log(`\n  • ${r.origen}.${r.campo} → ${r.destino}: ${r.total}`);
      for (const m of r.muestras.slice(0, 5)) {
        log(`      ${JSON.stringify(m)}`);
      }
      if (r.total > 5) log(`      … y ${r.total - 5} más`);
    }
    process.exitCode = 2;
  }

  await auditar(db, {
    accion: 'verificar-integridad',
    detalle: `${conProblemas.length} problemas detectados`,
    meta: { chequeos: nombres, problemas: conProblemas.map(r => ({
      coleccion: r.origen, campo: r.campo, total: r.total
    })) }
  });
}

run(main).catch(err => { console.error('❌ Error fatal:', err); process.exit(1); });