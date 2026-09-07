const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

const JWT_SECRET = process.env.JWT_SECRET || 'mi-secreto-super-seguro-2026';

// ===== REGISTRO (solo admin) =====
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const existingUser = await req.db.collection('usuarios').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      nombre,
      email,
      password: hashedPassword,
      rol: rol || 'vendedor',
      activo: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await req.db.collection('usuarios').insertOne(newUser);
    res.status(201).json({ 
      message: 'Usuario creado exitosamente', 
      userId: result.insertedId 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    res.json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== MIDDLEWARE VERIFICAR TOKEN =====
const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// ===== OBTENER PERFIL =====
router.get('/perfil', verificarToken, async (req, res) => {
  try {
    const user = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CAMBIAR CONTRASEÑA (opcional) =====
router.put('/cambiar-password', verificarToken, async (req, res) => {
  try {
    const { passwordActual, nuevaPassword } = req.body;
    const user = await req.db.collection('usuarios').findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const match = await bcrypt.compare(passwordActual, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hashed = await bcrypt.hash(nuevaPassword, 10);
    await req.db.collection('usuarios').updateOne(
      { _id: user._id },
      { $set: { password: hashed, updatedAt: new Date() } }
    );
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.verificarToken = verificarToken;