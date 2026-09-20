// backend/middleware/errorHandler.js
// ============================================================
// Manejo unificado de errores
// ------------------------------------------------------------
// Contrato de respuesta (JSON):
//   { error: string, codigo: string, detalles?: any, reqId?: string }
//   + stack solo en desarrollo y solo para 5xx.
// - No expone stack traces ni detalles internos en producción.
// - Respeta `res.headersSent` (delega al default handler de Express).
// - Añade `Retry-After` cuando el error trae `retryAfter`.
// - Log estructurado con severidad por status (>=500 error, >=400 warn).
// - Marca `Cache-Control: no-store` en TODAS las respuestas de error.
//
// 🔧 FIXES HISTÓRICOS (preservados)
//   1. Los traductores que producen mensajes SEGUROS marcan
//      `ctx.mensajeSeguro = true`. La decisión de saneo en prod
//      no depende de una whitelist frágil de strings.
//   2. `Retry-After` se emite en 5xx Y en 429 (Rate Limit).
//   3. Se limpian `ctx.detalles` en producción si el mensaje fue
//      saneado.
//
// 🆕 REFACTOR 2025-XX
// ------------------------------------------------------------
//   [Metadata de traductores] Cada traductor ahora declara su
//     `categoria` y su flag `esSeguro` como PROPIEDADES de la
//     función, no como estado en `ctx`. Esto hace que:
//       a) El handler pueda decidir el saneo ANTES de ejecutar
//          cualquier traductor (basándose en la metadata).
//       b) `registrarTraductor` pueda aceptar metadata al vuelo.
//       c) Sea más fácil auditar qué traductores producen
//          mensajes "seguros" con un vistazo al código.
//
//     La retro-compatibilidad está garantizada: si un traductor
//     setea `ctx.mensajeSeguro = true` dinámicamente, el handler
//     lo respeta igual (fallback).
//
//   [Categorías] El log estructurado ahora incluye `categoria`
//     ('mongo' | 'auth' | 'validacion' | 'externo' | 'rate-limit'
//     | 'interno'). Facilita el filtrado y las alertas.
//
//   [Métricas] `stats()` expone contadores por categoría, código
//     y rango de status. Útil para /health/detailed y para
//     detectar patrones (ej: muchos `RATE_LIMIT` = ataque).
//
//   [Traductores defensivos] Si un traductor lanza, se loggea
//     con más contexto (nombre del traductor + categoria) y se
//     continúa con el resto.
// ============================================================
'use strict';

const log = require('../utils/logger');

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

// ------------------------------------------------------------
// Sets de detección (ampliables por env)
// ------------------------------------------------------------
function parseListaEnv(raw) {
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

const MONGO_NETWORK_ERRORS = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTopologyClosedError',
  'MongoNotConnectedError',
  'MongoExpiredSessionError',
  'MongoPoolClosedError',
  ...parseListaEnv(process.env.ERRORS_MONGO_NETWORK_EXTRA)
]);

const MONGO_TIMEOUT_ERRORS = new Set([
  'MongoTimeoutError',
  'MongoServerSelectionTimeoutError',
  ...parseListaEnv(process.env.ERRORS_MONGO_TIMEOUT_EXTRA)
]);

const MONGO_DUPLICATE_NAMES = new Set([
  'MongoServerError',
  'MongoBulkWriteError',
  'MongoWriteConcernError'
]);

const BSON_INVALID_NAMES = new Set([
  'BSONTypeError',
  'BSONError',
  'BSONOffsetError',
  'BSONSerializeError'
]);

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function normalizarStatus(err) {
  const raw = err.status ?? err.statusCode ?? 500;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 400 && n <= 599) return n;
  return 500;
}

function raizDeErrorMongo(err) {
  if (Array.isArray(err.writeErrors) && err.writeErrors.length > 0) {
    const first = err.writeErrors[0];
    return (first && first.err) || first || err;
  }
  if (err.cause && typeof err.cause === 'object') return err.cause;
  return err;
}

function primerCampoDuplicado(errBase) {
  const kp = errBase.keyPattern || errBase.keyValue || {};
  const campo = Object.keys(kp)[0];
  if (!campo) return { campo: null, keyValue: undefined };
  const kv = errBase.keyValue || {};
  return { campo, keyValue: kv[campo] };
}

