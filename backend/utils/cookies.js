// backend/utils/cookies.js
// ============================================================
// Cookies de autenticación — helpers unificados
// ------------------------------------------------------------
// Modelo de cookies:
//   - Access token:  `sc_at`, httpOnly, path `/`.
//   - Refresh token: `sc_rt`, httpOnly, path `/api/auth`.
//
// Configuración (env):
//   COOKIE_CROSS_SITE=true     → frontend y backend en dominios distintos.
//                                Fuerza `sameSite='none'` (requiere HTTPS).
//   COOKIE_DOMAIN=.example.com → dominio compartido entre subdominios.
//   COOKIE_REFRESH_PATH        → override del path del refresh.
//   ACCESS_TOKEN_EXPIRES       → '15m', '2h', '1d', '500ms', etc.
//   REFRESH_TOKEN_EXPIRES      → '7d' por defecto.
//
// Reglas de seguridad aplicadas siempre:
//   - httpOnly: JS del navegador NUNCA las lee → inmune a XSS.
//   - secure:   sólo HTTPS en producción (obligatorio si sameSite='none').
//   - sameSite: 'lax' por defecto, 'none' si CROSS_SITE=true.
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const IS_PROD = process.env.NODE_ENV === 'production';

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Sanitiza el dominio de cookie:
 *   - quita protocolo (http://, https://)
 *   - quita path (`/xxx`)
 *   - quita puerto (`:3000`)
 *   - deja solo `.dominio.tld` o `dominio.tld`
 * Devuelve `null` si no queda nada útil.
 */
function sanitizarDominio(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;

  // Quitar protocolo.
  s = s.replace(/^https?:\/\//i, '');
  // Quitar path.
  s = s.split('/')[0];
  // Quitar puerto.
  s = s.split(':')[0];

  if (!s) return null;

  // Solo aceptamos dominios o subdominios razonables.
  if (!/^\.?[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(s)) {
    log.warn({ dominio: raw }, 'COOKIE_DOMAIN tiene caracteres no esperados, se ignora');
    return null;
  }
  return s;
}

const COOKIE_DOMAIN_RAW = process.env.COOKIE_DOMAIN;
const COOKIE_DOMAIN = sanitizarDominio(COOKIE_DOMAIN_RAW);
if (COOKIE_DOMAIN_RAW && !COOKIE_DOMAIN) {
  log.warn({ raw: COOKIE_DOMAIN_RAW }, 'COOKIE_DOMAIN inválido, se ignora');
}

const CROSS_SITE = envBool('COOKIE_CROSS_SITE', false);

// ⚠️  Chrome/Firefox/Safari RECHAZAN cookies con `sameSite='none'` sin `secure`.
//     En dev (HTTP), esta combinación rompe silenciosamente la sesión.
//     Preferimos fallar al arranque antes que servir cookies rotas.
if (CROSS_SITE && !IS_PROD) {
  const err = new Error(
    'COOKIE_CROSS_SITE=true requiere NODE_ENV=production (HTTPS). ' +
    'Los navegadores rechazan cookies sameSite=none sin Secure.'
  );
  err.codigo = 'COOKIE_CONFIG_INVALIDA';
  // En test permitimos continuar (para no romper CI), pero avisamos fuerte.
  if (process.env.NODE_ENV === 'test') {
    log.warn({ err: err.message }, 'Config de cookies cross-site en test');
  } else {
    throw err;
  }
}

// ============================================================
// CONSTANTES
// ============================================================
const ACCESS_COOKIE = 'sc_at';
const REFRESH_COOKIE = 'sc_rt';

const REFRESH_PATH_DEFAULT = '/api/auth';
const REFRESH_PATH = String(process.env.COOKIE_REFRESH_PATH || REFRESH_PATH_DEFAULT).trim() || REFRESH_PATH_DEFAULT;

const SAMESITE_VALUES = Object.freeze(['strict', 'lax', 'none']);

// ============================================================
// PARSEO DE DURACIONES
// ------------------------------------------------------------
// Formatos soportados: 500ms | 30s | 15m | 2h | 7d
// Si el valor es inválido o <= 0, se devuelve `defaultMs`.
// ============================================================
const UNIDADES_MS = Object.freeze({
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
});

/** Milisegundos en 1 año — tope sensato para evitar overflows. */
const MAX_DURACION_MS = 365 * 86_400_000;

/**
 * Parsea una duración tipo `'15m'`, `'2h'`, `'7d'`, `'500ms'`.
 *
 * @param {string} str         Duración (ej: '15m').
 * @param {number} defaultMs   Fallback si no se puede parsear.
 * @returns {number}           Milisegundos.
 */
function parseDuration(str, defaultMs) {
  if (!str) return defaultMs;

  const m = String(str).trim().match(/^(\d+)\s*(ms|[smhd])$/i);
  if (!m) {
    log.warn({ str }, 'parseDuration: formato inválido, usando default');
    return defaultMs;
  }

  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = UNIDADES_MS[unit];
  if (!mult) return defaultMs;

  const ms = n * mult;
  if (!Number.isFinite(ms) || ms <= 0) {
    log.warn({ str, ms }, 'parseDuration: resultado no positivo, usando default');
    return defaultMs;
  }
  if (ms > MAX_DURACION_MS) {
    log.warn({ str, ms }, 'parseDuration: duración excede 1 año, se acota');
    return MAX_DURACION_MS;
  }
  return ms;
}

// ============================================================
// DURACIONES EFECTIVAS
// ============================================================
const ACCESS_DEFAULT_MS = 15 * 60 * 1000;            // 15 min
const REFRESH_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;  // 7 días

const ACCESS_MAX_AGE = parseDuration(process.env.ACCESS_TOKEN_EXPIRES, ACCESS_DEFAULT_MS);
const REFRESH_MAX_AGE = parseDuration(process.env.REFRESH_TOKEN_EXPIRES, REFRESH_DEFAULT_MS);

// ============================================================
// CONSTRUCTOR DE OPCIONES
// ============================================================
/**
 * Opciones base para las cookies.
 *   - httpOnly: el JS del navegador NUNCA puede leerlas → inmune a XSS.
 *   - secure:   sólo HTTPS en prod (obligatorio si sameSite='none').
 *   - sameSite: 'lax' por defecto, 'none' si CROSS_SITE=true.
 *   - domain:   opcional, útil para compartir cookies entre subdominios.
 *   - path:     '/', o el path específico (ej. '/api/auth').
 *
 * @param {string} [path='/']
 * @returns {object}
 */
function baseOptions(path = '/') {
  const opts = {
    httpOnly: true,
    // Si sameSite='none', secure DEBE ser true; si no, el navegador
    // rechaza la cookie. Forzamos ese caso incluso en dev.
    secure: IS_PROD || CROSS_SITE,
    sameSite: CROSS_SITE ? 'none' : 'lax',
    path
  };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  return opts;
}

// ============================================================
// VALIDACIÓN DE TOKEN
// ============================================================
/**
 * Valida que un token sea seguro para `res.cookie`.
 * NUNCA debe contener `;`, `\n`, `\r`, ni comillas que romperían
 * el header `Set-Cookie`.
 *
 * @param {*} token
 * @param {string} nombre  Para mensajes de error.
 * @throws {Error} con codigo='TOKEN_COOKIE_INVALIDO'.
 */
function validarToken(token, nombre) {
  if (typeof token !== 'string' || token.length === 0) {
    const err = new Error(`${nombre} debe ser un string no vacío`);
    err.codigo = 'TOKEN_COOKIE_INVALIDO';
    throw err;
  }
  if (/[;\r\n"\\]/.test(token)) {
    const err = new Error(
      `${nombre} contiene caracteres no permitidos en cookies (;, CR, LF, comillas o backslash)`
    );
    err.codigo = 'TOKEN_COOKIE_INVALIDO';
    throw err;
  }
}

// ============================================================
// SETTERS
// ============================================================
/** Setea la cookie del access token. */
function setAccessCookie(res, token) {
  validarToken(token, 'accessToken');
  res.cookie(ACCESS_COOKIE, token, {
    ...baseOptions('/'),
    maxAge: ACCESS_MAX_AGE
  });
}

/** Setea la cookie del refresh token. */
function setRefreshCookie(res, token) {
  validarToken(token, 'refreshToken');
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(REFRESH_PATH),
    maxAge: REFRESH_MAX_AGE
  });
}

// ============================================================
// LIMPIEZA
// ------------------------------------------------------------
// Express no aplica automáticamente `secure`/`sameSite`/`domain` en
// `clearCookie`; si no coinciden con las del `set`, algunos browsers
// (Chrome sobre todo) NO borran la cookie.
// Pasamos las MISMAS opciones que usamos al setear.
// ============================================================
/** Limpia ambas cookies de autenticación. */
function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, baseOptions('/'));
  res.clearCookie(REFRESH_COOKIE, baseOptions(REFRESH_PATH));
}

// ============================================================
// DEBUG / TESTS
// ============================================================
/** Snapshot de la configuración efectiva (útil para /health y tests). */
function getCookieOptions() {
  return {
    isProd: IS_PROD,
    crossSite: CROSS_SITE,
    domain: COOKIE_DOMAIN,
    refreshPath: REFRESH_PATH,
    accessCookie: ACCESS_COOKIE,
    refreshCookie: REFRESH_COOKIE,
    accessMaxAgeMs: ACCESS_MAX_AGE,
    refreshMaxAgeMs: REFRESH_MAX_AGE,
    baseOptionsRoot: baseOptions('/'),
    baseOptionsRefresh: baseOptions(REFRESH_PATH)
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_PATH,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
  parseDuration,

  // ---- Extensiones ----
  baseOptions,
  getCookieOptions,
  validarToken,
  SAMESITE_VALUES,

  // ---- Flags ----
  IS_PROD,
  CROSS_SITE
};

// ---- Solo para tests ----
module.exports._sanitizarDominio = sanitizarDominio;
module.exports._UNIDADES_MS = UNIDADES_MS;
module.exports._MAX_DURACION_MS = MAX_DURACION_MS;