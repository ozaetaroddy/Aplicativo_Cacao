// backend/utils/validacion.js
// ============================================================
// Helper centralizado de validación (express-validator)
// ------------------------------------------------------------
// Uso típico en un router:
//
//   const { body } = require('express-validator');
//   const { validar } = require('../utils/validacion');
//
//   const reglas = [ body('email').isEmail(), body('nombre').notEmpty() ];
//
//   router.post('/x', reglas, (req, res, next) => {
//     if (validar(req, res)) return;    // ← ya respondió 400
//     // lógica del handler
//   });
//
// API pública:
//   respuestaValidacion(res, errors)  → envía 400 y devuelve la respuesta
//   validar(req, res)                 → boolean (true si respondió)
//
// Extensiones:
//   extraerError(err)                 → { campo, mensaje, ubicacion, codigo? }
//   agruparPorCampo(errors)           → { campo: [msg1, msg2] }
//   formatearMensajes(errors)         → string[]  (únicos, truncados)
//   getMetricas() / resetearMetricas()
//
// Configuración por env:
//   VALIDACION_MAX_MENSAJES=20        → tope de errores devueltos
//   VALIDACION_MAX_LONGITUD_MENSAJE=300  → truncado por mensaje
//
// ⚠️  El array original de express-validator sigue estando disponible
//     vía `errors.array()` para el caso en que un caller lo necesite.
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  /** Máx. errores incluidos en la respuesta. */
  maxMensajes: envNum('VALIDACION_MAX_MENSAJES', 20),

  /** Longitud máxima por mensaje individual. */
  maxLongitudMensaje: envNum('VALIDACION_MAX_LONGITUD_MENSAJE', 300),

  /** Código por defecto del error de validación. */
  codigoDefault: 'VALIDACION',

  /** Prefijo del mensaje compuesto. */
  separadorMensajes: ', '
});

// ============================================================
// MÉTRICAS (en memoria)
// ============================================================
const METRICAS = {
  validacionesFallidas: 0,
  validacionesOk: 0,
  erroresEnRespuesta: 0
};

function getMetricas() {
  return { ...METRICAS };
}

function resetearMetricas() {
  for (const k of Object.keys(METRICAS)) METRICAS[k] = 0;
}

// ============================================================
// CARGA LAZY DE express-validator
// ============================================================
let _validationResult = null;
let _expressValidatorError = null;

function cargarValidationResult() {
  if (_validationResult) return _validationResult;
  if (_expressValidatorError) return null;
  try {
    // eslint-disable-next-line global-require
    _validationResult = require('express-validator').validationResult;
    return _validationResult;
  } catch (err) {
    _expressValidatorError = err;
    log.error({ err: err.message }, 'express-validator no está instalado');
    return null;
  }
}

// ============================================================
// NORMALIZACIÓN DE ERRORES
// ============================================================
/**
 * Trunca un string a `max` chars, agregando un sufijo si corta.
 * @param {*} s
 * @param {number} [max]
 */