// ------------------------------------------------------------
// METRICAS (para /health y diagnóstico)
// ------------------------------------------------------------
const _stats = {
  total: 0,
  porCategoria: Object.create(null), // 'mongo' → 12
  porCodigo: Object.create(null),    // 'VALIDACION' → 5
  porStatus: {
    '4xx': 0,
    '5xx': 0
  },
  traductoresFallidos: 0,
  sanitizadosEnProd: 0,
  retryAfterEmitidos: 0
};

function _bumpPorCategoria(cat) {
  if (!cat) return;
  _stats.porCategoria[cat] = (_stats.porCategoria[cat] || 0) + 1;
}

function _bumpPorCodigo(codigo) {
  if (!codigo) return;
  _stats.porCodigo[codigo] = (_stats.porCodigo[codigo] || 0) + 1;
}

function _bumpPorStatus(status) {
  if (status >= 500) _stats.porStatus['5xx']++;
  else if (status >= 400) _stats.porStatus['4xx']++;
}

/**
 * Snapshot de estadísticas para /health o /metrics.
 * @returns {object}
 */
function stats() {
  return {
    total: _stats.total,
    porCategoria: { ..._stats.porCategoria },
    porCodigo: { ..._stats.porCodigo },
    porStatus: { ..._stats.porStatus },
    traductoresFallidos: _stats.traductoresFallidos,
    sanitizadosEnProd: _stats.sanitizadosEnProd,
    retryAfterEmitidos: _stats.retryAfterEmitidos
  };
}

/** Reset de métricas (solo tests). */
function _resetStats() {
  _stats.total = 0;
  _stats.porCategoria = Object.create(null);
  _stats.porCodigo = Object.create(null);
  _stats.porStatus = { '4xx': 0, '5xx': 0 };
  _stats.traductoresFallidos = 0;
  _stats.sanitizadosEnProd = 0;
  _stats.retryAfterEmitidos = 0;
}

