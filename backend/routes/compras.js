// backend/routes/compras.js
// ============================================================
// Compras — CRUD + reportes + importación TXT
// ------------------------------------------------------------
// Endpoints:
//   GET    /                                     → listado
//   GET    /cuentas-por-pagar                    → aging de CxP
//   GET    /por-proveedor                        → totales por proveedor
//   GET    /reporte-mensual/:mes/:anio           → reporte del mes
//   GET    /:id                                  → detalle
//   POST   /                                     → crear
//   PUT    /:id                                  → actualizar
//   DELETE /:id                                  → eliminar
//   POST   /importar-txt                         → importar lote
//
// Convenciones:
//   - Todas las rutas requieren permisos (`compras:*`).
//   - Escrituras pasan por `verificarPeriodoAbierto()`.
//   - Cambios de stock se hacen dentro de transacción con guard de cantidad.
//   - Errores se delegan al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const {
  verificarPeriodoAbierto,
  obtenerPeriodosCerradosEnFechas,
  MESES
} = require('../utils/periodos');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  colCompras: 'compras_v2',
  colProveedores: 'proveedores',
  colProductos: 'productos',
  colKardex: 'kardex',
  colPagos: 'pagos',
  colRetenciones: 'retenciones',
  colContadores: 'contadores',
  tiposCompra: Object.freeze(['inventario', 'gasto']),
  estadosPago: Object.freeze(['pendiente', 'pagado', 'parcial', 'anulado']),
  maxDetallesPorDocumento: 500,
  importBatchSize: 50,
  importMaxLineas: 500,
  anioMin: 2000,
  anioMax: 2100
});

const TIPOS_COMPRA_VALIDOS = CONFIG.tiposCompra;
const ESTADOS_PAGO_VALIDOS = CONFIG.estadosPago;
const MAX_DETALLES_POR_DOCUMENTO = CONFIG.maxDetallesPorDocumento;
const IMPORT_BATCH_SIZE = CONFIG.importBatchSize;
const IMPORT_MAX_LINEAS = CONFIG.importMaxLineas;

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function requireObjectId(id, codigo = 'ID_INVALIDO') {
  if (!ObjectId.isValid(id)) {
    const err = new Error('ID inválido');
    err.status = 400;
    err.codigo = codigo;
    throw err;
  }
  return new ObjectId(id);
}

/** Parsea fecha ISO; devuelve null si inválida. */
function parseFecha(v) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Devuelve un número finito o el fallback. NO silencia negativos. */
function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Redondea a 2 decimales como número. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar compra');
  }
}

// ============================================================
// VALIDACIONES DE NEGOCIO
// ============================================================
const validarCompra = [
  body('proveedorId').isMongoId().withMessage('ID de proveedor inválido'),
  body('fecha_emision').isISO8601().withMessage('Fecha inválida'),
  body('detalles').isArray({ min: 1 }).withMessage('Debe incluir al menos un detalle')
    .custom(arr => Array.isArray(arr) && arr.length <= MAX_DETALLES_POR_DOCUMENTO)
    .withMessage(`Máximo ${MAX_DETALLES_POR_DOCUMENTO} detalles por documento`),
  body('subtotal').isNumeric().withMessage('Subtotal debe ser número'),
  body('iva').isNumeric().withMessage('IVA debe ser número'),
  body('total').isNumeric().withMessage('Total debe ser número'),
  body('tipo_compra').optional().isIn(TIPOS_COMPRA_VALIDOS)
    .withMessage(`Tipo de compra debe ser: ${TIPOS_COMPRA_VALIDOS.join(' o ')}`),
  body('estado_pago').optional().isIn(ESTADOS_PAGO_VALIDOS)
    .withMessage(`Estado de pago inválido. Válidos: ${ESTADOS_PAGO_VALIDOS.join(', ')}`),
  body('numero_factura').optional({ nullable: true }).isString().trim()
    .isLength({ max: 50 }).withMessage('Número de factura demasiado largo'),
  body('observaciones').optional({ nullable: true }).isString().trim()
    .isLength({ max: 1000 }).withMessage('Observaciones demasiado largas')
];

