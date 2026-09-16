// backend/routes/kardex.js
// ============================================================
// Kardex — movimientos de inventario
// ------------------------------------------------------------
// Endpoints:
//   GET /                          → listado global (paginado)
//   GET /producto/:productoId      → movimientos de un producto
//   GET /cliente/:clienteId        → movimientos asociados a ventas
//                                    de un cliente
//   GET /proveedor/:proveedorId    → movimientos asociados a compras
//                                    de un proveedor
//
// Query params:
//   ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD → filtro por rango de fecha
//   ?page=N&limit=M                    → activa paginación
//   ?tipo_movimiento=...               → (solo en /) filtra por tipo
//   ?productoId=...                    → (solo en /) filtra por producto
//
// Comportamiento:
//   - Sin `?page`/`?limit` → devuelve array plano (legacy).
//   - Con `?page`/`?limit` → devuelve { data, total, page, limit, totalPages }.
//   - TODOS los listados están limitados (maxSinPaginar o paginación).
//
// Convenciones:
//   - Los movimientos se ordenan por `fecha` + `_id` (tie-break estable).
//   - `productoNombre`/`productoCodigo` se añaden en el listado global.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { parsePagination, wantsPagination } = require('../utils/pagination');
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
  colKardex: 'kardex',
  colProductos: 'productos',
  colVentas: 'ventas_v2',
  colCompras: 'compras_v2',

  /** Máx. registros devueltos sin paginación (evita payloads gigantes). */
  maxSinPaginar: envNum('KARDEX_MAX_SIN_PAGINAR', 5000),

  /** Tipos de movimiento reconocidos (validación). */
  tiposMovimiento: Object.freeze([
    'compra', 'venta', 'ajuste', 'devolucion', 'traslado', 'inicial'
  ]),

  /** Proyección para productos (evita traer docs completos). */
  proyeccionProducto: Object.freeze({ nombre: 1, codigo: 1 })
});

const TIPOS_MOVIMIENTO_SET = new Set(CONFIG.tiposMovimiento);

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id, mensaje = 'ID inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/** Parsea fecha ISO; devuelve null si inválida. */
function parseFecha(v, { finDelDia = false } = {}) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  if (finDelDia) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Construye el filtro de fecha para el rango.
 * Devuelve null si no hay rango utilizable (fechas inválidas).
 */
function buildFechaFilter(query) {
  const desde = parseFecha(query.desde, { finDelDia: false });
  const hasta = parseFecha(query.hasta, { finDelDia: true });
  if (!desde && !hasta) return null;

  const r = {};
  if (desde) r.$gte = desde;
  if (hasta) r.$lte = hasta;
  return Object.keys(r).length ? r : null;
}

// ============================================================
// HELPERS DE PAGINACIÓN / RESPUESTA
// ============================================================

/**
 * Responde un listado aplicando paginación o límite legacy.
 * @param {object} opts
 * @param {Collection} opts.col
 * @param {object}      opts.filter
 * @param {object}      opts.sort
 * @param {object}      opts.proyeccion
 * @param {object}      opts.paginacion  {page, limit, skip, paginar}
 * @param {Function}    opts.post       (data) => data transformada
 */
async function responderListado(res, { col, filter, sort, proyeccion, paginacion, post }) {
  const { page, limit, skip, paginar } = paginacion;

  if (!paginar) {
    const data = await col
      .find(filter, proyeccion ? { projection: proyeccion } : {})
      .sort(sort)
      .limit(CONFIG.maxSinPaginar)
      .toArray();
    headersNoStore(res);
    return res.json(post ? post(data) : data);
  }

  // Con paginación: count + find en paralelo.
  const [total, data] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter, proyeccion ? { projection: proyeccion } : {})
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray()
  ]);

  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  headersNoStore(res);
  return res.json({
    data: post ? post(data) : data,
    total,
    page,
    limit,
    totalPages,
    hasNext: skip + data.length < total,
    hasPrev: page > 1
  });
}

/**
 * Fábrica de handler para movimientos filtrados por una referencia externa
 * (ventas de un cliente, compras de un proveedor).
 *
 * @param {object} opts
 * @param {string} opts.referenciaTipo  'venta' | 'compra'
 * @param {string} opts.colReferencia   'ventas_v2' | 'compras_v2'
 * @param {string} opts.campoId         'clienteId' | 'proveedorId'
 * @param {string} opts.nombreId        'clienteId' | 'proveedorId'  (para logs/errores)
 */
function handlerPorReferencia({ referenciaTipo, colReferencia, campoId, nombreId }) {
  return async (req, res, next) => {
    try {
      const rawId = req.params[campoId];
      const referenciaId = requireObjectId(rawId, `ID de ${nombreId} inválido`);

      const paginacion = {
        ...parsePagination(req.query),
        paginar: wantsPagination(req.query)
      };

      const matchKardex = { referencia_tipo: referenciaTipo };
      const fechaFilter = buildFechaFilter(req.query);
      if (fechaFilter) matchKardex.fecha = fechaFilter;

      // Pipeline base: filtra kardex del tipo y hace lookup del documento
      // de referencia verificando que pertenezca al cliente/proveedor pedido.
      const basePipeline = [
        { $match: matchKardex },
        {
          $lookup: {
            from: colReferencia,
            let: { rid: '$referencia_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$rid'] },
                  [campoId]: referenciaId
                }
              },
              { $project: { _id: 1 } }
            ],
            as: 'ref'
          }
        },
        { $match: { 'ref.0': { $exists: true } } },
        { $project: { ref: 0 } }
      ];

      const sort = { fecha: 1, _id: 1 };

      if (!paginacion.paginar) {
        const movimientos = await req.db.collection(CONFIG.colKardex).aggregate([
          ...basePipeline,
          { $sort: sort },
          { $limit: CONFIG.maxSinPaginar }
        ]).toArray();
        headersNoStore(res);
        return res.json(movimientos);
      }

      // Con paginación: count + data en paralelo.
      const [countResult, data] = await Promise.all([
        req.db.collection(CONFIG.colKardex).aggregate([
          ...basePipeline,
          { $count: 'total' }
        ]).toArray(),
        req.db.collection(CONFIG.colKardex).aggregate([
          ...basePipeline,
          { $sort: sort },
          { $skip: paginacion.skip },
          { $limit: paginacion.limit }
        ]).toArray()
      ]);

      const total = countResult[0]?.total || 0;
      const totalPages = paginacion.limit > 0
        ? Math.ceil(total / paginacion.limit)
        : 0;

      headersNoStore(res);
      return res.json({
        data,
        total,
        page: paginacion.page,
        limit: paginacion.limit,
        totalPages,
        hasNext: paginacion.skip + data.length < total,
        hasPrev: paginacion.page > 1
      });
    } catch (err) {
      return next(err);
    }
  };
}