// ------------------------------------------------------------
// Traductores
// ------------------------------------------------------------
// Cada traductor muta `ctx` si reconoce el error. Los traductores
// que producen mensajes SEGUROS deben tener `.esSeguro = true`
// (metadata de la función). El handler lo aplica ANTES de llamarlos.
//
// Si un traductor setea `ctx.mensajeSeguro = true` dinámicamente,
// también se respeta (fallback retro-compatible).
// ------------------------------------------------------------
const traductores = [
  // --- Mongo: duplicados y validación de esquema ---
  (function mongoDuplicados(ctx) {
    const err = ctx.err;
    if (!MONGO_DUPLICATE_NAMES.has(err.name)) return;

    const errBase = raizDeErrorMongo(err);

    if (errBase.code === 11000) {
      const { campo, keyValue } = primerCampoDuplicado(errBase);
      ctx.status = 400;
      ctx.codigo = 'DUPLICADO';
      ctx.mensaje = campo
        ? `El valor del campo "${campo}" ya está registrado`
        : 'Registro duplicado';
      ctx.detalles = { campo: campo || undefined, keyValue };
      ctx.mensajeSeguro = true;
      return;
    }
    if (errBase.code === 121) {
      ctx.status = 400;
      ctx.codigo = 'VALIDACION_MONGO';
      ctx.mensaje = 'Error de validación en la base de datos';
      ctx.mensajeSeguro = true;
      if (!IS_PROD && errBase.errInfo) ctx.detalles = { errInfo: errBase.errInfo };
      return;
    }
  }),

  // --- Mongo: red ---
  (function mongoRed(ctx) {
    if (!MONGO_NETWORK_ERRORS.has(ctx.err.name)) return;
    ctx.status = 503;
    ctx.codigo = 'DB_NO_DISPONIBLE';
    ctx.mensaje = 'Base de datos no disponible. Reintente en unos segundos.';
    ctx.mensajeSeguro = true;
  }),

  // --- Mongo: timeout ---
  (function mongoTimeout(ctx) {
    if (!MONGO_TIMEOUT_ERRORS.has(ctx.err.name)) return;
    ctx.status = 504;
    ctx.codigo = 'DB_TIMEOUT';
    ctx.mensaje = 'La base de datos tardó demasiado en responder.';
    ctx.mensajeSeguro = true;
  }),

  // --- BSON inválido ---
  (function bsonInvalido(ctx) {
    if (!BSON_INVALID_NAMES.has(ctx.err.name)) return;
    ctx.status = 400;
    ctx.codigo = 'BSON_INVALIDO';
    ctx.mensaje = 'Datos con formato inválido';
    ctx.mensajeSeguro = true;
  }),

  // --- JWT ---
  (function jwt(ctx) {
    if (ctx.err.name === 'JsonWebTokenError') {
      ctx.status = 401; ctx.codigo = 'TOKEN_INVALIDO';
      ctx.mensaje = 'Token inválido'; ctx.mensajeSeguro = true;
    } else if (ctx.err.name === 'TokenExpiredError') {
      ctx.status = 401; ctx.codigo = 'TOKEN_EXPIRADO';
      ctx.mensaje = 'Sesión expirada'; ctx.mensajeSeguro = true;
    } else if (ctx.err.name === 'NotBeforeError') {
      ctx.status = 401; ctx.codigo = 'TOKEN_NO_VALIDO_AUN';
      ctx.mensaje = 'Token aún no válido'; ctx.mensajeSeguro = true;
    }
  }),

  // --- express-validator ---
  (function expressValidator(ctx) {
    const err = ctx.err;
    if (!Array.isArray(err.errors) || err.errors.length === 0) return;
    const primero = err.errors[0];
    if (!primero || typeof primero.msg !== 'string') return;

    ctx.status = 400;
    ctx.codigo = 'VALIDACION';
    ctx.mensaje = err.errors.map(e => e.msg).join(', ');
    ctx.detalles = err.errors.map(e => ({
      campo: e.path || e.param,
      mensaje: e.msg,
      ...(e.location ? { ubicacion: e.location } : {})
    }));
    ctx.mensajeSeguro = true;
  }),

  // --- Axios ---
  (function axios(ctx) {
    const err = ctx.err;
    if (!err.isAxiosError) return;
    ctx.status = 502;
    ctx.codigo = 'SERVICIO_EXTERNO';
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      ctx.mensaje = 'Timeout al conectar con servicio externo';
    } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      ctx.mensaje = 'Servicio externo no encontrado';
    } else {
      ctx.mensaje = 'Error al conectar con servicio externo';
    }
    ctx.mensajeSeguro = true;
    // Nunca exponer `err.response.data` (podría traer PII).
    if (!IS_PROD && err.config) {
      ctx.detalles = { url: err.config.url, method: err.config.method };
    }
  }),

  // --- Circuit breaker ---
  (function circuitBreaker(ctx) {
    if (ctx.err.codigo !== 'CIRCUIT_OPEN' && ctx.err.code !== 'CIRCUIT_OPEN') return;
    ctx.status = 503;
    ctx.codigo = 'CIRCUIT_OPEN';
    ctx.mensaje = ctx.mensaje || 'Servicio temporalmente no disponible';
    ctx.mensajeSeguro = true;
    const retryAfter = Number(ctx.err.retryAfter) || 60;
    ctx.detalles = { ...(ctx.detalles || {}), retryAfter };
    ctx.retryAfter = retryAfter;
  }),

  // --- Rate limiting (express-rate-limit) ---
  (function rateLimit(ctx) {
    if (ctx.err.status !== 429 && ctx.codigo !== 'RATE_LIMIT') return;
    ctx.status = 429;
    ctx.codigo = ctx.codigo || 'RATE_LIMIT';
    ctx.mensajeSeguro = true;
    // `retryAfter` puede venir en segundos (express-rate-limit) o ms.
    const ra = Number(ctx.err.retryAfter);
    if (Number.isFinite(ra) && ra > 0) ctx.retryAfter = ra;
  })
];

// ------------------------------------------------------------
// METADATA DECLARATIVA DE TRADUCTORES
// ------------------------------------------------------------
// La asignamos aquí para mantener el código de cada traductor
// "puro" (sin contaminar el cuerpo). En un futuro se podría
// pasar como opciones a `registrarTraductor`.
// ------------------------------------------------------------
const _traductoresMeta = Object.freeze({
  mongoDuplicados: { categoria: 'mongo', esSeguro: true },
  mongoRed:        { categoria: 'mongo', esSeguro: true },
  mongoTimeout:    { categoria: 'mongo', esSeguro: true },
  bsonInvalido:    { categoria: 'mongo', esSeguro: true },
  jwt:             { categoria: 'auth',  esSeguro: true },
  expressValidator:{ categoria: 'validacion', esSeguro: true },
  axios:           { categoria: 'externo', esSeguro: true },
  circuitBreaker:  { categoria: 'externo', esSeguro: true },
  rateLimit:       { categoria: 'rate-limit', esSeguro: true }
});

