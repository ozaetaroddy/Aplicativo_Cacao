// backend/routes/usuarios.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../utils/audit');
const { requierePermiso, ROLES_VALIDOS } = require('../utils/permisos');
const { parsePagination, wantsPagination, parseSort, escapeRegex } = require('../utils/pagination');
const { validarEmail } = require('../utils/validators');
const { invalidarCachePorUsuario } = require('../middleware/auth');

const BCRYPT_ROUNDS = 12;

function esEmailValido(email) {
  return validarEmail(email).valido;
}

function esStringValido(v, max = 200) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

/**
 * Verifica que un cambio (rol o activo) no deje al sistema sin admins activos.
 * Devuelve un string con el error, o null si está OK.
 */
async function validarUltimoAdmin(db, userId, cambios) {
  const user = await db.collection('usuarios').findOne({ _id: new ObjectId(userId) });
  if (!user) return null;

  const eraAdminActivo = user.rol === 'admin' && user.activo;
  if (!eraAdminActivo) return null;

  const nuevoRol = cambios.rol !== undefined ? cambios.rol : user.rol;
  const nuevoActivo = cambios.activo !== undefined ? cambios.activo : user.activo;
  const seguiraSiendoAdminActivo = nuevoRol === 'admin' && nuevoActivo === true;
  if (seguiraSiendoAdminActivo) return null;

  const otrosAdmins = await db.collection('usuarios').countDocuments({
    _id: { $ne: new ObjectId(userId) },
    rol: 'admin',
    activo: true
  });

  if (otrosAdmins === 0) {
    return 'No puede quitar el rol admin ni desactivar al último administrador activo';
  }
  return null;
}

