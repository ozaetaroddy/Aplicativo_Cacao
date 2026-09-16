// backend/utils/periodos.js
// ============================================================
// Períodos contables — verificación de cierre por mes
// ------------------------------------------------------------
// API pública:
//   obtenerPeriodoCerrado(db, fecha)      → doc | null
//   verificarPeriodoAbierto(opts?)        → middleware Express
//   MESES                                 → array congelado
//   obtenerPeriodosCerradosEnFechas(db, fechas) → array
//
// Extensiones:
//   estaPeriodoCerrado(db, fecha)         → boolean
//   assertPeriodoAbierto(db, fecha)       → lanza error tipado
//   nombrePeriodo(anio, mes)              → 'Marzo 2024'
//   getMeses()                            → copia inmutable
//
// ⚠️  Todas las fechas se interpretan en TZ **Ecuador** (UTC-5).
//     Un documento emitido a las 21:00 EC del 31/03 (= 02:00 UTC
//     del 01/04) DEBE validarse contra Marzo, no Abril.
//
// Middleware:
//   - En PUT/PATCH/DELETE valida AMBAS fechas: la original del
//     documento y la nueva que se quiere guardar.
//   - Cachea el documento completo en `req._documentoOriginal`
//     para que el handler lo reutilice sin re-consultar.
//   - Cachea los `periodos_cerrados` en `req._periodosCache`.
// ============================================================
'use strict';

const { ObjectId } = require('mongodb');
const { anioMesEC } = require('./fechaEC');
const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /** Nombre de la colección donde se persisten los cierres. */
  coleccionPeriodos: 'periodos_cerrados',

  /** Habilitar cache de períodos por request (recomendado). */
  cachePerRequest: envBool('PERIODOS_CACHE_PER_REQUEST', true),

  /**
   * Mapa base URL → colección de documentos.
   * Permite detectar sobre qué colección operar en PUT/PATCH/DELETE.
   *
   * El matching es por `startsWith` case-insensitive sobre `req.baseUrl`.
   * El orden importa: el primero que matchea gana.
   */
  mapaBaseUrl: Object.freeze([
    { prefijo: '/api/ventas',           coleccion: 'ventas_v2' },
    { prefijo: '/api/compras',          coleccion: 'compras_v2' },
    { prefijo: '/api/retenciones',      coleccion: 'retenciones' },
    { prefijo: '/api/guias',            coleccion: 'ventas_v2' },
    { prefijo: '/api/notas-credito',    coleccion: 'ventas_v2' },
    { prefijo: '/api/notas-debito',     coleccion: 'ventas_v2' },
    { prefijo: '/api/liquidaciones',    coleccion: 'ventas_v2' },
    { prefijo: '/api/exportaciones',    coleccion: 'ventas_v2' },
    { prefijo: '/api/pagos',            coleccion: 'pagos' }
  ])
});

// ============================================================
// CONSTANTES
// ============================================================
/** Nombres de mes en español (índice 0 = Enero). CONGELADO. */
const MESES = Object.freeze([
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]);

/** Copia mutable por si el caller quiere modificarla localmente. */
function getMeses() {
  return [...MESES];
}

/**
 * Devuelve `'Marzo 2024'` a partir de `anio` y `mes`.
 * @param {number} anio
 * @param {number} mes  1-12
 */
function nombrePeriodo(anio, mes) {
  const idx = Number(mes) - 1;
  const nombre = MESES[idx] || `Mes ${mes}`;
  return `${nombre} ${anio}`;
}

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 423, extra = {}) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  Object.assign(err, extra);
  return err;
}

// ============================================================
// HELPERS
// ============================================================
/** `true` si el valor es una fecha parseable (Date o string ISO). */
function esFechaParseable(fecha) {
  if (fecha === null || fecha === undefined || fecha === '') return false;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return !Number.isNaN(d.getTime());
}

/** Normaliza a Date, o `null`. */
function normalizarFecha(fecha) {
  if (!esFechaParseable(fecha)) return null;
  return fecha instanceof Date ? fecha : new Date(fecha);
}

/**
 * Cache por request para períodos cerrados.
 * Si no hay `req`, cae a query directa.
 * @param {object} req
 */
function getCache(req) {
  if (!CONFIG.cachePerRequest || !req) return null;
  if (!req._periodosCache) {
    req._periodosCache = new Map();
  }
  return req._periodosCache;
}

/**
 * Detecta la colección de documentos a partir de `req.baseUrl`.
 * @param {string} baseUrl
 * @returns {string|null}
 */
function detectarColeccion(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl) return null;
  const url = baseUrl.toLowerCase();
  for (const { prefijo, coleccion } of CONFIG.mapaBaseUrl) {
    if (url.startsWith(prefijo.toLowerCase())) return coleccion;
  }
  return null;
}

