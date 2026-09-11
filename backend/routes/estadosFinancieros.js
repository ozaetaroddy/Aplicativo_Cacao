// backend/routes/estadosFinancieros.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// ============================================================
// ESTADO DE RESULTADOS
// Ingresos - Costo de ventas = Utilidad Bruta
// Utilidad Bruta - Gastos = Utilidad Neta
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

    // 1. Ingresos por ventas (excluyendo notas de crédito y guías)
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

    // 2. Notas de crédito (devoluciones - reducen ingresos)
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

    // 3. Costo de ventas: usamos el kardex de tipo "venta" (que ya guarda costo_unitario y cantidad)
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
          costo: {
            $sum: {
              $multiply: [
                { $abs: '$cantidad' },  // cantidad es negativa en ventas, la hacemos positiva
                '$costo_unitario'
              ]
            }
          }
        }
      }
    ]).toArray();

    const costoDeVentas = costoVentas[0]?.costo || 0;

    // 4. Utilidad Bruta
    const utilidadBruta = ingresosNetos - costoDeVentas;
    const margenBruto = ingresosNetos > 0 ? (utilidadBruta / ingresosNetos) * 100 : 0;

    // 5. Gastos operativos (compras tipo "gasto")
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

    // Desglose de gastos por proveedor (top)
    const gastosPorProveedor = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $gte: fechaDesde, $lte: fechaHasta },
          tipo_compra: 'gasto'
        }
      },
      {
        $group: {
          _id: '$proveedorId',
          total: { $sum: '$subtotal' },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'proveedores',
          localField: '_id',
          foreignField: '_id',
          as: 'proveedor'
        }
      },
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

    // 6. Utilidad Neta
    const utilidadNeta = utilidadBruta - gastosOperativos;
    const margenNeto = ingresosNetos > 0 ? (utilidadNeta / ingresosNetos) * 100 : 0;

    // 7. IVA (informativo, no es utilidad)
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

    // Comparación con período anterior (opcional)
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
        periodo_anterior: {
          desde: anteriorDesde,
          hasta: anteriorHasta
        },
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
      costos: {
        costoDeVentas,
        margenBruto
      },
      gastos: {
        gastosOperativos,
        cantidadCompras: gastos[0]?.cantidad || 0,
        desglosePorProveedor: gastosPorProveedor
      },
      utilidad: {
        utilidadBruta,
        utilidadNeta,
        margenNeto
      },
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
// BALANCE GENERAL (a una fecha)
// Activo = Pasivo + Patrimonio
// ============================================================
router.get('/balance', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) {
      return res.status(400).json({ error: 'Se requiere la fecha de corte' });
    }

    const fechaCorte = new Date(fecha);
    fechaCorte.setHours(23, 59, 59, 999);

    // ===== ACTIVOS =====

    // 1. Inventario valorizado (stock × precio_compra)
    const productos = await req.db.collection('productos').find({}).toArray();
    const inventarioValorCompra = productos.reduce((sum, p) => {
      return sum + ((p.stock || 0) * (p.precio_compra || 0));
    }, 0);
    const inventarioValorVenta = productos.reduce((sum, p) => {
      return sum + ((p.stock || 0) * (p.precio_venta || 0));
    }, 0);

    // 2. Cuentas por cobrar (ventas pendientes de pago)
    const cxc = await req.db.collection('ventas_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          tipo_documento: { $nin: ['guia_remision', 'nota_credito', 'proforma'] },
          estado_pago: { $ne: 'pagado' }
        }
      },
      { $group: { _id: null, total: { $sum: '$total' }, cantidad: { $sum: 1 } } }
    ]).toArray();
    const cuentasPorCobrar = cxc[0]?.total || 0;
    const cantidadCxC = cxc[0]?.cantidad || 0;

    // 3. IVA crédito tributario (IVA de compras)
    const ivaCompras = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte }
        }
      },
      { $group: { _id: null, iva: { $sum: '$iva' } } }
    ]).toArray();
    const ivaCredito = ivaCompras[0]?.iva || 0;

    // Total activos
    const totalActivos = inventarioValorCompra + cuentasPorCobrar + ivaCredito;

    // ===== PASIVOS =====

    // 1. Cuentas por pagar (compras pendientes)
    const cxp = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          estado_pago: { $ne: 'pagado' }
        }
      },
      { $group: { _id: null, total: { $sum: '$total' }, cantidad: { $sum: 1 } } }
    ]).toArray();
    const cuentasPorPagar = cxp[0]?.total || 0;
    const cantidadCxP = cxp[0]?.cantidad || 0;

    // 2. IVA por pagar (IVA ventas - IVA compras)
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

    // Total pasivos
    const totalPasivos = cuentasPorPagar + ivaPorPagar;

    // ===== PATRIMONIO =====

    // Calcular utilidades acumuladas (todas las ventas - todos los costos - todos los gastos)
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
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          tipo_documento: 'nota_credito'
        }
      },
      { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
    ]).toArray();
    const devolucionesAcum = notasCreditoAcum[0]?.subtotal || 0;

    const costoAcum = await req.db.collection('kardex').aggregate([
      {
        $match: {
          fecha: { $lte: fechaCorte },
          tipo_movimiento: 'venta'
        }
      },
      {
        $group: {
          _id: null,
          costo: {
            $sum: {
              $multiply: [{ $abs: '$cantidad' }, '$costo_unitario']
            }
          }
        }
      }
    ]).toArray();
    const costoVentasAcum = costoAcum[0]?.costo || 0;

    const gastosAcum = await req.db.collection('compras_v2').aggregate([
      {
        $match: {
          fecha_emision: { $lte: fechaCorte },
          tipo_compra: 'gasto'
        }
      },
      { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
    ]).toArray();
    const gastosTotales = gastosAcum[0]?.subtotal || 0;

    const utilidadesAcumuladas = (ingresosAcum - devolucionesAcum) - costoVentasAcum - gastosTotales;

    const totalPatrimonio = utilidadesAcumuladas;

    // Verificación de la ecuación contable
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