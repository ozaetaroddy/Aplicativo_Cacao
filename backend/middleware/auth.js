// backend/middleware/auth.js
// Middleware de autenticación.
// - Lee el access token desde cookie httpOnly `sc_at` o desde `Authorization: Bearer`.
// - Valida contra BD (usuario activo, password_changed_at).
// - Cache LRU acotado para evitar hits a Mongo en cada request.

const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const { ACCESS_COOKIE } = require('../utils/cookies');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está definido en el entorno');
  process.exit(1);
}

const CACHE_TTL_MS = 30 * 1000;
const MAX_USUARIOS_CACHE = 500;
const MAX_TOKENS_POR_USUARIO = 10;

const cacheUsuarios = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
}

function tokenEsAnteriorAlCambio(decoded, user) {
  if (!user?.password_changed_at) return false;
  const changed = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
  const iat = Number(decoded.iat) || 0;
  return iat < changed;
}

function tocarUsuario(userIdStr) {
  if (cacheUsuarios.has(userIdStr)) {
    const val = cacheUsuarios.get(userIdStr);
    cacheUsuarios.delete(userIdStr);
    cacheUsuarios.set(userIdStr, val);
  }
}

function evictUsuarios() {
  while (cacheUsuarios.size > MAX_USUARIOS_CACHE) {
    const primeraKey = cacheUsuarios.keys().next().value;
    cacheUsuarios.delete(primeraKey);
  }
}

function evictTokens(tokensMap) {
  while (tokensMap.size > MAX_TOKENS_POR_USUARIO) {
    const primeraKey = tokensMap.keys().next().value;
    tokensMap.delete(primeraKey);
  }
}

const limpiezaInterval = setInterval(() => {
  const ahora = Date.now();
  for (const [userId, tokens] of cacheUsuarios.entries()) {
    for (const [hash, entry] of tokens.entries()) {
      if (entry.expiresAt < ahora) tokens.delete(hash);
    }
    if (tokens.size === 0) cacheUsuarios.delete(userId);
  }
}, 2 * 60 * 1000);
limpiezaInterval.unref?.();

/**
 * Extrae el token de la request (cookie primero, luego header).
 */
function extraerToken(req) {
  // 1. Cookie httpOnly (recomendado)
  if (req.cookies && req.cookies[ACCESS_COOKIE]) {
    return req.cookies[ACCESS_COOKIE];
  }
  // 2. Header Authorization: Bearer (compatibilidad)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

module.exports = async (req, res, next) => {
  try {
    const token = extraerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado', codigo: 'NO_TOKEN' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Sesión expirada', codigo: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Token inválido', codigo: 'TOKEN_INVALID' });
    }

    if (!decoded.userId || !decoded.email) {
      return res.status(401).json({ error: 'Token malformado', codigo: 'TOKEN_MALFORMED' });
    }

    const userIdStr = String(decoded.userId);
    const tokenHash = hashToken(token);

    // Fast path: cache hit
    const tokensDeUsuario = cacheUsuarios.get(userIdStr);
    if (tokensDeUsuario) {
      const cached = tokensDeUsuario.get(tokenHash);
      if (cached && cached.expiresAt > Date.now()) {
        if (tokenEsAnteriorAlCambio(decoded, cached.user)) {
          tokensDeUsuario.delete(tokenHash);
          return res.status(401).json({
            error: 'Sesión invalidada por cambio de contraseña',
            codigo: 'PASSWORD_CHANGED'
          });
        }
        tokensDeUsuario.delete(tokenHash);
        tokensDeUsuario.set(tokenHash, cached);
        tocarUsuario(userIdStr);
        req.user = cached.user;
        return next();
      }
    }

    // Slow path: validar contra BD
    if (!req.db) {
      return res.status(503).json({ error: 'Base de datos no disponible' });
    }
    if (!ObjectId.isValid(decoded.userId)) {
      return res.status(401).json({ error: 'ID de usuario inválido' });
    }

    const usuario = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { password: 0 } }
    );

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no existe', codigo: 'USER_NOT_FOUND' });
    }
    if (!usuario.activo) {
      return res.status(401).json({ error: 'Usuario desactivado', codigo: 'USER_INACTIVE' });
    }

    const userFinal = {
      userId: usuario._id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre || usuario.email,
      password_changed_at: usuario.password_changed_at || null
    };

    if (tokenEsAnteriorAlCambio(decoded, userFinal)) {
      return res.status(401).json({
        error: 'Sesión invalidada por cambio de contraseña',
        codigo: 'PASSWORD_CHANGED'
      });
    }

    if (!cacheUsuarios.has(userIdStr)) cacheUsuarios.set(userIdStr, new Map());
    const tokensMap = cacheUsuarios.get(userIdStr);
    tokensMap.set(tokenHash, {
      user: userFinal,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    evictTokens(tokensMap);
    evictUsuarios();
    tocarUsuario(userIdStr);

    req.user = userFinal;
    next();
  } catch (err) {
    console.error('❌ Error en auth middleware:', err);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

module.exports.invalidarCache = (token) => {
  if (!token) return;
  const h = hashToken(token);
  for (const tokens of cacheUsuarios.values()) tokens.delete(h);
};

module.exports.invalidarCachePorUsuario = (userId) => {
  if (!userId) return;
  cacheUsuarios.delete(String(userId));
};

module.exports.invalidarTodoElCache = () => cacheUsuarios.clear();

module.exports.stats = () => {
  let totalTokens = 0;
  for (const tokens of cacheUsuarios.values()) totalTokens += tokens.size;
  return {
    usuarios: cacheUsuarios.size,
    tokens: totalTokens,
    limite_usuarios: MAX_USUARIOS_CACHE,
    limite_tokens_por_usuario: MAX_TOKENS_POR_USUARIO
  };
};