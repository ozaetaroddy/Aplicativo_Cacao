// backend/routes/usuarios.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');
const { requierePermiso, ROLES_VALIDOS } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');

// ===== LISTAR USUARIOS =====
router.get('/', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (req.query.search || '').trim();
    const { rol, activo } = req.query;

    const match = {};
    if (rol) match.rol = rol;
    if (activo !== undefined && activo !== '') match.activo = activo === 'true';
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { nombre: regex },
        { email: regex }
      ];
    }

    const sort = parseSort(req.query, { createdAt: -1 });
    const projection = { password: 0 };

    if (!paginar) {
      const data = await req.db.collection('usuarios').find(match, { projection }).sort(sort).toArray();
      return res.json(data);
    }

    const total = await req.db.collection('usuarios').countDocuments(match);
    const data = await req.db.collection('usuarios')
      .find(match, { projection })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== OBTENER UN USUARIO =====
router.get('/:id', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const user = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CREAR USUARIO =====
router.post('/', requierePermiso('usuarios', 'crear'), async (req, res) => {
  try {
    const { nombre, email, password, rol, telefono, activo } = req.body;

    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}` });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existente = await req.db.collection('usuarios').findOne({ email });
    if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevoUsuario = {
      nombre,
      email,
      password: hashedPassword,
      rol,
      telefono: telefono || '',
      activo: activo !== undefined ? activo : true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await req.db.collection('usuarios').insertOne(nuevoUsuario);

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'usuarios',
      documentoId: result.insertedId,
      documentoNumero: email,
      datosNuevos: { nombre, email, rol, telefono, activo: nuevoUsuario.activo },
      detalle: `Usuario creado: ${email} (${rol})`
    });

    res.status(201).json({
      _id: result.insertedId,
      nombre,
      email,
      rol,
      telefono: nuevoUsuario.telefono,
      activo: nuevoUsuario.activo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ACTUALIZAR USUARIO =====
router.put('/:id', requierePermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const { nombre, email, password, rol, telefono, activo } = req.body;

    const anterior = await req.db.collection('usuarios').findOne({ _id: new ObjectId(id) });
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (rol && !ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}` });
    }

    // Verificar email único
    if (email && email !== anterior.email) {
      const dup = await req.db.collection('usuarios').findOne({
        _id: { $ne: new ObjectId(id) },
        email
      });
      if (dup) return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const updateData = {
      nombre: nombre || anterior.nombre,
      email: email || anterior.email,
      rol: rol || anterior.rol,
      telefono: telefono !== undefined ? telefono : anterior.telefono,
      activo: activo !== undefined ? activo : anterior.activo,
      updatedAt: new Date()
    };

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'usuarios',
      documentoId: id,
      documentoNumero: updateData.email,
      datosAnteriores: { nombre: anterior.nombre, email: anterior.email, rol: anterior.rol, telefono: anterior.telefono, activo: anterior.activo },
      datosNuevos: { nombre: updateData.nombre, email: updateData.email, rol: updateData.rol, telefono: updateData.telefono, activo: updateData.activo },
      detalle: `Usuario actualizado: ${updateData.email}${password ? ' (contraseña cambiada)' : ''}`
    });

    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ELIMINAR USUARIO =====
router.delete('/:id', requierePermiso('usuarios', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    // No permitir eliminar el propio usuario
    if (String(req.user.userId) === String(id)) {
      return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    }

    const anterior = await req.db.collection('usuarios').findOne({ _id: new ObjectId(id) });
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado' });

    const result = await req.db.collection('usuarios').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await logAudit(req.db, req, {
      accion: 'eliminar',
      coleccion: 'usuarios',
      documentoId: id,
      documentoNumero: anterior.email,
      datosAnteriores: { nombre: anterior.nombre, email: anterior.email, rol: anterior.rol },
      detalle: `Usuario eliminado: ${anterior.email}`
    });

    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== TOGGLE ACTIVO =====
router.patch('/:id/toggle-activo', requierePermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    if (String(req.user.userId) === String(id)) {
      return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
    }

    const user = await req.db.collection('usuarios').findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const nuevoEstado = !user.activo;
    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(id) },
      { $set: { activo: nuevoEstado, updatedAt: new Date() } }
    );

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'usuarios',
      documentoId: id,
      documentoNumero: user.email,
      datosAnteriores: { activo: user.activo },
      datosNuevos: { activo: nuevoEstado },
      detalle: `Usuario ${nuevoEstado ? 'activado' : 'desactivado'}: ${user.email}`
    });

    res.json({ activo: nuevoEstado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;