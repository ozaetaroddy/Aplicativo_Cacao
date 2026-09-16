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

const CONFIG = Object.freeze({
  /** Desactivar todo el middleware (útil para tests o modo API puro). */
  enabled: process.env.CSRF_ENABLED !== 'false',

  /** Métodos que no mutan estado. No requieren chequeo. */
  safeMethods: Object.freeze(['GET', 'HEAD', 'OPTIONS']),

  /**
   * Orígenes permitidos. Ej: 'https://app.example.com,https://admin.example.com'.
   * Soporta wildcard de subdominio: '*.example.com'.
   * Si está vacío → se omite la validación de Origin (con warning al boot).
   */
  allowedOrigins: Object.freeze(parseLista(process.env.CSRF_ALLOWED_ORIGINS)),

  /** Si no hay cookies ni Authorization → permitir (endpoints públicos). */
  allowNoCookies: process.env.CSRF_ALLOW_NO_COOKIES !== 'false',

  /** Exigir `X-Requested-With: XMLHttpRequest`. */
  requireRequestedWith: process.env.CSRF_REQUIRE_XRW !== 'false',
  requestedWithValue: 'XMLHttpRequest',

  /** Double-submit token: nombres de cookie y header (lowercase). */
  headerTokenName: (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase(),
  cookieTokenName: process.env.CSRF_COOKIE_NAME || 'csrf_token',

  /** Si `true`, el double-submit token es OBLIGATORIO en toda request cookie-based. */
  tokenRequired: process.env.CSRF_TOKEN_REQUIRED === 'true'
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
// Errores tipados (formato consistente con el resto del backend)
// ------------------------------------------------------------
const ERRORES = Object.freeze({
  CSRF_BLOCKED: Object.freeze({ status: 403, codigo: 'CSRF_BLOCKED', mensaje: 'Solicitud bloqueada por protección CSRF' }),
  CSRF_ORIGIN:  Object.freeze({ status: 403, codigo: 'CSRF_ORIGIN',  mensaje: 'Origen no permitido' }),
  CSRF_TOKEN:   Object.freeze({ status: 403, codigo: 'CSRF_TOKEN',   mensaje: 'Token CSRF inválido o ausente' })
});

function responderError(res, err) {
  res.set('Cache-Control', 'no-store');
  return res.status(err.status).json({ error: err.mensaje, codigo: err.codigo });
}

function logBloqueo(req, err) {
  if (process.env.NODE_ENV === 'test') return;
  const origen = req.headers.origin || req.headers.referer || '-';
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '-';
  console.warn(`[CSRF] ${err.codigo} ${req.method} ${req.originalUrl} origin=${origen} ip=${ip}`);
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

/** Extrae el origin de un valor Origin/Referer. Devuelve null si inválido. */
function extraerOrigen(valor) {
  if (!valor) return null;
  try {
    return new URL(valor).origin; // protocol://host:port
  } catch {
    return null;
  }
}

/** Comprueba si `origin` está en la allowlist (soporta wildcard `*.dominio`). */
function origenPermitido(origin) {
  if (!origin) return false;
  if (CONFIG.allowedOrigins.includes(origin)) return true;

  let hostname;
  try { hostname = new URL(origin).hostname; } catch { return false; }

  return CONFIG.allowedOrigins.some(patron => {
    if (patron.startsWith('*.')) {
      const base = patron.slice(2);
      // `*.example.com` matchea subdominios pero NO el apex.
      return hostname.endsWith('.' + base);
    }
    return false;
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

  // 4) Validación de Origin/Referer (defensa primaria)
  if (CONFIG.allowedOrigins.length > 0) {
    const originRaw = req.headers.origin || req.headers.referer;
    if (originRaw) {
      const origen = extraerOrigen(originRaw);
      if (!origen || !origenPermitido(origen)) {
        logBloqueo(req, ERRORES.CSRF_ORIGIN);
        return responderError(res, ERRORES.CSRF_ORIGIN);
      }
    }
    // Si no hay Origin/Referer (raro en navegadores modernos para POST),
    // delegamos en las capas 5 y 6.
  }

  // 5) X-Requested-With (defensa secundaria)
  if (CONFIG.requireRequestedWith) {
    const xrw = req.headers['x-requested-with'];
    if (xrw !== CONFIG.requestedWithValue) {
      logBloqueo(req, ERRORES.CSRF_BLOCKED);
      return responderError(res, ERRORES.CSRF_BLOCKED);
    }
  }

  // 6) Double-Submit Token (opcional, defensa terciaria)
  const headerToken = String((req.headers && req.headers[CONFIG.headerTokenName]) || '');
  const cookieToken = String(
    (req.cookies && req.cookies[CONFIG.cookieTokenName]) || ''
  );
  const algunTokenPresente = headerToken.length > 0 || cookieToken.length > 0;

  if (CONFIG.tokenRequired || algunTokenPresente) {
    if (!headerToken || !cookieToken || !compararSeguro(headerToken, cookieToken)) {
      logBloqueo(req, ERRORES.CSRF_TOKEN);
      return responderError(res, ERRORES.CSRF_TOKEN);
    }
  }

  return next();
}

// ------------------------------------------------------------
// Exports
// ------------------------------------------------------------
module.exports = csrfProtection;
module.exports.CONFIG = CONFIG;
module.exports.ERRORES = ERRORES;
module.exports.generarToken = generarToken;

// ---- Solo para tests ----
module.exports._compararSeguro = compararSeguro;
module.exports._origenPermitido = origenPermitido;