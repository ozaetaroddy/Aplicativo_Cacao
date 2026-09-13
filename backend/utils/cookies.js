// backend/utils/cookies.js
// Helpers para manejo unificado de cookies de autenticación.

const IS_PROD = process.env.NODE_ENV === 'production';
const CROSS_SITE = String(process.env.COOKIE_CROSS_SITE || 'false') === 'true';

const ACCESS_COOKIE = 'sc_at';
const REFRESH_COOKIE = 'sc_rt';
const REFRESH_PATH = '/api/auth'; // El refresh solo viaja a /api/auth/*

/**
 * Opciones base para las cookies.
 *
 * - httpOnly: el JS del navegador NUNCA puede leerlas → inmune a XSS.
 * - secure: solo HTTPS (obligatorio en prod).
 * - sameSite:
 *     'lax'  → seguro por defecto, funciona en same-site.
 *     'none' → requerido si frontend y backend están en dominios distintos.
 *              OJO: obliga a `secure: true`.
 * - domain: opcional. Útil para compartir cookies entre subdominios.
 */
function baseOptions(path = '/') {
  const opts = {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: CROSS_SITE ? 'none' : 'lax',
    path
  };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

function parseDuration(str, defaultMs) {
  if (!str) return defaultMs;
  const m = String(str).trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return defaultMs;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

const ACCESS_MAX_AGE = parseDuration(process.env.ACCESS_TOKEN_EXPIRES, 15 * 60 * 1000);
const REFRESH_MAX_AGE = parseDuration(process.env.REFRESH_TOKEN_EXPIRES, 7 * 24 * 60 * 60 * 1000);

function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE, token, { ...baseOptions('/'), maxAge: ACCESS_MAX_AGE });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(REFRESH_PATH), maxAge: REFRESH_MAX_AGE });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, baseOptions('/'));
  res.clearCookie(REFRESH_COOKIE, baseOptions(REFRESH_PATH));
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_PATH,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
  parseDuration
};