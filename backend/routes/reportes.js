// backend/routes/reportes.js
// ============================================================
// Reportes — listado de ventas y compras con rango de fechas
// ------------------------------------------------------------
// Endpoints:
//   GET /ventas    → listado de ventas comerciales
//   GET /compras   → listado de compras
//   GET /resumen   → agregados de ventas/compras (opcional)
//
// Query params comunes:
//   ?desde=YYYY-MM-DD   → filtro desde (inclusive, 00:00)
//   ?hasta=YYYY-MM-DD   → filtro hasta (inclusive, 23:59:59.999)
//   ?page=N&limit=M     → paginación (si no viene, usa MAX_EXPORT)
//   ?search=...         → busca por nº factura / cliente / proveedor
//
// Convenciones:
//   - Todas las rutas requieren permiso `reportes:ver`.
//   - Se excluyen documentos NO comerciales (guías, proformas,
//     retenciones) del listado de ventas.
//   - Los listados SIN paginación están topeados por MAX_EXPORT.
//   - Los errores se delegan al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const {
  parsePagination,
  wantsPagination,
  escapeRegex
} = require('../utils/pagination');
const { TIPOS_NO_COMERCIALES } = require('../utils/tiposDocumento');
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
  colVentas: 'ventas_v2',
  colCompras: 'compras_v2',
  colClientes: 'clientes',
  colProveedores: 'proveedores',

  /** Máx. registros devueltos sin paginación explícita. */
  maxExport: envNum('REPORTES_MAX_EXPORT', 5000),

  /** Proyección mínima en el lookup de clientes. */
  proyeccionCliente: Object.freeze({
    nombre: 1, ruc: 1, telefono: 1, email: 1
  }),

  /** Proyección mínima en el lookup de proveedores. */
  proyeccionProveedor: Object.freeze({
    nombre: 1, ruc: 1, telefono: 1, email: 1
  })
});

const TIPOS_NO_COMERCIALES_SET = new Set(TIPOS_NO_COMERCIALES);

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Parsea fecha `YYYY-MM-DD` o ISO. Devuelve `null` si inválida. */
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

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    const { logAudit } = require('../utils/audit');
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar reporte');
  }
}

/**
 * Construye el filtro `fecha_emision` desde query params.
 * @returns {{ ok: true, filtro: object, desde: Date|null, hasta: Date|null }
 *         | { ok: false, error: string, codigo: string }}
 */
function buildFiltroFecha(query) {
  const desde = parseFecha(query.desde, { finDelDia: false });
  const hasta = parseFecha(query.hasta, { finDelDia: true });

  // Si el usuario pasó un valor y no se pudo parsear → error 400.
  if (query.desde !== undefined && query.desde !== '' && !desde) {
    return { ok: false, error: 'Fecha "desde" inválida', codigo: 'DESDE_INVALIDO' };
  }
  if (query.hasta !== undefined && query.hasta !== '' && !hasta) {
    return { ok: false, error: 'Fecha "hasta" inválida', codigo: 'HASTA_INVALIDO' };
  }

  if (desde && hasta && desde > hasta) {
    return {
      ok: false,
      error: '"desde" no puede ser posterior a "hasta"',
      codigo: 'RANGO_INVALIDO'
    };
  }

  const filtro = {};
  if (desde || hasta) {
    filtro.fecha_emision = {};
    if (desde) filtro.fecha_emision.$gte = desde;
    if (hasta) filtro.fecha_emision.$lte = hasta;
  }
  return { ok: true, filtro, desde: desde || null, hasta: hasta || null };
}

/**
 * Búsqueda: aplica `$or` sobre los campos indicados.
 * El regex se escapa para evitar ReDoS.
 */
function aplicarBusqueda(pipeline, search, campos) {
  const q = (soloString(search) || '').trim();
  if (!q) return;
  const regex = new RegExp(escapeRegex(q), 'i');
  pipeline.push({
    $match: { $or: campos.map(c => ({ [c]: regex })) }
  });
}

// ============================================================
// PIPELINES REUTILIZABLES
// ============================================================

/** Pipeline base para ventas (con lookup de cliente). */
function pipelineVentas(matchBase) {
  return [
    { $match: matchBase },
    {
      $lookup: {
        from: CONFIG.colClientes,
        localField: 'clienteId',
        foreignField: '_id',
        as: 'cliente',
        pipeline: [{ $project: { ...CONFIG.proyeccionCliente } }]
      }
    },
    { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } }
  ];
}

/** Pipeline base para compras (con lookup de proveedor). */
function pipelineCompras(matchBase) {
  return [
    { $match: matchBase },
    {
      $lookup: {
        from: CONFIG.colProveedores,
        localField: 'proveedorId',
        foreignField: '_id',
        as: 'proveedor',
        pipeline: [{ $project: { ...CONFIG.proyeccionProveedor } }]
      }
    },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
  ];
}

/**
 * Ejecuta un pipeline con o sin paginación y responde.
 * @param {object} opts
 * @param {Collection} opts.col
 * @param {Array}      opts.pipeline  pipeline base (sin $sort/$skip/$limit)
 * @param {object}     opts.paginacion
 * @param {object}     opts.sort
 * @param {Response}   opts.res
 */
