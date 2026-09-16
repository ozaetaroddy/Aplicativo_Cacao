// backend/routes/pagos.js
// ============================================================
// Pagos — cobros (CxC) y pagos a proveedores (CxP)
// ------------------------------------------------------------
// Endpoints:
//   GET    /                        → listado (con o sin paginación)
//   GET    /resumen/cartera         → aging consolidado CxC + CxP
//   GET    /cliente/:clienteId      → pagos de un cliente
//   GET    /proveedor/:proveedorId  → pagos a un proveedor
//   GET    /:id                     → detalle
//   POST   /                        → crear cobro/pago
//   DELETE /:id                     → anular (soft delete)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`pagos:*`).
//   - Escrituras corren dentro de transacción y recalculan el
//     estado del documento asociado (venta o compra) si lo hay.
//   - La anulación es SOFT (`anulado: true`) para preservar
//     trazabilidad contable.
//   - Los errores se delegan al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const {
  parsePagination,
  wantsPagination,
  parseSort,
  escapeRegex
} = require('../utils/pagination');
const { conTransaccion } = require('../utils/transacciones');
const { validar } = require('../utils/validacion');
const { partesFechaEC } = require('../utils/fechaEC');
const { TIPOS_NO_CXC } = require('../utils/tiposDocumento');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  colPagos: 'pagos',
  colVentas: 'ventas_v2',
  colCompras: 'compras_v2',
  colClientes: 'clientes',
  colProveedores: 'proveedores',

  tipos: Object.freeze(['cobro', 'pago']),
  formasPagoValidas: Object.freeze([
    '01', '15', '16', '17', '18', '19', '20', '21'
  ]),

  referenciaMaxLen: 200,
  numeroReciboMaxLen: 50,
  observacionesMaxLen: 1000,

  /** Umbral para considerar un saldo como cero. */
  umbralSaldo: 0.01,

  /** Máx. documentos devueltos en el aging de cartera. */
  maxDocumentosCartera: envNum('PAGOS_MAX_DOCS_CARTERA', 5000),

  /** Máx. registros sin paginación (listado legacy). */
  maxSinPaginar: envNum('PAGOS_MAX_SIN_PAGINAR', 5000)
});

const TIPOS = CONFIG.tipos;
const FORMAS_PAGO_VALIDAS = CONFIG.formasPagoValidas;
const TIPOS_NO_CXC_SET = new Set(TIPOS_NO_CXC);

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Booleano tolerante: 'true'/'1'/true → true; 'false'/'0'/false → false. */
function toBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return Boolean(v);
}

/** Número finito o fallback. NO silencia negativos. */
function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Redondeo a 2 decimales (evita drift por EPSILON). */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Parsea `YYYY-MM-DD` o ISO. Devuelve `null` si inválida. */
function parseFecha(v, { finDelDia = false } = {}) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  if (finDelDia) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id, mensaje = 'ID inválido', codigo = 'ID_INVALIDO') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = codigo;
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar pago');
  }
}

// ============================================================
// FECHAS / AGING
// ============================================================
/**
 * Diferencia en días calendario (TZ Ecuador) entre dos fechas.
 * Evita el off-by-one que ocurre si el servidor corre en UTC.
 */
function diasEntreFechasEC(fechaMayor, fechaMenor) {
  const pMayor = partesFechaEC(fechaMayor);
  const pMenor = partesFechaEC(fechaMenor);
  const msMayor = Date.UTC(
    parseInt(pMayor.year, 10),
    parseInt(pMayor.month, 10) - 1,
    parseInt(pMayor.day, 10)
  );
  const msMenor = Date.UTC(
    parseInt(pMenor.year, 10),
    parseInt(pMenor.month, 10) - 1,
    parseInt(pMenor.day, 10)
  );
  return Math.floor((msMayor - msMenor) / 86400000);
}

