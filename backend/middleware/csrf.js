// backend/middleware/csrf.js
// ============================================================
// Protección CSRF (defensa en profundidad)
// ------------------------------------------------------------
// Capas, en orden de aplicación:
//   1) Métodos seguros (GET/HEAD/OPTIONS) → pasan.
//   2) `Authorization: Bearer` → pasa (el navegador no lo adjunta
//      automáticamente, por lo que no hay riesgo CSRF).
//   3) Sin cookies de sesión → pasa (no hay nada que secuestrar).
//   4) Validación de `Origin`/`Referer` contra allowlist. Es la
//      defensa PRIMARIA: el navegador los envía y JS cross-origin
//      no puede falsificarlos.
//   5) Header custom `X-Requested-With: XMLHttpRequest`. Defensa
//      SECUNDARIA: un form HTML tradicional no puede enviar headers
//      custom, y un fetch cross-origin dispara preflight CORS.
//   6) Double-Submit Token (opcional): cookie `csrf_token` +
//      header `x-csrf-token` deben coincidir (timing-safe).
//
// ⚠️  Requiere `cookie-parser` montado ANTES que este middleware
//     para que `req.cookies` esté disponible (si no, se omite el
//     double-submit y se cae al header `Cookie` crudo).
//
// 🆕 REFACTOR 2025-XX
// ------------------------------------------------------------
//   [Origen estricto] `extraerOrigen` ahora SOLO acepta URLs con
//     protocolo `http:` o `https:`. Antes, un `Referer` malformado
//     como `example.com/path` se parseaba como path relativo
//     (origin `null`) o producía resultados confusos. Ahora se
//     rechaza explícitamente.
//
//   [Normalización de allowlist] Los orígenes configurados vía
//     `CSRF_ALLOWED_ORIGINS` se normalizan (lowercase host,
//     sin trailing slash) al cargar el módulo. Esto evita que
//     `https://APP.example.com/` no matchee contra el `Origin`
//     del navegador `https://app.example.com`.
//
//   [Rate limit CSRF] Se añade un limiter en memoria por IP para
//     requests BLOQUEADAS (no para exitosas). Un atacante que
//     intenta adivinar el token CSRF ahora recibe 429 tras N
//     intentos. No interfiere con tráfico legítimo.
//
//   [Logs enriquecidos] Los bloqueos incluyen `user-agent` truncado
//     y `ruta` para diagnosticar mejor.
// ============================================================
'use strict';

const crypto = require('crypto');

