// backend/middleware/auth.js
// ============================================================
// Middleware de autenticación
// ------------------------------------------------------------
// - Lee el access token desde:
//     1) Cookie httpOnly `sc_at` (recomendado)
//     2) Header `Authorization: Bearer <token>` (case-insensitive)
// - Verifica JWT (HS256) y valida contra BD:
//     * usuario existente y activo
//     * token emitido DESPUÉS del último cambio de contraseña
// - Cache LRU en memoria:
//     * acotada por usuarios y por tokens/usuario
//     * TTL corto (default 30 s) para no servir datos obsoletos
//     * limpieza periódica de entradas expiradas (unref)
// - Respuestas de error con códigos estables (`codigo`) y headers
//   HTTP correctos (`WWW-Authenticate`, `Cache-Control: no-store`).
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const { ACCESS_COOKIE } = require('../utils/cookies');

// ------------------------------------------------------------
// Configuración (env-driven con defaults sensatos)
// ------------------------------------------------------------
function numeroDesdeEnv(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  jwtSecret: process.env.JWT_SECRET || null,
  jwtAlgorithms: Object.freeze(['HS256']),
  cacheTtlMs:           numeroDesdeEnv('AUTH_CACHE_TTL_MS',   30_000),
  maxUsuariosCache:     numeroDesdeEnv('AUTH_MAX_USERS',      500),
  maxTokensPorUsuario:  numeroDesdeEnv('AUTH_MAX_TOKENS_USER', 10),
  cleanupIntervalMs:    numeroDesdeEnv('AUTH_CLEANUP_MS',     2 * 60_000),
  userCollection:       process.env.AUTH_USER_COLLECTION || 'usuarios'
});

// Fail-fast si falta el secreto JWT (excepto en tests, donde se permite inyectar).
if (!CONFIG.jwtSecret) {
  console.error('❌ FATAL: JWT_SECRET no está definido en el entorno');
  if (process.env.NODE_ENV !== 'test') process.exit(1);
}

// ------------------------------------------------------------
// Errores tipados (códigos estables para el frontend)
// ------------------------------------------------------------
const AUTH_ERRORS = Object.freeze({
  NO_TOKEN:         Object.freeze({ status: 401, codigo: 'NO_TOKEN',         mensaje: 'Token no proporcionado' }),
  TOKEN_EXPIRED:    Object.freeze({ status: 401, codigo: 'TOKEN_EXPIRED',    mensaje: 'Sesión expirada' }),
  TOKEN_INVALID:    Object.freeze({ status: 401, codigo: 'TOKEN_INVALID',    mensaje: 'Token inválido' }),
  TOKEN_MALFORMED:  Object.freeze({ status: 401, codigo: 'TOKEN_MALFORMED',  mensaje: 'Token malformado' }),
  PASSWORD_CHANGED: Object.freeze({ status: 401, codigo: 'PASSWORD_CHANGED', mensaje: 'Sesión invalidada por cambio de contraseña' }),
  USER_NOT_FOUND:   Object.freeze({ status: 401, codigo: 'USER_NOT_FOUND',   mensaje: 'Usuario no existe' }),
  USER_INACTIVE:    Object.freeze({ status: 401, codigo: 'USER_INACTIVE',    mensaje: 'Usuario desactivado' }),
  DB_UNAVAILABLE:   Object.freeze({ status: 503, codigo: 'DB_UNAVAILABLE',   mensaje: 'Base de datos no disponible' }),
  INTERNAL:         Object.freeze({ status: 500, codigo: 'INTERNAL',         mensaje: 'Error interno de autenticación' })
});

function responderError(res, err) {
  // Nunca cachear respuestas de auth (ni éxito ni error).
  res.set('Cache-Control', 'no-store');
  // Estándar HTTP para 401.
  if (err.status === 401) res.set('WWW-Authenticate', 'Bearer');
  return res.status(err.status).json({ error: err.mensaje, codigo: err.codigo });
}

// ------------------------------------------------------------
// Cache LRU
// ------------------------------------------------------------
// Estructura: Map<userIdStr, Map<tokenHash, { user, expiresAt }>>
//  - El Map externo es LRU por usuario (se re-inserta al tocar).
//  - El Map interno es LRU por token  (se re-inserta al tocar).
// ------------------------------------------------------------
const cacheUsuarios = new Map();