function truncar(s, max = CONFIG.maxLongitudMensaje) {
  const str = typeof s === 'string' ? s : String(s == null ? '' : s);
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

/**
 * Convierte un error individual de express-validator al shape uniforme.
 *
 * Soporta:
 *   - express-validator v6 (usa `param`) y v7+ (usa `path`)
 *   - mensajes string u objeto (`withMessage({ ... })`)
 *   - cualquier otra forma de error (fallback genérico)
 *
 * @param {object} err
 * @returns {{ campo: string, mensaje: string, ubicacion: string, codigo?: string }}
 */
function extraerError(err) {
  if (!err || typeof err !== 'object') {
    return { campo: '', mensaje: 'Error de validación', ubicacion: '' };
  }

  // En v7 `path` reemplaza a `param`. Soportamos ambos.
  const campo = err.path || err.param || err.field || '';

  // El mensaje puede ser string, un objeto con `.message`, o cualquier cosa.
  let mensaje;
  if (typeof err.msg === 'string') {
    mensaje = err.msg;
  } else if (err.msg && typeof err.msg.message === 'string') {
    mensaje = err.msg.message;
  } else if (err.msg != null) {
    mensaje = String(err.msg);
  } else {
    mensaje = 'Error de validación';
  }

  const ubicacion = err.location || err.location_ || '';

  const out = {
    campo: String(campo),
    mensaje: truncar(mensaje),
    ubicacion: String(ubicacion)
  };

  // `err.code` es raro en express-validator, pero algunos custom validators lo setean.
  if (err.code) out.codigo = String(err.code);

  return out;
}

/**
 * Extrae los errores de un `ValidationError` (objeto de express-validator).
 * NUNCA lanza.
 *
 * @param {*} errors
 * @returns {Array<object>}
 */
function extraerErrores(errors) {
  if (!errors) return [];
  if (typeof errors.array !== 'function') return [];
  let arr;
  try {
    arr = errors.array();
  } catch (err) {
    log.warn({ err: err.message }, 'No se pudo extraer .array() de errors');
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.map(extraerError);
}

/**
 * Deduplica por `(campo, mensaje)`. Mantiene el orden de aparición.
 * @param {Array<object>} errores
 */
function deduplicar(errores) {
  const vistos = new Set();
  const out = [];
  for (const e of errores) {
    const key = `${e.campo}\u0000${e.mensaje}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push(e);
  }
  return out;
}

// ============================================================
// HELPERS EXPUESTOS
// ============================================================
/**
 * Devuelve los mensajes únicos de un conjunto de errores.
 * @param {*} errors
 * @returns {string[]}
 */
function formatearMensajes(errors) {
  const arr = Array.isArray(errors) ? errors : extraerErrores(errors);
  return deduplicar(arr).map(e => e.mensaje);
}

/**
 * Agrupa los errores por campo. Útil para UIs que muestran el error
 * junto al input (por ejemplo `{ email: ['Email inválido'] }`).
 * @param {*} errors
 * @returns {Object<string, string[]>}
 */
function agruparPorCampo(errors) {
  const arr = Array.isArray(errors) ? errors : extraerErrores(errors);
  const out = {};
  for (const e of arr) {
    const campo = e.campo || '_';
    if (!out[campo]) out[campo] = [];
    if (!out[campo].includes(e.mensaje)) out[campo].push(e.mensaje);
  }
  return out;
}

// ============================================================
// RESPUESTA HTTP
// ============================================================
/**
 * Envía una respuesta 400 con los errores de validación.
 *
 * @param {import('express').Response} res
 * @param {*} errors                    ValidationError de express-validator.
 * @param {object} [opts]
 * @param {string} [opts.codigo]        Override del código (`'VALIDACION'`).
 * @returns {import('express').Response}
 */
function respuestaValidacion(res, errors, opts = {}) {
  // Deduplicamos y truncamos el listado.
  const todos = extraerErrores(errors);
  const unicos = deduplicar(todos);
  const recortados = unicos.slice(0, CONFIG.maxMensajes);
  const huboRecorte = unicos.length > CONFIG.maxMensajes;

  // Mensaje compuesto.
  const mensajes = recortados.map(e => e.mensaje);
  let mensajeCompuesto = mensajes.join(CONFIG.separadorMensajes);
  if (huboRecorte) {
    mensajeCompuesto += ` … y ${unicos.length - CONFIG.maxMensajes} más`;
  }

  METRICAS.validacionesFallidas++;
  METRICAS.erroresEnRespuesta += recortados.length;

  const payload = {
    error: mensajeCompuesto,
    codigo: opts.codigo || CONFIG.codigoDefault,
    detalles: recortados.map(e => {
      const detalle = { campo: e.campo, mensaje: e.mensaje };
      if (e.ubicacion) detalle.ubicacion = e.ubicacion;
      if (e.codigo) detalle.codigo = e.codigo;
      return detalle;
    })
  };

  if (huboRecorte) {
    payload._meta = { total: unicos.length, mostrados: recortados.length };
  }

  // ---- Responder con seguridad ----
  // Si el errorHandler u otro middleware ya envió headers, no podemos
  // escribir. Delegamos al caller (que ya hizo `return`).
  if (res.headersSent) {
    log.warn({ total: unicos.length }, 'Validación fallida tras headers sent');
    return res;
  }

  res.set('Cache-Control', 'no-store');
  return res.status(400).json(payload);
}

/**
 * Valida la request. Si hay errores, responde y devuelve `true`.
 *
 * Uso:
 *   if (validar(req, res)) return;
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} [opts]              Mismas opciones que `respuestaValidacion`.
 * @returns {boolean} `true` si hubo errores (ya respondidos), `false` si está OK.
 */
function validar(req, res, opts = {}) {
  const validationResult = cargarValidationResult();

  // ---- Fallback si express-validator no está instalado ----
  if (!validationResult) {
    log.error('express-validator no disponible, todas las validaciones pasan');
    // Degradamos: dejamos pasar la request (el handler validará a mano).
    METRICAS.validacionesOk++;
    return false;
  }

  let errors;
  try {
    errors = validationResult(req);
  } catch (err) {
    // El request no pasó por el chain de express-validator → sin errores.
    log.warn({ err: err.message }, 'validationResult() lanzó, se asume sin errores');
    METRICAS.validacionesOk++;
    return false;
  }

  if (!errors || typeof errors.isEmpty !== 'function') {
    METRICAS.validacionesOk++;
    return false;
  }

  let vacio;
  try {
    vacio = errors.isEmpty();
  } catch (err) {
    log.warn({ err: err.message }, 'errors.isEmpty() lanzó, se asume sin errores');
    METRICAS.validacionesOk++;
    return false;
  }

  if (vacio) {
    METRICAS.validacionesOk++;
    return false;
  }

  respuestaValidacion(res, errors, opts);
  return true;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  respuestaValidacion,
  validar,

  // ---- Extensiones ----
  extraerError,
  extraerErrores,
  formatearMensajes,
  agruparPorCampo,
  getMetricas,
  resetearMetricas,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._truncar = truncar;
module.exports._deduplicar = deduplicar;
module.exports._cargarValidationResult = cargarValidationResult;
module.exports._METRICAS = METRICAS;
module.exports._resetCache = () => {
  _validationResult = null;
  _expressValidatorError = null;
};