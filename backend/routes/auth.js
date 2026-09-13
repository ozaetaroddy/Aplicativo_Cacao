// backend/routes/auth.js
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
const {
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE
} = require('../utils/cookies');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está definido en el entorno');
  process.exit(1);
}
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '15m';
const BCRYPT_ROUNDS = 12;

const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation-dummy-value', BCRYPT_ROUNDS);
const ALLOW_REGISTER = String(process.env.ALLOW_REGISTER ?? 'true').toLowerCase() !== 'false';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espere 15 minutos.' }
});

// ============================================================
// UTILIDADES DE REFRESH TOKEN
// ============================================================

function hashRefresh(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generarRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function guardarRefreshToken(db, userId, token, req) {
  const tokenHash = hashRefresh(token);
  const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE);

  await db.collection('refresh_tokens').insertOne({
    tokenHash,
    userId: new ObjectId(userId),
    expiresAt,
    createdAt: new Date(),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ip: req.ip || ''
  });
}

async function consumirRefreshToken(db, token) {
  const tokenHash = hashRefresh(token);
  const result = await db.collection('refresh_tokens').findOneAndDelete({ tokenHash });
  if (!result) return null;
  if (result.expiresAt < new Date()) return null;
  return result;
}

async function limpiarRefreshTokensDeUsuario(db, userId) {
  try {
    await db.collection('refresh_tokens').deleteMany({ userId: new ObjectId(userId) });
  } catch (_) { /* noop */ }
}

// ============================================================
// LOGIN
// ============================================================
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    if (typeof email !== 'string' || email.length > 200) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (typeof password !== 'string' || password.length > 200) {
      return res.status(400).json({ error: 'Contraseña inválida' });
    }

    const emailNorm = email.trim().toLowerCase();
    const user = await req.db.collection('usuarios').findOne({ email: emailNorm });

    const hashAComparar = user?.password || DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashAComparar);

    if (!user || !passwordMatch) {
      if (user) {
        await logAudit(
          req.db,
          { user: { email: emailNorm }, headers: req.headers, socket: req.socket, ip: req.ip },
          {
            accion: 'login-fallido',
            coleccion: 'auth',
            documentoNumero: emailNorm,
            detalle: `Intento de login fallido: ${emailNorm}`
          }
        );
      }
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.activo) {
      return res.status(401).json({ error: 'Usuario desactivado. Contacte al administrador.' });
    }

    // 1. Access token (corto)
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: ACCESS_EXPIRES, algorithm: 'HS256' }
    );

    // 2. Refresh token (largo, rotable)
    const refreshToken = generarRefreshToken();
    await guardarRefreshToken(req.db, user._id, refreshToken, req);

    // 3. Setear cookies httpOnly
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    req.user = { userId: user._id, email: user.email, rol: user.rol, nombre: user.nombre };
    await logAudit(req.db, req, {
      accion: 'login',
      coleccion: 'auth',
      documentoId: user._id,
      documentoNumero: user.email,
      detalle: `Login exitoso: ${user.email}`
    });

    // Ya NO devolvemos el token en el body (está en las cookies)
    res.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        telefono: user.telefono || ''
      }
    });
  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// REFRESH (renovar access token)
// ============================================================
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ error: 'Sin sesión', codigo: 'NO_REFRESH' });
    }

    const guardado = await consumirRefreshToken(req.db, refreshToken);
    if (!guardado) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Sesión expirada', codigo: 'REFRESH_INVALID' });
    }

    const user = await req.db.collection('usuarios').findOne(
      { _id: guardado.userId },
      { projection: { password: 0 } }
    );

    if (!user || !user.activo) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Usuario inactivo', codigo: 'USER_INACTIVE' });
    }

    // Rotación: emitir un nuevo access + un nuevo refresh
    const newAccess = jwt.sign(
      { userId: user._id, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: ACCESS_EXPIRES, algorithm: 'HS256' }
    );
    const newRefresh = generarRefreshToken();
    await guardarRefreshToken(req.db, user._id, newRefresh, req);

    setAccessCookie(res, newAccess);
    setRefreshCookie(res, newRefresh);

    res.json({
      ok: true,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        telefono: user.telefono || ''
      }
    });
  } catch (err) {
    console.error('❌ Error en refresh:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// LOGOUT
// ============================================================
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await req.db.collection('refresh_tokens').deleteOne({
        tokenHash: hashRefresh(refreshToken)
      });
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) {
    clearAuthCookies(res);
    res.json({ ok: true });
  }
});