// ============================================================
// API PÚBLICA
// ============================================================

/**
 * Devuelve el período cerrado que corresponde a `fecha` (TZ Ecuador),
 * o `null` si el período está abierto.
 *
 * @param {Db} db
 * @param {Date|string|number} fecha
 * @param {object} [opts]
 * @param {object} [opts.req]  Si se pasa, se usa el cache por request.
 * @returns {Promise<object|null>}
 */
async function obtenerPeriodoCerrado(db, fecha, opts = {}) {
  const d = normalizarFecha(fecha);
  if (!d) return null;

  // ⚠️  TZ de Ecuador, no del servidor. Ver header.
  const { anio, mes } = anioMesEC(d);
  const key = `${anio}-${mes}`;

  const cache = getCache(opts.req);
  if (cache && cache.has(key)) {
    return cache.get(key);
  }

  const doc = await db.collection(CONFIG.coleccionPeriodos).findOne({ anio, mes });

  if (cache) cache.set(key, doc);

  return doc;
}

/**
 * Devuelve `true` si el período correspondiente a `fecha` está cerrado.
 * @param {Db} db
 * @param {Date|string|number} fecha
 * @returns {Promise<boolean>}
 */
async function estaPeriodoCerrado(db, fecha) {
  const p = await obtenerPeriodoCerrado(db, fecha);
  return Boolean(p);
}

/**
 * Lanza un error tipado (`PERIODO_CERRADO`, status 423) si el
 * período de `fecha` está cerrado.
 *
 * Útil para validaciones internas (importadores, migraciones).
 *
 * @param {Db} db
 * @param {Date|string|number} fecha
 * @throws {Error}
 */
async function assertPeriodoAbierto(db, fecha) {
  const periodo = await obtenerPeriodoCerrado(db, fecha);
  if (!periodo) return;

  throw errorTipado(
    `El período ${nombrePeriodo(periodo.anio, periodo.mes)} está cerrado. ` +
    `No se pueden modificar documentos de ese mes.`,
    'PERIODO_CERRADO',
    423,
    {
      fecha: normalizarFecha(fecha)?.toISOString(),
      periodo: {
        anio: periodo.anio,
        mes: periodo.mes,
        nombre: nombrePeriodo(periodo.anio, periodo.mes),
        fecha_cierre: periodo.fecha_cierre
      }
    }
  );
}

// ============================================================
// MIDDLEWARE
// ============================================================
/**
 * Middleware que bloquea operaciones de escritura en períodos cerrados.
 *
 * - En POST: valida `req.body.fecha_emision` (o `fecha`).
 * - En PUT/PATCH/DELETE: valida la fecha original del documento
 *   **y** la nueva que se quiere guardar.
 *
 * Respuestas:
 *   - 423 `PERIODO_CERRADO` si el período está cerrado.
 *   - 400 `FECHA_INVALIDA` si el body trae una fecha que no parsea.
 *
 * @param {object} [opts]
 * @param {Array<{prefijo: string, coleccion: string}>} [opts.colecciones]
 *        Override del mapa base URL → colección.
 * @returns {import('express').RequestHandler}
 */
