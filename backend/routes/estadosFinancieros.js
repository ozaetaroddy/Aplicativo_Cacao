// backend/routes/estadosFinancieros.js
const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');

router.use(requierePermiso('reportes', 'ver'));

// ============================================================
// ESTADO DE RESULTADOS
// ============================================================
router.get('/resultados', async (req, res) => {
  try {
    const { desde, hasta, comparar } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Se requieren las fechas "desde" y "hasta"' });
    }

    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);
    fechaHasta.setHours(23, 59, 59, 999);

    const ventas = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_documento: { $nin: ['guia_remision', 'nota_credito', 'proforma'] }
        }
      },
      {
        $group: {
          _id: null,
          subtotal: { $sum: '$subtotal' },
          iva: { $sum: '$iva' },
          total: { $sum: '$total' },
          cantidad: { $sum: 1 }
        }
      }
    ]).toArray();

    const ingresos = ventas[0] || { subtotal: 0, iva: 0, total: 0, cantidad: 0 };

    const notasCredito = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_documento: 'nota_credito'
        }
      },
      {
        $group: {
          _id: null,
          subtotal: { $sum: '$subtotal' },
          total: { $sum: '$total' }
        }
      }
    ]).toArray();

    const devoluciones = notasCredito[0] || { subtotal: 0, total: 0 };
    const ingresosNetos = (ingresos.subtotal || 0) - (devoluciones.subtotal || 0);

    const costoVentas = await req.db.collection('kardex').aggregate([
      {
        $match: {
          fecha: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_movimiento: 'venta'
        }
      },
      {
        $group: {
          _id: null,
          costo: { $sum: { $multiply: [{ $abs: '$cantidad' }, '$costo_unitario'] } }
        }
      }
    ]).toArray();

    const costoDeVentas = costoVentas[0]?.costo || 0;

    const utilidadBruta = ingresosNetos - costoDeVentas;
    const margenBruto = ingresosNetos > 0 ? (utilidadBruta / ingresosNetos) * 100 : 0;

    const gastos = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_compra: 'gasto'
        }
      },
      {
        $group: {
          _id: null,
          subtotal: { $sum: '$subtotal' },
          iva: { $sum: '$iva' },
          total: { $sum: '$total' },
          cantidad: { $sum: 1 }
        }
      }
    ]).toArray();

    const gastosOperativos = gastos[0]?.subtotal || 0;

    const gastosPorProveedor = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_compra: 'gasto'
        }
      },
      { $group: { _id: '$proveedorId', total: { $sum: '$subtotal' }, cantidad: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'proveedores', localField: '_id', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          proveedorNombre: '$proveedor.nombre',
          proveedorRuc: '$proveedor.ruc',
          total: 1,
          cantidad: 1
        }
      }
    ]).toArray();

    const utilidadNeta = utilidadBruta - gastosOperativos;
    const margenNeto = ingresosNetos > 0 ? (utilidadNeta / ingresosNetos) * 100 : 0;

    const ivaVentas = ingresos.iva || 0;
    const ivaCompras = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_compra: 'gasto'
        }
      },
      { $group: { _id: null, iva: { $sum: '$iva' } } }
    ]).toArray();
    const ivaComprasTotal = ivaCompras[0]?.iva || 0;

    let comparacion = null;
    if (comparar === 'true') {
      const duracion = fechaHasta - fechaDesde;
      const anteriorDesde = new Date(fechaDesde.getTime() - duracion);
      const anteriorHasta = new Date(fechaDesde.getTime() - 1);

      const ventasAnterior = await req.db.collection('ventas_v2').aggregate([
        {
          $match: {
            fecha_emision: { $gte: anteriorDesde, $lte: anteriorHasta },
            tipo_documento: { $nin: ['guia_remision', 'nota_credito', 'proforma'] }
          }
        },
        { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
      ]).toArray();

      const gastosAnterior = await req.db.collection('compras_v2').aggregate([
        {
          $match: {
            fecha_emision: { $gte: anteriorDesde, $lte: anteriorHasta },
            tipo_compra: 'gasto'
          }
        },
        { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
      ]).toArray();

      comparacion = {
        periodo_anterior: { desde: anteriorDesde, hasta: anteriorHasta },
        ingresosNetos: ventasAnterior[0]?.subtotal || 0,
        gastosOperativos: gastosAnterior[0]?.subtotal || 0
      };
    }

    res.json({
      periodo: {
        desde: fechaDesde,
        hasta: fechaHasta,
        dias: Math.ceil((fechaHasta - fechaDesde) / (1000 * 60 * 60 * 24))
      },
      ingresos: {
        subtotal: ingresos.subtotal || 0,
        cantidadFacturas: ingresos.cantidad || 0,
        devoluciones: devoluciones.subtotal || 0,
        ingresosNetos
      },
      costos: { costoDeVentas, margenBruto },
      gastos: {
        gastosOperativos,
        cantidadCompras: gastos[0]?.cantidad || 0,
        desglosePorProveedor: gastosPorProveedor
      },
      utilidad: { utilidadBruta, utilidadNeta, margenNeto },
      iva: {
        ivaVentas,
        ivaCompras: ivaComprasTotal,
        ivaPorPagar: ivaVentas - ivaComprasTotal
      },
      comparacion
    });
  } catch (err) {
    console.error('Error en estado de resultados:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// BALANCE GENERAL (CxC y CxP netos por cliente/proveedor)
// Criterio consistente con /estadisticas/dashboard:
//   saldo cliente = SUM(débitos) - SUM(NC) - SUM(cobros del cliente)
//   saldo proveedor = SUM(compras) - SUM(pagos al proveedor)
// Solo se suman los saldos POSITIVOS.
// ============================================================
router.get('/balance', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Se requiere la fecha de corte' });

    const fechaCorte = new Date(fecha);
    fechaCorte.setHours(23, 59, 59, 999);

    // ===== ACTIVOS =====
    const productos = await req.db.collection('productos').find({}).toArray();
    const inventarioValorCompra = productos.reduce((sum, p) => sum + ((p.stock || 0) * (p.precio_compra || 0)), 0);
    const inventarioValorVenta = productos.reduce((sum, p) => sum + ((p.stock || 0) * (p.precio_venta || 0)), 0);

    // CxC neta por cliente (filtrada por fecha de corte)
    const cxcAgg = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          tipo_documento: { $nin: ['guia_remision', 'proforma'] }
        }
      },
      {
        $group: {
          _id: '$clienteId',
          debitos: { $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] } },
          creditosNC: { $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] } }
        }
      }
    ]).toArray();

    const pagosClientesAgg = await req.db.collection('pagos').aggregate([
      {
        $match: {
          tipo: 'cobro',
          anulado: { $ne: true },
          clienteId: { $ne: null },
          fecha: { $lte: fechaCorte }
        }
      },
      { $group: { _id: '$clienteId', total: { $sum: '$monto' } } }
    ]).toArray();
    const pagosPorCliente = new Map(pagosClientesAgg.map(p => [String(p._id), p.total || 0]));

    let cuentasPorCobrar = 0;
    let cantidadCxC = 0;
    for (const c of cxcAgg) {
      if (!c._id) continue;
      const pagos = pagosPorCliente.get(String(c._id)) || 0;
      const saldo = (c.debitos || 0) - (c.creditosNC || 0) - pagos;
      if (saldo > 0.01) {
        cuentasPorCobrar += saldo;
        cantidadCxC += 1;
      }
    }
    cuentasPorCobrar = +cuentasPorCobrar.toFixed(2);

    const ivaCompras = await req.db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $lte: fechaCorte } } },
      { $group: { _id: null, iva: { $sum: '$iva' } } }
    ]).toArray();
    const ivaCredito = ivaCompras[0]?.iva || 0;

    const totalActivos = inventarioValorCompra + cuentasPorCobrar + ivaCredito;

    // ===== PASIVOS =====
    const cxpAgg = await req.db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $lte: fechaCorte } } },
      { $group: { _id: '$proveedorId', total: { $sum: '$total' } } }
    ]).toArray();

    const pagosProvAgg = await req.db.collection('pagos').aggregate([
      {
        $match: {
          tipo: 'pago',
          anulado: { $ne: true },
          proveedorId: { $ne: null },
          fecha: { $lte: fechaCorte }
        }
      },
      { $group: { _id: '$proveedorId', total: { $sum: '$monto' } } }
    ]).toArray();
    const pagosPorProveedor = new Map(pagosProvAgg.map(p => [String(p._id), p.total || 0]));

    let cuentasPorPagar = 0;
    let cantidadCxP = 0;
    for (const c of cxpAgg) {
      if (!c._id) continue;
      const pagos = pagosPorProveedor.get(String(c._id)) || 0;
      const saldo = (c.total || 0) - pagos;
      if (saldo > 0.01) {
        cuentasPorPagar += saldo;
        cantidadCxP += 1;
      }
    }
    cuentasPorPagar = +cuentasPorPagar.toFixed(2);

    const ivaVentasAgg = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          tipo_documento: { $nin: ['guia_remision', 'nota_credito', 'proforma'] }
        }
      },
      { $group: { _id: null, iva: { $sum: '$iva' } } }
    ]).toArray();
    const ivaVentas = ivaVentasAgg[0]?.iva || 0;
    const ivaPorPagar = Math.max(0, ivaVentas - ivaCredito);

    const totalPasivos = cuentasPorPagar + ivaPorPagar;

    // ===== PATRIMONIO =====
    const ventasAcum = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          tipo_documento: { $nin: ['guia_remision', 'nota_credito', 'proforma'] }
        }
      },
      { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
    ]).toArray();
    const ingresosAcum = ventasAcum[0]?.subtotal || 0;

    const notasCreditoAcum = await req.db.collection('ventas_v2').aggregate([
      { $match: { fecha_emision: { $lte: fechaCorte }, tipo_documento: 'nota_credito' } },
      { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
    ]).toArray();
    const devolucionesAcum = notasCreditoAcum[0]?.subtotal || 0;

    const costoAcum = await req.db.collection('kardex').aggregate([
      { $match: { fecha: { $lte: fechaCorte }, tipo_movimiento: 'venta' } },
      { $group: { _id: null, costo: { $sum: { $multiply: [{ $abs: '$cantidad' }, '$costo_unitario'] } } } }
    ]).toArray();
    const costoVentasAcum = costoAcum[0]?.costo || 0;

    const gastosAcum = await req.db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $lte: fechaCorte }, tipo_compra: 'gasto' } },
      { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
    ]).toArray();
    const gastosTotales = gastosAcum[0]?.subtotal || 0;

    const utilidadesAcumuladas = (ingresosAcum - devolucionesAcum) - costoVentasAcum - gastosTotales;
    const totalPatrimonio = utilidadesAcumuladas;

    const totalPasivoPatrimonio = totalPasivos + totalPatrimonio;
    const diferencia = totalActivos - totalPasivoPatrimonio;

    res.json({
      fecha_corte: fechaCorte,
      activos: {
        inventario: inventarioValorCompra,
        inventarioValorVenta,
        cuentasPorCobrar,
        cantidadCxC,
        ivaCreditoTributario: ivaCredito,
        total: totalActivos
      },
      pasivos: {
        cuentasPorPagar,
        cantidadCxP,
        ivaPorPagar,
        total: totalPasivos
      },
      patrimonio: {
        utilidadesAcumuladas,
        total: totalPatrimonio
      },
      verificacion: {
        totalActivos,
        totalPasivoPatrimonio,
        diferencia,
        cuadra: Math.abs(diferencia) < 0.01
      }
    });
  } catch (err) {
    console.error('Error en balance general:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;