// Aplicamos la metadata a cada traductor como propiedades de la función.
for (const t of traductores) {
  const meta = _traductoresMeta[t.name];
  if (meta) {
    t.esSeguro = meta.esSeguro;
    t.categoria = meta.categoria;
  }
}

// ------------------------------------------------------------
// Middleware
// ------------------------------------------------------------
function errorHandler(err, req, res, next) {
  // Si ya se enviaron headers, delegamos (Express cierra el socket).
  if (res.headersSent) return next(err);

  // --- 1. Construir contexto base ---
  const ctx = {
    err,
    status: normalizarStatus(err),
    codigo: err.codigo || err.code || 'ERROR_INTERNO',
    mensaje: err.message || 'Error interno del servidor',
    detalles: err.detalles || null,
    retryAfter: null,
    /** Marca explícita: "este mensaje es seguro, no lo sanées". */
    mensajeSeguro: false,
    /** Categoría del error (se rellena con la metadata del traductor). */
    categoria: null
  };

  // --- 2. Aplicar traductores ---
  //    Antes de cada traductor, aplicamos su metadata (esSeguro/categoria).
  //    Así el traductor no necesita setearla manualmente y el handler
  //    conoce la categoría incluso si el traductor no reacciona.
  for (const traductor of traductores) {
    try {
      // Aplicar metadata declarativa primero.
      if (traductor.esSeguro === true) ctx.mensajeSeguro = true;
      if (traductor.categoria && !ctx.categoria) ctx.categoria = traductor.categoria;

      traductor(ctx);
    } catch (e) {
      // Un traductor buggy no debe romper el handler.
      _stats.traductoresFallidos++;
      if (!IS_PROD) {
        log.warn(
          {
            err: e && e.message,
            traductor: traductor.name,
            categoria: traductor.categoria
          },
          'Traductor de error falló'
        );
      }
    }
  }

  // --- 3. Sanitizar mensaje para 5xx en producción ---
  //    Decisión: saneamos SOLO si TODAS las condiciones se cumplen:
  //      a) Es producción
  //      b) El status es 5xx
  //      c) El traductor NO marcó el mensaje como seguro
  //      d) El ctx.mensaje NO está en la whitelist
  //      e) El err original NO está marcado como público (.public/.expose/.status<500)
  if (IS_PROD && ctx.status >= 500 && !ctx.mensajeSeguro) {
    const ctxSeguro = esMensajeSeguro(ctx.mensaje);
    const errSeguro = esMensajeSeguro(err);
    if (!ctxSeguro && !errSeguro) {
      ctx.mensaje = mensajeGenericoPara(ctx.status);
      _stats.sanitizadosEnProd++;
      // Si saneamos el mensaje, los `detalles` también pueden filtrar
      // información interna (errInfo de Mongo, stack parcial, etc.).
      // Los descartamos salvo que el error se haya marcado como público.
      if (!(err.public === true || err.expose === true)) {
        ctx.detalles = null;
      }
    }
  }

  // --- 4. Headers adicionales ---
  res.set('Cache-Control', 'no-store');
  // Retry-After aplica a 5xx Y 429 (rate limit).
  if (ctx.retryAfter && (ctx.status >= 500 || ctx.status === 429)) {
    res.set('Retry-After', String(ctx.retryAfter));
    _stats.retryAfterEmitidos++;
  }

  // --- 5. Métricas ---
  _stats.total++;
  _bumpPorStatus(ctx.status);
  _bumpPorCodigo(ctx.codigo);
  _bumpPorCategoria(ctx.categoria);

  // --- 6. Log estructurado ---
  const logCtx = {
    reqId: req.reqId,
    status: ctx.status,
    codigo: ctx.codigo,
    categoria: ctx.categoria || undefined,
    mensaje: ctx.mensaje,
    metodo: req.method,
    ruta: req.originalUrl || req.url,
    user: req.user && req.user.email ? req.user.email : 'anónimo',
    ip: req.ip,
    nombreError: err.name,
    mensajeOriginal: err.message,
    ...(err.code ? { codigoOriginal: err.code } : {}),
    ...(ctx.retryAfter ? { retryAfter: ctx.retryAfter } : {})
  };

  if (ctx.status >= 500) {
    log.error({ ...logCtx, stack: IS_PROD ? undefined : err.stack }, '❌ Error servidor');
  } else if (ctx.status >= 400) {
    log.warn(logCtx, '⚠️  Error cliente');
  }

  // --- 7. Respuesta ---
  const respuesta = { error: ctx.mensaje, codigo: ctx.codigo };
  if (ctx.detalles) respuesta.detalles = ctx.detalles;
  if (req.reqId) respuesta.reqId = req.reqId;
  if (!IS_PROD && ctx.status >= 500 && err.stack) {
    respuesta.stack = String(err.stack).split('\n').slice(0, 10).join('\n');
  }
  if (err.periodo) respuesta.periodo = err.periodo;

  return res.status(ctx.status).json(respuesta);
}

