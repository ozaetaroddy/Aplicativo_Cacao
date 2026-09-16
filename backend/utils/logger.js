// backend/utils/logger.js
// ============================================================
// Logger estructurado (pino + pino-pretty en dev)
// ------------------------------------------------------------
// Uso:
//   const log = require('../utils/logger');
//   log.info({ ctx }, 'mensaje');
//   log.error({ err }, 'algo falló');
//
// Child logger por módulo:
//   const log = require('../utils/logger').childLogger('ventas');
//
// El módulo NUNCA lanza: si pino no está instalado, cae a un
// fallback funcional con la misma API.
//
// Configuración por env:
//   LOG_LEVEL=silent|trace|debug|info|warn|error|fatal
//   LOG_SILENT=true                  → apaga todo (útil en tests)
//   LOG_PRETTY=true                  → fuerza pino-pretty en dev
//   LOG_PRETTY=false                 → fuerza JSON aunque NODE_ENV!=production
//   LOG_KEEP_LEVEL=true              → mantiene `level` en lugar de `nivel`
//   LOG_REDACT_EXTRA=path1,path2     → añade paths al redactor
//   LOG_SERVICIO=mi-servicio         → nombre en el campo `servicio`
// ============================================================
'use strict';

const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================================
// HELPERS DE ENV
// ============================================================
function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

function envStr(nombre, fallback = '') {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw);
}

// ============================================================
// PATHS DE REDACT
// ------------------------------------------------------------
// El redactor oculta (no borra) valores sensibles en los logs.
// Los paths con `*.` aplican a cualquier anidamiento.
// ============================================================
const REDACT_BASE = [
  // HTTP
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',

  // Contraseñas
  'password',
  '*.password',
  'passwordActual',
  '*.passwordActual',
  'passwordNueva',
  '*.passwordNueva',
  'password_cifrado',
  '*.password_cifrado',
  'passwordCifrado',
  '*.passwordCifrado',

  // Tokens y secretos
  'token',
  '*.token',
  'access_token',
  '*.access_token',
  'refreshToken',
  '*.refreshToken',
  'refresh_token',
  '*.refresh_token',
  'csrf_token',
  '*.csrf_token',
  'jwt',
  '*.jwt',
  'secret',
  '*.secret',
  'bearer',
  '*.bearer',

  // API keys
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',

  // Criptografía
  'privateKey',
  '*.privateKey',
  'privateKeyPem',
  '*.privateKeyPem',
  'CERT_ENCRYPTION_KEY',
  '*.CERT_ENCRYPTION_KEY',
  'JWT_SECRET',
  '*.JWT_SECRET',

  // SMTP
  'SMTP_PASS',
  '*.SMTP_PASS',
  'SMTP_PASSWORD',
  '*.SMTP_PASSWORD',

  // Certificado
  'archivo_base64',
  '*.archivo_base64',
  'p12',
  '*.p12',
  'certificado_base64',
  '*.certificado_base64'
];

/** Paths adicionales vía `LOG_REDACT_EXTRA=a,b,c`. */
function getRedactExtra() {
  const raw = process.env.LOG_REDACT_EXTRA;
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

// Paths que se pueden añadir en runtime con `addRedactPath()`.
const _redactExtraRuntime = new Set();

/** Construye la lista final de paths de redacción. */
function buildRedactPaths() {
  return [
    ...REDACT_BASE,
    ...getRedactExtra(),
    ..._redactExtraRuntime
  ];
}

// ============================================================
// SERIALIZERS
// ------------------------------------------------------------
// Convierten objetos comunes a JSON legible.
// ============================================================
/** Serializa un `Error` a `{ name, message, stack?, code?, ... }`. */
function errSerializer(err) {
  if (!err || typeof err !== 'object') return err;
  const out = {
    type: err.name || 'Error',
    message: err.message || String(err)
  };
  if (err.code !== undefined) out.code = err.code;
  if (err.codigo !== undefined) out.codigo = err.codigo;
  if (err.status !== undefined) out.status = err.status;
  if (err.retryAfter !== undefined) out.retryAfter = err.retryAfter;
  if (!IS_PROD && err.stack) out.stack = err.stack;
  return out;
}

/** Serializa `req` de Express con lo mínimo útil. */
function reqSerializer(req) {
  if (!req || typeof req !== 'object') return req;
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userId: req.user?.userId || null
  };
}