function validarTotales(body) {
  const subtotal = toNumber(body.subtotal);
  const iva = toNumber(body.iva);
  const total = toNumber(body.total);
  const esperado = round2(subtotal + iva);
  if (Math.abs(esperado - total) > 0.01) {
    return `Total inconsistente: subtotal(${subtotal}) + iva(${iva}) = ${esperado}, pero se envió total=${total}`;
  }
  return null;
}

function validarFechaNoFutura(fecha) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return 'Fecha inválida';
  const limite = new Date();
  limite.setHours(23, 59, 59, 999);
  limite.setDate(limite.getDate() + 1); // margen por zona horaria
  if (d > limite) return 'La fecha de emisión no puede ser futura';
  return null;
}

/** Valida un detalle (cantidad > 0, costo ≥ 0). Devuelve mensaje o null. */
function validarDetalle(detalle) {
  const cantidad = Number(detalle?.cantidad);
  const costo = Number(detalle?.costo_unitario);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return `Cantidad inválida en detalle (debe ser > 0): ${detalle?.cantidad}`;
  }
  if (!Number.isFinite(costo) || costo < 0) {
    return `Costo unitario inválido (debe ser >= 0): ${detalle?.costo_unitario}`;
  }
  return null;
}

// ============================================================
// HELPERS DE STOCK
// ============================================================
/** Reserva un número secuencial de compra (atómico). */
async function reservarContadorCompra(db, session = null) {
  const opts = { upsert: true, returnDocument: 'after' };
  if (session) opts.session = session;

  const r = await db.collection(CONFIG.colContadores).findOneAndUpdate(
    { _id: 'compra' },
    { $inc: { valor: 1 } },
    opts
  );

  // Driver v3 devuelve {value: doc}, v4+ devuelve el doc directo.
  const doc = r && r.value !== undefined ? r.value : r;
  return toNumber(doc?.valor, 1);
}

/**
 * Actualiza stock atómicamente. Si `signoStock < 0` exige stock suficiente.
 * @returns {Promise<object>} producto actualizado
 * @throws si no hay stock suficiente o el producto no existe
 */
async function actualizarStockAtomico(db, productoId, cantidad, signoStock, session, extras = {}) {
  const cant = Math.abs(Number(cantidad));
  const filtro = signoStock < 0
    ? { _id: productoId, stock: { $gte: cant } }
    : { _id: productoId };

  const r = await db.collection(CONFIG.colProductos).updateOne(
    filtro,
    { $inc: { stock: signoStock * cant }, $set: { updatedAt: new Date(), ...extras } },
    { session }
  );

  if (r.matchedCount === 0) {
    const err = new Error(
      `No se puede aplicar el cambio de stock: el producto ${productoId} no existe o no hay stock suficiente ` +
      `(se intentó ${signoStock < 0 ? 'restar' : 'sumar'} ${cant} unidades)`
    );
    err.status = 409;
    err.codigo = 'STOCK_INSUFICIENTE';
    throw err;
  }

  return await db.collection(CONFIG.colProductos).findOne({ _id: productoId }, { session });
}

/** Revierte el stock y borra el kardex de una compra (dentro de una sesión). */
async function revertirStockDeCompra(db, compra, session) {
  if (compra.tipo_compra !== 'inventario') return;
  for (const detalle of compra.detalles || []) {
    const productoId = new ObjectId(detalle.productoId);
    await actualizarStockAtomico(db, productoId, detalle.cantidad, -1, session);
  }
  await db.collection(CONFIG.colKardex).deleteMany(
    { referencia_id: compra._id, referencia_tipo: 'compra' },
    { session }
  );
}

/** Aplica el stock y registra en kardex (dentro de una sesión). */
async function aplicarStockDeCompra(db, compraId, detalles, fechaEmision, session) {
  for (const detalle of detalles) {
    const productoId = new ObjectId(detalle.productoId);
    const productoActualizado = await actualizarStockAtomico(
      db, productoId, detalle.cantidad, +1, session,
      { precio_compra: toNumber(detalle.costo_unitario) }
    );

    await db.collection(CONFIG.colKardex).insertOne({
      productoId,
      fecha: new Date(fechaEmision),
      tipo_movimiento: 'compra',
      cantidad: toNumber(detalle.cantidad),
      costo_unitario: toNumber(detalle.costo_unitario),
      saldo: productoActualizado.stock,
      referencia_id: compraId,
      referencia_tipo: 'compra',
      createdAt: new Date()
    }, { session });
  }
}