/** Clasifica días al bucket de aging correspondiente. */
function bucketAging(dias) {
  if (dias <= 30) return '0-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

/** Aging vacío (para inicializar sin repetir literales). */
function agingVacio() {
  return { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };
}

// ============================================================
// RECÁLCULO DE ESTADO (ventas y compras)
// ------------------------------------------------------------
// Un único helper para evitar duplicación entre CxC y CxP.
// ============================================================
/**
 * Recalcula `estado_pago` y `monto_pagado` de un documento en
 * función de la suma de sus pagos activos (no anulados).
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} opts.coleccion  'ventas_v2' | 'compras_v2'
 * @param {ObjectId} opts.docId
 * @param {ClientSession} opts.session
 * @param {string} opts.campoId    'ventaId' | 'compraId'
 * @returns {Promise<{estado:string, pagado:number, total:number}|null>}
 */
async function recalcularEstadoDocumento(db, { coleccion, docId, session, campoId }) {
  if (!docId) return null;

  const doc = await db.collection(coleccion).findOne({ _id: docId }, { session });
  if (!doc) return null;

  const agg = await db.collection(CONFIG.colPagos).aggregate([
    { $match: { [campoId]: docId, anulado: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$monto' } } }
  ], { session }).toArray();

  const pagado = round2(toNumber(agg[0]?.total));
  const total = toNumber(doc.total);

  let estado = 'pendiente';
  if (total > 0 && pagado >= total - CONFIG.umbralSaldo) estado = 'pagado';
  else if (pagado > CONFIG.umbralSaldo) estado = 'parcial';

  await db.collection(coleccion).updateOne(
    { _id: docId },
    { $set: { estado_pago: estado, monto_pagado: pagado, updatedAt: new Date() } },
    { session }
  );

  return { estado, pagado, total };
}

function recalcularEstadoVenta(db, ventaId, session) {
  return recalcularEstadoDocumento(db, {
    coleccion: CONFIG.colVentas,
    docId: ventaId,
    session,
    campoId: 'ventaId'
  });
}

function recalcularEstadoCompra(db, compraId, session) {
  return recalcularEstadoDocumento(db, {
    coleccion: CONFIG.colCompras,
    docId: compraId,
    session,
    campoId: 'compraId'
  });
}

// ============================================================
// VALIDADORES
// ============================================================
const validarPago = [
  body('tipo')
    .isIn(TIPOS).withMessage(`tipo debe ser: ${TIPOS.join(', ')}`),

  body('monto')
    .isFloat({ gt: 0 }).withMessage('monto debe ser un número mayor a 0'),

  body('fecha')
    .isISO8601().withMessage('Fecha inválida'),

  body('forma_pago')
    .optional({ checkFalsy: true })
    .isIn(FORMAS_PAGO_VALIDAS)
    .withMessage(`forma_pago inválida. Válidas: ${FORMAS_PAGO_VALIDAS.join(', ')}`),

  body('referencia')
    .optional({ nullable: true })
    .isString().withMessage('referencia debe ser texto')
    .trim()
    .isLength({ max: CONFIG.referenciaMaxLen })
    .withMessage(`referencia no puede superar ${CONFIG.referenciaMaxLen} caracteres`),

  body('numero_recibo')
    .optional({ nullable: true })
    .isString().withMessage('numero_recibo debe ser texto')
    .trim()
    .isLength({ max: CONFIG.numeroReciboMaxLen })
    .withMessage(`numero_recibo no puede superar ${CONFIG.numeroReciboMaxLen} caracteres`),

  body('observaciones')
    .optional({ nullable: true })
    .isString().withMessage('observaciones debe ser texto')
    .trim()
    .isLength({ max: CONFIG.observacionesMaxLen })
    .withMessage(`observaciones no puede superar ${CONFIG.observacionesMaxLen} caracteres`),

  body('clienteId')
    .if((_v, { req }) => req.body?.tipo === 'cobro')
    .notEmpty().withMessage('clienteId es obligatorio para cobros')
    .isMongoId().withMessage('ID de cliente inválido'),

  body('proveedorId')
    .if((_v, { req }) => req.body?.tipo === 'pago')
    .notEmpty().withMessage('proveedorId es obligatorio para pagos')
    .isMongoId().withMessage('ID de proveedor inválido'),

  body('ventaId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('ID de venta inválido'),

  body('compraId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('ID de compra inválido')
];

// ============================================================
// CÁLCULO DE CARTERA (CxC / CxP)
// ------------------------------------------------------------
// Aging FIFO: los créditos (cobros/pagos) se aplican contra las
// facturas más antiguas primero.
// ============================================================
async function calcularCxC(db) {
  const saldosClientes = await db.collection(CONFIG.colVentas).aggregate([
    { $match: { tipo_documento: { $nin: [...TIPOS_NO_CXC_SET] } } },
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
    },
    {
      $lookup: {
        from: CONFIG.colPagos,
        let: { cliId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$clienteId', '$$cliId'] },
              tipo: 'cobro',
              anulado: { $ne: true }
            }
          },
          { $group: { _id: null, total: { $sum: '$monto' } } }
        ],
        as: 'cobros'
      }
    },
    { $addFields: { cobrosTotal: { $ifNull: [{ $arrayElemAt: ['$cobros.total', 0] }, 0] } } },
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
    { $match: { saldoNeto: { $gt: CONFIG.umbralSaldo } } }
  ]).toArray();

  const clienteIds = saldosClientes.map(s => s._id).filter(Boolean);
  const facturasPendientes = clienteIds.length
    ? await db.collection(CONFIG.colVentas).find(
        {
          clienteId: { $in: clienteIds },
          tipo_documento: { $nin: [...TIPOS_NO_CXC_SET, 'nota_credito'] }
        },
        {
          projection: {
            clienteId: 1, numero_factura: 1, fecha_emision: 1,
            total: 1, estado_pago: 1
          }
        }
      ).sort({ clienteId: 1, fecha_emision: 1 })
        .limit(CONFIG.maxDocumentosCartera)
        .toArray()
    : [];

  const clientes = clienteIds.length
    ? await db.collection(CONFIG.colClientes).find(
        { _id: { $in: clienteIds } },
        { projection: { nombre: 1, ruc: 1 } }
      ).toArray()
    : [];
  const clienteMap = new Map(clientes.map(c => [String(c._id), c]));

  // Indexar facturas por cliente (para aplicación FIFO).
  const facturasPorCliente = new Map();
  for (const f of facturasPendientes) {
    const k = String(f.clienteId);
    if (!facturasPorCliente.has(k)) facturasPorCliente.set(k, []);
    facturasPorCliente.get(k).push(f);
  }

  const hoy = new Date();
  const aging = agingVacio();
  const documentos = [];
  let total = 0;

  for (const s of saldosClientes) {
    const cliId = String(s._id);
    let credito = toNumber(s.saldoNeto);
    if (credito <= CONFIG.umbralSaldo) continue;

    const facturas = facturasPorCliente.get(cliId) || [];
    for (const f of facturas) {
      if (credito <= CONFIG.umbralSaldo) break;
      const aplicable = Math.min(credito, toNumber(f.total));
      if (aplicable <= CONFIG.umbralSaldo) continue;
      credito -= aplicable;

      const dias = diasEntreFechasEC(hoy, f.fecha_emision);
      aging[bucketAging(dias)] += aplicable;
      total += aplicable;

      const cli = clienteMap.get(cliId);
      documentos.push({
        _id: f._id,
        numero_factura: f.numero_factura,
        fecha_emision: f.fecha_emision,
        total: f.total,
        estado_pago: f.estado_pago,
        clienteNombre: cli?.nombre || 'Cliente eliminado',
        clienteRuc: cli?.ruc || '',
        dias,
        saldoPendiente: round2(aplicable)
      });
    }
  }

  for (const k of Object.keys(aging)) aging[k] = round2(aging[k]);

  return { total: round2(total), aging, documentos };
}

async function calcularCxP(db) {
  const saldosProveedores = await db.collection(CONFIG.colCompras).aggregate([
    { $group: { _id: '$proveedorId', total: { $sum: '$total' } } },
    {
      $lookup: {
        from: CONFIG.colPagos,
        let: { provId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$proveedorId', '$$provId'] },
              tipo: 'pago',
              anulado: { $ne: true }
            }
          },
          { $group: { _id: null, total: { $sum: '$monto' } } }
        ],
        as: 'pagos'
      }
    },
    { $addFields: { pagosTotal: { $ifNull: [{ $arrayElemAt: ['$pagos.total', 0] }, 0] } } },
    { $addFields: { saldoNeto: { $subtract: ['$total', '$pagosTotal'] } } },
    { $match: { saldoNeto: { $gt: CONFIG.umbralSaldo } } }
  ]).toArray();

  const provIds = saldosProveedores.map(s => s._id).filter(Boolean);
  const comprasPendientes = provIds.length
    ? await db.collection(CONFIG.colCompras).find(
        { proveedorId: { $in: provIds } },
        {
          projection: {
            proveedorId: 1, numero_factura: 1, fecha_emision: 1,
            total: 1, estado_pago: 1
          }
        }
      ).sort({ proveedorId: 1, fecha_emision: 1 })
        .limit(CONFIG.maxDocumentosCartera)
        .toArray()
    : [];

  const proveedores = provIds.length
    ? await db.collection(CONFIG.colProveedores).find(
        { _id: { $in: provIds } },
        { projection: { nombre: 1, ruc: 1 } }
      ).toArray()
    : [];
  const provMap = new Map(proveedores.map(p => [String(p._id), p]));

  const comprasPorProv = new Map();
  for (const c of comprasPendientes) {
    const k = String(c.proveedorId);
    if (!comprasPorProv.has(k)) comprasPorProv.set(k, []);
    comprasPorProv.get(k).push(c);
  }

  const hoy = new Date();
  const aging = agingVacio();
  const documentos = [];
  let total = 0;

  for (const s of saldosProveedores) {
    const provId = String(s._id);
    let credito = toNumber(s.saldoNeto);
    if (credito <= CONFIG.umbralSaldo) continue;

    const compras = comprasPorProv.get(provId) || [];
    for (const c of compras) {
      if (credito <= CONFIG.umbralSaldo) break;
      const aplicable = Math.min(credito, toNumber(c.total));
      if (aplicable <= CONFIG.umbralSaldo) continue;
      credito -= aplicable;

      const dias = diasEntreFechasEC(hoy, c.fecha_emision);
      aging[bucketAging(dias)] += aplicable;
      total += aplicable;

      const prov = provMap.get(provId);
      documentos.push({
        _id: c._id,
        numero_factura: c.numero_factura,
        fecha_emision: c.fecha_emision,
        total: c.total,
        estado_pago: c.estado_pago,
        proveedorNombre: prov?.nombre || 'Proveedor eliminado',
        proveedorRuc: prov?.ruc || '',
        dias,
        saldoPendiente: round2(aplicable)
      });
    }
  }

  for (const k of Object.keys(aging)) aging[k] = round2(aging[k]);

  return { total: round2(total), aging, documentos };
}