/** Serializa `res` de Express con lo mínimo útil. */
function resSerializer(res) {
  if (!res || typeof res !== 'object') return res;
  return {
    statusCode: res.statusCode,
    headersSent: Boolean(res.headersSent)
  };
}

// ============================================================
// FALLBACK (sin pino)
// ============================================================
/** Serializa un valor cualquiera a string seguro (maneja ciclos). */
function safeStringify(valor, vistos = new WeakSet(), profundidad = 0) {
  if (valor === null || valor === undefined) return String(valor);
  if (profundidad > 6) return '[profundo]';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') {
    return String(valor);
  }
  if (typeof valor === 'function') return '[función]';
  if (typeof valor === 'symbol') return String(valor);

  if (valor instanceof Error) {
    const out = { type: valor.name, message: valor.message };
    if (valor.code !== undefined) out.code = valor.code;
    if (!IS_PROD && valor.stack) out.stack = valor.stack;
    try { return JSON.stringify(out); } catch { return `${valor.name}: ${valor.message}`; }
  }

  if (typeof valor === 'object') {
    if (vistos.has(valor)) return '[circular]';
    vistos.add(valor);

    if (Array.isArray(valor)) {
      return '[' + valor.map(v => safeStringify(v, vistos, profundidad + 1)).join(', ') + ']';
    }

    if (Buffer.isBuffer(valor)) return `[Buffer ${valor.length}B]`;

    try {
      return JSON.stringify(valor, (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (vistos.has(v)) return '[circular]';
          vistos.add(v);
        }
        return v;
      });
    } catch {
      return '[objeto no serializable]';
    }
  }

  return String(valor);
}

/** Formatea y emite un log por consola. */
function emitirFallback(nivel, args) {
  if (_silent) return;
  const ts = new Date().toISOString();
  const fn = nivel === 'error' || nivel === 'fatal'
    ? console.error
    : nivel === 'warn'
      ? console.warn
      : console.log;

  const partes = args.map(a => safeStringify(a));
  fn(`[${ts}] [${nivel.toUpperCase()}]`, ...partes);
}

/**
 * Crea un logger fallback con la misma API que pino.
 * @param {object} [bindings]  Contexto acumulado por `child()`.
 */
function crearFallback(bindings = {}) {
  const base = { ...bindings };

  const logger = {
    debug: (...a) => emitirFallback('debug', Object.keys(base).length ? [base, ...a] : a),
    info: (...a) => emitirFallback('info', Object.keys(base).length ? [base, ...a] : a),
    warn: (...a) => emitirFallback('warn', Object.keys(base).length ? [base, ...a] : a),
    error: (...a) => emitirFallback('error', Object.keys(base).length ? [base, ...a] : a),
    fatal: (...a) => emitirFallback('fatal', Object.keys(base).length ? [base, ...a] : a),
    trace: (...a) => emitirFallback('trace', Object.keys(base).length ? [base, ...a] : a),
    /** Devuelve un logger hijo que acumula el contexto. */
    child: (extra = {}) => crearFallback({ ...base, ...extra }),
    /** No-op en fallback. */
    flush: () => {},
    /** Silencia todo. */
    silent: () => { /* ya es global vía _silent */ }
  };

  return logger;
}

// ============================================================
// CONSTRUCCIÓN DEL LOGGER
// ============================================================
let _silent = envBool('LOG_SILENT', false);
let logger;

// Nivel efectivo (soporta `silent`).
function nivelEfectivo() {
  if (_silent) return 'silent';
  const raw = envStr('LOG_LEVEL', '').trim().toLowerCase();
  if (raw === 'silent') return 'silent';
  if (raw) return raw;
  return IS_PROD ? 'info' : 'debug';
}

