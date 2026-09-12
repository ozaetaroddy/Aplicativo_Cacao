// backend/routes/compras.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { verificarPeriodoAbierto, obtenerPeriodoCerrado, MESES } = require('../utils/periodos');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');

const TIPOS_COMPRA_VALIDOS = ['inventario', 'gasto'];
const ESTADOS_PAGO_VALIDOS = ['pendiente', 'pagado', 'parcial', 'anulado'];

const validarCompra = [
  body('proveedorId').isMongoId().withMessage('ID de proveedor inválido'),
  body('fecha_emision').isISO8601().withMessage('Fecha inválida'),
  body('detalles').isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle'),
  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),
  body('tipo_compra').optional().isIn(TIPOS_COMPRA_VALIDOS)
    .withMessage(`Tipo de compra debe ser: ${TIPOS_COMPRA_VALIDOS.join(' o ')}`),
  body('estado_pago').optional().isIn(ESTADOS_PAGO_VALIDOS)
    .withMessage(`Estado de pago inválido. Válidos: ${ESTADOS_PAGO_VALIDOS.join(', ')}`)
];

function validarTotales(body) {
  const subtotal = parseFloat(body.subtotal) || 0;
  const iva = parseFloat(body.iva) || 0;
  const total = parseFloat(body.total) || 0;
  const esperado = +(subtotal + iva).toFixed(2);
  if (Math.abs(esperado - total) > 0.01) {
    return `Total inconsistente: subtotal(${subtotal}) + iva(${iva}) = ${esperado}, pero se envió total=${total}`;
  }
  return null;
}

function validarFechaNoFutura(fecha) {
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return 'Fecha inválida';
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  hoy.setDate(hoy.getDate() + 1);
  if (d > hoy) return 'La fecha de emisión no puede ser futura';
  return null;
}

