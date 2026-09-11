// backend/routes/estadoCuenta.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Días para agrupar cartera (aging)
const EDADES = [0, 30, 60, 90]; // 0-30, 31-60, 61-90, +90

/**
 * Calcula los días transcurridos entre una fecha y hoy.
 */
function diasDesde(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return Math.floor((hoy - f) / (1000 * 60 * 60 * 24));
}

/**
 * Determina el rango de aging para un saldo pendiente.
 */
function rangoAging(dias) {
  if (dias <= 30) return '0-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

// ===== ESTADO DE CUENTA DE UN CLIENTE =====
router.get('/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { desde, hasta } = req.query;

    if (!ObjectId.isValid(clienteId)) {
      return res.status(400).json({ error: 'ID de cliente inválido' });
    }

    // 1. Buscar cliente
    const cliente = await req.db.collection('clientes').findOne({
      _id: new ObjectId(clienteId)
    });
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // 2. Construir filtro de fecha
    const filtroFecha = {};
    if (desde) {
      const d = new Date(desde);
      if (!isNaN(d)) filtroFecha.$gte = d;
    }
    if (hasta) {
      const h = new Date(hasta);
      if (!isNaN(h)) {
        h.setHours(23, 59, 59, 999);
        filtroFecha.$lte = h;
      }
    }

    const matchVentas = { clienteId: new ObjectId(clienteId) };
    if (Object.keys(filtroFecha).length) matchVentas.fecha_emision = filtroFecha;

    // 3. Traer ventas del cliente
    const ventas = await req.db.collection('ventas_v2')
      .find(matchVentas)
      .sort({ fecha_emision: 1 })
      .toArray();

    // 4. Construir movimientos (débitos y créditos)
    const movimientos = [];
    let saldoAcumulado = 0;

    for (const v of ventas) {
      const tipo = v.tipo_documento || 'factura';
      const esNotaCredito = tipo === 'nota_credito';

      // Notas de crédito y guías no cuentan como deuda
      // Guías no generan cargo. Notas de crédito reducen la deuda.
      if (tipo === 'guia_remision') continue;

      const total = v.total || 0;
      let debito = 0;
      let credito = 0;

      if (esNotaCredito) {
        credito = total;
      } else {
        debito = total;
      }

      saldoAcumulado += debito - credito;

      const dias = diasDesde(v.fecha_emision);

      movimientos.push({
        _id: v._id,
        fecha: v.fecha_emision,
        tipo,
        numero: v.numero_factura || '',
        descripcion: describeTipo(tipo),
        debito,
        credito,
        saldo: saldoAcumulado,
        forma_pago: v.forma_pago || '',
        estado_pago: v.estado_pago || 'pendiente',
        dias_vencidos: dias,
        aplica_iva: v.detalles?.some(d => d.aplica_iva !== false) || false
      });
    }

    // 5. Agregar pagos manuales (si existen en una colección "pagos")
    //    Si no usas esta colección, simplemente no aparecerán
    try {
      const filtroPagos = { clienteId: new ObjectId(clienteId) };
      if (Object.keys(filtroFecha).length) filtroPagos.fecha = filtroFecha;

      const pagos = await req.db.collection('pagos')
        .find(filtroPagos)
        .sort({ fecha: 1 })
        .toArray();

      for (const p of pagos) {
        saldoAcumulado -= p.monto || 0;
        movimientos.push({
          _id: p._id,
          fecha: p.fecha,
          tipo: 'pago',
          numero: p.numero_recibo || '',
          descripcion: `Pago ${p.forma_pago || ''}`.trim(),
          debito: 0,
          credito: p.monto || 0,
          saldo: saldoAcumulado,
          forma_pago: p.forma_pago || '',
          estado_pago: 'pagado',
          dias_vencidos: diasDesde(p.fecha)
        });
      }

      // Reordenar todos los movimientos por fecha
      movimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      // Recalcular saldo corrido después de reordenar
      let saldo = 0;
      movimientos.forEach(m => {
        saldo += m.debito - m.credito;
        m.saldo = saldo;
      });
      saldoAcumulado = saldo;
    } catch (e) {
      // Si no existe la colección de pagos, ignorar
    }

    // 6. Calcular totales
    const totalDebitos = movimientos.reduce((sum, m) => sum + m.debito, 0);
    const totalCreditos = movimientos.reduce((sum, m) => sum + m.credito, 0);
    const saldoFinal = totalDebitos - totalCreditos;

    // 7. Calcular aging (solo deudas pendientes)
    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    const pendientes = movimientos.filter(m => m.tipo === 'factura' && m.estado_pago !== 'pagado');

    for (const m of pendientes) {
      const rango = rangoAging(m.dias_vencidos);
      aging[rango] += m.debito;
    }

    // 8. Resumen por tipo de documento
    const resumenPorTipo = movimientos.reduce((acc, m) => {
      if (!acc[m.tipo]) acc[m.tipo] = { cantidad: 0, total: 0 };
      acc[m.tipo].cantidad++;
      acc[m.tipo].total += m.debito || m.credito;
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

function describeTipo(tipo) {
  const map = {
    factura: 'Factura',
    nota_credito: 'Nota de Crédito',
    guia_remision: 'Guía de Remisión',
    exportacion: 'Factura de Exportación',
    reembolso: 'Factura de Reembolso',
    retencion: 'Comprobante de Retención',
    liquidacion: 'Liquidación de Compra',
    proforma: 'Proforma'
  };
  return map[tipo] || tipo;
}

// ===== RESUMEN DE CARTERA GENERAL =====
router.get('/', async (req, res) => {
  try {
    // Traer todos los clientes con saldo pendiente > 0
    const pipeline = [
      { $match: { tipo_documento: { $ne: 'guia_remision' } } },
      {
        $group: {
          _id: '$clienteId',
          totalDebitos: {
            $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          totalCreditos: {
            $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          cantidadFacturas: { $sum: 1 },
          ultimaFactura: { $max: '$fecha_emision' }
        }
      },
      {
        $addFields: {
          saldo: { $subtract: ['$totalDebitos', '$totalCreditos'] }
        }
      },
      { $match: { saldo: { $gt: 0.01 } } },
      {
        $lookup: {
          from: 'clientes',
          localField: '_id',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          clienteId: '$_id',
          clienteNombre: '$cliente.nombre',
          clienteRuc: '$cliente.ruc',
          clienteTelefono: '$cliente.telefono',
          totalDebitos: 1,
          totalCreditos: 1,
          saldo: 1,
          cantidadFacturas: 1,
          ultimaFactura: 1
        }
      },
      { $sort: { saldo: -1 } }
    ];

    const resultado = await req.db.collection('ventas_v2').aggregate(pipeline).toArray();

    // Totales generales
    const totalCartera = resultado.reduce((sum, r) => sum + (r.saldo || 0), 0);
    const clientesConDeuda = resultado.length;

    res.json({
      totalCartera,
      clientesConDeuda,
      clientes: resultado
    });
  } catch (err) {
    console.error('Error en resumen de cartera:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;