// backend/routes/estadisticas.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');

router.get('/dashboard', requierePermiso('reportes', 'ver'), async (req, res) => {
  try {
    const db = req.db;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioMesSig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    const inicioMesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

    const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
    const hace7 = new Date(hoy); hace7.setDate(hace7.getDate() - 6);

    const rangoTotal = async (col, desde, hasta, matchExtra = {}) => {
      const r = await db.collection(col).aggregate([
        { $match: { fecha_emision: { $gte: desde, $lt: hasta }, ...matchExtra } },
        { $group: { _id: null, total: { $sum: '$total' }, cantidad: { $sum: 1 } } }
      ]).toArray();
      return r[0] || { total: 0, cantidad: 0 };
    };

    const matchSoloVentas = {
      tipo_documento: { $nin: ['guia_remision', 'proforma', 'nota_credito'] }
    };

    const [
      ventasHoy, ventasAyer, ventasMes, ventasMesPrev,
      comprasHoy, comprasAyer, comprasMes, comprasMesPrev
    ] = await Promise.all([
      rangoTotal('ventas_v2', hoy, manana, matchSoloVentas),
      rangoTotal('ventas_v2', ayer, hoy, matchSoloVentas),
      rangoTotal('ventas_v2', inicioMes, inicioMesSig, matchSoloVentas),
      rangoTotal('ventas_v2', inicioMesPrev, inicioMes, matchSoloVentas),
      rangoTotal('compras_v2', hoy, manana),
      rangoTotal('compras_v2', ayer, hoy),
      rangoTotal('compras_v2', inicioMes, inicioMesSig),
      rangoTotal('compras_v2', inicioMesPrev, inicioMes)
    ]);

    const ventas7d = await db.collection('ventas_v2').aggregate([
      { $match: { fecha_emision: { $gte: hace7, $lt: manana }, ...matchSoloVentas } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha_emision', timezone: '-05:00' } },
          total: { $sum: '$total' }
        }
      }
    ]).toArray();

    const compras7d = await db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $gte: hace7, $lt: manana } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha_emision', timezone: '-05:00' } },
          total: { $sum: '$total' }
        }
      }
    ]).toArray();

    const dias = [];
    const ventasDiarias = [];
    const comprasDiarias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      dias.push(d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' }));
      ventasDiarias.push(ventas7d.find(x => x._id === iso)?.total || 0);
      comprasDiarias.push(compras7d.find(x => x._id === iso)?.total || 0);
    }

    const topProductos = await db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: inicioMes },
          tipo_documento: { $nin: ['guia_remision', 'proforma', 'nota_credito'] }
        }
      },
      { $unwind: '$detalles' },
      {
        $group: {
          _id: '$detalles.productoId',
          cantidad: { $sum: '$detalles.cantidad' },
          total: { $sum: { $multiply: ['$detalles.cantidad', '$detalles.precio_unitario'] } }
        }
      },
      { $sort: { cantidad: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'producto' } },
      { $unwind: { path: '$producto', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productoId: '$_id',
          nombre: { $ifNull: ['$producto.nombre', 'Producto eliminado'] },
          codigo: '$producto.codigo',
          cantidad: 1,
          total: 1
        }
      }
    ]).toArray();

    const [pendientesSri, firmadosSri, autorizadosSri, rechazadosSri] = await Promise.all([
      db.collection('ventas_v2').countDocuments({ estado_sri: 'PENDIENTE' }),
      db.collection('ventas_v2').countDocuments({ estado_sri: 'FIRMADO' }),
      db.collection('ventas_v2').countDocuments({ estado_sri: 'AUTORIZADO' }),
      db.collection('ventas_v2').countDocuments({ estado_sri: { $in: ['RECHAZADA', 'DEVUELTA'] } })
    ]);

    const stockBajo = await db.collection('productos').countDocuments({
      $expr: { $lte: ['$stock', '$stock_minimo'] },
      stock_minimo: { $gt: 0 }
    });

    // ============================================================
    // CUENTAS POR COBRAR (neto por cliente)
    // Regla: por cliente, saldo = SUM(débitos) - SUM(NC) - SUM(cobros).
    // Solo contamos los saldos POSITIVOS. Un cliente con saldo a favor
    // NO reduce la cartera de otro cliente.
    // ============================================================
    const cxcAgg = await db.collection('ventas_v2').aggregate([
      { $match: { tipo_documento: { $nin: ['guia_remision', 'proforma'] } } },
      {
        $group: {
          _id: '$clienteId',
          debitos: {
            $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          creditosNC: {
            $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          }
        }
      }
    ]).toArray();

    const pagosCobrosAgg = await db.collection('pagos').aggregate([
      { $match: { tipo: 'cobro', anulado: { $ne: true }, clienteId: { $ne: null } } },
      { $group: { _id: '$clienteId', total: { $sum: '$monto' } } }
    ]).toArray();
    const pagosPorCliente = new Map(pagosCobrosAgg.map(p => [String(p._id), p.total || 0]));

    let cuentasPorCobrar = 0;
    let cuentasPorCobrarDocs = 0;
    for (const c of cxcAgg) {
      if (!c._id) continue;
      const pagos = pagosPorCliente.get(String(c._id)) || 0;
      const saldo = (c.debitos || 0) - (c.creditosNC || 0) - pagos;
      if (saldo > 0.01) {
        cuentasPorCobrar += saldo;
        cuentasPorCobrarDocs += 1;
      }
    }
    cuentasPorCobrar = +cuentasPorCobrar.toFixed(2);

    // ============================================================
    // CUENTAS POR PAGAR (neto por proveedor)
    // Misma regla: solo sumamos saldos positivos por proveedor.
    // ============================================================
    const cxpAgg = await db.collection('compras_v2').aggregate([
      { $group: { _id: '$proveedorId', total: { $sum: '$total' } } }
    ]).toArray();

    const pagosProvAgg = await db.collection('pagos').aggregate([
      { $match: { tipo: 'pago', anulado: { $ne: true }, proveedorId: { $ne: null } } },
      { $group: { _id: '$proveedorId', total: { $sum: '$monto' } } }
    ]).toArray();
    const pagosPorProveedor = new Map(pagosProvAgg.map(p => [String(p._id), p.total || 0]));

    let cuentasPorPagar = 0;
    let cuentasPorPagarDocs = 0;
    for (const c of cxpAgg) {
      if (!c._id) continue;
      const pagos = pagosPorProveedor.get(String(c._id)) || 0;
      const saldo = (c.total || 0) - pagos;
      if (saldo > 0.01) {
        cuentasPorPagar += saldo;
        cuentasPorPagarDocs += 1;
      }
    }
    cuentasPorPagar = +cuentasPorPagar.toFixed(2);

    const tendenciaVentas = ventasAyer.total > 0
      ? ((ventasHoy.total - ventasAyer.total) / ventasAyer.total) * 100
      : (ventasHoy.total > 0 ? 100 : 0);
    const tendenciaCompras = comprasAyer.total > 0
      ? ((comprasHoy.total - comprasAyer.total) / comprasAyer.total) * 100
      : (comprasHoy.total > 0 ? 100 : 0);
    const varMesVentas = ventasMesPrev.total > 0
      ? ((ventasMes.total - ventasMesPrev.total) / ventasMesPrev.total) * 100
      : (ventasMes.total > 0 ? 100 : 0);
    const varMesCompras = comprasMesPrev.total > 0
      ? ((comprasMes.total - comprasMesPrev.total) / comprasMesPrev.total) * 100
      : (comprasMes.total > 0 ? 100 : 0);

    res.json({
      ventasHoy: ventasHoy.total,
      ventasAyer: ventasAyer.total,
      facturasHoy: ventasHoy.cantidad,
      ventasMes: ventasMes.total,
      facturasMes: ventasMes.cantidad,
      ventasMesPrev: ventasMesPrev.total,
      varMesVentas,
      comprasHoy: comprasHoy.total,
      comprasAyer: comprasAyer.total,
      comprasMes: comprasMes.total,
      comprasDelMes: comprasMes.cantidad,
      comprasMesPrev: comprasMesPrev.total,
      varMesCompras,
      tendenciaVentas,
      tendenciaCompras,
      ventasDiarias,
      comprasDiarias,
      dias,
      topProductos,
      cuentasPorCobrar,
      cuentasPorCobrarDocs,
      cuentasPorPagar,
      cuentasPorPagarDocs,
      stockBajo,
      sri: {
        pendientes: pendientesSri,
        firmados: firmadosSri,
        autorizados: autorizadosSri,
        rechazados: rechazadosSri
      },
      generado: new Date()
    });
  } catch (err) {
    console.error('Error en /estadisticas/dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;