// ------------------------------------------------------------
// Configuración (env-driven)
// ------------------------------------------------------------
function parseLista(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Normaliza un origen para comparación robusta.
 *
 * Reglas:
 *   - Trim.
 *   - Preserva el wildcard `*.` si está al inicio.
 *   - Si tiene protocolo, lo mantiene.
 *   - Si no tiene protocolo, se asume `https://` (los navegadores
 *     SIEMPRE envían protocolo en `Origin`).
 *   - Lowercase SOLO el hostname (el path es case-sensitive pero
 *     aquí no hay path).
 *   - Quita trailing slash.
 *
 * @param {string} origen
 * @returns {string|null} Origen normalizado o `null` si inválido.
 */
function normalizarOrigenConfigurado(origen) {
  if (!origen || typeof origen !== 'string') return null;
  let s = origen.trim();
  if (!s) return null;

  // Wildcard al inicio (ej: `*.example.com` o `*.example.com:3000`)
  let esWildcard = false;
  if (s.startsWith('*.')) {
    esWildcard = true;
    s = s.slice(2);
  }

  // Si no tiene protocolo, lo añadimos (solo para parsear).
  const tieneProtocolo = /^https?:\/\//i.test(s);
  const conProtocolo = tieneProtocolo ? s : `https://${s}`;

  try {
    const u = new URL(conProtocolo);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    if (!host) return null;
    const puerto = u.port ? `:${u.port}` : '';
    const esquema = u.protocol.replace(':', '');
    return esWildcard
      ? `*.${host}${puerto}`
      : `${esquema}://${host}${puerto}`;
  } catch {
    return null;
  }
}

// ---- Lista de orígenes normalizada (una sola vez al cargar) ----
const _allowedOriginsRaw = parseLista(process.env.CSRF_ALLOWED_ORIGINS);
const _allowedOriginsNormalized = Object.freeze(
  _allowedOriginsRaw
    .map(normalizarOrigenConfigurado)
    .filter(Boolean)
);

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const CONFIG = Object.freeze({
  /** Desactivar todo el middleware (útil para tests o modo API puro). */
  enabled: process.env.CSRF_ENABLED !== 'false',

  /** Métodos que no mutan estado. No requieren chequeo. */
  safeMethods: Object.freeze(['GET', 'HEAD', 'OPTIONS']),

  /**
   * Orígenes permitidos YA NORMALIZADOS.
   * Ej: ['https://app.example.com', '*.admin.example.com']
   */
  allowedOrigins: _allowedOriginsNormalized,

  /** Orígenes crudos (para diagnósticos). */
  allowedOriginsRaw: Object.freeze(_allowedOriginsRaw),

  /** Si no hay cookies ni Authorization → permitir (endpoints públicos). */
  allowNoCookies: process.env.CSRF_ALLOW_NO_COOKIES !== 'false',

  /** Exigir `X-Requested-With: XMLHttpRequest`. */
  requireRequestedWith: process.env.CSRF_REQUIRE_XRW !== 'false',
  requestedWithValue: 'XMLHttpRequest',

  /** Double-submit token: nombres de cookie y header (lowercase). */
  headerTokenName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
  cookieTokenName: process.env.CSRF_COOKIE_NAME || 'csrf_token',

  /** Si `true`, el double-submit token es OBLIGATORIO en toda request cookie-based. */
  tokenRequired: process.env.CSRF_TOKEN_REQUIRED === 'true',

  /**
   * Rate limit para requests BLOQUEADAS por IP.
   * Evita que un atacante haga fuerza bruta sobre el token CSRF.
   * Solo aplica a requests que ya fallaron la validación.
   */
  rateLimitWindowMs: 60_000,       // 1 minuto
  rateLimitMax: 10,                // 10 bloqueos/min por IP
  rateLimitMaxEntries: 5000        // LRU para no crecer infinito
});

// Aviso de arranque si todas las defensas están apagadas.
if (
  CONFIG.enabled &&
  !CONFIG.requireRequestedWith &&
  CONFIG.allowedOrigins.length === 0 &&
  !CONFIG.tokenRequired
) {
  console.warn(
    '⚠️  CSRF: todas las defensas están desactivadas (XRW off, origins vacío, token off).'
  );
}
if (CONFIG.enabled && CONFIG.allowedOrigins.length === 0) {
  console.warn(
    '⚠️  CSRF: CSRF_ALLOWED_ORIGINS vacío → se omite validación de Origin. ' +
    'Configura la allowlist en producción.'
  );
}

// ------------------------------------------------------------
// Errores tipados
// ------------------------------------------------------------
const ERRORES = Object.freeze({
  CSRF_BLOCKED: Object.freeze({ status: 403, codigo: 'CSRF_BLOCKED', mensaje: 'Solicitud bloqueada por protección CSRF' }),
  CSRF_ORIGIN:  Object.freeze({ status: 403, codigo: 'CSRF_ORIGIN',  mensaje: 'Origen no permitido' }),
  CSRF_TOKEN:   Object.freeze({ status: 403, codigo: 'CSRF_TOKEN',   mensaje: 'Token CSRF inválido o ausente' }),
  CSRF_RATE:    Object.freeze({ status: 429, codigo: 'CSRF_RATE',    mensaje: 'Demasiados intentos bloqueados. Espere un momento.' })
});

function responderError(res, err) {
  res.set('Cache-Control', 'no-store');
  return res.status(err.status).json({ error: err.mensaje, codigo: err.codigo });
}

// ------------------------------------------------------------
// Rate limit en memoria (solo para requests bloqueadas)
// ------------------------------------------------------------
const _intentosBloqueados = new Map(); // ip → { count, resetAt }

/**
 * Registra un bloqueo para una IP. Devuelve `true` si la IP
 * superó el umbral de bloqueos.
 */
function registrarBloqueo(ip) {
  if (!ip) return false;
  const ahora = Date.now();
  const entry = _intentosBloqueados.get(ip);

  if (!entry || entry.resetAt < ahora) {
    _intentosBloqueados.set(ip, { count: 1, resetAt: ahora + CONFIG.rateLimitWindowMs });
    // LRU simple: si supera el máximo, borrar los más antiguos.
    if (_intentosBloqueados.size > CONFIG.rateLimitMaxEntries) {
      const primera = _intentosBloqueados.keys().next().value;
      if (primera !== undefined) _intentosBloqueados.delete(primera);
    }
    return false;
  }

  entry.count++;
  return entry.count > CONFIG.rateLimitMax;
}

/** ¿Está la IP actualmente rate-limited? (sin incrementar). */
function estaRateLimited(ip) {
  if (!ip) return false;
  const entry = _intentosBloqueados.get(ip);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    _intentosBloqueados.delete(ip);
    return false;
  }
  return entry.count > CONFIG.rateLimitMax;
}