// ============================================================
// LOGOUT TOTAL (invalidar TODAS las sesiones del usuario)
// ============================================================
router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    await limpiarRefreshTokensDeUsuario(req.db, req.user.userId);
    invalidarCachePorUsuario(req.user.userId);
    clearAuthCookies(res);
    res.json({ ok: true, message: 'Todas las sesiones cerradas' });
  } catch (err) {
    console.error('Error en logout-all:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// REGISTER (público, solo vendedores)
// ============================================================
router.post('/register', loginLimiter, async (req, res) => {
  if (!ALLOW_REGISTER) {
    return res.status(403).json({ error: 'El registro público está deshabilitado' });
  }

  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const emailCheck = validarEmail(email);
    if (!emailCheck.valido) {
      return res.status(400).json({ error: emailCheck.mensaje });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const emailNorm = email.trim().toLowerCase();
    const existingUser = await req.db.collection('usuarios').findOne({ email: emailNorm });
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const newUser = {
      nombre: nombre.trim(),
      email: emailNorm,
      password: hashedPassword,
      rol: 'vendedor',
      activo: true,
      telefono: '',
      password_changed_at: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await req.db.collection('usuarios').insertOne(newUser);

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'usuarios',
      documentoId: result.insertedId,
      documentoNumero: emailNorm,
      datosNuevos: { nombre, email: emailNorm, rol: 'vendedor', activo: true },
      detalle: `Usuario registrado: ${emailNorm}`
    });

    res.status(201).json({ message: 'Usuario creado exitosamente', userId: result.insertedId });
  } catch (err) {
    console.error('❌ Error en register:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// PERFIL
// ============================================================
router.get('/perfil', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    console.error('Error obteniendo perfil:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/perfil', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nombre, email, telefono, password, passwordActual } = req.body;

    const user = await req.db.collection('usuarios').findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const updateData = {
      nombre: nombre || user.nombre,
      email: email ? email.trim().toLowerCase() : user.email,
      telefono: telefono !== undefined ? telefono : (user.telefono || ''),
      updatedAt: new Date()
    };

    if (email && updateData.email !== user.email) {
      const emailCheck = validarEmail(updateData.email);
      if (!emailCheck.valido) {
        return res.status(400).json({ error: emailCheck.mensaje });
      }
      const dup = await req.db.collection('usuarios').findOne({
        _id: { $ne: new ObjectId(userId) },
        email: updateData.email
      });
      if (dup) return res.status(400).json({ error: 'El email ya está registrado' });
    }

    let passwordCambiada = false;
    if (password) {
      if (!passwordActual) {
        return res.status(400).json({ error: 'Debe ingresar la contraseña actual' });
      }
      const passwordMatch = await bcrypt.compare(passwordActual, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: 'Contraseña actual incorrecta' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
      }
      updateData.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      updateData.password_changed_at = new Date();
      passwordCambiada = true;
    }

    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    if (passwordCambiada) {
      invalidarCachePorUsuario(userId);
      // Invalidar también los refresh tokens (forzar re-login)
      await limpiarRefreshTokensDeUsuario(req.db, userId);
      clearAuthCookies(res);
    }

    const updatedUser = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'usuarios',
      documentoId: userId,
      documentoNumero: updatedUser.email,
      datosAnteriores: { nombre: user.nombre, email: user.email, telefono: user.telefono },
      datosNuevos: { nombre: updatedUser.nombre, email: updatedUser.email, telefono: updatedUser.telefono },
      detalle: `Perfil actualizado: ${updatedUser.email}${passwordCambiada ? ' (contraseña cambiada)' : ''}`
    });

    res.json({
      message: 'Perfil actualizado correctamente',
      user: updatedUser,
      requiereRelogin: passwordCambiada
    });
  } catch (err) {
    console.error('Error actualizando perfil:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;