// ============================================================
// GET /  → listado (con o sin paginación)
// ============================================================
router.get('/', requierePermiso('pagos', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (soloString(req.query.search) || '').trim();

    const tipo = soloString(req.query.tipo);
    const clienteId = soloString(req.query.clienteId);
    const proveedorId = soloString(req.query.proveedorId);
    const anulado = soloString(req.query.anulado);
    const desde = parseFecha(req.query.desde, { finDelDia: false });
    const hasta = parseFecha(req.query.hasta, { finDelDia: true });

    const match = {};

    if (tipo && TIPOS.includes(tipo)) match.tipo = tipo;

    if (anulado === 'true') match.anulado = true;
    else match.anulado = { $ne: true };

    if (clienteId && ObjectId.isValid(clienteId)) {
      match.clienteId = new ObjectId(clienteId);
    }
    if (proveedorId && ObjectId.isValid(proveedorId)) {
      match.proveedorId = new ObjectId(proveedorId);
    }
    if (desde || hasta) {
      match.fecha = {};
      if (desde) match.fecha.$gte = desde;
      if (hasta) match.fecha.$lte = hasta;
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: CONFIG.colClientes,
          localField: 'clienteId',
          foreignField: '_id',
          as: '_cliente'
        }
      },
      {
        $lookup: {
          from: CONFIG.colProveedores,
          localField: 'proveedorId',
          foreignField: '_id',
          as: '_proveedor'
        }
      },
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
    const col = req.db.collection(CONFIG.colPagos);

    // ---- Modo sin paginación (compatibilidad legacy) ----
    if (!paginar) {
      const data = await col.aggregate([
        ...pipeline,
        { $sort: sort },
        { $limit: CONFIG.maxSinPaginar }
      ]).toArray();

      headersNoStore(res);
      return res.json(data);
    }

    // ---- Modo paginado ----
    const [countRes, data] = await Promise.all([
      col.aggregate([...pipeline, { $count: 'total' }]).toArray(),
      col.aggregate([
        ...pipeline,
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]).toArray()
    ]);

    const total = countRes[0]?.total || 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    headersNoStore(res);
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
// GET /resumen/cartera  → aging consolidado CxC + CxP
// ------------------------------------------------------------
// ⚠️  Declarado ANTES que `/:id` (aunque no colisiona por el
//     número de segmentos, mantenemos el orden explícito).
// ============================================================
router.get('/resumen/cartera', requierePermiso('pagos', 'ver'), async (req, res, next) => {
  try {
    const t0 = Date.now();
    const [cxc, cxp] = await Promise.all([
      calcularCxC(req.db),
      calcularCxP(req.db)
    ]);

    const truncadoCxC = cxc.documentos.length >= CONFIG.maxDocumentosCartera;
    const truncadoCxP = cxp.documentos.length >= CONFIG.maxDocumentosCartera;

    headersNoStore(res);
    return res.json({
      cuentasPorCobrar: {
        total: cxc.total,
        aging: cxc.aging,
        documentos: cxc.documentos
      },
      cuentasPorPagar: {
        total: cxp.total,
        aging: cxp.aging,
        documentos: cxp.documentos
      },
      _meta: {
        tiempoMs: Date.now() - t0,
        maxDocumentos: CONFIG.maxDocumentosCartera,
        truncado: truncadoCxC || truncadoCxP
      }
    });
  } catch (err) {
    log.error({ err: err.message }, 'Error en resumen de cartera');
    return next(err);
  }
});

// ============================================================
// GET /cliente/:clienteId
// ============================================================
router.get('/cliente/:clienteId', requierePermiso('pagos', 'ver'), async (req, res, next) => {
  try {
    const clienteObjectId = requireObjectId(
      req.params.clienteId,
      'ID de cliente inválido'
    );

    const desde = parseFecha(req.query.desde, { finDelDia: false });
    const hasta = parseFecha(req.query.hasta, { finDelDia: true });

    const filter = { clienteId: clienteObjectId, anulado: { $ne: true } };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = desde;
      if (hasta) filter.fecha.$lte = hasta;
    }

    const pagos = await req.db.collection(CONFIG.colPagos)
      .find(filter)
      .sort({ fecha: 1 })
      .limit(CONFIG.maxSinPaginar)
      .toArray();

    const total = round2(pagos.reduce((s, p) => s + toNumber(p.monto), 0));

    headersNoStore(res);
    return res.json({ pagos, total, cantidad: pagos.length });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /proveedor/:proveedorId
// ============================================================
router.get('/proveedor/:proveedorId', requierePermiso('pagos', 'ver'), async (req, res, next) => {
  try {
    const proveedorObjectId = requireObjectId(
      req.params.proveedorId,
      'ID de proveedor inválido'
    );

    const desde = parseFecha(req.query.desde, { finDelDia: false });
    const hasta = parseFecha(req.query.hasta, { finDelDia: true });

    const filter = { proveedorId: proveedorObjectId, anulado: { $ne: true } };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = desde;
      if (hasta) filter.fecha.$lte = hasta;
    }

    const pagos = await req.db.collection(CONFIG.colPagos)
      .find(filter)
      .sort({ fecha: 1 })
      .limit(CONFIG.maxSinPaginar)
      .toArray();

    const total = round2(pagos.reduce((s, p) => s + toNumber(p.monto), 0));

    headersNoStore(res);
    return res.json({ pagos, total, cantidad: pagos.length });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id  → detalle
// ============================================================
router.get('/:id', requierePermiso('pagos', 'ver'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id, 'ID inválido');

    const pago = await req.db.collection(CONFIG.colPagos).findOne({ _id });
    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado', codigo: 'PAGO_NOT_FOUND' });
    }

    let contraparte = null;
    if (pago.clienteId) {
      contraparte = await req.db.collection(CONFIG.colClientes).findOne(
        { _id: pago.clienteId },
        { projection: { nombre: 1, ruc: 1, telefono: 1, email: 1 } }
      );
    } else if (pago.proveedorId) {
      contraparte = await req.db.collection(CONFIG.colProveedores).findOne(
        { _id: pago.proveedorId },
        { projection: { nombre: 1, ruc: 1, telefono: 1, email: 1 } }
      );
    }

    headersNoStore(res);
    return res.json({ ...pago, contraparte });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /  → crear cobro/pago
// ============================================================
router.post('/', requierePermiso('pagos', 'crear'), validarPago, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const {
      tipo,
      monto,
      fecha,
      forma_pago,
      referencia,
      numero_recibo,
      observaciones,
      clienteId,
      proveedorId,
      ventaId,
      compraId
    } = req.body;

    const clienteObjectId = tipo === 'cobro' ? new ObjectId(clienteId) : null;
    const proveedorObjectId = tipo === 'pago' ? new ObjectId(proveedorId) : null;
    const ventaObjectId = tipo === 'cobro' && ventaId ? new ObjectId(ventaId) : null;
    const compraObjectId = tipo === 'pago' && compraId ? new ObjectId(compraId) : null;

    // ---- Pre-validaciones (paralelas) ----
    const [
      contraparte,
      ventaDoc,
      compraDoc
    ] = await Promise.all([
      tipo === 'cobro'
        ? req.db.collection(CONFIG.colClientes).findOne(
            { _id: clienteObjectId },
            { projection: { _id: 1 } }
          )
        : req.db.collection(CONFIG.colProveedores).findOne(
            { _id: proveedorObjectId },
            { projection: { _id: 1 } }
          ),

      ventaObjectId
        ? req.db.collection(CONFIG.colVentas).findOne(
            { _id: ventaObjectId },
            { projection: { _id: 1, clienteId: 1, total: 1 } }
          )
        : Promise.resolve(null),

      compraObjectId
        ? req.db.collection(CONFIG.colCompras).findOne(
            { _id: compraObjectId },
            { projection: { _id: 1, proveedorId: 1, total: 1 } }
          )
        : Promise.resolve(null)
    ]);

    if (!contraparte) {
      return res.status(404).json({
        error: tipo === 'cobro' ? 'Cliente no encontrado' : 'Proveedor no encontrado',
        codigo: tipo === 'cobro' ? 'CLIENTE_NOT_FOUND' : 'PROVEEDOR_NOT_FOUND'
      });
    }

    if (ventaObjectId) {
      if (!ventaDoc) {
        return res.status(404).json({ error: 'Venta no encontrada', codigo: 'VENTA_NOT_FOUND' });
      }
      if (String(ventaDoc.clienteId) !== String(clienteObjectId)) {
        return res.status(400).json({
          error: 'La venta no pertenece al cliente indicado',
          codigo: 'VENTA_CLIENTE_MISMATCH'
        });
      }
    }

    if (compraObjectId) {
      if (!compraDoc) {
        return res.status(404).json({ error: 'Compra no encontrada', codigo: 'COMPRA_NOT_FOUND' });
      }
      if (String(compraDoc.proveedorId) !== String(proveedorObjectId)) {
        return res.status(400).json({
          error: 'La compra no pertenece al proveedor indicado',
          codigo: 'COMPRA_PROVEEDOR_MISMATCH'
        });
      }
    }

    // ---- Persistir en transacción ----
    const pagoId = await conTransaccion(req.db, async (session) => {
      const ahora = new Date();
      const doc = {
        tipo,
        monto: round2(monto),
        fecha: new Date(fecha),
        forma_pago: forma_pago || '01',
        referencia: (referencia || '').trim(),
        numero_recibo: (numero_recibo || '').trim() || `REC-${Date.now()}`,
        observaciones: (observaciones || '').trim(),
        clienteId: clienteObjectId,
        proveedorId: proveedorObjectId,
        ventaId: ventaObjectId,
        compraId: compraObjectId,
        anulado: false,
        createdBy: {
          userId: req.user.userId,
          email: req.user.email
        },
        createdAt: ahora,
        updatedAt: ahora
      };

      const result = await req.db.collection(CONFIG.colPagos)
        .insertOne(doc, { session });

      if (doc.ventaId) await recalcularEstadoVenta(req.db, doc.ventaId, session);
      if (doc.compraId) await recalcularEstadoCompra(req.db, doc.compraId, session);

      return result.insertedId;
    });

    const pagoCreado = await req.db.collection(CONFIG.colPagos).findOne({ _id: pagoId });

    await auditarSeguro(req.db, req, {
      accion: 'crear',
      coleccion: CONFIG.colPagos,
      documentoId: pagoId,
      documentoNumero: pagoCreado.numero_recibo,
      datosNuevos: pagoCreado,
      detalle: `${tipo === 'cobro' ? 'Cobro' : 'Pago'} registrado: $${round2(pagoCreado.monto)}`
    });

    if (req.io) req.io.emit('nuevo-pago', pagoCreado);

    headersNoStore(res);
    return res.status(201).json(pagoCreado);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// DELETE /:id  → anular (soft delete)
// ============================================================
router.delete('/:id', requierePermiso('pagos', 'eliminar'), async (req, res, next) => {
  try {
    const _id = requireObjectId(req.params.id, 'ID inválido');

    const pago = await req.db.collection(CONFIG.colPagos).findOne({ _id });
    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado', codigo: 'PAGO_NOT_FOUND' });
    }
    if (pago.anulado) {
      return res.status(409).json({
        error: 'El pago ya está anulado',
        codigo: 'PAGO_YA_ANULADO'
      });
    }

    const ahora = new Date();
    await conTransaccion(req.db, async (session) => {
      await req.db.collection(CONFIG.colPagos).updateOne(
        { _id },
        {
          $set: {
            anulado: true,
            anulado_en: ahora,
            anulado_por: {
              userId: req.user.userId,
              email: req.user.email
            },
            updatedAt: ahora
          }
        },
        { session }
      );

      if (pago.ventaId) await recalcularEstadoVenta(req.db, pago.ventaId, session);
      if (pago.compraId) await recalcularEstadoCompra(req.db, pago.compraId, session);
    });

    await auditarSeguro(req.db, req, {
      accion: 'anular',
      coleccion: CONFIG.colPagos,
      documentoId: pago._id,
      documentoNumero: pago.numero_recibo,
      datosAnteriores: pago,
      detalle: `Pago anulado: ${pago.numero_recibo} ($${round2(pago.monto)})`
    });

    if (req.io) req.io.emit('pago-anulado', { id: String(_id) });

    headersNoStore(res);
    return res.json({ message: 'Pago anulado correctamente' });
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
module.exports._diasEntreFechasEC = diasEntreFechasEC;
module.exports._bucketAging = bucketAging;
module.exports._recalcularEstadoDocumento = recalcularEstadoDocumento;
module.exports._recalcularEstadoVenta = recalcularEstadoVenta;
module.exports._recalcularEstadoCompra = recalcularEstadoCompra;
module.exports._calcularCxC = calcularCxC;
module.exports._calcularCxP = calcularCxP;
module.exports._round2 = round2;
module.exports._toNumber = toNumber;
module.exports._toBool = toBool;