async function ejecutarListado({ col, pipeline, paginacion, sort, res }) {
  const { page, limit, skip, paginar } = paginacion;

  if (!paginar) {
    const data = await col.aggregate([
      ...pipeline,
      { $sort: sort },
      { $limit: CONFIG.maxExport }
    ]).toArray();

    headersNoStore(res);
    return res.json(data);
  }

  // Con paginación: count + data en paralelo.
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
}

// ============================================================
// MIDDLEWARE (aplica a todo el router)
// ============================================================
router.use(requierePermiso('reportes', 'ver'));

// ============================================================
// GET /ventas  → listado de ventas comerciales
// ============================================================
router.get('/ventas', async (req, res, next) => {
  try {
    const fechas = buildFiltroFecha(req.query);
    if (!fechas.ok) {
      return res.status(400).json({ error: fechas.error, codigo: fechas.codigo });
    }

    const paginacion = {
      ...parsePagination(req.query),
      paginar: wantsPagination(req.query)
    };

    const matchBase = {
      ...fechas.filtro,
      tipo_documento: { $nin: [...TIPOS_NO_COMERCIALES_SET] }
    };

    const pipeline = pipelineVentas(matchBase);

    aplicarBusqueda(pipeline, req.query.search, [
      'numero_factura',
      'cliente.nombre',
      'cliente.ruc',
      'clave_acceso'
    ]);

    return ejecutarListado({
      col: req.db.collection(CONFIG.colVentas),
      pipeline,
      paginacion,
      sort: { fecha_emision: -1, _id: -1 },
      res
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /compras  → listado de compras
// ============================================================
router.get('/compras', async (req, res, next) => {
  try {
    const fechas = buildFiltroFecha(req.query);
    if (!fechas.ok) {
      return res.status(400).json({ error: fechas.error, codigo: fechas.codigo });
    }

    const paginacion = {
      ...parsePagination(req.query),
      paginar: wantsPagination(req.query)
    };

    const pipeline = pipelineCompras(fechas.filtro);

    aplicarBusqueda(pipeline, req.query.search, [
      'numero_factura',
      'proveedor.nombre',
      'proveedor.ruc',
      'numero_autorizacion'
    ]);

    return ejecutarListado({
      col: req.db.collection(CONFIG.colCompras),
      pipeline,
      paginacion,
      sort: { fecha_emision: -1, _id: -1 },
      res
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /resumen  → agregados de ventas y compras en el rango
// ------------------------------------------------------------
// Útil para dashboards y exportaciones. Devuelve totales,
// cantidad, IVA y desglose por tipo de documento.
// ============================================================
router.get('/resumen', async (req, res, next) => {
  try {
    const fechas = buildFiltroFecha(req.query);
    if (!fechas.ok) {
      return res.status(400).json({ error: fechas.error, codigo: fechas.codigo });
    }

    const t0 = Date.now();
    const matchVentas = {
      ...fechas.filtro,
      tipo_documento: { $nin: [...TIPOS_NO_COMERCIALES_SET] }
    };
    const matchCompras = { ...fechas.filtro };

    const [ventasAgg, comprasAgg] = await Promise.all([
      req.db.collection(CONFIG.colVentas).aggregate([
        { $match: matchVentas },
        {
          $group: {
            _id: '$tipo_documento',
            subtotal: { $sum: '$subtotal' },
            iva: { $sum: '$iva' },
            total: { $sum: '$total' },
            cantidad: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]).toArray(),

      req.db.collection(CONFIG.colCompras).aggregate([
        { $match: matchCompras },
        {
          $group: {
            _id: '$tipo_compra',
            subtotal: { $sum: '$subtotal' },
            iva: { $sum: '$iva' },
            total: { $sum: '$total' },
            cantidad: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]).toArray()
    ]);

    const sumar = (arr, campo) =>
      Math.round((arr.reduce((s, x) => s + (Number(x[campo]) || 0), 0) + Number.EPSILON) * 100) / 100;

    headersNoStore(res);
    return res.json({
      periodo: { desde: fechas.desde, hasta: fechas.hasta },
      ventas: {
        total: sumar(ventasAgg, 'total'),
        subtotal: sumar(ventasAgg, 'subtotal'),
        iva: sumar(ventasAgg, 'iva'),
        cantidad: ventasAgg.reduce((s, x) => s + (x.cantidad || 0), 0),
        porTipoDocumento: ventasAgg
      },
      compras: {
        total: sumar(comprasAgg, 'total'),
        subtotal: sumar(comprasAgg, 'subtotal'),
        iva: sumar(comprasAgg, 'iva'),
        cantidad: comprasAgg.reduce((s, x) => s + (x.cantidad || 0), 0),
        porTipoCompra: comprasAgg
      },
      _meta: { tiempoMs: Date.now() - t0, generado: new Date() }
    });
  } catch (err) {
    log.error({ err: err.message }, 'Error en resumen de reportes');
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._parseFecha = parseFecha;
module.exports._buildFiltroFecha = buildFiltroFecha;
module.exports._pipelineVentas = pipelineVentas;
module.exports._pipelineCompras = pipelineCompras;
module.exports._ejecutarListado = ejecutarListado;
module.exports._aplicarBusqueda = aplicarBusqueda;