// backend/routes/estadisticas.js
// Estadísticas agregadas del dashboard — 100% server-side
const express = require('express');
const router = express.Router();

/**
 * GET /api/estadisticas/dashboard
 * Devuelve todas las estadísticas que el Dashboard necesita en un solo request.
 * Reemplaza las 3 peticiones a /ventas, /compras, /productos.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const db = req.db;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioMesSig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);

    const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
    const pasado = new Date(ayer);

    // Ventana últimos 7 días
    const hace7 = new Date(hoy); hace7.setDate(hace7.getDate() - 6);

    // ===== Helper: total de un rango para una colección =====
    const rangoTotal = async (col, desde, hasta, matchExtra = {}) => {
      const r = await db.collection(col).aggregate([
        { $match: { fecha_emision: { $gte: desde, $lt: hasta }, ...matchExtra } },
        { $group: { _id: null, total: { $sum: '$total' }, cantidad: { $sum: 1 } } }
      ]).toArray();
      return r[0] || { total: 0, cantidad: 0 };
    };

    // ===== Ventas y Compras de hoy / ayer / mes =====
    const [
      ventasHoy, ventasAyer, ventasMes,
      comprasHoy, comprasAyer, comprasMes
    ] = await Promise.all([
      rangoTotal('ventas_v2', hoy, manana, { tipo_documento: { $nin: ['guia_remision', 'proforma'] } }),
      rangoTotal('ventas_v2', ayer, hoy, { tipo_documento: { $nin: ['guia_remision', 'proforma'] } }),
      rangoTotal('ventas_v2', inicioMes, inicioMesSig, { tipo_documento: { $nin: ['guia_remision', 'proforma'] } }),
      rangoTotal('compras_v2', hoy, manana),
      rangoTotal('compras_v2', ayer, hoy),
      rangoTotal('compras_v2', inicioMes, inicioMesSig),
    ]);

    // ===== Ventas/compras de los últimos 7 días =====
    const ventas7d = await db.collection('ventas_v2').aggregate([
      { $match: {
        fecha_emision: { $gte: hace7, $lt: manana },
        tipo_documento: { $nin: ['guia_remision', 'proforma'] }
      }},
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha_emision' } },
        total: { $sum: '$total' }
      }}
    ]).toArray();

    const compras7d = await db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $gte: hace7, $lt: manana } }},
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha_emision' } },
        total: { $sum: '$total' }
      }}
    ]).toArray();

    // Construir arrays de 7 días (rellenando con 0)
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

    // ===== Top 5 productos vendidos (por cantidad) =====
    const topProductos = await db.collection('ventas_v2').aggregate([
      { $match: {
        fecha_emision: { $gte: inicioMes },
        tipo_documento: { $nin: ['guia_remision', 'proforma', 'nota_credito'] }
      }},
      { $unwind: '$detalles' },
      { $group: {
        _id: '$detalles.productoId',
        cantidad: { $sum: '$detalles.cantidad' },
        total: { $sum: { $multiply: ['$detalles.cantidad', '$detalles.precio_unitario'] } }
      }},
      { $sort: { cantidad: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: 'productos',
        localField: '_id',
        foreignField: '_id',
        as: 'producto'
      }},
      { $unwind: { path: '$producto', preserveNullAndEmptyArrays: true } },
      { $project: {
        _id: 0,
        productoId: '$_id',
        nombre: { $ifNull: ['$producto.nombre', 'Producto eliminado'] },
        codigo: '$producto.codigo',
        cantidad: 1,
        total: 1
      }}
    ]).toArray();

    // ===== Cuentas por pagar (cantidad de compras pendientes) =====
    const cxp = await db.collection('compras_v2').countDocuments({ estado_pago: { $ne: 'pagado' } });

    // ===== Documentos SRI =====
    const [pendientesSri, firmadosSri, autorizadosSri, rechazadosSri] = await Promise.all([
      db.collection('ventas_v2').countDocuments({ estado_sri: 'PENDIENTE' }),
      db.collection('ventas_v2').countDocuments({ estado_sri: 'FIRMADO' }),
      db.collection('ventas_v2').countDocuments({ estado_sri: 'AUTORIZADO' }),
      db.collection('ventas_v2').countDocuments({ estado_sri: { $in: ['RECHAZADA', 'DEVUELTA'] } })
    ]);

    // ===== Stock bajo =====
    const stockBajo = await db.collection('productos').countDocuments({
      $expr: { $lte: ['$stock', '$stock_minimo'] },
      stock_minimo: { $gt: 0 }
    });

    // ===== Tendencia =====
    const tendenciaVentas = ventasAyer.total > 0
      ? ((ventasHoy.total - ventasAyer.total) / ventasAyer.total) * 100
      : (ventasHoy.total > 0 ? 100 : 0);
    const tendenciaCompras = comprasAyer.total > 0
      ? ((comprasHoy.total - comprasAyer.total) / comprasAyer.total) * 100
      : (comprasHoy.total > 0 ? 100 : 0);

    res.json({
      ventasHoy: ventasHoy.total,
      ventasAyer: ventasAyer.total,
      facturasHoy: ventasHoy.cantidad,
      ventasMes: ventasMes.total,
      facturasMes: ventasMes.cantidad,
      comprasHoy: comprasHoy.total,
      comprasAyer: comprasAyer.total,
      comprasMes: comprasMes.total,
      comprasDelMes: comprasMes.cantidad,
      tendenciaVentas,
      tendenciaCompras,
      ventasDiarias,
      comprasDiarias,
      dias,
      topProductos,
      cuentasPorPagar: cxp,
      stockBajo,
      sri: { pendientes: pendientesSri, firmados: firmadosSri, autorizados: autorizadosSri, rechazados: rechazadosSri },
      generado: new Date()
    });
  } catch (err) {
    console.error('Error en /estadisticas/dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;