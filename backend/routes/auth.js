// backend/routes/auth.js
// ============================================================
// Autenticación — login / refresh / logout / register / perfil
// ------------------------------------------------------------
// Modelo de tokens:
//   - Access token: JWT HS256, vida corta, cookie httpOnly `sc_at`.
//   - Refresh token: opaco (48 bytes hex), ROTABLE, cookie httpOnly,
//     persistido como SHA-256 en `refresh_tokens`.
//
// TOKEN FAMILIES (protección contra robo de refresh):
//   - Cada login crea una `familyId` nueva.
//   - Cada rotación emite un refresh nuevo en la MISMA familia y
//     marca el anterior como usado (`usedAt`).
//   - Si un token YA USADO vuelve a presentarse → se asume robo →
//     se borra TODA la familia del usuario (invalida todas las
//     sesiones derivadas de ese login) y se audita el incidente.
//   - Grace period opcional (`AUTH_REFRESH_REUSE_GRACE_MS`) para
//     tolerar reintentos de red inmediatos sin penalizar la familia.
//
// Otras defensas:
//   - Timing attack mitigation con `DUMMY_HASH` en login.
//   - Rate limit diferenciado por endpoint.
//   - Password policy configurable (longitud + complejidad).
//   - Auditoría que NUNCA tumba la request.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');

const authMiddleware = require('../middleware/auth');
const { invalidarCachePorUsuario } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { validarEmail } = require('../utils/validators');
const log = require('../utils/logger');
const {
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE
} = require('../utils/cookies');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('❌ FATAL: JWT_SECRET no está definido en el entorno');
  process.exit(1);
}

function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  jwtSecret: JWT_SECRET,
  jwtAlgorithm: 'HS256',
  accessExpires: process.env.ACCESS_TOKEN_EXPIRES || '15m',
  bcryptRounds: envNum('BCRYPT_ROUNDS', 12) || 12,
  allowRegister: String(process.env.ALLOW_REGISTER ?? 'true').toLowerCase() !== 'false',
  minPasswordLength: envNum('MIN_PASSWORD_LENGTH', 8) || 8,
  maxPasswordLength: 200,
  maxEmailLength: 200,
  refreshBytes: 48,                            // 48 bytes → 96 hex
  refreshCollection: 'refresh_tokens',
  userCollection: 'usuarios',
  /** Detección de reuso de refresh tokens (recomendado: true). */
  detectRefreshReuse: String(process.env.AUTH_DETECT_REFRESH_REUSE ?? 'true').toLowerCase() !== 'false',
  /**
   * Ventana de tolerancia para reintentos de red legítimos.
   * Si un token ya consumido vuelve dentro de esta ventana, se trata como
   * `RETRY` (soft error) en vez de `REUSO` (invalida toda la familia).
   * Default 0 = estricto. Recomendado en prod: 10-30s.
   */
  reuseGraceMs: envNum('AUTH_REFRESH_REUSE_GRACE_MS', 0)
});

// Hash "señuelo" para mitigar timing attacks (calculado una sola vez).
const DUMMY_HASH = bcrypt.hashSync(
  'timing-attack-mitigation-dummy-value',
  CONFIG.bcryptRounds
);

// ============================================================
// RATE LIMITERS
// ============================================================
function crearLimiter({ windowMs, max, mensaje }) {
  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(429).json({ error: mensaje, codigo: 'RATE_LIMIT' });
    }
  });
}

const loginLimiter = crearLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  mensaje: 'Demasiados intentos. Espere 15 minutos.'
});

const registerLimiter = crearLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  mensaje: 'Demasiados registros desde esta IP. Intente más tarde.'
});

const refreshLimiter = crearLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  mensaje: 'Demasiadas renovaciones. Espere unos minutos.'
});

// ============================================================
// HELPERS DE VALIDACIÓN
// ============================================================
function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizarEmail(email) {
  return String(email).trim().toLowerCase();
}