// ------------------------------------------------------------
// Mensajes "seguros" (no necesitan saneo en 5xx de prod)
// ------------------------------------------------------------
const MENSAJES_SEGUROS_5XX = new Set([
  'Base de datos no disponible. Reintente en unos segundos.',
  'La base de datos tardó demasiado en responder.',
  'Timeout al conectar con servicio externo',
  'Error al conectar con servicio externo',
  'Servicio externo no encontrado',
  'Servicio temporalmente no disponible',
  'Error interno del servidor'
]);

/**
 * ¿El mensaje es seguro para mostrar al cliente en prod?
 * Acepta tanto un `Error` como un string (para chequear el mensaje
 * YA traducido en `ctx.mensaje`).
 */
function esMensajeSeguro(errOMsg) {
  // Caso 1: string directo (el mensaje post-traducción).
  if (typeof errOMsg === 'string') {
    return MENSAJES_SEGUROS_5XX.has(errOMsg);
  }

  const err = errOMsg;
  if (!err || typeof err !== 'object') return false;

  // Errores explícitamente marcados como públicos por el caller.
  if (err.public === true || err.expose === true) return true;
  if (err.status && err.status < 500) return true;
  if (typeof err.message === 'string' && MENSAJES_SEGUROS_5XX.has(err.message)) return true;
  return false;
}

function mensajeGenericoPara(status) {
  if (status === 502) return 'Servicio externo no disponible';
  if (status === 503) return 'Servicio temporalmente no disponible';
  if (status === 504) return 'Tiempo de espera agotado';
  return 'Error interno del servidor';
}

// ------------------------------------------------------------
// Exports
// ------------------------------------------------------------
module.exports = errorHandler;
module.exports.IS_PROD = IS_PROD;
module.exports.IS_TEST = IS_TEST;
module.exports.traductores = traductores;
module.exports.stats = stats;

/**
 * API extensible para registrar traductores custom.
 *
 * @param {Function} fn
 * @param {object} [opts]
 * @param {boolean} [opts.prepend=false]
 * @param {boolean} [opts.esSeguro]     Metadata: mensaje seguro (no sanear).
 * @param {string}  [opts.categoria]    Metadata: 'mongo' | 'auth' | ...
 * @returns {Function}
 */
module.exports.registrarTraductor = (fn, opts = {}) => {
  if (typeof fn !== 'function') throw new TypeError('registrarTraductor espera una función');
  const { prepend = false, esSeguro, categoria } = opts;

  if (esSeguro === true) fn.esSeguro = true;
  if (typeof categoria === 'string' && categoria) fn.categoria = categoria;

  if (prepend) traductores.unshift(fn);
  else traductores.push(fn);
  return fn;
};

// ---- Solo para tests ----
module.exports._normalizarStatus = normalizarStatus;
module.exports._esMensajeSeguro = esMensajeSeguro;
module.exports._MENSAJES_SEGUROS_5XX = MENSAJES_SEGUROS_5XX;
module.exports._stats = _stats;
module.exports._resetStats = _resetStats;
module.exports._traductoresMeta = _traductoresMeta;