// Limpieza periódica (unref para no retener el proceso).
const _limpiezaRateLimit = setInterval(() => {
  const ahora = Date.now();
  for (const [ip, entry] of _intentosBloqueados) {
    if (entry.resetAt < ahora) _intentosBloqueados.delete(ip);
  }
}, 60_000);
if (_limpiezaRateLimit.unref) _limpuezaRateLimitUnref(_limpiezaRateLimit);

// Helper para silenciar el linter sobre `_limpiezaRateLimit`
function _limpuezaRateLimitUnref(t) {
  if (t && typeof t.unref === 'function') t.unref();
}

// Métricas expuestas para /health
const _stats = {
  bloqueos: 0,
  bloqueosPorOrigen: 0,
  bloqueosPorXRW: 0,
  bloqueosPorToken: 0,
  rateLimited: 0
};

// ------------------------------------------------------------
// Log enriquecido de bloqueo
// ------------------------------------------------------------
function logBloqueo(req, err) {
  if (process.env.NODE_ENV === 'test') return;

  const origen = req.headers.origin || req.headers.referer || '-';
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '-';
  const ua = String(req.headers['user-agent'] || '').slice(0, 80);

  // Incrementar métricas por tipo
  _stats.bloqueos++;
  if (err.codigo === 'CSRF_ORIGIN') _stats.bloqueosPorOrigen++;
  else if (err.codigo === 'CSRF_BLOCKED') _stats.bloqueosPorXRW++;
  else if (err.codigo === 'CSRF_TOKEN') _stats.bloqueosPorToken++;

  console.warn(
    `[CSRF] ${err.codigo} ${req.method} ${req.originalUrl} ` +
    `origin=${origen} ip=${ip} ua="${ua}"`
  );
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function tieneBearer(req) {
  const auth = req.headers && req.headers.authorization;
  return typeof auth === 'string' && /^Bearer\s+\S+/i.test(auth.trim());
}

function tieneCookies(req) {
  if (req.cookies && typeof req.cookies === 'object' && Object.keys(req.cookies).length > 0) {
    return true;
  }
  const raw = req.headers && req.headers.cookie;
  return typeof raw === 'string' && raw.length > 0;
}

/**
 * Extrae el origin de un valor Origin/Referer.
 *
 * 🆕 FIX: SOLO acepta URLs con protocolo `http:` o `https:`.
 *    Antes, `new URL('example.com/path')` se interpretaba como
 *    path relativo y devolvía un origin inesperado (o null).
 *    Ahora se valida el protocolo ANTES de devolver el origin.
 *
 * @param {string} valor
 * @returns {string|null} `scheme://host[:port]` o `null` si inválido.
 */
function extraerOrigen(valor) {
  if (!valor || typeof valor !== 'string') return null;
  const s = valor.trim();
  if (!s) return null;

  // Rechazo rápido: debe empezar con http:// o https://
  if (!/^https?:\/\//i.test(s)) return null;

  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // `.origin` ya devuelve `scheme://host[:port]` normalizado.
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Comprueba si `origin` está en la allowlist (soporta wildcard `*.dominio`).
 *
 * @param {string} origin  Debe venir de `extraerOrigen()` (ya normalizado).
 * @returns {boolean}
 */
function origenPermitido(origin) {
  if (!origin) return false;

  // Match exacto.
  if (CONFIG.allowedOrigins.includes(origin)) return true;

  // Match por wildcard.
  let hostname;
  try { hostname = new URL(origin).hostname; } catch { return false; }

  return CONFIG.allowedOrigins.some(patron => {
    if (!patron.startsWith('*.')) return false;
    const base = patron.slice(2); // quita `*.`
    // `*.example.com` matchea subdominios pero NO el apex.
    return hostname.endsWith('.' + base);
  });
}

/** Comparación timing-safe para tokens (evita side-channel attacks). */
function compararSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Genera un token CSRF criptográficamente seguro (32 bytes → 64 hex). */
function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ------------------------------------------------------------
// Middleware
// ------------------------------------------------------------
function csrfProtection(req, res, next) {
  if (!CONFIG.enabled) return next();

  // 1) Métodos seguros
  if (CONFIG.safeMethods.includes(req.method)) return next();

  // 2) Bearer auth → sin cookies de sesión, sin riesgo CSRF
  if (tieneBearer(req)) return next();

  // 3) Sin cookies → nada que un atacante pueda "adjuntar" desde otro sitio
  if (CONFIG.allowNoCookies && !tieneCookies(req)) return next();

  // 4) Rate limit: si esta IP ya está bloqueada, rechazar antes de procesar.
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '-';
  if (estaRateLimited(ip)) {
    _stats.rateLimited++;
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[CSRF] CSRF_RATE ip=${ip} → demasiados bloqueos previos`);
    }
    res.set('Retry-After', '60');
    return responderError(res, ERRORES.CSRF_RATE);
  }

  // 5) Validación de Origin/Referer (defensa primaria)
  if (CONFIG.allowedOrigins.length > 0) {
    const originRaw = req.headers.origin || req.headers.referer;
    if (originRaw) {
      const origen = extraerOrigen(originRaw);
      if (!origen || !origenPermitido(origen)) {
        logBloqueo(req, ERRORES.CSRF_ORIGIN);
        registrarBloqueo(ip);
        return responderError(res, ERRORES.CSRF_ORIGIN);
      }
    }
    // Si no hay Origin/Referer (raro en navegadores modernos para POST),
    // delegamos en las capas 6 y 7.
  }

  // 6) X-Requested-With (defensa secundaria)
  if (CONFIG.requireRequestedWith) {
    const xrw = req.headers['x-requested-with'];
    if (xrw !== CONFIG.requestedWithValue) {
      logBloqueo(req, ERRORES.CSRF_BLOCKED);
      registrarBloqueo(ip);
      return responderError(res, ERRORES.CSRF_BLOCKED);
    }
  }

  // 7) Double-Submit Token (opcional, defensa terciaria)
  const headerToken = String((req.headers && req.headers[CONFIG.headerTokenName]) || '');
  const cookieToken = String(
    (req.cookies && req.cookies[CONFIG.cookieTokenName]) || ''
  );
  const algunTokenPresente = headerToken.length > 0 || cookieToken.length > 0;

  if (CONFIG.tokenRequired || algunTokenPresente) {
    if (!headerToken || !cookieToken || !compararSeguro(headerToken, cookieToken)) {
      logBloqueo(req, ERRORES.CSRF_TOKEN);
      registrarBloqueo(ip);
      return responderError(res, ERRORES.CSRF_TOKEN);
    }
  }

  return next();
}

// ------------------------------------------------------------
// Snapshot de estadísticas (para /health)
// ------------------------------------------------------------
function stats() {
  return {
    ..._stats,
    allowedOriginsCount: CONFIG.allowedOrigins.length,
    ipsConBloqueos: _intentosBloqueados.size,
    config: {
      enabled: CONFIG.enabled,
      requireRequestedWith: CONFIG.requireRequestedWith,
      tokenRequired: CONFIG.tokenRequired,
      allowNoCookies: CONFIG.allowNoCookies
    }
  };
}

/** Reset (útil en tests). */
function _resetStats() {
  _stats.bloqueos = 0;
  _stats.bloqueosPorOrigen = 0;
  _stats.bloqueosPorXRW = 0;
  _stats.bloqueosPorToken = 0;
  _stats.rateLimited = 0;
  _intentosBloqueados.clear();
}

// ------------------------------------------------------------
// Exports
// ------------------------------------------------------------
module.exports = csrfProtection;
module.exports.CONFIG = CONFIG;
module.exports.ERRORES = ERRORES;
module.exports.generarToken = generarToken;
module.exports.stats = stats;

// ---- Solo para tests ----
module.exports._compararSeguro = compararSeguro;
module.exports._origenPermitido = origenPermitido;
module.exports._extraerOrigen = extraerOrigen;
module.exports._normalizarOrigenConfigurado = normalizarOrigenConfigurado;
module.exports._registrarBloqueo = registrarBloqueo;
module.exports._estaRateLimited = estaRateLimited;
module.exports._resetStats = _resetStats;
module.exports._stats = _stats;