function verificarPeriodoAbierto(opts = {}) {
  const mapa = Array.isArray(opts.colecciones) && opts.colecciones.length > 0
    ? opts.colecciones
    : CONFIG.mapaBaseUrl;

  return async function middlewareVerificarPeriodo(req, res, next) {
    try {
      const metodo = String(req.method || '').toUpperCase();
      const esModificacion = ['PUT', 'PATCH', 'DELETE'].includes(metodo);
      const id = req.params?.id;

      // ---- 1. Fecha nueva declarada en el body/query ----
      const body = req.body || {};
      const query = req.query || {};
      const fechaNuevaRaw =
        (body.fecha_emision != null ? body.fecha_emision : undefined) ??
        (body.fecha != null ? body.fecha : undefined) ??
        (query.fecha_emision != null ? query.fecha_emision : undefined) ??
        (query.fecha != null ? query.fecha : undefined);

      let fechaNueva = null;
      if (fechaNuevaRaw != null && fechaNuevaRaw !== '') {
        fechaNueva = normalizarFecha(fechaNuevaRaw);
        if (!fechaNueva) {
          return res.status(400).json({
            error: `Fecha inválida: "${fechaNuevaRaw}"`,
            codigo: 'FECHA_INVALIDA'
          });
        }
      }

      // ---- 2. Fecha original del documento (en modificaciones) ----
      let fechaOriginal = null;
      let docOriginal = null;

      if (esModificacion && id) {
        if (!ObjectId.isValid(id)) {
          log.warn({ id, metodo }, 'verificarPeriodoAbierto: ID inválido');
          // No bloqueamos — el handler principal validará el ID.
        } else {
          const coleccion = detectarColeccionConMapa(req.baseUrl, mapa);
          if (!coleccion) {
            log.warn(
              { baseUrl: req.baseUrl, metodo },
              'verificarPeriodoAbierto: no se reconoce la colección a partir del baseUrl'
            );
          } else {
            docOriginal = await req.db.collection(coleccion).findOne({
              _id: new ObjectId(id)
            });
            fechaOriginal = docOriginal?.fecha_emision || docOriginal?.fecha || null;

            // Validación defensiva: si la fecha original del doc no parsea,
            // lo loggeamos pero no bloqueamos (dato corrupto, no culpa del user).
            if (fechaOriginal && !normalizarFecha(fechaOriginal)) {
              log.warn(
                { id, fechaOriginal, coleccion },
                'verificarPeriodoAbierto: fecha_emision original inválida en BD'
              );
              fechaOriginal = null;
            }
          }
        }
      }

      // ---- 3. Reunir fechas a validar ----
      const fechas = [];
      if (fechaOriginal) fechas.push({ fecha: fechaOriginal, tipo: 'original' });
      if (fechaNueva) fechas.push({ fecha: fechaNueva, tipo: 'nueva' });

      // ---- 4. Validar cada fecha contra periodos_cerrados ----
      for (const item of fechas) {
        const periodo = await obtenerPeriodoCerrado(req.db, item.fecha, { req });
        if (periodo) {
          return res.status(423).json({
            error:
              `El período ${nombrePeriodo(periodo.anio, periodo.mes)} está cerrado ` +
              `(fecha ${item.tipo}). No se pueden modificar documentos de ese mes.`,
            codigo: 'PERIODO_CERRADO',
            fecha: item.fecha instanceof Date
              ? item.fecha.toISOString()
              : String(item.fecha),
            tipo_fecha: item.tipo,
            periodo: {
              anio: periodo.anio,
              mes: periodo.mes,
              nombre: nombrePeriodo(periodo.anio, periodo.mes),
              fecha_cierre: periodo.fecha_cierre
            }
          });
        }
      }

      // ---- 5. Exponer el doc original para reutilización ----
      if (docOriginal) req._documentoOriginal = docOriginal;

      return next();
    } catch (err) {
      // Delegamos al errorHandler central (respeta reqId, sanitiza, etc.)
      return next(err);
    }
  };
}

/**
 * Variante de `detectarColeccion` que acepta un mapa personalizado.
 * @param {string} baseUrl
 * @param {Array<{prefijo: string, coleccion: string}>} mapa
 */
function detectarColeccionConMapa(baseUrl, mapa) {
  if (typeof baseUrl !== 'string' || !baseUrl) return null;
  const url = baseUrl.toLowerCase();
  for (const { prefijo, coleccion } of mapa) {
    if (url.startsWith(String(prefijo).toLowerCase())) return coleccion;
  }
  return null;
}

// ============================================================
// VERIFICACIÓN MASIVA (importaciones)
// ============================================================
/**
 * Devuelve los períodos cerrados que intersectan las fechas dadas.
 *
 * Optimizado para lotes: hace UNA sola query con `$or` en lugar de
 * N `findOne`. Ideal para importadores que reciben cientos de líneas.
 *
 * @param {Db} db
 * @param {Array<Date|string|number>} fechas
 * @returns {Promise<Array<object>>} Documentos con `nombre` legible.
 */
async function obtenerPeriodosCerradosEnFechas(db, fechas) {
  if (!Array.isArray(fechas) || fechas.length === 0) return [];

  // Reunir pares únicos (anio, mes).
  const pares = new Set();
  for (const f of fechas) {
    const d = normalizarFecha(f);
    if (!d) continue;
    const { anio, mes } = anioMesEC(d);
    pares.add(`${anio}-${mes}`);
  }
  if (pares.size === 0) return [];

  const orQuery = [...pares].map(k => {
    const [anio, mes] = k.split('-').map(Number);
    return { anio, mes };
  });

  const docs = await db
    .collection(CONFIG.coleccionPeriodos)
    .find({ $or: orQuery })
    .toArray();

  return docs.map(p => ({
    ...p,
    nombre: nombrePeriodo(p.anio, p.mes)
  }));
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  obtenerPeriodoCerrado,
  verificarPeriodoAbierto,
  MESES,
  obtenerPeriodosCerradosEnFechas,

  // ---- Extensiones ----
  estaPeriodoCerrado,
  assertPeriodoAbierto,
  nombrePeriodo,
  getMeses,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._esFechaParseable = esFechaParseable;
module.exports._normalizarFecha = normalizarFecha;
module.exports._detectarColeccion = detectarColeccion;
module.exports._detectarColeccionConMapa = detectarColeccionConMapa;
module.exports._errorTipado = errorTipado;
module.exports._getCache = getCache;