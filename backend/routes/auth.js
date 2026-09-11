const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const authMiddleware = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const JWT_SECRET = process.env.JWT_SECRET || 'mi-secreto-super-seguro-2026';

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    const user = await req.db.collection('usuarios').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (!user.activo) {
      return res.status(401).json({ error: 'Usuario desactivado' });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign(
      { userId: user._id, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ===== AUDITORÍA =====
    // Asignamos req.user manualmente para que el helper de auditoría lo detecte
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
    res.status(500).json({ error: err.message });
  }
});

// ===== REGISTER (público, solo vendedores) =====
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const existingUser = await req.db.collection('usuarios').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const assignedRol = 'vendedor';

    const newUser = {
      nombre,
      email,
      password: hashedPassword,
      rol: assignedRol,
      activo: true,
      telefono: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await req.db.collection('usuarios').insertOne(newUser);

    // ===== AUDITORÍA (sin usuario aún, pero registramos el evento) =====
    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'usuarios',
      documentoId: result.insertedId,
      documentoNumero: email,
      datosNuevos: { nombre, email, rol: assignedRol, activo: true },
      detalle: `Usuario registrado: ${email}`
    });

    res.status(201).json({ message: 'Usuario creado exitosamente', userId: result.insertedId });
  } catch (err) {
    console.error('❌ Error en register:', err);
    res.status(500).json({ error: err.message });
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
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
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
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const updateData = {
      nombre: nombre || user.nombre,
      email: email || user.email,
      telefono: telefono || user.telefono || '',
      updatedAt: new Date()
    };

    if (password) {
      const passwordMatch = await bcrypt.compare(passwordActual, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: 'Contraseña actual incorrecta' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    const updatedUser = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    // ===== AUDITORÍA =====
    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'usuarios',
      documentoId: userId,
      documentoNumero: updatedUser.email,
      datosAnteriores: { nombre: user.nombre, email: user.email, telefono: user.telefono },
      datosNuevos: { nombre: updatedUser.nombre, email: updatedUser.email, telefono: updatedUser.telefono },
      detalle: `Perfil actualizado: ${updatedUser.email}${password ? ' (contraseña cambiada)' : ''}`
    });

    res.json({
      message: 'Perfil actualizado correctamente',
      user: updatedUser
    });
  } catch (err) {
    console.error('Error actualizando perfil:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;