/** Hash determinista y truncado para usar como clave de cache. */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

function tocarUsuario(userIdStr) {
  if (!cacheUsuarios.has(userIdStr)) return;
  const val = cacheUsuarios.get(userIdStr);
  cacheUsuarios.delete(userIdStr);
  cacheUsuarios.set(userIdStr, val);
}

function evictUsuariosSiExcede() {
  while (cacheUsuarios.size > CONFIG.maxUsuariosCache) {
    const primera = cacheUsuarios.keys().next().value;
    if (primera === undefined) break;
    cacheUsuarios.delete(primera);
  }
}

function evictTokensSiExcede(tokensMap) {
  while (tokensMap.size > CONFIG.maxTokensPorUsuario) {
    const primera = tokensMap.keys().next().value;
    if (primera === undefined) break;
    tokensMap.delete(primera);
  }
}

function limpiarCacheExpirado() {
  const ahora = Date.now();
  for (const [userId, tokens] of cacheUsuarios) {
    for (const [hash, entry] of tokens) {
      if (!entry || entry.expiresAt <= ahora) tokens.delete(hash);
    }
    if (tokens.size === 0) cacheUsuarios.delete(userId);
  }
}

const limpiezaInterval = setInterval(limpiarCacheExpirado, CONFIG.cleanupIntervalMs);
limpiezaInterval.unref?.();

// ------------------------------------------------------------
// Utilidades de token
// ------------------------------------------------------------
/** Extrae el token: cookie httpOnly primero, luego `Authorization: Bearer`. */
function extraerToken(req) {
  // 1. Cookie httpOnly (recomendado)
  const cookieToken = req.cookies && req.cookies[ACCESS_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

  // 2. Header `Authorization: Bearer <token>` (case-insensitive)
  const authHeader = req.headers && req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authHeader.trim());
    if (match) return match[1];
  }
  return null;
}

/** `true` si el token se emitió antes del último cambio de contraseña. */
function tokenEsAnteriorAlCambio(decoded, user) {
  if (!user || !user.password_changed_at) return false;
  const changed = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
  const iat = Number(decoded && decoded.iat) || 0;
  return iat > 0 && iat < changed;
}

/** Proyección de usuario que se adjunta a `req.user`. */
function construirUsuarioPublico(doc) {
  return {
    userId: doc._id,
    email: doc.email,
    rol: doc.rol,
    nombre: doc.nombre || doc.email,
    password_changed_at: doc.password_changed_at || null
  };
}

