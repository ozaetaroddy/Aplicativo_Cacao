// backend/routes/pagos.js
// Registro de cobros (de clientes) y pagos (a proveedores).
// Al crear/eliminar un pago, recalcula el estado_pago del documento asociado.

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');

const TIPOS = ['cobro', 'pago'];  // cobro = cliente nos paga; pago = nosotros al proveedor
const FORMAS_PAGO_VALIDAS = ['01', '15', '16', '17', '18', '19', '20', '21'];

const validarPago = [
  body('tipo').isIn(TIPOS).withMessage(`tipo debe ser: ${TIPOS.join(', ')}`),
  body('monto').isNumeric().withMessage('monto debe ser número')
    .custom(v => parseFloat(v) > 0).withMessage('monto debe ser mayor a 0'),
  body('fecha').isISO8601().withMessage('Fecha inválida'),
  body('forma_pago').optional().isIn(FORMAS_PAGO_VALIDAS)
    .withMessage(`forma_pago inválida. Válidas: ${FORMAS_PAGO_VALIDAS.join(', ')}`),
  body('clienteId').if(body('tipo').equals('cobro'))
    .isMongoId().withMessage('ID de cliente inválido'),
  body('proveedorId').if(body('tipo').equals('pago'))
    .isMongoId().withMessage('ID de proveedor inválido')
];

// ============================================================
// RECALCULAR estado_pago del documento afectado
// ============================================================
async function recalcularEstadoVenta(db, ventaId, session) {
  if (!ventaId) return null;
  const venta = await db.collection('ventas_v2').findOne({ _id: ventaId }, { session });
  if (!venta) return null;

  const agg = await db.collection('pagos').aggregate([
    { $match: { ventaId, anulado: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$monto' } } }
  ], { session }).toArray();

  const pagado = +((agg[0]?.total) || 0).toFixed(2);
  const total = parseFloat(venta.total) || 0;

  let estado = 'pendiente';
  if (pagado >= total - 0.01) estado = 'pagado';
  else if (pagado > 0.01) estado = 'parcial';

  await db.collection('ventas_v2').updateOne(
    { _id: ventaId },
    { $set: { estado_pago: estado, monto_pagado: pagado, updatedAt: new Date() } },
    { session }
  );

  return { estado, pagado, total };
}

async function recalcularEstadoCompra(db, compraId, session) {
  if (!compraId) return null;
  const compra = await db.collection('compras_v2').findOne({ _id: compraId }, { session });
  if (!compra) return null;

  const agg = await db.collection('pagos').aggregate([
    { $match: { compraId, anulado: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$monto' } } }
  ], { session }).toArray();

  const pagado = +((agg[0]?.total) || 0).toFixed(2);
  const total = parseFloat(compra.total) || 0;

  let estado = 'pendiente';
  if (pagado >= total - 0.01) estado = 'pagado';
  else if (pagado > 0.01) estado = 'parcial';

  await db.collection('compras_v2').updateOne(
    { _id: compraId },
    { $set: { estado_pago: estado, monto_pagado: pagado, updatedAt: new Date() } },
    { session }
  );

  return { estado, pagado, total };
}

// ============================================================
// LISTAR PAGOS
// ============================================================
router.get('/', requierePermiso('pagos', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim();
    const { desde, hasta, tipo, clienteId, proveedorId, anulado } = req.query;

    const match = {};
    if (typeof tipo === 'string' && tipo) match.tipo = tipo;
    if (anulado === 'true') match.anulado = true;
    else if (anulado === 'false' || anulado === undefined) match.anulado = { $ne: true };
    if (typeof clienteId === 'string' && ObjectId.isValid(clienteId)) {
      match.clienteId = new ObjectId(clienteId);
    }
    if (typeof proveedorId === 'string' && ObjectId.isValid(proveedorId)) {
      match.proveedorId = new ObjectId(proveedorId);
    }

    if (desde || hasta) {
      match.fecha = {};
      if (desde) { const d = new Date(desde); if (!isNaN(d)) match.fecha.$gte = d; }
      if (hasta) { const h = new Date(hasta); if (!isNaN(h)) { h.setHours(23, 59, 59, 999); match.fecha.$lte = h; } }
    }

    const pipeline = [
      { $match: match },
      { $lookup: { from: 'clientes', localField: 'clienteId', foreignField: '_id', as: '_cliente' } },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: '_proveedor' } },
      {
        $addFields: {
          contraparteNombre: {
            $ifNull: [
              { $arrayElemAt: ['$_cliente.nombre', 0] },
              { $arrayElemAt: ['$_proveedor.nombre', 0] }
            ]
          },
          contraparteRuc: {
            $ifNull: [
              { $arrayElemAt: ['$_cliente.ruc', 0] },
              { $arrayElemAt: ['$_proveedor.ruc', 0] }
            ]
          }
        }
      },
      { $project: { _cliente: 0, _proveedor: 0 } }
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { numero_recibo: regex },
            { referencia: regex },
            { observaciones: regex },
            { contraparteNombre: regex },
            { contraparteRuc: regex }
          ]
        }
      });
    }

    const sort = parseSort(req.query, { fecha: -1 });

    if (!paginar) {
      pipeline.push({ $sort: sort });
      const data = await req.db.collection('pagos').aggregate(pipeline).toArray();
      return res.json(data);
    }

    const countRes = await req.db.collection('pagos').aggregate([...pipeline, { $count: 'total' }]).toArray();
    const total = countRes[0]?.total || 0;

    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const data = await req.db.collection('pagos').aggregate(pipeline).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Error listando pagos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// OBTENER UNO
