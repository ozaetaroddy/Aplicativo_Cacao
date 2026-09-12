// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const JWT_SECRET = process.env.JWT_SECRET || 'mi-secreto-super-seguro-2026';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// Rate limit local adicional (además del global de server.js)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espere 15 minutos.' }
});

// ===== LOGIN =====
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

    // ⚠️ Mensaje genérico para no filtrar si existe o no el email
    const credencialesInvalidas = { error: 'Credenciales inválidas' };

    if (!user) return res.status(401).json(credencialesInvalidas);
    if (!user.activo) return res.status(401).json({ error: 'Usuario desactivado. Contacte al administrador.' });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      // Auditoría de intento fallido
      await logAudit(req.db, { user: { email: emailNorm }, headers: req.headers, socket: req.socket, ip: req.ip }, {
        accion: 'login-fallido',
        coleccion: 'auth',
        documentoNumero: emailNorm,
        detalle: `Intento de login fallido: ${emailNorm}`
      });
      return res.status(401).json(credencialesInvalidas);
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // Auditoría de login exitoso
    req.user = { userId: user._id, email: user.email, rol: user.rol, nombre: user.nombre };
    await logAudit(req.db, req, {
      accion: 'login',
      coleccion: 'auth',
      documentoId: user._id,
      documentoNumero: user.email,
      detalle: `Login exitoso: ${user.email}`
    });

    res.json({
      token,
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

// ===== REGISTER (público, solo vendedores) =====
router.post('/register', loginLimiter, async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const emailNorm = email.trim().toLowerCase();
    const existingUser = await req.db.collection('usuarios').findOne({ email: emailNorm });
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = {
      nombre: nombre.trim(),
      email: emailNorm,
      password: hashedPassword,
      rol: 'vendedor',
      activo: true,
      telefono: '',
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

// ===== OBTENER PERFIL =====
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

// ===== ACTUALIZAR PERFIL =====
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
      updateData.password = await bcrypt.hash(password, 12);
    }

    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

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
      detalle: `Perfil actualizado: ${updatedUser.email}${password ? ' (contraseña cambiada)' : ''}`
    });

    res.json({ message: 'Perfil actualizado correctamente', user: updatedUser });
  } catch (err) {
    console.error('Error actualizando perfil:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;