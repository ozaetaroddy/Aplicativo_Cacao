// backend/routes/estadoCuenta.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');

router.use(requierePermiso('reportes', 'ver'));

// Documentos que NO cuentan como deuda (no son comprobantes comerciales)
const TIPOS_NO_DEUDA = ['guia_remision', 'proforma'];

function diasDesde(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return Math.floor((hoy - f) / 86400000);
}

function rangoAging(dias) {
  if (dias <= 30) return '0-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

function describeTipo(tipo) {
  const map = {
    factura: 'Factura',
    nota_credito: 'Nota de Crédito',
    nota_debito: 'Nota de Débito',
    guia_remision: 'Guía de Remisión',
    retencion: 'Comprobante de Retención',
    liquidacion: 'Liquidación de Compra',
    exportacion: 'Comprobante de Exportación',
    pago: 'Pago'
  };
  return map[tipo] || tipo;
}

// ===== ESTADO DE CUENTA DE UN CLIENTE =====
router.get('/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { desde, hasta } = req.query;

    if (!ObjectId.isValid(clienteId)) {
      return res.status(400).json({ error: 'ID de cliente inválido' });
    }

    const cliente = await req.db.collection('clientes').findOne({ _id: new ObjectId(clienteId) });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const filtroFecha = {};
    if (desde) { const d = new Date(desde); if (!isNaN(d)) filtroFecha.$gte = d; }
    if (hasta) { const h = new Date(hasta); if (!isNaN(h)) { h.setHours(23, 59, 59, 999); filtroFecha.$lte = h; } }
    const hayFiltroFecha = Object.keys(filtroFecha).length > 0;

    // --- 1. Ventas (débitos y notas de crédito) ---
    const matchVentas = { clienteId: new ObjectId(clienteId) };
    if (hayFiltroFecha) matchVentas.fecha_emision = filtroFecha;

    const ventas = await req.db.collection('ventas_v2')
      .find(matchVentas).sort({ fecha_emision: 1 }).toArray();

    const movimientos = [];
    for (const v of ventas) {
      const tipo = v.tipo_documento || 'factura';
      if (TIPOS_NO_DEUDA.includes(tipo)) continue;

      const esNC = tipo === 'nota_credito';
      const total = v.total || 0;
      movimientos.push({
        _id: v._id,
        fecha: v.fecha_emision,
        tipo,
        numero: v.numero_factura || '',
        descripcion: describeTipo(tipo),
        debito: esNC ? 0 : total,
        credito: esNC ? total : 0,
        saldo: 0,
        forma_pago: v.forma_pago || '',
        estado_pago: v.estado_pago || 'pendiente',
        dias_vencidos: diasDesde(v.fecha_emision)
      });
    }

    // --- 2. Pagos registrados (créditos) ---
    const filtroPagos = { clienteId: new ObjectId(clienteId), anulado: { $ne: true } };
    if (hayFiltroFecha) filtroPagos.fecha = filtroFecha;

    const pagos = await req.db.collection('pagos').find(filtroPagos).sort({ fecha: 1 }).toArray();
    for (const p of pagos) {
      movimientos.push({
        _id: p._id,
        fecha: p.fecha,
        tipo: 'pago',
        numero: p.numero_recibo || '',
        descripcion: `Pago ${p.forma_pago || ''}`.trim(),
        debito: 0,
        credito: p.monto || 0,
        saldo: 0,
        forma_pago: p.forma_pago || '',
        estado_pago: 'pagado',
        dias_vencidos: diasDesde(p.fecha)
      });
    }

    // --- 3. Reordenar y recalcular saldo acumulado ---
    movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    let saldo = 0;
    for (const m of movimientos) {
      saldo += m.debito - m.credito;
      m.saldo = +saldo.toFixed(2);
    }

    const totalDebitos = +movimientos.reduce((s, m) => s + m.debito, 0).toFixed(2);
    const totalCreditos = +movimientos.reduce((s, m) => s + m.credito, 0).toFixed(2);
    const saldoFinal = +(totalDebitos - totalCreditos).toFixed(2);

    // --- 4. Aging: sólo sobre facturas con saldo pendiente ---
    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    const facturasPendientes = movimientos.filter(m =>
      m.tipo === 'factura' && m.estado_pago !== 'pagado'
    );
    // Aplicar los pagos globales a las facturas más antiguas (FIFO)
    let creditoDisponible = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    for (const m of facturasPendientes) {
      let montoAplicable = m.debito;
      if (creditoDisponible > 0) {
        const aplicado = Math.min(creditoDisponible, montoAplicable);
        montoAplicable -= aplicado;
        creditoDisponible -= aplicado;
      }
      if (montoAplicable > 0.01) {
        aging[rangoAging(m.dias_vencidos)] += montoAplicable;
      }
    }
    Object.keys(aging).forEach(k => { aging[k] = +aging[k].toFixed(2); });

    // --- 5. Resumen por tipo ---
    const resumenPorTipo = movimientos.reduce((acc, m) => {
      if (!acc[m.tipo]) acc[m.tipo] = { cantidad: 0, total: 0 };
      acc[m.tipo].cantidad++;
      acc[m.tipo].total += (m.debito || m.credito);
      return acc;
    }, {});

    res.json({
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        ruc: cliente.ruc,
        telefono: cliente.telefono,
        email: cliente.email,
        direccion: cliente.direccion,
        tipo: cliente.tipo
      },
      periodo: {
        desde: desde || null,
        hasta: hasta || null,
        generado: new Date()
      },
      movimientos,
      totales: {
        totalDebitos,
        totalCreditos,
        saldoFinal,
        cantidadMovimientos: movimientos.length
      },
      aging,
      resumenPorTipo
    });
  } catch (err) {
    console.error('Error en estado de cuenta:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== RESUMEN DE CARTERA GENERAL =====
router.get('/', async (req, res) => {
  try {
    // CxC por cliente
    const cxcPipeline = [
      { $match: { tipo_documento: { $nin: TIPOS_NO_DEUDA } } },
      {
        $group: {
          _id: '$clienteId',
          totalDebitos: {
            $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          totalCreditosNC: {
            $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          cantidadFacturas: {
            $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, 1, 0] }
          },
          ultimaFactura: { $max: '$fecha_emision' }
        }
      }
    ];

    const cxcAgg = await req.db.collection('ventas_v2').aggregate(cxcPipeline).toArray();

    // Pagos por cliente
    const pagosAgg = await req.db.collection('pagos').aggregate([
      { $match: { tipo: 'cobro', anulado: { $ne: true }, clienteId: { $ne: null } } },
      { $group: { _id: '$clienteId', totalPagos: { $sum: '$monto' } } }
    ]).toArray();
    const pagosPorCliente = new Map(pagosAgg.map(p => [String(p._id), p.totalPagos || 0]));

    // Enriquecer con cliente
    const clienteIds = cxcAgg.map(c => c._id).filter(Boolean);
    const clientes = clienteIds.length
      ? await req.db.collection('clientes').find(
          { _id: { $in: clienteIds } },
          { projection: { nombre: 1, ruc: 1, telefono: 1 } }
        ).toArray()
      : [];
    const clienteMap = new Map(clientes.map(c => [String(c._id), c]));

    const resultado = cxcAgg
      .map(c => {
        const pagos = pagosPorCliente.get(String(c._id)) || 0;
        const saldo = (c.totalDebitos || 0) - (c.totalCreditosNC || 0) - pagos;
        const cli = clienteMap.get(String(c._id));
        return {
          clienteId: c._id,
          clienteNombre: cli?.nombre || 'Cliente eliminado',
          clienteRuc: cli?.ruc || '',
          clienteTelefono: cli?.telefono || '',
          totalDebitos: +(c.totalDebitos || 0).toFixed(2),
          totalCreditosNC: +(c.totalCreditosNC || 0).toFixed(2),
          totalPagos: +pagos.toFixed(2),
          saldo: +saldo.toFixed(2),
          cantidadFacturas: c.cantidadFacturas || 0,
          ultimaFactura: c.ultimaFactura
        };
      })
      .filter(r => r.saldo > 0.01)
      .sort((a, b) => b.saldo - a.saldo);

    const totalCartera = +resultado.reduce((s, r) => s + r.saldo, 0).toFixed(2);

    res.json({
      totalCartera,
      clientesConDeuda: resultado.length,
      clientes: resultado
    });
  } catch (err) {
    console.error('Error en resumen de cartera:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;