// ============================================================
router.get('/:id', requierePermiso('pagos', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const pago = await req.db.collection('pagos').findOne({ _id: new ObjectId(id) });
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    let contraparte = null;
    if (pago.clienteId) {
      contraparte = await req.db.collection('clientes').findOne(
        { _id: pago.clienteId }, { projection: { nombre: 1, ruc: 1, telefono: 1, email: 1 } }
      );
    } else if (pago.proveedorId) {
      contraparte = await req.db.collection('proveedores').findOne(
        { _id: pago.proveedorId }, { projection: { nombre: 1, ruc: 1, telefono: 1, email: 1 } }
      );
    }

    res.json({ ...pago, contraparte });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CREAR PAGO
// ============================================================
router.post('/', requierePermiso('pagos', 'crear'), validarPago, async (req, res) => {
  if (validar(req, res)) return;

  const {
    tipo, monto, fecha, forma_pago, referencia, numero_recibo, observaciones,
    clienteId, proveedorId, ventaId, compraId
  } = req.body;

  if (tipo === 'cobro' && ventaId && !ObjectId.isValid(ventaId)) {
    return res.status(400).json({ error: 'ID de venta inválido' });
  }
  if (tipo === 'pago' && compraId && !ObjectId.isValid(compraId)) {
    return res.status(400).json({ error: 'ID de compra inválido' });
  }

  try {
    const pagoId = await conTransaccion(req.db, async (session) => {
      const doc = {
        tipo,
        monto: +parseFloat(monto).toFixed(2),
        fecha: new Date(fecha),
        forma_pago: forma_pago || '01',
        referencia: (referencia || '').trim(),
        numero_recibo: (numero_recibo || '').trim() || `REC-${Date.now()}`,
        observaciones: (observaciones || '').trim(),
        clienteId: tipo === 'cobro' && clienteId ? new ObjectId(clienteId) : null,
        proveedorId: tipo === 'pago' && proveedorId ? new ObjectId(proveedorId) : null,
        ventaId: tipo === 'cobro' && ventaId ? new ObjectId(ventaId) : null,
        compraId: tipo === 'pago' && compraId ? new ObjectId(compraId) : null,
        anulado: false,
        createdBy: {
          userId: req.user.userId,
          email: req.user.email
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await req.db.collection('pagos').insertOne(doc, { session });

      if (doc.ventaId) await recalcularEstadoVenta(req.db, doc.ventaId, session);
      if (doc.compraId) await recalcularEstadoCompra(req.db, doc.compraId, session);

      return result.insertedId;
    });

    const pagoCreado = await req.db.collection('pagos').findOne({ _id: pagoId });

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'pagos',
      documentoId: pagoId,
      documentoNumero: pagoCreado.numero_recibo,
      datosNuevos: pagoCreado,
      detalle: `${tipo === 'cobro' ? 'Cobro' : 'Pago'} registrado: $${pagoCreado.monto.toFixed(2)}`
    });

    if (req.io) req.io.emit('nuevo-pago', pagoCreado);

    res.status(201).json(pagoCreado);
  } catch (err) {
    console.error('Error creando pago:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ANULAR PAGO (soft delete)
// ============================================================
router.delete('/:id', requierePermiso('pagos', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const pago = await req.db.collection('pagos').findOne({ _id: new ObjectId(id) });
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.anulado) return res.status(400).json({ error: 'El pago ya está anulado' });

    await conTransaccion(req.db, async (session) => {
      await req.db.collection('pagos').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            anulado: true,
            anulado_en: new Date(),
            anulado_por: { userId: req.user.userId, email: req.user.email },
            updatedAt: new Date()
          }
        },
        { session }
      );

      if (pago.ventaId) await recalcularEstadoVenta(req.db, pago.ventaId, session);
      if (pago.compraId) await recalcularEstadoCompra(req.db, pago.compraId, session);
    });

    await logAudit(req.db, req, {
      accion: 'anular',
      coleccion: 'pagos',
      documentoId: id,
      documentoNumero: pago.numero_recibo,
      datosAnteriores: pago,
      detalle: `Pago anulado: ${pago.numero_recibo} ($${(pago.monto || 0).toFixed(2)})`
    });

    if (req.io) req.io.emit('pago-anulado', { id });

    res.json({ message: 'Pago anulado correctamente' });
  } catch (err) {
    console.error('Error anulando pago:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PAGOS DE UN CLIENTE
// ============================================================
router.get('/cliente/:clienteId', requierePermiso('pagos', 'ver'), async (req, res) => {
  try {
    const { clienteId } = req.params;
    if (!ObjectId.isValid(clienteId)) return res.status(400).json({ error: 'ID inválido' });

    const { desde, hasta } = req.query;
    const filter = { clienteId: new ObjectId(clienteId), anulado: { $ne: true } };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) { const h = new Date(hasta); h.setHours(23, 59, 59, 999); filter.fecha.$lte = h; }
    }

    const pagos = await req.db.collection('pagos').find(filter).sort({ fecha: 1 }).toArray();
    const total = pagos.reduce((s, p) => s + (p.monto || 0), 0);

    res.json({ pagos, total: +total.toFixed(2), cantidad: pagos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PAGOS A UN PROVEEDOR
// ============================================================
router.get('/proveedor/:proveedorId', requierePermiso('pagos', 'ver'), async (req, res) => {
  try {
    const { proveedorId } = req.params;
    if (!ObjectId.isValid(proveedorId)) return res.status(400).json({ error: 'ID inválido' });

    const { desde, hasta } = req.query;
    const filter = { proveedorId: new ObjectId(proveedorId), anulado: { $ne: true } };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) { const h = new Date(hasta); h.setHours(23, 59, 59, 999); filter.fecha.$lte = h; }
    }

    const pagos = await req.db.collection('pagos').find(filter).sort({ fecha: 1 }).toArray();
    const total = pagos.reduce((s, p) => s + (p.monto || 0), 0);

    res.json({ pagos, total: +total.toFixed(2), cantidad: pagos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// RESUMEN: CUENTAS POR COBRAR Y POR PAGAR (con aging)
// ✅ FIX: montos NETOS por cliente/proveedor, consistente con
// /estadisticas/dashboard y /estados-financieros/balance.
// Regla: saldo cliente = SUM(débitos) - SUM(NC) - SUM(cobros).
// Solo se incluyen los saldos POSITIVOS en la cartera.
// ============================================================
router.get('/resumen/cartera', requierePermiso('pagos', 'ver'), async (req, res) => {
  try {
    // ---------- CxC ----------
    // 1. Saldo neto por cliente
    const saldosClientes = await req.db.collection('ventas_v2').aggregate([
      { $match: { tipo_documento: { $nin: ['guia_remision', 'proforma'] } } },
      {
        $group: {
          _id: '$clienteId',
          debitos: { $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] } },
          creditosNC: { $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] } }
        }
      },
      {
        $lookup: {
          from: 'pagos',
          let: { cliId: '$_id' },
          pipeline: [
            { $match: {
              $expr: { $eq: ['$clienteId', '$$cliId'] },
              tipo: 'cobro',
              anulado: { $ne: true }
            } },
            { $group: { _id: null, total: { $sum: '$monto' } } }
          ],
          as: 'cobros'
        }
      },
      {
        $addFields: {
          cobrosTotal: { $ifNull: [{ $arrayElemAt: ['$cobros.total', 0] }, 0] }
        }
      },
      {
        $addFields: {
          saldoNeto: {
            $subtract: [
              { $subtract: ['$debitos', '$creditosNC'] },
              '$cobrosTotal'
            ]
          }
        }
      },
      { $match: { saldoNeto: { $gt: 0.01 } } }
    ]).toArray();

    // 2. Facturas pendientes de todos esos clientes (una sola query)
    const clienteIds = saldosClientes.map(s => s._id).filter(Boolean);
    let facturasPendientes = [];
    if (clienteIds.length > 0) {
      facturasPendientes = await req.db.collection('ventas_v2').find(
        {
          clienteId: { $in: clienteIds },
          tipo_documento: { $nin: ['guia_remision', 'proforma', 'nota_credito'] }
        },
        { projection: { clienteId: 1, numero_factura: 1, fecha_emision: 1, total: 1, estado_pago: 1 } }
      ).sort({ clienteId: 1, fecha_emision: 1 }).toArray();
    }

    // 3. Clientes (para nombre/RUC)
    const clientes = clienteIds.length
      ? await req.db.collection('clientes').find(
          { _id: { $in: clienteIds } },
          { projection: { nombre: 1, ruc: 1 } }
        ).toArray()
      : [];
    const clienteMap = new Map(clientes.map(c => [String(c._id), c]));

    // 4. Aplicar saldo FIFO por cliente y calcular aging
    const hoy = new Date();
    const agingCxC = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    const documentosCxC = [];
    let totalCxC = 0;

    const facturasPorCliente = new Map();
    for (const f of facturasPendientes) {
      const k = String(f.clienteId);
      if (!facturasPorCliente.has(k)) facturasPorCliente.set(k, []);
      facturasPorCliente.get(k).push(f);
    }

    for (const s of saldosClientes) {
      const cliId = String(s._id);
      const facturas = facturasPorCliente.get(cliId) || [];
      let credito = s.saldoNeto;
      if (credito <= 0.01) continue;

      for (const f of facturas) {
        if (credito <= 0.01) break;
        const aplicable = Math.min(credito, f.total || 0);
        if (aplicable <= 0.01) continue;
        credito -= aplicable;

        const dias = Math.floor((hoy - new Date(f.fecha_emision)) / 86400000);
        const r = dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90';
        agingCxC[r] += aplicable;
        totalCxC += aplicable;

        const cli = clienteMap.get(cliId);
        documentosCxC.push({
          _id: f._id,
          numero_factura: f.numero_factura,
          fecha_emision: f.fecha_emision,
          total: f.total,
          estado_pago: f.estado_pago,
          clienteNombre: cli?.nombre || 'Cliente eliminado',
          clienteRuc: cli?.ruc || '',
          dias,
          saldoPendiente: +aplicable.toFixed(2)
        });
      }
    }

    Object.keys(agingCxC).forEach(k => { agingCxC[k] = +agingCxC[k].toFixed(2); });

    // ---------- CxP ----------
    const saldosProveedores = await req.db.collection('compras_v2').aggregate([
      { $group: { _id: '$proveedorId', total: { $sum: '$total' } } },
      {
        $lookup: {
          from: 'pagos',
          let: { provId: '$_id' },
          pipeline: [
            { $match: {
              $expr: { $eq: ['$proveedorId', '$$provId'] },
              tipo: 'pago',
              anulado: { $ne: true }
            } },
            { $group: { _id: null, total: { $sum: '$monto' } } }
          ],
          as: 'pagos'
        }
      },
      {
        $addFields: {
          pagosTotal: { $ifNull: [{ $arrayElemAt: ['$pagos.total', 0] }, 0] }
        }
      },
      {
        $addFields: {
          saldoNeto: { $subtract: ['$total', '$pagosTotal'] }
        }
      },
      { $match: { saldoNeto: { $gt: 0.01 } } }
    ]).toArray();

    const provIds = saldosProveedores.map(s => s._id).filter(Boolean);
    let comprasPendientes = [];
    if (provIds.length > 0) {
      comprasPendientes = await req.db.collection('compras_v2').find(
        { proveedorId: { $in: provIds } },
        { projection: { proveedorId: 1, numero_factura: 1, fecha_emision: 1, total: 1, estado_pago: 1 } }
      ).sort({ proveedorId: 1, fecha_emision: 1 }).toArray();
    }

    const proveedores = provIds.length
      ? await req.db.collection('proveedores').find(
          { _id: { $in: provIds } },
          { projection: { nombre: 1, ruc: 1 } }
        ).toArray()
      : [];
    const provMap = new Map(proveedores.map(p => [String(p._id), p]));

    const agingCxP = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    const documentosCxP = [];
    let totalCxP = 0;

    const comprasPorProv = new Map();
    for (const c of comprasPendientes) {
      const k = String(c.proveedorId);
      if (!comprasPorProv.has(k)) comprasPorProv.set(k, []);
      comprasPorProv.get(k).push(c);
    }

    for (const s of saldosProveedores) {
      const provId = String(s._id);
      const compras = comprasPorProv.get(provId) || [];
      let credito = s.saldoNeto;
      if (credito <= 0.01) continue;

      for (const c of compras) {
        if (credito <= 0.01) break;
        const aplicable = Math.min(credito, c.total || 0);
        if (aplicable <= 0.01) continue;
        credito -= aplicable;

        const dias = Math.floor((hoy - new Date(c.fecha_emision)) / 86400000);
        const r = dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90';
        agingCxP[r] += aplicable;
        totalCxP += aplicable;

        const prov = provMap.get(provId);
        documentosCxP.push({
          _id: c._id,
          numero_factura: c.numero_factura,
          fecha_emision: c.fecha_emision,
          total: c.total,
          estado_pago: c.estado_pago,
          proveedorNombre: prov?.nombre || 'Proveedor eliminado',
          proveedorRuc: prov?.ruc || '',
          dias,
          saldoPendiente: +aplicable.toFixed(2)
        });
      }
    }

    Object.keys(agingCxP).forEach(k => { agingCxP[k] = +agingCxP[k].toFixed(2); });

    res.json({
      cuentasPorCobrar: {
        total: +totalCxC.toFixed(2),
        aging: agingCxC,
        documentos: documentosCxC
      },
      cuentasPorPagar: {
        total: +totalCxP.toFixed(2),
        aging: agingCxP,
        documentos: documentosCxP
      }
    });
  } catch (err) {
    console.error('Error en resumen de cartera:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;