try {
  // eslint-disable-next-line global-require
  const pino = require('pino');

  // ---- ¿Pretty print? ----
  // Solo si pino-pretty está disponible y no estamos en prod (salvo override).
  let usarPretty = false;
  const prettyOverride = process.env.LOG_PRETTY;
  if (prettyOverride === 'true') usarPretty = true;
  else if (prettyOverride === 'false') usarPretty = false;
  else usarPretty = !IS_PROD;

  if (usarPretty) {
    try {
      require.resolve('pino-pretty');
    } catch {
      // pino-pretty no instalado → fallback silencioso a JSON.
      console.warn('[logger] pino-pretty no está instalado, se usa salida JSON');
      usarPretty = false;
    }
  }

  // ---- Formatters ----
  // Por defecto renombramos `level` → `nivel` (comportamiento previo).
  // Con LOG_KEEP_LEVEL=true mantenemos la clave estándar `level`.
  const mantenerLevelEstandar = envBool('LOG_KEEP_LEVEL', false);
  const formatters = mantenerLevelEstandar
    ? undefined
    : { level: (label) => ({ nivel: label }) };

  // ---- Configuración de pino ----
  const opciones = {
    level: nivelEfectivo(),
    base: {
      servicio: envStr('LOG_SERVICIO', 'cacao-backend'),
      pid: process.pid
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: errSerializer,
      error: errSerializer,
      req: reqSerializer,
      res: resSerializer
    },
    redact: {
      paths: buildRedactPaths(),
      censor: '***',
      remove: false
    }
  };

  if (formatters) opciones.formatters = formatters;

  if (usarPretty) {
    opciones.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,servicio,hostname'
      }
    };
  }

  logger = pino(opciones);
} catch (err) {
  // Fallback funcional si pino no está instalado o algo falla.
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[logger] pino no disponible (${err.message}), usando fallback`);
  }
  logger = crearFallback();
}

// ============================================================
// HELPERS ADICIONALES
// ============================================================
/**
 * Devuelve un logger hijo con `{ modulo }` como binding.
 * @param {string} modulo
 * @param {object} [extra]
 */
function childLogger(modulo, extra = {}) {
  const bindings = { modulo, ...extra };
  if (typeof logger.child === 'function') {
    return logger.child(bindings);
  }
  return crearFallback(bindings);
}

/** Añade un path al redactor en runtime (antes de logs sensibles). */
function addRedactPath(path) {
  if (typeof path === 'string' && path.length > 0) {
    _redactExtraRuntime.add(path);
  }
}

/** Devuelve la lista actual de paths de redacción. */
function getRedactPaths() {
  return buildRedactPaths();
}

/**
 * Vacía el buffer de salida (llamado en SIGTERM/shutdown).
 * @returns {Promise<void>}
 */
function flush() {
  return new Promise(resolve => {
    if (typeof logger.flush === 'function') {
      try { logger.flush(); } catch { /* noop */ }
    }
    resolve();
  });
}

/** Cierra el logger (por si pino tiene recursos abiertos). */
function close() {
  if (typeof logger.close === 'function') {
    try { logger.close(); } catch { /* noop */ }
  }
}

/** Silencia el logger globalmente (útil en tests). */
function silent() {
  _silent = true;
  if (typeof logger.level !== 'undefined') {
    try { logger.level = 'silent'; } catch { /* noop */ }
  }
}

/** Vuelve a activar el logger. */
function unsilent() {
  _silent = false;
  if (typeof logger.level !== 'undefined') {
    try { logger.level = nivelEfectivo(); } catch { /* noop */ }
  }
}

// ============================================================
// ADJUNTAMOS HELPERS AL LOGGER (no rompen la API)
// ============================================================
// Los módulos hacen `const log = require('logger')` y usan
// `log.info/warn/error/debug/child`. Añadimos funciones extra
// como propiedades del logger — pino las ignora, pero están
// disponibles para quien las necesite.
logger.childLogger = childLogger;
logger.addRedactPath = addRedactPath;
logger.getRedactPaths = getRedactPaths;
logger.flush = flush;
logger.close = close;
logger.silent = silent;
logger.unsilent = unsilent;

// ============================================================
// EXPORTS
// ============================================================
module.exports = logger;

// ---- Solo para tests ----
module.exports._CONFIG = Object.freeze({
  IS_PROD,
  REDACT_BASE,
  getRedactExtra,
  nivelEfectivo
});
module.exports._errSerializer = errSerializer;
module.exports._reqSerializer = reqSerializer;
module.exports._resSerializer = resSerializer;
module.exports._safeStringify = safeStringify;
module.exports._crearFallback = crearFallback;
module.exports._buildRedactPaths = buildRedactPaths;
module.exports._resetRedactExtra = () => _redactExtraRuntime.clear();