async function reservarContadorCompra(db) {
  const r = await db.collection('contadores').findOneAndUpdate(
    { _id: 'compra' },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return r?.valor || 1;
}

async function actualizarStockAtomico(db, productoId, cantidad, signoStock, session, extras = {}) {
  const filtro = signoStock < 0
    ? { _id: productoId, stock: { $gte: cantidad } }
    : { _id: productoId };

  const r = await db.collection('productos').updateOne(
    filtro,
    { $inc: { stock: signoStock * cantidad }, $set: { updatedAt: new Date(), ...extras } },
    { session }
  );

  if (r.matchedCount === 0) {
    throw new Error(
      `No se puede revertir la compra: el stock del producto ${productoId} ya fue consumido ` +
      `(se intentó restar ${cantidad} unidades pero no hay suficiente disponible)`
    );
  }

  return await db.collection('productos').findOne({ _id: productoId }, { session });
}

// ============================================================
// LISTAR
// ============================================================
router.get('/', requierePermiso('compras', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim();
    const { desde, hasta, tipo_compra, estado_pago, proveedorId } = req.query;

    const matchStage = {};
    if (desde || hasta) {
      matchStage.fecha_emision = {};
      if (desde) { const d = new Date(desde); if (!isNaN(d)) matchStage.fecha_emision.$gte = d; }
      if (hasta) { const h = new Date(hasta); if (!isNaN(h)) { h.setHours(23, 59, 59, 999); matchStage.fecha_emision.$lte = h; } }
    }
    if (typeof tipo_compra === 'string' && tipo_compra) matchStage.tipo_compra = tipo_compra;
    if (typeof estado_pago === 'string' && estado_pago) matchStage.estado_pago = estado_pago;
    if (typeof proveedorId === 'string' && ObjectId.isValid(proveedorId)) {
      matchStage.proveedorId = new ObjectId(proveedorId);
    }

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { numero_factura: regex },
            { 'proveedor.nombre': regex },
            { 'proveedor.ruc': regex }
          ]
        }
      });
    }

    const sort = parseSort(req.query, { fecha_emision: -1 });

    if (!paginar) {
      pipeline.push({ $sort: sort });
      const compras = await req.db.collection('compras_v2').aggregate(pipeline).toArray();
      return res.json(compras);
    }

    const countResult = await req.db.collection('compras_v2').aggregate([...pipeline, { $count: 'total' }]).toArray();
    const total = countResult[0]?.total || 0;

    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const compras = await req.db.collection('compras_v2').aggregate(pipeline).toArray();

    res.json({ data: compras, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Error listando compras:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/cuentas-por-pagar', requierePermiso('compras', 'ver'), async (req, res) => {
  try {
    const pipeline = [
      { $match: { estado_pago: { $ne: 'pagado' } } },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'pagos',
          let: { compraId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$compraId', '$$compraId'] }, anulado: { $ne: true } } },
            { $group: { _id: null, total: { $sum: '$monto' } } }
          ],
          as: 'pagos'
        }
      },
      { $addFields: { montoPagado: { $ifNull: [{ $arrayElemAt: ['$pagos.total', 0] }, 0] } } },
      { $addFields: { saldoPendiente: { $subtract: ['$total', '$montoPagado'] } } },
      { $match: { saldoPendiente: { $gt: 0.01 } } },
      {
        $project: {
          proveedorId: 1,
          proveedorNombre: '$proveedor.nombre',
          proveedorRuc: '$proveedor.ruc',
          numero_factura: 1,
          fecha_emision: 1,
          total: 1,
          montoPagado: 1,
          saldoPendiente: 1,
          estado_pago: 1,
          dias: { $divide: [{ $subtract: [new Date(), '$fecha_emision'] }, 86400000] }
        }
      },
      { $sort: { fecha_emision: 1 } }
    ];

    const compras = await req.db.collection('compras_v2').aggregate(pipeline).toArray();

    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    let totalPagar = 0;
    compras.forEach(c => {
      totalPagar += c.saldoPendiente || 0;
      const d = Math.floor(c.dias || 0);
      if (d <= 30) aging['0-30'] += c.saldoPendiente || 0;
      else if (d <= 60) aging['31-60'] += c.saldoPendiente || 0;
      else if (d <= 90) aging['61-90'] += c.saldoPendiente || 0;
      else aging['+90'] += c.saldoPendiente || 0;
    });

    Object.keys(aging).forEach(k => { aging[k] = +aging[k].toFixed(2); });

    res.json({
      totalPagar: +totalPagar.toFixed(2),
      cantidadFacturas: compras.length,
      aging,
      facturas: compras
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/por-proveedor', requierePermiso('compras', 'ver'), async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const match = {};
    if (desde || hasta) {
      match.fecha_emision = {};
      if (desde) match.fecha_emision.$gte = new Date(desde);
      if (hasta) { const h = new Date(hasta); h.setHours(23, 59, 59, 999); match.fecha_emision.$lte = h; }
    }

    const resultado = await req.db.collection('compras_v2').aggregate([
      { $match: match },
      {
        $group: {
          _id: '$proveedorId',
          totalCompras: { $sum: '$total' },
          subtotal: { $sum: '$subtotal' },
          iva: { $sum: '$iva' },
          retencion: { $sum: '$retencion_valor' },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { totalCompras: -1 } },
      { $lookup: { from: 'proveedores', localField: '_id', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          proveedorId: '$_id',
          proveedorNombre: '$proveedor.nombre',
          proveedorRuc: '$proveedor.ruc',
          totalCompras: 1, subtotal: 1, iva: 1, retencion: 1, cantidad: 1
        }
      }
    ]).toArray();

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reporte-mensual/:mes/:anio', requierePermiso('compras', 'ver'), async (req, res) => {
  try {
    const { mes, anio } = req.params;
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    if (mesNum < 1 || mesNum > 12) return res.status(400).json({ error: 'Mes inválido (1-12)' });
    if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) return res.status(400).json({ error: 'Año fuera de rango' });

    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0);
    fin.setHours(23, 59, 59, 999);

    const compras = await req.db.collection('compras_v2').aggregate([
      { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalComprasInventario: { $sum: { $cond: [{ $eq: ['$tipo_compra', 'inventario'] }, '$total', 0] } },
          totalComprasGasto: { $sum: { $cond: [{ $eq: ['$tipo_compra', 'gasto'] }, '$total', 0] } },
          totalIva: { $sum: '$iva' },
          totalRetenido: { $sum: '$retencion_valor' },
          compras: { $push: '$$ROOT' }
        }
      }
    ]).toArray();

    const reporte = compras.length > 0 ? compras[0] : {
      totalComprasInventario: 0, totalComprasGasto: 0, totalIva: 0, totalRetenido: 0, compras: []
    };

    reporte.mes = mesNum;
    reporte.anio = anioNum;
    reporte.nombre = `${MESES[mesNum - 1]} ${anioNum}`;
    reporte.desde = inicio;
    reporte.hasta = fin;

    res.json(reporte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requierePermiso('compras', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const compra = await req.db.collection('compras_v2').aggregate([
      { $match: { _id: new ObjectId(id) } },
      { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
    ]).toArray();
    if (compra.length === 0) return res.status(404).json({ error: 'Compra no encontrada' });
    res.json(compra[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CREAR
// ============================================================
router.post('/',
  requierePermiso('compras', 'crear'),
  verificarPeriodoAbierto(),
  validarCompra,
  async (req, res) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales });

    const errorFecha = validarFechaNoFutura(req.body.fecha_emision);
    if (errorFecha) return res.status(400).json({ error: errorFecha });

    try {
      const {
        proveedorId, numero_factura, fecha_emision,
        detalles, subtotal, iva, total,
        tipo_compra, estado_pago, forma_pago,
        fecha_pago, retencion_valor, retencion_porcentaje,
        observaciones
      } = req.body;

      const tipoCompra = tipo_compra || 'inventario';
      const retencionValorNum = parseFloat(retencion_valor) || 0;

      if (tipoCompra === 'inventario') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle.productoId)) {
            throw new Error(`ID de producto inválido: ${detalle.productoId}`);
          }
          const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(detalle.productoId) });
          if (!producto) throw new Error(`Producto ${detalle.productoId} no encontrado`);
        }
      }

      const contadorValor = await reservarContadorCompra(req.db);
      const codigo = `COM-${String(contadorValor).padStart(6, '0')}`;

      const result = await conTransaccion(req.db, async (session) => {
        const compra = {
          proveedorId: new ObjectId(proveedorId),
          numero_factura: numero_factura || codigo,
          fecha_emision: new Date(fecha_emision),
          detalles, subtotal, iva, total,
          tipo_compra: tipoCompra,
          estado_pago: estado_pago || 'pendiente',
          monto_pagado: 0,
          forma_pago: forma_pago || '',
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          retencion_valor: retencionValorNum,
          retencion_porcentaje: parseFloat(retencion_porcentaje) || 0,
          retencion_pendiente_emision: retencionValorNum > 0,
          observaciones: observaciones || '',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const compraResult = await req.db.collection('compras_v2').insertOne(compra, { session });
        const compraId = compraResult.insertedId;

        if (tipoCompra === 'inventario') {
          for (const detalle of detalles) {
            const productoId = new ObjectId(detalle.productoId);
            const productoActualizado = await actualizarStockAtomico(
              req.db, productoId, detalle.cantidad, +1, session,
              { precio_compra: detalle.costo_unitario }
            );

            await req.db.collection('kardex').insertOne({
              productoId,
              fecha: new Date(fecha_emision),
              tipo_movimiento: 'compra',
              cantidad: detalle.cantidad,
              costo_unitario: detalle.costo_unitario,
              saldo: productoActualizado.stock,
              referencia_id: compraId,
              referencia_tipo: 'compra',
              createdAt: new Date()
            }, { session });
          }
        }

        return compraResult;
      });

      const compraCreada = await req.db.collection('compras_v2').aggregate([
        { $match: { _id: result.insertedId } },
        { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
        { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
      ]).toArray();

      await logAudit(req.db, req, {
        accion: 'crear', coleccion: 'compras', documentoId: result.insertedId,
        documentoNumero: compraCreada[0]?.numero_factura || '',
        datosNuevos: compraCreada[0],
        detalle: `Compra creada: ${compraCreada[0]?.numero_factura || ''} por $${(compraCreada[0]?.total || 0).toFixed(2)}`
      });

      if (req.io) req.io.emit('nueva-compra', compraCreada[0]);

      const advertencia = retencionValorNum > 0
        ? 'Esta compra tiene retención. Debe emitir el comprobante de retención electrónico desde el módulo de Ventas (tipo_documento: retencion).'
        : null;

      res.status(201).json({
        ...compraCreada[0],
        _advertencia: advertencia
      });
    } catch (err) {
      console.error('Error en compra:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================
// ACTUALIZAR
// ============================================================
router.put('/:id',
  requierePermiso('compras', 'editar'),
  verificarPeriodoAbierto(),
  validarCompra,
  async (req, res) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales });

    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

      // ✅ Reutiliza el documento que ya leyó verificarPeriodoAbierto()
      const compraActual = req._documentoOriginal
        || await req.db.collection('compras_v2').findOne({ _id: new ObjectId(id) });
      if (!compraActual) return res.status(404).json({ error: 'Compra no encontrada' });

      const {
        proveedorId, numero_factura, fecha_emision,
        detalles, subtotal, iva, total,
        tipo_compra, estado_pago, forma_pago,
        fecha_pago, retencion_valor, retencion_porcentaje,
        observaciones
      } = req.body;

      const tipoCompra = tipo_compra || 'inventario';
      const retencionValorNum = parseFloat(retencion_valor) || 0;

      if (tipoCompra === 'inventario') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle.productoId)) {
            throw new Error(`ID de producto inválido: ${detalle.productoId}`);
          }
          const producto = await req.db.collection('productos').findOne({ _id: new ObjectId(detalle.productoId) });
          if (!producto) throw new Error(`Producto ${detalle.productoId} no encontrado`);
        }
      }

      await conTransaccion(req.db, async (session) => {
        if (compraActual.tipo_compra === 'inventario') {
          for (const detalle of compraActual.detalles) {
            const productoId = new ObjectId(detalle.productoId);
            await actualizarStockAtomico(req.db, productoId, detalle.cantidad, -1, session);
          }
          await req.db.collection('kardex').deleteMany(
            { referencia_id: new ObjectId(id), referencia_tipo: 'compra' },
            { session }
          );
        }

        const updateData = {
          proveedorId: new ObjectId(proveedorId),
          numero_factura,
          fecha_emision: new Date(fecha_emision),
          detalles, subtotal, iva, total,
          tipo_compra: tipoCompra,
          estado_pago,
          forma_pago,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          retencion_valor: retencionValorNum,
          retencion_porcentaje: parseFloat(retencion_porcentaje) || 0,
          retencion_pendiente_emision: retencionValorNum > 0,
          observaciones: observaciones || '',
          updatedAt: new Date()
        };

        await req.db.collection('compras_v2').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { session }
        );

        if (tipoCompra === 'inventario') {
          for (const detalle of detalles) {
            const productoId = new ObjectId(detalle.productoId);
            const productoActualizado = await actualizarStockAtomico(
              req.db, productoId, detalle.cantidad, +1, session,
              { precio_compra: detalle.costo_unitario }
            );

            await req.db.collection('kardex').insertOne({
              productoId,
              fecha: new Date(fecha_emision),
              tipo_movimiento: 'compra',
              cantidad: detalle.cantidad,
              costo_unitario: detalle.costo_unitario,
              saldo: productoActualizado.stock,
              referencia_id: new ObjectId(id),
              referencia_tipo: 'compra',
              createdAt: new Date()
            }, { session });
          }
        }
      });

      const compraActualizada = await req.db.collection('compras_v2').aggregate([
        { $match: { _id: new ObjectId(id) } },
        { $lookup: { from: 'proveedores', localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
        { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
      ]).toArray();

      await logAudit(req.db, req, {
        accion: 'actualizar', coleccion: 'compras', documentoId: id,
        documentoNumero: compraActualizada[0]?.numero_factura || '',
        datosAnteriores: compraActual,
        datosNuevos: compraActualizada[0],
        detalle: `Compra actualizada: ${compraActualizada[0]?.numero_factura || ''}`
      });

      if (req.io) req.io.emit('compra-actualizada', compraActualizada[0]);
      res.json(compraActualizada[0]);
    } catch (err) {
      console.error('Error actualizando compra:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================
// ELIMINAR
// ============================================================
router.delete('/:id',
  requierePermiso('compras', 'eliminar'),
  verificarPeriodoAbierto(),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

      // ✅ Reutiliza el documento que ya leyó verificarPeriodoAbierto()
      const compra = req._documentoOriginal
        || await req.db.collection('compras_v2').findOne({ _id: new ObjectId(id) });
      if (!compra) return res.status(404).json({ error: 'Compra no encontrada' });

      const pagosAsociados = await req.db.collection('pagos').countDocuments({
        compraId: new ObjectId(id), anulado: { $ne: true }
      });
      if (pagosAsociados > 0) {
        return res.status(409).json({
          error: `No se puede eliminar: hay ${pagosAsociados} pagos registrados. Anule los pagos primero.`,
          pagosAsociados
        });
      }

      await conTransaccion(req.db, async (session) => {
        if (compra.tipo_compra === 'inventario') {
          for (const detalle of compra.detalles) {
            const productoId = new ObjectId(detalle.productoId);
            await actualizarStockAtomico(req.db, productoId, detalle.cantidad, -1, session);
          }
          await req.db.collection('kardex').deleteMany(
            { referencia_id: new ObjectId(id), referencia_tipo: 'compra' },
            { session }
          );
        }

        await req.db.collection('compras_v2').deleteOne({ _id: new ObjectId(id) }, { session });
      });

      await logAudit(req.db, req, {
        accion: 'eliminar', coleccion: 'compras', documentoId: id,
        documentoNumero: compra.numero_factura || '',
        datosAnteriores: compra,
        detalle: `Compra eliminada: ${compra.numero_factura || ''} por $${(compra.total || 0).toFixed(2)}`
      });

      if (req.io) req.io.emit('compra-eliminada', { id });
      res.json({ message: 'Compra eliminada correctamente' });
    } catch (err) {
      console.error('Error eliminando compra:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================
// IMPORTAR TXT (formato SRI) — cache perezoso por código
// ============================================================
router.post('/importar-txt',
  requierePermiso('compras', 'crear'),
  async (req, res) => {
    try {
      const { lineas } = req.body;
      if (!lineas || !Array.isArray(lineas) || lineas.length === 0) {
        return res.status(400).json({ error: 'No se enviaron líneas para importar' });
      }
      if (lineas.length > 500) {
        return res.status(413).json({ error: 'Máximo 500 líneas por importación' });
      }

      const productosCache = new Map();

      const buscarProducto = async (codigoProducto, session) => {
        if (!codigoProducto) return null;
        const key = String(codigoProducto).toLowerCase();
        if (productosCache.has(key)) return productosCache.get(key);

        const prod = await req.db.collection('productos').findOne(
          { $or: [{ codigo: codigoProducto }, { codigo_barras: codigoProducto }] },
          { collation: { locale: 'es', strength: 2 }, session }
        );
        productosCache.set(key, prod);
        return prod;
      };

      const proveedoresCache = new Map();
      let proveedoresCreados = 0;

      const buscarOCrearProveedor = async (ruc, razonSocial, session) => {
        const key = String(ruc).trim();
        if (proveedoresCache.has(key)) return proveedoresCache.get(key);

        let prov = await req.db.collection('proveedores').findOne({ ruc: key }, { session });
        if (!prov) {
          const nuevoProv = {
            nombre: (razonSocial || `Proveedor ${ruc}`).trim(),
            ruc: key, telefono: '', email: '', direccion: '',
            createdAt: new Date()
          };
          const resultProv = await req.db.collection('proveedores').insertOne(nuevoProv, { session });
          prov = { ...nuevoProv, _id: resultProv.insertedId };
          proveedoresCreados++;
        }
        proveedoresCache.set(key, prov);
        return prov;
      };

      const periodosCerradosDetectados = new Set();
      for (let idx = 0; idx < lineas.length; idx++) {
        const fecha = lineas[idx]?.fechaEmision ? new Date(lineas[idx].fechaEmision) : null;
        if (!fecha || isNaN(fecha.getTime())) continue;
        const periodo = await obtenerPeriodoCerrado(req.db, fecha);
        if (periodo) periodosCerradosDetectados.add(`${MESES[periodo.mes - 1]} ${periodo.anio}`);
      }
      if (periodosCerradosDetectados.size > 0) {
        return res.status(423).json({
          error: `Hay líneas con fechas en períodos cerrados: ${[...periodosCerradosDetectados].join(', ')}. Reabra el período o corrija las fechas.`,
          codigo: 'PERIODO_CERRADO',
          periodos: [...periodosCerradosDetectados]
        });
      }

      const resultados = [];
      const errores = [];
      let importados = 0;

      await conTransaccion(req.db, async (session) => {
        for (let idx = 0; idx < lineas.length; idx++) {
          const linea = lineas[idx];
          try {
            const { ruc, razonSocial, fechaEmision, total, valorSinImpuestos, iva, tipo_compra, codigoProducto } = linea;

            if (!ruc || !total || total === 0) {
              errores.push(`Línea ${idx + 1}: sin RUC o total inválido`);
              continue;
            }

            const fecha = fechaEmision ? new Date(fechaEmision) : null;
            if (!fecha || isNaN(fecha.getTime())) {
              errores.push(`Línea ${idx + 1} (RUC ${ruc}): fecha inválida "${fechaEmision}"`);
              continue;
            }

            const proveedor = await buscarOCrearProveedor(ruc, razonSocial, session);

            const producto = await buscarProducto(codigoProducto, session);
            if (!producto) {
              errores.push(`Línea ${idx + 1} (RUC ${ruc}): producto no encontrado${codigoProducto ? ` con código "${codigoProducto}"` : ' (sin código)'}`);
              continue;
            }

            const contadorResult = await req.db.collection('contadores').findOneAndUpdate(
              { _id: 'compra' },
              { $inc: { valor: 1 } },
              { upsert: true, returnDocument: 'after', session }
            );
            const codigo = `COM-${String(contadorResult.valor).padStart(6, '0')}`;

            const compraData = {
              proveedorId: proveedor._id,
              numero_factura: codigo,
              fecha_emision: fecha,
              detalles: [{
                productoId: producto._id,
                cantidad: 1,
                costo_unitario: parseFloat(total) || 0,
                aplica_iva: parseFloat(iva) > 0
              }],
              subtotal: parseFloat(valorSinImpuestos) || 0,
              iva: parseFloat(iva) || 0,
              total: parseFloat(total) || 0,
              tipo_compra: tipo_compra || 'inventario',
              estado_pago: 'pendiente',
              monto_pagado: 0,
              forma_pago: '',
              fecha_pago: null,
              retencion_valor: 0,
              retencion_porcentaje: 0,
              retencion_pendiente_emision: false,
              observaciones: `Importado desde TXT. Emisor: ${razonSocial}`,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            const compraResult = await req.db.collection('compras_v2').insertOne(compraData, { session });
            const compraId = compraResult.insertedId;

            if ((tipo_compra || 'inventario') === 'inventario') {
              const productoActualizado = await actualizarStockAtomico(
                req.db, producto._id, 1, +1, session, { precio_compra: parseFloat(total) }
              );

              await req.db.collection('kardex').insertOne({
                productoId: producto._id,
                fecha: compraData.fecha_emision,
                tipo_movimiento: 'compra',
                cantidad: 1,
                costo_unitario: parseFloat(total),
                saldo: productoActualizado.stock,
                referencia_id: compraId,
                referencia_tipo: 'compra',
                createdAt: new Date()
              }, { session });
            }

            resultados.push({ compraId, numero: compraData.numero_factura, ruc });
            importados++;
          } catch (lineaError) {
            errores.push(`Línea ${idx + 1}: ${lineaError.message}`);
          }
        }
      });

      await logAudit(req.db, req, {
        accion: 'importar', coleccion: 'compras',
        documentoNumero: `${importados} facturas`,
        datosNuevos: { importados, errores: errores.length, proveedoresCreados },
        detalle: `Importación TXT: ${importados} facturas, ${errores.length} errores, ${proveedoresCreados} proveedores creados`
      });

      res.json({ success: true, importados, errores, resultados, proveedoresCreados });
    } catch (err) {
      console.error('Error en importación:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;