// ===== LISTAR USUARIOS =====
router.get('/', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim();
    const { rol, activo } = req.query;

    const match = {};
    if (typeof rol === 'string' && rol) match.rol = rol;
    if (activo !== undefined && activo !== '') match.activo = activo === 'true';
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ nombre: regex }, { email: regex }];
    }

    const sort = parseSort(req.query, { createdAt: -1 });
    const projection = { password: 0 };

    if (!paginar) {
      const data = await req.db.collection('usuarios').find(match, { projection }).sort(sort).toArray();
      return res.json(data);
    }

    const total = await req.db.collection('usuarios').countDocuments(match);
    const data = await req.db.collection('usuarios')
      .find(match, { projection }).sort(sort).skip(skip).limit(limit).toArray();

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== OBTENER UNO =====
router.get('/:id', requierePermiso('usuarios', 'ver'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
    const user = await req.db.collection('usuarios').findOne(
      { _id: new ObjectId(id) }, { projection: { password: 0 } }
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CREAR =====
router.post('/', requierePermiso('usuarios', 'crear'), async (req, res) => {
  try {
    const { nombre, email, password, rol, telefono, activo } = req.body;

    if (!esStringValido(nombre, 100)) {
      return res.status(400).json({ error: 'Nombre inválido (1-100 caracteres)' });
    }
    if (!esStringValido(email, 200)) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (!esStringValido(password, 200) || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!esStringValido(rol, 30)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    if (telefono !== undefined && telefono !== null && typeof telefono !== 'string') {
      return res.status(400).json({ error: 'Teléfono debe ser string' });
    }

    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}` });
    }
    if (!esEmailValido(email)) {
      return res.status(400).json({ error: validarEmail(email).mensaje || 'Email inválido' });
    }

    if (rol === 'admin' && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede crear otros administradores' });
    }

    const emailNorm = email.trim().toLowerCase();
    const existente = await req.db.collection('usuarios').findOne({ email: emailNorm });
    if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const ahora = new Date();

    const nuevoUsuario = {
      nombre: nombre.trim(),
      email: emailNorm,
      password: hashedPassword,
      rol,
      telefono: telefono || '',
      activo: activo !== undefined ? !!activo : true,
      password_changed_at: ahora,
      createdAt: ahora,
      updatedAt: ahora
    };

    const result = await req.db.collection('usuarios').insertOne(nuevoUsuario);

    await logAudit(req.db, req, {
      accion: 'crear',
      coleccion: 'usuarios',
      documentoId: result.insertedId,
      documentoNumero: emailNorm,
      datosNuevos: { nombre, email: emailNorm, rol, telefono, activo: nuevoUsuario.activo },
      detalle: `Usuario creado: ${emailNorm} (${rol})`
    });

    res.status(201).json({
      _id: result.insertedId,
      nombre: nuevoUsuario.nombre,
      email: emailNorm,
      rol,
      telefono: nuevoUsuario.telefono,
      activo: nuevoUsuario.activo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ACTUALIZAR =====
router.put('/:id', requierePermiso('usuarios', 'editar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const { nombre, email, password, rol, telefono, activo } = req.body;

    if (nombre !== undefined && !esStringValido(nombre, 100)) {
      return res.status(400).json({ error: 'Nombre inválido (1-100 caracteres)' });
    }
    if (email !== undefined && !esStringValido(email, 200)) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (password !== undefined && !esStringValido(password, 200)) {
      return res.status(400).json({ error: 'Contraseña inválida' });
    }
    if (rol !== undefined && !esStringValido(rol, 30)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    if (telefono !== undefined && telefono !== null && typeof telefono !== 'string') {
      return res.status(400).json({ error: 'Teléfono debe ser string' });
    }

    const anterior = await req.db.collection('usuarios').findOne({ _id: new ObjectId(id) });
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (rol && !ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}` });
    }

    if (rol && (rol === 'admin' || anterior.rol === 'admin') && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede gestionar administradores' });
    }

    // 🔒 No dejar al sistema sin admins activos
    const errorUltimoAdmin = await validarUltimoAdmin(req.db, id, {
      rol: rol !== undefined ? rol : undefined,
      activo: activo !== undefined ? !!activo : undefined
    });
    if (errorUltimoAdmin) {
      return res.status(400).json({ error: errorUltimoAdmin, codigo: 'ULTIMO_ADMIN' });
    }

    const updateData = {
      nombre: nombre || anterior.nombre,
      email: email ? email.trim().toLowerCase() : anterior.email,
      rol: rol || anterior.rol,
      telefono: telefono !== undefined ? telefono : anterior.telefono,
      activo: activo !== undefined ? !!activo : anterior.activo,
      updatedAt: new Date()
    };

    if (email && updateData.email !== anterior.email) {
      if (!esEmailValido(updateData.email)) {
        return res.status(400).json({ error: validarEmail(updateData.email).mensaje || 'Email inválido' });
      }
      const dup = await req.db.collection('usuarios').findOne({
        _id: { $ne: new ObjectId(id) }, email: updateData.email
      });
      if (dup) return res.status(400).json({ error: 'El email ya está registrado' });
    }

    let passwordCambiada = false;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      updateData.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      updateData.password_changed_at = new Date();
      passwordCambiada = true;
    }

    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    invalidarCachePorUsuario(id);

    await logAudit(req.db, req, {
      accion: 'actualizar',
      coleccion: 'usuarios',
      documentoId: id,
      documentoNumero: updateData.email,
      datosAnteriores: { nombre: anterior.nombre, email: anterior.email, rol: anterior.rol, telefono: anterior.telefono, activo: anterior.activo },
      datosNuevos: { nombre: updateData.nombre, email: updateData.email, rol: updateData.rol, telefono: updateData.telefono, activo: updateData.activo },
      detalle: `Usuario actualizado: ${updateData.email}${passwordCambiada ? ' (contraseña cambiada)' : ''}`
    });

    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ELIMINAR =====
router.delete('/:id', requierePermiso('usuarios', 'eliminar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    if (String(req.user.userId) === String(id)) {
      return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    }

    const anterior = await req.db.collection('usuarios').findOne({ _id: new ObjectId(id) });
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (anterior.rol === 'admin' && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede eliminar a otro administrador' });
    }

    // 🔒 No eliminar al último admin activo
    if (anterior.rol === 'admin' && anterior.activo) {
      const otrosAdmins = await req.db.collection('usuarios').countDocuments({
        _id: { $ne: new ObjectId(id) },
        rol: 'admin',
        activo: true
      });
      if (otrosAdmins === 0) {
        return res.status(400).json({ error: 'No puede eliminar al único administrador activo', codigo: 'ULTIMO_ADMIN' });
      }
    }

    const result = await req.db.collection('usuarios').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    invalidarCachePorUsuario(id);

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

    if (user.rol === 'admin' && user.activo) {
      const otrosAdmins = await req.db.collection('usuarios').countDocuments({
        _id: { $ne: new ObjectId(id) }, rol: 'admin', activo: true
      });
      if (otrosAdmins === 0) {
        return res.status(400).json({ error: 'No puede desactivar al único administrador activo', codigo: 'ULTIMO_ADMIN' });
      }
    }

    const nuevoEstado = !user.activo;
    await req.db.collection('usuarios').updateOne(
      { _id: new ObjectId(id) },
      { $set: { activo: nuevoEstado, updatedAt: new Date() } }
    );

    invalidarCachePorUsuario(id);

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