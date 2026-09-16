// backend/routes/auditoria.js
// ============================================================
// Auditoría — listado y estadísticas
// ------------------------------------------------------------
// Endpoints:
//   GET /api/auditoria           → listado paginado con filtros
//   GET /api/auditoria/stats     → agregados (cacheados 60s)
//
// Seguridad:
//   - Todos los query params se coaccionan a string ANTES de usarse
//     (evita `?campo[$ne]=x` → NoSQL injection).
//   - Fechas validadas con `Date.parse`.
//   - `search` escapa regex (vía `escapeRegex`).
//   - `limit` acotado (1..500) y `page` >= 1.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { escapeRegex } = require('../utils/pagination');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const COL = 'auditoria';
const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 500;

/** Campos que se proyectan en el listado (evita payloads gordos). */
const PROYECCION_LISTA = Object.freeze({
  fecha: 1,
  accion: 1,
  coleccion: 1,
  documentoId: 1,
  documentoNumero: 1,
  usuarioEmail: 1,
  usuarioNombre: 1,
  ip: 1,
  detalle: 1,
  meta: 1
});

/** Ordenamientos permitidos (evita sort injection). */
const SORTS_PERMITIDOS = Object.freeze({
  fecha_desc: { fecha: -1 },
  fecha_asc:  { fecha: 1 }
});

/** Caché simple en memoria para /stats (evita agregaciones por cada hit). */
const STATS_TTL_MS = 60_000;
let statsCache = null; // { expiresAt, payload }
let statsEnVuelo = null; // dedupe de requests concurrentes

// ============================================================
// HELPERS DE VALIDACIÓN
// ============================================================

/** Fuerza string (evita objetos tipo `?campo[$ne]=x`). */
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Parsea un entero positivo con tope. */
function parseIntSeguro(v, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  const n = parseInt(soloString(v) ?? '', 10);
  if (!Number.isInteger(n)) return fallback;
  if (n < min) return fallback;
  if (n > max) return max;
  return n;
}

/** Parsea una fecha `YYYY-MM-DD` o ISO. Devuelve `null` si inválida. */
function parseFecha(v) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Devuelve el sort válido o el default. */
function parseSort(v) {
  const s = soloString(v);
  return SORTS_PERMITIDOS[s] || SORTS_PERMITIDOS.fecha_desc;
}

// ============================================================
// CONSTRUCCIÓN DEL FILTRO
// ============================================================
/**
 * Construye el filtro Mongo a partir de los query params.
 * Todos los valores vienen ya coaccionados a string.
 */
function construirFiltro(query) {
  const match = {};

  const coleccion = soloString(query.coleccion);
  const usuarioEmail = soloString(query.usuarioEmail);
  const ip = soloString(query.ip);
  const accion = soloString(query.accion);
  const soloErrores = soloString(query.soloErrores);
  const search = (soloString(query.search) || '').trim();
  const desde = parseFecha(query.desde);
  const hasta = parseFecha(query.hasta);

  if (coleccion) match.coleccion = coleccion;
  if (usuarioEmail) match.usuarioEmail = usuarioEmail;
  if (ip) match.ip = ip;

  // Filtro de acción:
  //   - `soloErrores=true` → gana y busca acciones de error/fallo/rechazo
  //   - `accion=xxx`       → filtro exacto
  if (soloErrores === 'true') {
    match.accion = { $regex: 'error|fallido|rechaz', $options: 'i' };
  } else if (accion) {
    match.accion = accion;
  }

  if (desde || hasta) {
    match.fecha = {};
    if (desde) match.fecha.$gte = desde;
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59, 999);
      match.fecha.$lte = h;
    }
    // Si el usuario mandó fechas inválidas, no agregamos la clave vacía.
    if (Object.keys(match.fecha).length === 0) delete match.fecha;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    match.$or = [
      { usuarioEmail: regex },
      { usuarioNombre: regex },
      { documentoNumero: regex },
      { detalle: regex },
      { coleccion: regex }
    ];
  }

  return { match, hayFiltroFecha: Boolean(desde || hasta) };
}

// ============================================================
// ENDPOINTS
// ============================================================

// Todas las rutas de este router requieren permiso de auditoría.
router.use(requierePermiso('auditoria', 'ver'));

// GET /api/auditoria/stats  → agregados (con caché)
// ⚠️ Declarado ANTES que "/" para evitar cualquier ambigüedad de routing.
router.get('/stats', async (req, res, next) => {
  try {
    const ahora = Date.now();
    if (statsCache && statsCache.expiresAt > ahora) {
      res.set('X-Cache', 'HIT');
      return res.json(statsCache.payload);
    }

    // Dedupe: si ya hay una ejecución en vuelo, esperamos a esa.
    if (!statsEnVuelo) {
      statsEnVuelo = (async () => {
        const hace7dias = new Date();
        hace7dias.setDate(hace7dias.getDate() - 7);

        const [totalRegistros, ultimos7dias, porAccion, porColeccion, topUsuarios] =
          await Promise.all([
            req.db.collection(COL).countDocuments(),
            req.db.collection(COL).countDocuments({ fecha: { $gte: hace7dias } }),
            req.db.collection(COL).aggregate([
              { $group: { _id: '$accion', total: { $sum: 1 } } },
              { $sort: { total: -1 } },
              { $limit: 10 }
            ]).toArray(),
            req.db.collection(COL).aggregate([
              { $group: { _id: '$coleccion', total: { $sum: 1 } } },
              { $sort: { total: -1 } },
              { $limit: 10 }
            ]).toArray(),
            req.db.collection(COL).aggregate([
              { $match: { fecha: { $gte: hace7dias } } },
              { $group: { _id: '$usuarioEmail', total: { $sum: 1 } } },
              { $sort: { total: -1 } },
              { $limit: 5 }
            ]).toArray()
          ]);

        return { totalRegistros, ultimos7dias, porAccion, porColeccion, topUsuarios };
      })();
    }

    let payload;
    try {
      payload = await statsEnVuelo;
      statsCache = { expiresAt: ahora + STATS_TTL_MS, payload };
    } finally {
      statsEnVuelo = null;
    }

    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${Math.floor(STATS_TTL_MS / 1000)}`);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

// GET /api/auditoria  → listado paginado
router.get('/', async (req, res, next) => {
  try {
    const page = parseIntSeguro(req.query.page, { min: 1, fallback: 1 });
    const limit = parseIntSeguro(req.query.limit, {
      min: 1,
      max: PAGE_SIZE_MAX,
      fallback: PAGE_SIZE_DEFAULT
    });
    const skip = (page - 1) * limit;

    const { match } = construirFiltro(req.query);
    const sort = parseSort(req.query.sort);

    // count y find en paralelo (más rápido que secuencial).
    const coleccion = req.db.collection(COL);
    const [total, data] = await Promise.all([
      coleccion.countDocuments(match),
      coleccion
        .find(match, { projection: PROYECCION_LISTA })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      data,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
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
module.exports._construirFiltro = construirFiltro;
module.exports._parseFecha = parseFecha;
module.exports._parseIntSeguro = parseIntSeguro;
module.exports._invalidarStatsCache = () => { statsCache = null; statsEnVuelo = null; };