/** Trae una compra con su proveedor populado. */
async function traerCompraPopulada(db, compraId) {
  const r = await db.collection(CONFIG.colCompras).aggregate([
    { $match: { _id: compraId } },
    { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
  ]).toArray();
  return r[0] || null;
}

// ============================================================
// LISTAR
// ============================================================
router.get('/', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = String(req.query.search || '').trim();
    const { tipo_compra, estado_pago, proveedorId } = req.query;

    const desde = parseFecha(req.query.desde);
    const hasta = parseFecha(req.query.hasta);

    const matchStage = {};
    if (desde || hasta) {
      matchStage.fecha_emision = {};
      if (desde) matchStage.fecha_emision.$gte = desde;
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        matchStage.fecha_emision.$lte = h;
      }
    }
    if (soloString(tipo_compra) && TIPOS_COMPRA_VALIDOS.includes(tipo_compra)) {
      matchStage.tipo_compra = tipo_compra;
    }
    if (soloString(estado_pago) && ESTADOS_PAGO_VALIDOS.includes(estado_pago)) {
      matchStage.estado_pago = estado_pago;
    }
    if (soloString(proveedorId) && ObjectId.isValid(proveedorId)) {
      matchStage.proveedorId = new ObjectId(proveedorId);
    }

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
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
      const compras = await req.db.collection(CONFIG.colCompras).aggregate(pipeline).toArray();
      res.set('Cache-Control', 'no-store');
      return res.json(compras);
    }

    const [countResult, data] = await Promise.all([
      req.db.collection(CONFIG.colCompras).aggregate([...pipeline, { $count: 'total' }]).toArray(),
      req.db.collection(CONFIG.colCompras).aggregate([
        ...pipeline,
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]).toArray()
    ]);

    const total = countResult[0]?.total || 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    res.set('Cache-Control', 'no-store');
    return res.json({
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: skip + data.length < total,
      hasPrev: page > 1
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CUENTAS POR PAGAR
// ============================================================
router.get('/cuentas-por-pagar', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const pipeline = [
      { $match: { estado_pago: { $ne: 'pagado' } } },
      { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: CONFIG.colPagos,
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
          // Días transcurridos desde la emisión (entero).
          dias: {
            $floor: {
              $divide: [{ $subtract: [new Date(), '$fecha_emision'] }, 86400000]
            }
          }
        }
      },
      { $sort: { fecha_emision: 1 } }
    ];

    const compras = await req.db.collection(CONFIG.colCompras).aggregate(pipeline).toArray();

    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
    let totalPagar = 0;
    for (const c of compras) {
      const saldo = toNumber(c.saldoPendiente);
      totalPagar += saldo;
      const d = Math.floor(toNumber(c.dias));
      if (d <= 30) aging['0-30'] += saldo;
      else if (d <= 60) aging['31-60'] += saldo;
      else if (d <= 90) aging['61-90'] += saldo;
      else aging['+90'] += saldo;
    }
    for (const k of Object.keys(aging)) aging[k] = round2(aging[k]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      totalPagar: round2(totalPagar),
      cantidadFacturas: compras.length,
      aging,
      facturas: compras
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// TOTALES POR PROVEEDOR
// ============================================================
router.get('/por-proveedor', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const desde = parseFecha(req.query.desde);
    const hasta = parseFecha(req.query.hasta);

    const match = {};
    if (desde || hasta) {
      match.fecha_emision = {};
      if (desde) match.fecha_emision.$gte = desde;
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        match.fecha_emision.$lte = h;
      }
    }

    const resultado = await req.db.collection(CONFIG.colCompras).aggregate([
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
      { $lookup: { from: CONFIG.colProveedores, localField: '_id', foreignField: '_id', as: 'proveedor' } },
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

    res.set('Cache-Control', 'no-store');
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// REPORTE MENSUAL
// ============================================================
router.get('/reporte-mensual/:mes/:anio', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const { mes, anio } = req.params;
    const mesNum = Number(mes);
    const anioNum = Number(anio);

    if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'Mes inválido (1-12)', codigo: 'MES_INVALIDO' });
    }
    if (!Number.isInteger(anioNum) || anioNum < CONFIG.anioMin || anioNum > CONFIG.anioMax) {
      return res.status(400).json({
        error: `Año fuera de rango (${CONFIG.anioMin}-${CONFIG.anioMax})`,
        codigo: 'ANIO_INVALIDO'
      });
    }

    const inicio = new Date(anioNum, mesNum - 1, 1);
    const fin = new Date(anioNum, mesNum, 0, 23, 59, 59, 999);

    const resultado = await req.db.collection(CONFIG.colCompras).aggregate([
      { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
      { $lookup: { from: CONFIG.colProveedores, localField: 'proveedorId', foreignField: '_id', as: 'proveedor' } },
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

    const reporte = resultado[0] || {
      totalComprasInventario: 0, totalComprasGasto: 0,
      totalIva: 0, totalRetenido: 0, compras: []
    };
    reporte.mes = mesNum;
    reporte.anio = anioNum;
    reporte.nombre = `${MESES[mesNum - 1]} ${anioNum}`;
    reporte.desde = inicio;
    reporte.hasta = fin;

    res.set('Cache-Control', 'no-store');
    return res.json(reporte);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// DETALLE
// ============================================================
router.get('/:id', requierePermiso('compras', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id);
    const compra = await traerCompraPopulada(req.db, _id);
    if (!compra) {
      return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
    }
    return res.json(compra);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// CREAR
// ============================================================
router.post(
  '/',
  requierePermiso('compras', 'crear'),
  verificarPeriodoAbierto(),
  validarCompra,
  async (req, res, next) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales, codigo: 'TOTALES_INCONSISTENTES' });

    const errorFecha = validarFechaNoFutura(req.body.fecha_emision);
    if (errorFecha) return res.status(400).json({ error: errorFecha, codigo: 'FECHA_INVALIDA' });

    try {
      const {
        proveedorId, numero_factura, fecha_emision,
        detalles, subtotal, iva, total,
        tipo_compra, estado_pago, forma_pago,
        fecha_pago, retencion_valor, retencion_porcentaje,
        observaciones
      } = req.body;

      const tipoCompra = tipo_compra || 'inventario';
      const retencionValorNum = toNumber(retencion_valor);

      // Validación de detalles (fuera de la transacción para fallar rápido).
      if (tipoCompra === 'inventario') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle?.productoId)) {
            const err = new Error(`ID de producto inválido: ${detalle?.productoId}`);
            err.status = 400;
            err.codigo = 'PRODUCTO_ID_INVALIDO';
            throw err;
          }
          const msg = validarDetalle(detalle);
          if (msg) {
            const err = new Error(msg);
            err.status = 400;
            err.codigo = 'DETALLE_INVALIDO';
            throw err;
          }
        }
      }

      // Verificaciones previas (paralelas).
      const [proveedorExiste, productos] = await Promise.all([
        req.db.collection(CONFIG.colProveedores).findOne(
          { _id: new ObjectId(proveedorId) }, { projection: { _id: 1 } }
        ),
        tipoCompra === 'inventario'
          ? req.db.collection(CONFIG.colProductos)
              .find({ _id: { $in: detalles.map(d => new ObjectId(d.productoId)) } })
              .project({ _id: 1 })
              .toArray()
          : Promise.resolve([])
      ]);

      if (!proveedorExiste) {
        return res.status(400).json({
          error: 'El proveedor no existe',
          codigo: 'PROVEEDOR_NO_EXISTE',
          proveedorId
        });
      }

      if (tipoCompra === 'inventario') {
        const encontrados = new Set(productos.map(p => String(p._id)));
        for (const detalle of detalles) {
          if (!encontrados.has(String(detalle.productoId))) {
            const err = new Error(`Producto ${detalle.productoId} no encontrado`);
            err.status = 400;
            err.codigo = 'PRODUCTO_NO_EXISTE';
            throw err;
          }
        }
      }

      // Persistir dentro de una transacción.
      const resultado = await conTransaccion(req.db, async (session) => {
        const contadorValor = await reservarContadorCompra(req.db, session);
        const codigo = `COM-${String(contadorValor).padStart(6, '0')}`;

        const compra = {
          proveedorId: new ObjectId(proveedorId),
          numero_factura: numero_factura || codigo,
          fecha_emision: new Date(fecha_emision),
          detalles, subtotal: toNumber(subtotal), iva: toNumber(iva), total: toNumber(total),
          tipo_compra: tipoCompra,
          estado_pago: estado_pago || 'pendiente',
          monto_pagado: 0,
          forma_pago: forma_pago || '',
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          retencion_valor: retencionValorNum,
          retencion_porcentaje: toNumber(retencion_porcentaje),
          retencion_pendiente_emision: retencionValorNum > 0,
          observaciones: observaciones || '',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const compraResult = await req.db.collection(CONFIG.colCompras).insertOne(compra, { session });
        const compraId = compraResult.insertedId;

        if (tipoCompra === 'inventario') {
          await aplicarStockDeCompra(req.db, compraId, detalles, fecha_emision, session);
        }

        return { compraId };
      });

      const compraCreada = await traerCompraPopulada(req.db, resultado.compraId);

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.colCompras,
        documentoId: resultado.compraId,
        documentoNumero: compraCreada?.numero_factura || '',
        datosNuevos: compraCreada,
        detalle: `Compra creada: ${compraCreada?.numero_factura || ''} por $${round2(compraCreada?.total)}`
      });

      if (req.io) req.io.emit('nueva-compra', compraCreada);

      const advertencia = retencionValorNum > 0
        ? 'Esta compra tiene retención. Debe emitir el comprobante de retención electrónico desde el módulo de Ventas (tipo_documento: retencion).'
        : null;

      return res.status(201).json({ ...compraCreada, _advertencia: advertencia });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// ACTUALIZAR
// ============================================================
router.put(
  '/:id',
  requierePermiso('compras', 'editar'),
  verificarPeriodoAbierto(),
  validarCompra,
  async (req, res, next) => {
    if (validar(req, res)) return;

    const errorTotales = validarTotales(req.body);
    if (errorTotales) return res.status(400).json({ error: errorTotales, codigo: 'TOTALES_INCONSISTENTES' });

    try {
      const _id = requireObjectId(req.params.id);

      const compraActual = req._documentoOriginal
        || await req.db.collection(CONFIG.colCompras).findOne({ _id });
      if (!compraActual) {
        return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
      }

      const {
        proveedorId, numero_factura, fecha_emision,
        detalles, subtotal, iva, total,
        tipo_compra, estado_pago, forma_pago,
        fecha_pago, retencion_valor, retencion_porcentaje,
        observaciones
      } = req.body;

      const tipoCompra = tipo_compra || 'inventario';
      const retencionValorNum = toNumber(retencion_valor);

      // Validar detalles fuera de tx.
      if (tipoCompra === 'inventario') {
        for (const detalle of detalles) {
          if (!ObjectId.isValid(detalle?.productoId)) {
            const err = new Error(`ID de producto inválido: ${detalle?.productoId}`);
            err.status = 400;
            err.codigo = 'PRODUCTO_ID_INVALIDO';
            throw err;
          }
          const msg = validarDetalle(detalle);
          if (msg) {
            const err = new Error(msg);
            err.status = 400;
            err.codigo = 'DETALLE_INVALIDO';
            throw err;
          }
        }

        // Verificar que todos los productos existan.
        const ids = detalles.map(d => new ObjectId(d.productoId));
        const productos = await req.db.collection(CONFIG.colProductos)
          .find({ _id: { $in: ids } }).project({ _id: 1 }).toArray();
        const encontrados = new Set(productos.map(p => String(p._id)));
        for (const detalle of detalles) {
          if (!encontrados.has(String(detalle.productoId))) {
            const err = new Error(`Producto ${detalle.productoId} no encontrado`);
            err.status = 400;
            err.codigo = 'PRODUCTO_NO_EXISTE';
            throw err;
          }
        }
      }

      await conTransaccion(req.db, async (session) => {
        // 1. Revertir stock anterior (si era inventario).
        await revertirStockDeCompra(req.db, compraActual, session);

        // 2. Actualizar documento.
        const updateData = {
          proveedorId: new ObjectId(proveedorId),
          numero_factura,
          fecha_emision: new Date(fecha_emision),
          detalles, subtotal: toNumber(subtotal), iva: toNumber(iva), total: toNumber(total),
          tipo_compra: tipoCompra,
          estado_pago,
          forma_pago,
          fecha_pago: fecha_pago ? new Date(fecha_pago) : null,
          retencion_valor: retencionValorNum,
          retencion_porcentaje: toNumber(retencion_porcentaje),
          retencion_pendiente_emision: retencionValorNum > 0,
          observaciones: observaciones || '',
          updatedAt: new Date()
        };

        await req.db.collection(CONFIG.colCompras).updateOne(
          { _id },
          { $set: updateData },
          { session }
        );

        // 3. Aplicar nuevo stock.
        if (tipoCompra === 'inventario') {
          await aplicarStockDeCompra(req.db, _id, detalles, fecha_emision, session);
        }
      });

      const compraActualizada = await traerCompraPopulada(req.db, _id);

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.colCompras,
        documentoId: _id,
        documentoNumero: compraActualizada?.numero_factura || '',
        datosAnteriores: compraActual,
        datosNuevos: compraActualizada,
        detalle: `Compra actualizada: ${compraActualizada?.numero_factura || ''}`
      });

      if (req.io) req.io.emit('compra-actualizada', compraActualizada);
      return res.json(compraActualizada);
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// ELIMINAR
// ============================================================
router.delete(
  '/:id',
  requierePermiso('compras', 'eliminar'),
  verificarPeriodoAbierto(),
  async (req, res, next) => {
    try {
      const _id = requireObjectId(req.params.id);

      const compra = req._documentoOriginal
        || await req.db.collection(CONFIG.colCompras).findOne({ _id });
      if (!compra) {
        return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
      }

      const [pagosAsociados, retencionesAsociadas] = await Promise.all([
        req.db.collection(CONFIG.colPagos).countDocuments({ compraId: _id, anulado: { $ne: true } }),
        req.db.collection(CONFIG.colRetenciones).countDocuments({ compraId: _id })
      ]);

      if (pagosAsociados > 0) {
        return res.status(409).json({
          error: `No se puede eliminar: hay ${pagosAsociados} pago${pagosAsociados === 1 ? '' : 's'} registrado${pagosAsociados === 1 ? '' : 's'}. Anule los pagos primero.`,
          codigo: 'COMPRA_CON_PAGOS',
          pagosAsociados
        });
      }
      if (retencionesAsociadas > 0) {
        return res.status(409).json({
          error: `No se puede eliminar: hay ${retencionesAsociadas} comprobante${retencionesAsociadas === 1 ? '' : 's'} de retención emitido${retencionesAsociadas === 1 ? '' : 's'} para esta compra. Anúlelos primero.`,
          codigo: 'COMPRA_CON_RETENCIONES',
          retencionesAsociadas
        });
      }

      await conTransaccion(req.db, async (session) => {
        await revertirStockDeCompra(req.db, compra, session);
        const r = await req.db.collection(CONFIG.colCompras).deleteOne({ _id }, { session });
        if (r.deletedCount === 0) {
          const err = new Error('Compra no encontrada');
          err.status = 404;
          err.codigo = 'COMPRA_NOT_FOUND';
          throw err;
        }
      });

      await auditarSeguro(req.db, req, {
        accion: 'eliminar',
        coleccion: CONFIG.colCompras,
        documentoId: _id,
        documentoNumero: compra.numero_factura || '',
        datosAnteriores: compra,
        detalle: `Compra eliminada: ${compra.numero_factura || ''} por $${round2(compra.total)}`
      });

      if (req.io) req.io.emit('compra-eliminada', { id: String(_id) });
      return res.json({ message: 'Compra eliminada correctamente' });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// IMPORTAR TXT
// ------------------------------------------------------------
// CORRECCIONES:
//   - Contadores (`importados`, `proveedoresCreados`) se suman
//     FUERA de la transacción (evita doble conteo en reintentos).
//   - `toNumber` en lugar de `parseFloat(x) || 0` (no silencia NaN).
//   - Validación de fechas antes de pasarlas al chequeo de períodos.
//   - Reporte estructurado de errores por línea.
// ============================================================
router.post('/importar-txt', requierePermiso('compras', 'crear'), async (req, res, next) => {
  try {
    const { lineas } = req.body || {};
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'No se enviaron líneas para importar', codigo: 'SIN_LINEAS' });
    }
    if (lineas.length > IMPORT_MAX_LINEAS) {
      return res.status(413).json({
        error: `Máximo ${IMPORT_MAX_LINEAS} líneas por importación`,
        codigo: 'DEMASIADAS_LINEAS'
      });
    }

    // Normalizar fechas para el chequeo de períodos (una sola query).
    const fechasValidas = lineas
      .map(l => l?.fechaEmision)
      .filter(Boolean);
    const cerrados = await obtenerPeriodosCerradosEnFechas(req.db, fechasValidas);
    if (cerrados.length > 0) {
      return res.status(423).json({
        error: `Hay líneas con fechas en períodos cerrados: ${cerrados.map(c => c.nombre).join(', ')}. Reabra el período o corrija las fechas.`,
        codigo: 'PERIODO_CERRADO',
        periodos: cerrados.map(c => c.nombre)
      });
    }

    const resultados = [];
    const errores = [];
    let importados = 0;
    let proveedoresCreados = 0;

    for (let offset = 0; offset < lineas.length; offset += IMPORT_BATCH_SIZE) {
      const lote = lineas.slice(offset, offset + IMPORT_BATCH_SIZE);

      try {
        // La transacción devuelve los contadores; se acumulan afuera para
        // evitar doble conteo si MongoDB reintenta el callback.
        const resumenLote = await conTransaccion(req.db, async (session) => {
          const productosCache = new Map();
          const proveedoresCache = new Map();
          const out = [];
          let provCreados = 0;
          let importadosLote = 0;
          const erroresLote = [];

          const buscarProducto = async (codigoProducto) => {
            if (!codigoProducto) return null;
            const key = String(codigoProducto).toLowerCase();
            if (productosCache.has(key)) return productosCache.get(key);

            const prod = await req.db.collection(CONFIG.colProductos).findOne(
              { $or: [{ codigo: codigoProducto }, { codigo_barras: codigoProducto }] },
              { collation: { locale: 'es', strength: 2 }, session }
            );
            productosCache.set(key, prod);
            return prod;
          };

          const buscarOCrearProveedor = async (ruc, razonSocial) => {
            const key = String(ruc).trim();
            if (proveedoresCache.has(key)) return proveedoresCache.get(key);

            let prov = await req.db.collection(CONFIG.colProveedores).findOne({ ruc: key }, { session });
            if (!prov) {
              const nuevoProv = {
                nombre: (razonSocial || `Proveedor ${ruc}`).trim(),
                ruc: key, telefono: '', email: '', direccion: '',
                createdAt: new Date()
              };
              const resultProv = await req.db.collection(CONFIG.colProveedores).insertOne(nuevoProv, { session });
              prov = { ...nuevoProv, _id: resultProv.insertedId };
              provCreados++;
            }
            proveedoresCache.set(key, prov);
            return prov;
          };

          for (let idx = 0; idx < lote.length; idx++) {
            const linea = lote[idx];
            const numLinea = offset + idx + 1;
            try {
              const {
                ruc, razonSocial, fechaEmision, total, valorSinImpuestos,
                iva, tipo_compra, codigoProducto
              } = linea;

              const totalNum = toNumber(total);
              if (!ruc || totalNum === 0) {
                erroresLote.push(`Línea ${numLinea}: sin RUC o total inválido`);
                continue;
              }

              const fecha = fechaEmision ? new Date(fechaEmision) : null;
              if (!fecha || Number.isNaN(fecha.getTime())) {
                erroresLote.push(`Línea ${numLinea} (RUC ${ruc}): fecha inválida "${fechaEmision}"`);
                continue;
              }

              const proveedor = await buscarOCrearProveedor(ruc, razonSocial);
              const producto = await buscarProducto(codigoProducto);
              if (!producto) {
                erroresLote.push(
                  `Línea ${numLinea} (RUC ${ruc}): producto no encontrado` +
                  (codigoProducto ? ` con código "${codigoProducto}"` : ' (sin código)')
                );
                continue;
              }

              const contadorResult = await req.db.collection(CONFIG.colContadores).findOneAndUpdate(
                { _id: 'compra' },
                { $inc: { valor: 1 } },
                { upsert: true, returnDocument: 'after', session }
              );
              const docContador = contadorResult && contadorResult.value !== undefined
                ? contadorResult.value
                : contadorResult;
              const contadorValor = toNumber(docContador?.valor, 1);
              const codigo = `COM-${String(contadorValor).padStart(6, '0')}`;

              const tipoCompra = tipo_compra || 'inventario';
              const ivaNum = toNumber(iva);

              const compraData = {
                proveedorId: proveedor._id,
                numero_factura: codigo,
                fecha_emision: fecha,
                detalles: [{
                  productoId: producto._id,
                  cantidad: 1,
                  costo_unitario: totalNum,
                  aplica_iva: ivaNum > 0
                }],
                subtotal: toNumber(valorSinImpuestos),
                iva: ivaNum,
                total: totalNum,
                tipo_compra: tipoCompra,
                estado_pago: 'pendiente',
                monto_pagado: 0,
                forma_pago: '',
                fecha_pago: null,
                retencion_valor: 0,
                retencion_porcentaje: 0,
                retencion_pendiente_emision: false,
                observaciones: `Importado desde TXT. Emisor: ${razonSocial || ''}`,
                createdAt: new Date(),
                updatedAt: new Date()
              };

              const compraResult = await req.db.collection(CONFIG.colCompras)
                .insertOne(compraData, { session });
              const compraId = compraResult.insertedId;

              if (tipoCompra === 'inventario') {
                const productoActualizado = await actualizarStockAtomico(
                  req.db, producto._id, 1, +1, session, { precio_compra: totalNum }
                );

                await req.db.collection(CONFIG.colKardex).insertOne({
                  productoId: producto._id,
                  fecha: compraData.fecha_emision,
                  tipo_movimiento: 'compra',
                  cantidad: 1,
                  costo_unitario: totalNum,
                  saldo: productoActualizado.stock,
                  referencia_id: compraId,
                  referencia_tipo: 'compra',
                  createdAt: new Date()
                }, { session });
              }

              out.push({ compraId, numero: compraData.numero_factura, ruc });
              importadosLote++;
            } catch (lineaError) {
              erroresLote.push(`Línea ${numLinea}: ${lineaError.message}`);
            }
          }

          return { out, importadosLote, provCreados, erroresLote };
        });

        // Acumular resultados del lote (fuera de la transacción).
        resultados.push(...(resumenLote.out || []));
        errores.push(...(resumenLote.erroresLote || []));
        importados += resumenLote.importadosLote || 0;
        proveedoresCreados += resumenLote.provCreados || 0;
      } catch (batchError) {
        const numeroBatch = Math.floor(offset / IMPORT_BATCH_SIZE) + 1;
        errores.push(`Batch ${numeroBatch}: ${batchError.message}`);
      }
    }

    await auditarSeguro(req.db, req, {
      accion: 'importar',
      coleccion: CONFIG.colCompras,
      documentoNumero: `${importados} facturas`,
      datosNuevos: { importados, errores: errores.length, proveedoresCreados },
      detalle: `Importación TXT: ${importados} facturas, ${errores.length} errores, ${proveedoresCreados} proveedores creados`
    });

    return res.json({
      success: true,
      importados,
      errores,
      resultados,
      proveedoresCreados
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarTotales = validarTotales;
module.exports._validarFechaNoFutura = validarFechaNoFutura;
module.exports._validarDetalle = validarDetalle;
module.exports._toNumber = toNumber;
module.exports._round2 = round2;
module.exports._requireObjectId = requireObjectId;