/** Valida formato y longitud de email. Devuelve `{ok, valor?, error?}`. */
function validarEmailRobusto(email) {
  if (!esStringNoVacio(email)) return { ok: false, error: 'Email requerido' };
  if (email.length > CONFIG.maxEmailLength) return { ok: false, error: 'Email demasiado largo' };
  const r = validarEmail(email);
  if (!r || !r.valido) return { ok: false, error: r?.mensaje || 'Email inválido' };
  return { ok: true, valor: normalizarEmail(email) };
}

/** Valida contraseña por longitud y complejidad mínima. */
function validarPasswordRobusto(password, { esNueva = false } = {}) {
  if (typeof password !== 'string') return { ok: false, error: 'Contraseña inválida' };
  if (password.length > CONFIG.maxPasswordLength) {
    return { ok: false, error: 'Contraseña demasiado larga' };
  }
  if (esNueva && password.length < CONFIG.minPasswordLength) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${CONFIG.minPasswordLength} caracteres`
    };
  }
  if (esNueva && !/[A-Za-z]/.test(password)) {
    return { ok: false, error: 'La contraseña debe incluir al menos una letra' };
  }
  if (esNueva && !/\d/.test(password)) {
    return { ok: false, error: 'La contraseña debe incluir al menos un número' };
  }
  return { ok: true };
}

// ============================================================
// HELPERS DE USUARIO
// ============================================================
function usuarioPublico(user) {
  return {
    id: user._id,
    nombre: user.nombre || user.email,
    email: user.email,
    rol: user.rol,
    telefono: user.telefono || ''
  };
}

function firmarAccessToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, rol: user.rol },
    CONFIG.jwtSecret,
    { expiresIn: CONFIG.accessExpires, algorithm: CONFIG.jwtAlgorithm }
  );
}

// ============================================================
// SERVICIO DE REFRESH TOKENS (con familias)
// ============================================================
function hashRefresh(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generarRefreshToken() {
  return crypto.randomBytes(CONFIG.refreshBytes).toString('hex');
}

function nuevoFamilyId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

/**
 * Crea un refresh token nuevo (raw + hash) y lo persiste.
 * @param {object} db
 * @param {string|ObjectId} userId
 * @param {object} req           request de Express (para userAgent/ip)
 * @param {object} [opts]
 * @param {string} [opts.familyId]  Si se omite, se genera una familia nueva.
 * @returns {Promise<{raw:string, tokenHash:string, familyId:string}>}
 */
async function crearRefreshToken(db, userId, req, { familyId } = {}) {
  const raw = generarRefreshToken();
  const tokenHash = hashRefresh(raw);
  const family = familyId || nuevoFamilyId();
  const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE);

  await db.collection(CONFIG.refreshCollection).insertOne({
    tokenHash,
    userId: new ObjectId(userId),
    familyId: family,
    expiresAt,
    createdAt: new Date(),
    usedAt: null,          // se marca al rotar
    replacedBy: null,      // hash del token que lo reemplazó (auditoría)
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ip: (req.ip || '').toString().slice(0, 64)
  });

  return { raw, tokenHash, familyId: family };
}

/**
 * Marca un token como `replacedBy` (auditoría). No bloquea la respuesta.
 */
function registrarReemplazo(db, oldHash, newHash) {
  db.collection(CONFIG.refreshCollection)
    .updateOne({ tokenHash: oldHash }, { $set: { replacedBy: newHash } })
    .catch(err => log.warn({ err: err.message }, 'No se pudo registrar replacedBy'));
}

/**
 * Consume un refresh token con rotación ATÓMICA y detección de reuso.
 *
 * @returns
 *   | { ok: true,  doc }
 *   | { ok: false, motivo: 'NO_EXISTE' | 'EXPIRADO' | 'RETRY' | 'REUSO' | 'DESCONOCIDO',
 *       familyId?, userId? }
 */
async function consumirRefreshToken(db, token) {
  const tokenHash = hashRefresh(token);
  const ahora = new Date();

  // 1. Intento atómico: marcar como usado solo si está fresco y sin usar.
  const raw = await db.collection(CONFIG.refreshCollection).findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: ahora } },
    { $set: { usedAt: ahora } },
    { returnDocument: 'after' }
  );

  // Soportar driver v3 ({value: doc}) y v4+ (doc | null).
  const doc = raw && raw.value !== undefined ? raw.value : raw;
  if (doc) return { ok: true, doc };

  // 2. Averiguar por qué falló el update.
  const existente = await db.collection(CONFIG.refreshCollection).findOne({ tokenHash });

  if (!existente) return { ok: false, motivo: 'NO_EXISTE' };

  if (existente.expiresAt && existente.expiresAt <= ahora) {
    return { ok: false, motivo: 'EXPIRADO' };
  }

  if (existente.usedAt) {
    const delta = ahora.getTime() - new Date(existente.usedAt).getTime();
    // Dentro de la ventana de gracia → tratar como reintento de red.
    if (CONFIG.reuseGraceMs > 0 && delta <= CONFIG.reuseGraceMs) {
      return { ok: false, motivo: 'RETRY', familyId: existente.familyId };
    }
    // Fuera de la ventana → REUSO (posible robo).
    if (CONFIG.detectRefreshReuse) {
      return {
        ok: false,
        motivo: 'REUSO',
        familyId: existente.familyId,
        userId: existente.userId,
        usadoEn: existente.usedAt
      };
    }
    return { ok: false, motivo: 'EXPIRADO' };
  }

  // No debería llegar aquí (habría matcheado el update atómico).
  return { ok: false, motivo: 'DESCONOCIDO' };
}

/** Invalida TODOS los refresh tokens de un usuario. */
async function limpiarRefreshTokensDeUsuario(db, userId) {
  try {
    await db.collection(CONFIG.refreshCollection).deleteMany({ userId: new ObjectId(userId) });
  } catch (err) {
    log.warn({ err: err.message, userId: String(userId) }, 'No se pudieron limpiar refresh tokens');
  }
}

/**
 * Invalida TODA una familia de refresh tokens.
 * Se llama al detectar reuso (sospecha de robo).
 * @returns {Promise<number>} cantidad de tokens eliminados
 */
async function invalidarFamilia(db, familyId) {
  if (!familyId) return 0;
  try {
    const r = await db.collection(CONFIG.refreshCollection).deleteMany({ familyId });
    return r.deletedCount || 0;
  } catch (err) {
    log.warn({ err: err.message, familyId }, 'Error invalidando familia de refresh tokens');
    return 0;
  }
}

/** Limpieza oportunista de tokens expirados (no bloqueante). */
function limpiarExpiradosAsync(db) {
  db.collection(CONFIG.refreshCollection)
    .deleteMany({ expiresAt: { $lt: new Date() } })
    .catch(err => log.warn({ err: err.message }, 'Limpieza de refresh_tokens falló'));
}

// ============================================================
// AUDITORÍA
// ============================================================
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar');
  }
}

// ============================================================
// LOGIN
// ============================================================
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!esStringNoVacio(email) || !esStringNoVacio(password)) {
      return res.status(400).json({ error: 'Email y contraseña requeridos', codigo: 'CAMPOS_REQUERIDOS' });
    }
    if (email.length > CONFIG.maxEmailLength) {
      return res.status(400).json({ error: 'Email inválido', codigo: 'EMAIL_INVALIDO' });
    }
    if (password.length > CONFIG.maxPasswordLength) {
      return res.status(400).json({ error: 'Contraseña inválida', codigo: 'PASSWORD_INVALIDA' });
    }

    const emailNorm = normalizarEmail(email);
    const user = await req.db.collection(CONFIG.userCollection).findOne({ email: emailNorm });

    // Timing attack mitigation: siempre comparamos contra algo.
    const hashAComparar = user?.password || DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashAComparar);

    if (!user || !passwordMatch) {
      if (user) {
        await auditarSeguro(req.db, req, {
          accion: 'login-fallido',
          coleccion: 'auth',
          documentoId: user._id,
          documentoNumero: emailNorm,
          detalle: `Intento de login fallido: ${emailNorm}`
        });
      }
      return res.status(401).json({ error: 'Credenciales inválidas', codigo: 'CREDENCIALES_INVALIDAS' });
    }

    if (!user.activo) {
      return res.status(401).json({
        error: 'Usuario desactivado. Contacte al administrador.',
        codigo: 'USER_INACTIVE'
      });
    }

    // 1. Access token (JWT corto)
    const accessToken = firmarAccessToken(user);

    // 2. Refresh token con NUEVA familia (nueva sesión lógica)
    const { raw: refreshToken } = await crearRefreshToken(req.db, user._id, req);

    // 3. Cookies httpOnly
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    // 4. Auditoría
    await auditarSeguro(req.db, req, {
      accion: 'login',
      coleccion: 'auth',
      documentoId: user._id,
      documentoNumero: user.email,
      detalle: `Login exitoso: ${user.email}`
    });

    // Limpieza oportunista (no await)
    limpiarExpiradosAsync(req.db);

    return res.json({ user: usuarioPublico(user) });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// REFRESH
// ============================================================
router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ error: 'Sin sesión', codigo: 'NO_REFRESH' });
    }

    const resultado = await consumirRefreshToken(req.db, refreshToken);

    // ---- Caso 1: REUSO detectado → invalidar TODA la familia
    if (!resultado.ok && resultado.motivo === 'REUSO') {
      const eliminados = await invalidarFamilia(req.db, resultado.familyId);
      invalidarCachePorUsuario(resultado.userId);
      clearAuthCookies(res);

      log.error(
        {
          familyId: resultado.familyId,
          userId: String(resultado.userId),
          usadoEn: resultado.usadoEn,
          eliminados,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        },
        '🚨 Reuso de refresh token detectado — familia invalidada'
      );

      await auditarSeguro(req.db, req, {
        accion: 'refresh-reuso-detectado',
        coleccion: 'auth',
        documentoId: resultado.userId,
        detalle: `Reuso de refresh token detectado. Familia ${resultado.familyId} invalidada (${eliminados} tokens eliminados).`
      });

      return res.status(401).json({
        error: 'Sesión comprometida. Inicie sesión nuevamente.',
        codigo: 'REFRESH_REUSE'
      });
    }

    // ---- Caso 2: RETRY (dentro del grace) → soft error, sin invalidar familia
    if (!resultado.ok && resultado.motivo === 'RETRY') {
      clearAuthCookies(res);
      return res.status(401).json({
        error: 'Reintento de renovación detectado. Inicie sesión nuevamente.',
        codigo: 'REFRESH_RETRY'
      });
    }

    // ---- Caso 3: fallo genérico (NO_EXISTE / EXPIRADO / DESCONOCIDO)
    if (!resultado.ok) {
      clearAuthCookies(res);
      const codigo = resultado.motivo === 'EXPIRADO' ? 'REFRESH_EXPIRED' : 'REFRESH_INVALID';
      return res.status(401).json({ error: 'Sesión expirada', codigo });
    }

    // ---- Caso 4: OK → validar usuario y rotar
    const { doc: guardado } = resultado;

    const user = await req.db.collection(CONFIG.userCollection).findOne(
      { _id: guardado.userId },
      { projection: { password: 0 } }
    );

    if (!user || !user.activo) {
      // Usuario borrado o desactivado: matar la familia entera.
      await invalidarFamilia(req.db, guardado.familyId);
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Usuario inactivo', codigo: 'USER_INACTIVE' });
    }

    // Rotación: nuevo access + nuevo refresh en la MISMA familia
    const oldHash = hashRefresh(refreshToken);
    const newAccess = firmarAccessToken(user);
    const { raw: newRefresh, tokenHash: newHash } = await crearRefreshToken(
      req.db, user._id, req,
      { familyId: guardado.familyId }
    );

    // Auditoría: dejar rastro del reemplazo
    registrarReemplazo(req.db, oldHash, newHash);

    setAccessCookie(res, newAccess);
    setRefreshCookie(res, newRefresh);

    return res.json({ ok: true, user: usuarioPublico(user) });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// LOGOUT (idempotente, nunca falla)
// ============================================================
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken && req.db) {
      await req.db.collection(CONFIG.refreshCollection).deleteOne({
        tokenHash: hashRefresh(refreshToken)
      });
    }
  } catch (err) {
    log.warn({ err: err.message }, 'Error borrando refresh token en logout');
  } finally {
    clearAuthCookies(res);
    res.json({ ok: true });
  }
});

// ============================================================
// LOGOUT-ALL (invalida todas las sesiones del usuario)
// ============================================================
router.post('/logout-all', authMiddleware, async (req, res, next) => {
  try {
    await limpiarRefreshTokensDeUsuario(req.db, req.user.userId);
    invalidarCachePorUsuario(req.user.userId);
    clearAuthCookies(res);
    return res.json({ ok: true, message: 'Todas las sesiones cerradas' });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// REGISTER (público, solo vendedores)
// ============================================================
router.post('/register', registerLimiter, async (req, res, next) => {
  if (!CONFIG.allowRegister) {
    return res.status(403).json({
      error: 'El registro público está deshabilitado',
      codigo: 'REGISTER_DESHABILITADO'
    });
  }

  try {
    const { nombre, email, password } = req.body || {};

    if (!esStringNoVacio(nombre) || !esStringNoVacio(email) || !esStringNoVacio(password)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios', codigo: 'CAMPOS_REQUERIDOS' });
    }
    if (nombre.length > 200) {
      return res.status(400).json({ error: 'Nombre demasiado largo', codigo: 'NOMBRE_INVALIDO' });
    }

    const emailCheck = validarEmailRobusto(email);
    if (!emailCheck.ok) {
      return res.status(400).json({ error: emailCheck.error, codigo: 'EMAIL_INVALIDO' });
    }
    const emailNorm = emailCheck.valor;

    const pwCheck = validarPasswordRobusto(password, { esNueva: true });
    if (!pwCheck.ok) {
      return res.status(400).json({ error: pwCheck.error, codigo: 'PASSWORD_DEBIL' });
    }

    const existingUser = await req.db.collection(CONFIG.userCollection).findOne({ email: emailNorm });
    if (existingUser) {
      // Mismo código genérico para evitar enumeración de cuentas.
      return res.status(400).json({
        error: 'No se pudo registrar con esos datos',
        codigo: 'REGISTRO_INVALIDO'
      });
    }

    const hashedPassword = await bcrypt.hash(password, CONFIG.bcryptRounds);
    const ahora = new Date();

    const newUser = {
      nombre: nombre.trim(),
      email: emailNorm,
      password: hashedPassword,
      rol: 'vendedor',
      activo: true,
      telefono: '',
      password_changed_at: ahora,
      createdAt: ahora,
      updatedAt: ahora
    };
    const result = await req.db.collection(CONFIG.userCollection).insertOne(newUser);

    await auditarSeguro(req.db, req, {
      accion: 'crear',
      coleccion: 'usuarios',
      documentoId: result.insertedId,
      documentoNumero: emailNorm,
      datosNuevos: { nombre: newUser.nombre, email: emailNorm, rol: 'vendedor', activo: true },
      detalle: `Usuario registrado: ${emailNorm}`
    });

    return res.status(201).json({
      message: 'Usuario creado exitosamente',
      userId: result.insertedId
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// PERFIL
// ============================================================
router.get('/perfil', authMiddleware, async (req, res, next) => {
  try {
    const user = await req.db.collection(CONFIG.userCollection).findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } }
    );
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado', codigo: 'USER_NOT_FOUND' });
    }
    return res.json(user);
  } catch (err) {
    return next(err);
  }
});

router.put('/perfil', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { nombre, email, telefono, password, passwordActual } = req.body || {};

    const user = await req.db.collection(CONFIG.userCollection).findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado', codigo: 'USER_NOT_FOUND' });
    }

    if (nombre !== undefined && (!esStringNoVacio(nombre) || nombre.length > 200)) {
      return res.status(400).json({ error: 'Nombre inválido', codigo: 'NOMBRE_INVALIDO' });
    }

    let emailNuevo = null;
    if (email !== undefined && email !== user.email) {
      const check = validarEmailRobusto(email);
      if (!check.ok) return res.status(400).json({ error: check.error, codigo: 'EMAIL_INVALIDO' });
      emailNuevo = check.valor;
    }

    if (password !== undefined) {
      if (!esStringNoVacio(passwordActual)) {
        return res.status(400).json({
          error: 'Debe ingresar la contraseña actual',
          codigo: 'PASSWORD_ACTUAL_REQUERIDA'
        });
      }
      const match = await bcrypt.compare(passwordActual, user.password);
      if (!match) {
        return res.status(400).json({
          error: 'Contraseña actual incorrecta',
          codigo: 'PASSWORD_ACTUAL_INCORRECTA'
        });
      }
      const pwCheck = validarPasswordRobusto(password, { esNueva: true });
      if (!pwCheck.ok) {
        return res.status(400).json({ error: pwCheck.error, codigo: 'PASSWORD_DEBIL' });
      }
    }

    if (emailNuevo && emailNuevo !== user.email) {
      const dup = await req.db.collection(CONFIG.userCollection).findOne({
        _id: { $ne: new ObjectId(userId) },
        email: emailNuevo
      });
      if (dup) {
        return res.status(400).json({ error: 'El email ya está registrado', codigo: 'EMAIL_DUPLICADO' });
      }
    }

    const updateData = {
      nombre: nombre !== undefined ? nombre.trim() : user.nombre,
      email: emailNuevo || user.email,
      telefono: telefono !== undefined
        ? String(telefono).slice(0, 50)
        : (user.telefono || ''),
      updatedAt: new Date()
    };

    let passwordCambiada = false;
    if (password !== undefined) {
      updateData.password = await bcrypt.hash(password, CONFIG.bcryptRounds);
      updateData.password_changed_at = new Date();
      passwordCambiada = true;
    }

    await req.db.collection(CONFIG.userCollection).updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    if (passwordCambiada) {
      invalidarCachePorUsuario(userId);
      await limpiarRefreshTokensDeUsuario(req.db, userId);
      clearAuthCookies(res);
    }

    const updatedUser = await req.db.collection(CONFIG.userCollection).findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    await auditarSeguro(req.db, req, {
      accion: 'actualizar',
      coleccion: 'usuarios',
      documentoId: userId,
      documentoNumero: updatedUser.email,
      datosAnteriores: { nombre: user.nombre, email: user.email, telefono: user.telefono },
      datosNuevos: { nombre: updatedUser.nombre, email: updatedUser.email, telefono: updatedUser.telefono },
      detalle: `Perfil actualizado: ${updatedUser.email}${passwordCambiada ? ' (contraseña cambiada)' : ''}`
    });

    return res.json({
      message: 'Perfil actualizado correctamente',
      user: updatedUser,
      requiereRelogin: passwordCambiada
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._generarRefreshToken = generarRefreshToken;
module.exports._hashRefresh = hashRefresh;
module.exports._nuevoFamilyId = nuevoFamilyId;
module.exports._crearRefreshToken = crearRefreshToken;
module.exports._consumirRefreshToken = consumirRefreshToken;
module.exports._invalidarFamilia = invalidarFamilia;
module.exports._validarPasswordRobusto = validarPasswordRobusto;
module.exports._validarEmailRobusto = validarEmailRobusto;
module.exports._usuarioPublico = usuarioPublico;