// ------------------------------------------------------------
// Middleware principal
// ------------------------------------------------------------
async function authMiddleware(req, res, next) {
  try {
    const token = extraerToken(req);
    if (!token) return responderError(res, AUTH_ERRORS.NO_TOKEN);

    if (!CONFIG.jwtSecret) return responderError(res, AUTH_ERRORS.INTERNAL);

    // ---- 1. Verificar firma y expiración del JWT
    let decoded;
    try {
      decoded = jwt.verify(token, CONFIG.jwtSecret, { algorithms: [...CONFIG.jwtAlgorithms] });
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') return responderError(res, AUTH_ERRORS.TOKEN_EXPIRED);
      return responderError(res, AUTH_ERRORS.TOKEN_INVALID);
    }

    if (!decoded || !decoded.userId || !decoded.email) {
      return responderError(res, AUTH_ERRORS.TOKEN_MALFORMED);
    }

    const userIdStr = String(decoded.userId);
    const tokenHash = hashToken(token);

    // ---- 2. Fast path: cache hit
    const tokensDeUsuario = cacheUsuarios.get(userIdStr);
    if (tokensDeUsuario) {
      const cached = tokensDeUsuario.get(tokenHash);
      if (cached && cached.expiresAt > Date.now()) {
        if (tokenEsAnteriorAlCambio(decoded, cached.user)) {
          tokensDeUsuario.delete(tokenHash);
          if (tokensDeUsuario.size === 0) cacheUsuarios.delete(userIdStr);
          return responderError(res, AUTH_ERRORS.PASSWORD_CHANGED);
        }
        // LRU touch (token)
        tokensDeUsuario.delete(tokenHash);
        tokensDeUsuario.set(tokenHash, cached);
        // LRU touch (usuario)
        tocarUsuario(userIdStr);
        req.user = cached.user;
        return next();
      }
      // Entrada expirada: purgarla para no acumular basura.
      if (cached) {
        tokensDeUsuario.delete(tokenHash);
        if (tokensDeUsuario.size === 0) cacheUsuarios.delete(userIdStr);
      }
    }

    // ---- 3. Slow path: validar contra BD
    if (!req.db) return responderError(res, AUTH_ERRORS.DB_UNAVAILABLE);

    if (!ObjectId.isValid(decoded.userId)) {
      // Mismo código que TOKEN_INVALID para no filtrar información.
      return responderError(res, AUTH_ERRORS.TOKEN_INVALID);
    }

    const usuario = await req.db.collection(CONFIG.userCollection).findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { password: 0 } }
    );

    if (!usuario) return responderError(res, AUTH_ERRORS.USER_NOT_FOUND);
    if (!usuario.activo) return responderError(res, AUTH_ERRORS.USER_INACTIVE);

    const userFinal = construirUsuarioPublico(usuario);

    if (tokenEsAnteriorAlCambio(decoded, userFinal)) {
      return responderError(res, AUTH_ERRORS.PASSWORD_CHANGED);
    }

    // ---- 4. Guardar en cache
    let tokensMap = cacheUsuarios.get(userIdStr);
    if (!tokensMap) {
      tokensMap = new Map();
      cacheUsuarios.set(userIdStr, tokensMap);
    }
    tokensMap.set(tokenHash, {
      user: userFinal,
      expiresAt: Date.now() + CONFIG.cacheTtlMs
    });
    evictTokensSiExcede(tokensMap);
    evictUsuariosSiExcede();
    tocarUsuario(userIdStr);

    req.user = userFinal;
    return next();
  } catch (err) {
    // Nunca logear el token completo.
    console.error('❌ Error en auth middleware:', err && err.message ? err.message : err);
    return responderError(res, AUTH_ERRORS.INTERNAL);
  }
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------
module.exports = authMiddleware;
module.exports.AUTH_ERRORS = AUTH_ERRORS;
module.exports.CONFIG = CONFIG;

/** Invalida el cache de un token concreto. Devuelve cuántas entradas borró. */
module.exports.invalidarCache = (token) => {
  if (!token) return 0;
  const h = hashToken(token);
  let eliminados = 0;
  for (const [userId, tokens] of cacheUsuarios) {
    if (tokens.delete(h)) eliminados++;
    if (tokens.size === 0) cacheUsuarios.delete(userId);
  }
  return eliminados;
};

/** Invalida TODO el cache de un usuario (p. ej. al cambiar contraseña o rol). */
module.exports.invalidarCachePorUsuario = (userId) => {
  if (!userId) return false;
  return cacheUsuarios.delete(String(userId));
};

/** Limpia el cache completo (p. ej. al desplegar cambios de schema). */
module.exports.invalidarTodoElCache = () => cacheUsuarios.clear();

/** Snapshot del estado del cache (para `/health` o `/metrics`). */
module.exports.stats = () => {
  let totalTokens = 0;
  let tokensExpirados = 0;
  const ahora = Date.now();
  for (const tokens of cacheUsuarios.values()) {
    totalTokens += tokens.size;
    for (const entry of tokens.values()) {
      if (!entry || entry.expiresAt <= ahora) tokensExpirados++;
    }
  }
  return {
    usuarios: cacheUsuarios.size,
    tokens: totalTokens,
    tokensExpirados,
    limiteUsuarios: CONFIG.maxUsuariosCache,
    limiteTokensPorUsuario: CONFIG.maxTokensPorUsuario,
    ttlMs: CONFIG.cacheTtlMs
  };
};

// ---- Solo para tests ----
module.exports._forzarLimpieza = limpiarCacheExpirado;
module.exports._detenerLimpieza = () => clearInterval(limpiezaInterval);