// ============================================================
// ENDPOINTS
// ============================================================

// ---- GET /cliente/:clienteId ----
router.get(
  '/cliente/:clienteId',
  requierePermiso('kardex', 'ver'),
  handlerPorReferencia({
    referenciaTipo: 'venta',
    colReferencia: CONFIG.colVentas,
    campoId: 'clienteId',
    nombreId: 'cliente'
  })
);

// ---- GET /proveedor/:proveedorId ----
router.get(
  '/proveedor/:proveedorId',
  requierePermiso('kardex', 'ver'),
  handlerPorReferencia({
    referenciaTipo: 'compra',
    colReferencia: CONFIG.colCompras,
    campoId: 'proveedorId',
    nombreId: 'proveedor'
  })
);

// ---- GET /producto/:productoId ----
router.get('/producto/:productoId', requierePermiso('kardex', 'ver'), async (req, res, next) => {
  try {
    const productoId = requireObjectId(req.params.productoId, 'ID de producto inválido');

    const paginacion = {
      ...parsePagination(req.query),
      paginar: wantsPagination(req.query)
    };

    const filter = { productoId };
    const fechaFilter = buildFechaFilter(req.query);
    if (fechaFilter) filter.fecha = fechaFilter;

    // Consistencia: misma dirección de orden en ambos modos (asc por fecha).
    return responderListado(res, {
      col: req.db.collection(CONFIG.colKardex),
      filter,
      sort: { fecha: 1, _id: 1 },
      paginacion
    });
  } catch (err) {
    return next(err);
  }
});

// ---- GET / (listado global) ----
router.get('/', requierePermiso('kardex', 'ver'), async (req, res, next) => {
  try {
    const paginacion = parsePagination(req.query);

    const { productoId, tipo_movimiento } = req.query;
    const filter = {};

    if (soloString(productoId)) {
      if (!ObjectId.isValid(productoId)) {
        return res.status(400).json({
          error: 'ID de producto inválido',
          codigo: 'ID_INVALIDO'
        });
      }
      filter.productoId = new ObjectId(productoId);
    }

    if (soloString(tipo_movimiento)) {
      if (!TIPOS_MOVIMIENTO_SET.has(tipo_movimiento)) {
        return res.status(400).json({
          error: `Tipo de movimiento inválido. Válidos: ${CONFIG.tiposMovimiento.join(', ')}`,
          codigo: 'TIPO_MOVIMIENTO_INVALIDO'
        });
      }
      filter.tipo_movimiento = tipo_movimiento;
    }

    const fechaFilter = buildFechaFilter(req.query);
    if (fechaFilter) filter.fecha = fechaFilter;

    // Post-procesamiento: añadir productoNombre/productoCodigo.
    const post = async (data) => {
      if (!Array.isArray(data) || data.length === 0) return data;

      const productoIds = [...new Set(
        data.map(d => d.productoId?.toString()).filter(Boolean)
      )];

      if (productoIds.length === 0) {
        return data.map(d => ({
          ...d,
          productoNombre: 'Producto eliminado',
          productoCodigo: ''
        }));
      }

      const productos = await req.db.collection(CONFIG.colProductos)
        .find(
          { _id: { $in: productoIds.map(id => new ObjectId(id)) } },
          { projection: CONFIG.proyeccionProducto }
        )
        .toArray();

      const prodMap = new Map(productos.map(p => [p._id.toString(), p]));

      return data.map(d => {
        const prod = prodMap.get(d.productoId?.toString());
        return {
          ...d,
          productoNombre: prod?.nombre || 'Producto eliminado',
          productoCodigo: prod?.codigo || ''
        };
      });
    };

    // Como `post` es async, no podemos usar `responderListado` directamente;
    // replicamos la lógica con soporte async.
    const col = req.db.collection(CONFIG.colKardex);
    const sort = { fecha: -1, _id: -1 };

    if (!paginacion.paginar) {
      const data = await col.find(filter).sort(sort).limit(CONFIG.maxSinPaginar).toArray();
      const dataConProducto = await post(data);
      headersNoStore(res);
      return res.json(dataConProducto);
    }

    const { page, limit, skip } = paginacion;
    const [total, data] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter).sort(sort).skip(skip).limit(limit).toArray()
    ]);

    const dataConProducto = await post(data);
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    headersNoStore(res);
    return res.json({
      data: dataConProducto,
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
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._buildFechaFilter = buildFechaFilter;
module.exports._requireObjectId = requireObjectId;
module.exports._handlerPorReferencia = handlerPorReferencia;