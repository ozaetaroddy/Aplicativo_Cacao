// backend/routes/usuarios.js
// ============================================================
// Usuarios — CRUD + activación + roles
// ------------------------------------------------------------
// Endpoints:
//   GET    /                        → listado (con/sin paginación)
//   GET    /:id                     → detalle
//   POST   /                        → crear
//   PUT    /:id                     → actualizar (parcial)
//   DELETE /:id                     → eliminar
//   PATCH  /:id/toggle-activo       → alternar activo
//
// Convenciones:
//   - Nunca se expone `password` en las respuestas.
//   - Invalidar cache de auth + cerrar WebSockets al desactivar
//     o cambiar contraseña.
//   - Protección del "último admin activo": no se puede degradar
//     ni desactivar/eliminar el último admin.
//   - Los usuarios solo pueden ser gestionados por quien tenga los
//     permisos correspondientes (`usuarios:*`).
//   - Errores delegados al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso, ROLES_VALIDOS } = require('../utils/permisos');
const {
  parsePagination,
  wantsPagination,
  parseSort,
  escapeRegex
} = require('../utils/pagination');
const { validar } = require('../utils/validacion');
const { validarEmail } = require('../utils/validators');
const { invalidarCachePorUsuario } = require('../middleware/auth');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  col: 'usuarios',

  bcryptRounds: envNum('BCRYPT_ROUNDS', 12),

  nombreMaxLen: 100,
  nombreMinLen: 1,
  emailMaxLen: 200,
  telefonoMaxLen: 50,
  passwordMinLen: envNum('MIN_PASSWORD_LENGTH', 8),
  passwordMaxLen: 200,

  /** Máx. usuarios devueltos sin paginación. */
  maxSinPaginar: envNum('USUARIOS_MAX_SIN_PAGINAR', 5000),

  /** Proyección estándar: nunca exponer el hash. */
  proyeccionSinPassword: Object.freeze({ password: 0 })
});

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Booleano tolerante: 'true'/'1'/true → true; 'false'/'0'/false → false. */
function toBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return Boolean(v);
}

function normalizarTexto(v) {
  return String(v == null ? '' : v).trim();
}

function normalizarEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id, mensaje = 'ID inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar usuario');
  }
}

/** Valida un email defensivamente (no asume la forma de `validarEmail`). */
function emailValido(email) {
  const r = validarEmail(email);
  return {
    valido: Boolean(r && r.valido),
    mensaje: (r && r.mensaje) || 'Email inválido'
  };
}

// ============================================================
// HELPERS DE NEGOCIO
// ============================================================
/** Proyección pública (sin password). */
function construirUsuarioPublico(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    nombre: doc.nombre,
    email: doc.email,
    rol: doc.rol,
    telefono: doc.telefono || '',
    activo: Boolean(doc.activo),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/**
 * Verifica si un email ya está registrado (excluyendo opcionalmente un id).
 * @returns {Promise<object|null>} el documento en conflicto o null
 */
async function verificarEmailDisponible(db, email, { excluirId } = {}) {
  const emailNorm = normalizarEmail(email);
  const filtro = { email: emailNorm };
  if (excluirId) filtro._id = { $ne: excluirId };
  return db.collection(CONFIG.col).findOne(
    filtro,
    { projection: { _id: 1, email: 1, nombre: 1 } }
  );
}

/**
 * Verifica que un cambio no deje al sistema sin admin activo.
 *
 * ⚠️  Race condition conocida: entre este `countDocuments` y el
 *     `updateOne`/`deleteOne` posterior, otro request puede degradar
 *     al último admin. Migrar a transacción con `readConcern: 'snapshot'`
 *     si el sistema crece a >1 admin concurrente.
 *
 * @returns {Promise<string|null>} mensaje de error o null
 */
async function esUltimoAdminProtegido(db, userId, { nuevoRol, nuevoActivo } = {}) {
  const _id = new ObjectId(userId);
  const user = await db.collection(CONFIG.col).findOne(
    { _id },
    { projection: { rol: 1, activo: 1 } }
  );
  if (!user) return null;

  const eraAdminActivo = user.rol === 'admin' && user.activo;
  if (!eraAdminActivo) return null;

  const rolFinal = nuevoRol !== undefined ? nuevoRol : user.rol;
  const activoFinal = nuevoActivo !== undefined ? Boolean(nuevoActivo) : user.activo;

  const seguiraSiendoAdminActivo = rolFinal === 'admin' && activoFinal === true;
  if (seguiraSiendoAdminActivo) return null;

  const otrosAdmins = await db.collection(CONFIG.col).countDocuments({
    _id: { $ne: _id },
    rol: 'admin',
    activo: true
  });

  return otrosAdmins === 0
    ? 'No puede quitar el rol admin ni desactivar al último administrador activo'
    : null;
}

/**
 * Fuerza la desconexión de TODOS los WebSockets abiertos por un userId.
 * Se usa cuando el usuario es desactivado o eliminado.
 * @returns {number} cantidad de sockets cerrados
 */
function desconectarSocketsDeUsuario(io, userId) {
  if (!io || !userId || !io.sockets || !io.sockets.sockets) return 0;
  let cerrados = 0;
  const target = String(userId);

  for (const [, socket] of io.sockets.sockets) {
    if (socket && socket.user && String(socket.user.userId) === target) {
      try {
        if (typeof socket.emit === 'function') {
          socket.emit('sesion-invalidada', { motivo: 'usuario-desactivado' });
        }
        if (typeof socket.disconnect === 'function') {
          socket.disconnect(true);
          cerrados++;
        }
      } catch (_) {
        // nunca romper la request por un socket problemático
      }
    }
  }
  return cerrados;
}

// ============================================================
// VALIDADORES (express-validator)
// ============================================================
const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

const validadorCrear = [
  body('nombre')
    .exists({ checkFalsy: true }).withMessage('Nombre obligatorio')
    .isString().withMessage('Nombre debe ser texto')
    .trim()
    .isLength({ min: CONFIG.nombreMinLen, max: CONFIG.nombreMaxLen })
    .withMessage(`Nombre debe tener entre ${CONFIG.nombreMinLen} y ${CONFIG.nombreMaxLen} caracteres`),

  body('email')
    .exists({ checkFalsy: true }).withMessage('Email obligatorio')
    .isString().withMessage('Email debe ser texto')
    .isLength({ max: CONFIG.emailMaxLen })
    .withMessage(`Email no puede superar ${CONFIG.emailMaxLen} caracteres`),

  body('password')
    .exists({ checkFalsy: true }).withMessage('Contraseña obligatoria')
    .isString().withMessage('Contraseña debe ser texto')
    .isLength({ min: CONFIG.passwordMinLen, max: CONFIG.passwordMaxLen })
    .withMessage(`La contraseña debe tener al menos ${CONFIG.passwordMinLen} caracteres`),

  body('rol')
    .exists({ checkFalsy: true }).withMessage('Rol obligatorio')
    .isString().withMessage('Rol debe ser texto')
    .isIn(ROLES_VALIDOS)
    .withMessage(`Rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}`),

  body('telefono')
    .optional({ nullable: true })
    .isString().withMessage('Teléfono debe ser texto')
    .trim()
    .isLength({ max: CONFIG.telefonoMaxLen })
    .withMessage(`Teléfono no puede superar ${CONFIG.telefonoMaxLen} caracteres`),

  body('activo')
    .optional()
    .custom((v) => {
      const ok = typeof v === 'boolean' || v === 'true' || v === 'false' ||
                 v === '1' || v === '0' || v === 1 || v === 0;
      if (!ok) throw new Error('activo debe ser booleano');
      return true;
    })
];

const validadorActualizar = [
  body('nombre').optional().isString().trim()
    .isLength({ min: CONFIG.nombreMinLen, max: CONFIG.nombreMaxLen })
    .withMessage(`Nombre debe tener entre ${CONFIG.nombreMinLen} y ${CONFIG.nombreMaxLen} caracteres`),

  body('email').optional().isString()
    .isLength({ max: CONFIG.emailMaxLen })
    .withMessage(`Email no puede superar ${CONFIG.emailMaxLen} caracteres`),

  body('password').optional().isString()
    .isLength({ min: CONFIG.passwordMinLen, max: CONFIG.passwordMaxLen })
    .withMessage(`La contraseña debe tener al menos ${CONFIG.passwordMinLen} caracteres`),

  body('rol').optional().isIn(ROLES_VALIDOS)
    .withMessage(`Rol inválido. Válidos: ${ROLES_VALIDOS.join(', ')}`),

  body('telefono').optional({ nullable: true }).isString().trim()
    .isLength({ max: CONFIG.telefonoMaxLen })
    .withMessage(`Teléfono no puede superar ${CONFIG.telefonoMaxLen} caracteres`),

  body('activo').optional()
    .custom((v) => {
      const ok = typeof v === 'boolean' || v === 'true' || v === 'false' ||
                 v === '1' || v === '0' || v === 1 || v === 0;
      if (!ok) throw new Error('activo debe ser booleano');
      return true;
    })
];

// ============================================================
// GET /  → listado
// ============================================================
router.get('/', requierePermiso('usuarios', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (soloString(req.query.search) || '').trim();

    const rol = soloString(req.query.rol);
    const activo = soloString(req.query.activo);

    const match = {};
    if (rol && ROLES_VALIDOS.includes(rol)) match.rol = rol;
    if (activo === 'true') match.activo = true;
    else if (activo === 'false') match.activo = false;

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ nombre: regex }, { email: regex }];
    }

    const sort = parseSort(req.query, { createdAt: -1 });
    const col = req.db.collection(CONFIG.col);

    // ---- Sin paginación (compatibilidad legacy) ----
    if (!paginar) {
      const data = await col
        .find(match, { projection: CONFIG.proyeccionSinPassword })
        .sort(sort)
        .limit(CONFIG.maxSinPaginar)
        .toArray();

      headersNoStore(res);
      return res.json(data.map(construirUsuarioPublico));
    }

    // ---- Paginado ----
    const [total, data] = await Promise.all([
      col.countDocuments(match),
      col.find(match, { projection: CONFIG.proyeccionSinPassword })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    headersNoStore(res);
    return res.json({
      data: data.map(construirUsuarioPublico),
      total,
      page,
      limit,
      totalPages,
      hasNext: skip + data.length < total,
      hasPrev: page > 1
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id  → detalle
// ============================================================
router.get('/:id', requierePermiso('usuarios', 'ver'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const _id = new ObjectId(req.params.id);
    const user = await req.db.collection(CONFIG.col)
      .findOne({ _id }, { projection: CONFIG.proyeccionSinPassword });

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        codigo: 'USUARIO_NOT_FOUND'
      });
    }

    headersNoStore(res);
    return res.json(construirUsuarioPublico(user));
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /  → crear
// ============================================================
router.post(
  '/',
  requierePermiso('usuarios', 'crear'),
  validadorCrear,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const nombre = normalizarTexto(req.body.nombre);
      const email = normalizarEmail(req.body.email);
      const password = req.body.password;
      const rol = req.body.rol;
      const telefono = normalizarTexto(req.body.telefono);
      const activo = req.body.activo !== undefined ? toBool(req.body.activo, true) : true;

      // ---- Validación de email ----
      const emailCheck = emailValido(email);
      if (!emailCheck.valido) {
        return res.status(400).json({
          error: emailCheck.mensaje,
          codigo: 'EMAIL_INVALIDO'
        });
      }

      // ---- Solo admin puede crear admins ----
      if (rol === 'admin' && req.user?.rol !== 'admin') {
        return res.status(403).json({
          error: 'Solo un administrador puede crear otros administradores',
          codigo: 'SIN_PERMISO_ADMIN'
        });
      }

      // ---- Duplicado ----
      const existente = await verificarEmailDisponible(req.db, email);
      if (existente) {
        return res.status(409).json({
          error: 'El email ya está registrado',
          codigo: 'EMAIL_DUPLICADO',
          usuarioId: existente._id
        });
      }

      // ---- Persistir ----
      const hashedPassword = await bcrypt.hash(password, CONFIG.bcryptRounds);
      const ahora = new Date();

      const nuevoUsuario = {
        nombre,
        email,
        password: hashedPassword,
        rol,
        telefono,
        activo,
        password_changed_at: ahora,
        createdAt: ahora,
        updatedAt: ahora
      };

      let insertedId;
      try {
        const result = await req.db.collection(CONFIG.col).insertOne(nuevoUsuario);
        insertedId = result.insertedId;
      } catch (err) {
        // Race condition: otro request insertó el mismo email.
        if (err && err.code === 11000) {
          return res.status(409).json({
            error: 'El email ya está registrado',
            codigo: 'EMAIL_DUPLICADO'
          });
        }
        throw err;
      }

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.col,
        documentoId: insertedId,
        documentoNumero: email,
        datosNuevos: { nombre, email, rol, telefono, activo },
        detalle: `Usuario creado: ${email} (${rol})`
      });

      headersNoStore(res);
      return res.status(201).json(
        construirUsuarioPublico({ ...nuevoUsuario, _id: insertedId })
      );
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// PUT /:id  → actualizar
// ============================================================
router.put(
  '/:id',
  requierePermiso('usuarios', 'editar'),
  validadorId,
  validadorActualizar,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      const anterior = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!anterior) {
        return res.status(404).json({
          error: 'Usuario no encontrado',
          codigo: 'USUARIO_NOT_FOUND'
        });
      }

      // ---- Extraer campos enviados ----
      const nombreEnviado = req.body.nombre;
      const emailEnviado = req.body.email;
      const passwordEnviado = req.body.password;
      const rolEnviado = req.body.rol;
      const telefonoEnviado = req.body.telefono;
      const activoEnviado = req.body.activo;

      // ---- Reglas de autorización sobre admins ----
      const gestionaAdmin =
        (rolEnviado && rolEnviado === 'admin') ||
        anterior.rol === 'admin';

      if (gestionaAdmin && req.user?.rol !== 'admin') {
        return res.status(403).json({
          error: 'Solo un administrador puede gestionar administradores',
          codigo: 'SIN_PERMISO_ADMIN'
        });
      }

      // ---- Preparar update ----
      const updateData = { updatedAt: new Date() };

      if (nombreEnviado !== undefined) {
        updateData.nombre = normalizarTexto(nombreEnviado);
      }
      if (rolEnviado !== undefined) {
        updateData.rol = rolEnviado;
      }
      if (telefonoEnviado !== undefined) {
        updateData.telefono = normalizarTexto(telefonoEnviado);
      }
      if (activoEnviado !== undefined) {
        updateData.activo = toBool(activoEnviado, anterior.activo);
      }

      // ---- Email ----
      if (emailEnviado !== undefined) {
        const emailNorm = normalizarEmail(emailEnviado);
        if (emailNorm !== anterior.email) {
          const emailCheck = emailValido(emailNorm);
          if (!emailCheck.valido) {
            return res.status(400).json({
              error: emailCheck.mensaje,
              codigo: 'EMAIL_INVALIDO'
            });
          }
          const dup = await verificarEmailDisponible(req.db, emailNorm, { excluirId: _id });
          if (dup) {
            return res.status(409).json({
              error: 'El email ya está registrado',
              codigo: 'EMAIL_DUPLICADO',
              usuarioId: dup._id
            });
          }
          updateData.email = emailNorm;
        }
      }

      // ---- Password ----
      let passwordCambiada = false;
      if (passwordEnviado !== undefined && passwordEnviado !== '') {
        updateData.password = await bcrypt.hash(passwordEnviado, CONFIG.bcryptRounds);
        updateData.password_changed_at = new Date();
        passwordCambiada = true;
      }

      // ---- Protección del último admin activo ----
      const errorUltimoAdmin = await esUltimoAdminProtegido(req.db, _id, {
        nuevoRol: rolEnviado,
        nuevoActivo: activoEnviado !== undefined ? toBool(activoEnviado) : undefined
      });
      if (errorUltimoAdmin) {
        return res.status(409).json({
          error: errorUltimoAdmin,
          codigo: 'ULTIMO_ADMIN'
        });
      }

      // ---- Aplicar ----
      const result = await req.db.collection(CONFIG.col).updateOne(
        { _id },
        { $set: updateData }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({
          error: 'Usuario no encontrado',
          codigo: 'USUARIO_NOT_FOUND'
        });
      }

      // ---- Efectos secundarios ----
      invalidarCachePorUsuario(req.params.id);

      const quedoInactivo = updateData.activo === false;
      if ((quedoInactivo || passwordCambiada) && req.io) {
        desconectarSocketsDeUsuario(req.io, req.params.id);
      }

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.col,
        documentoId: anterior._id,
        documentoNumero: updateData.email || anterior.email,
        datosAnteriores: {
          nombre: anterior.nombre,
          email: anterior.email,
          rol: anterior.rol,
          telefono: anterior.telefono,
          activo: anterior.activo
        },
        datosNuevos: {
          nombre: updateData.nombre,
          email: updateData.email,
          rol: updateData.rol,
          telefono: updateData.telefono,
          activo: updateData.activo,
          passwordCambiada
        },
        detalle: `Usuario actualizado: ${updateData.email || anterior.email}${passwordCambiada ? ' (contraseña cambiada)' : ''}`
      });

      headersNoStore(res);
      return res.json({
        message: 'Usuario actualizado correctamente',
        passwordCambiada
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → eliminar
// ============================================================
router.delete(
  '/:id',
  requierePermiso('usuarios', 'eliminar'),
  validadorId,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      if (String(req.user.userId) === String(req.params.id)) {
        return res.status(400).json({
          error: 'No puede eliminar su propio usuario',
          codigo: 'AUTO_ELIMINACION'
        });
      }

      const anterior = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!anterior) {
        return res.status(404).json({
          error: 'Usuario no encontrado',
          codigo: 'USUARIO_NOT_FOUND'
        });
      }

      if (anterior.rol === 'admin' && req.user?.rol !== 'admin') {
        return res.status(403).json({
          error: 'Solo un administrador puede eliminar a otro administrador',
          codigo: 'SIN_PERMISO_ADMIN'
        });
      }

      // Protección del último admin (equivale a intentar "desactivarlo").
      const errorUltimoAdmin = await esUltimoAdminProtegido(req.db, _id, {
        nuevoActivo: false
      });
      if (errorUltimoAdmin) {
        return res.status(409).json({
          error: 'No puede eliminar al único administrador activo',
          codigo: 'ULTIMO_ADMIN'
        });
      }

      const result = await req.db.collection(CONFIG.col).deleteOne({ _id });
      if (result.deletedCount === 0) {
        return res.status(404).json({
          error: 'Usuario no encontrado',
          codigo: 'USUARIO_NOT_FOUND'
        });
      }

      invalidarCachePorUsuario(req.params.id);
      if (req.io) desconectarSocketsDeUsuario(req.io, req.params.id);

      await auditarSeguro(req.db, req, {
        accion: 'eliminar',
        coleccion: CONFIG.col,
        documentoId: anterior._id,
        documentoNumero: anterior.email,
        datosAnteriores: {
          nombre: anterior.nombre,
          email: anterior.email,
          rol: anterior.rol
        },
        detalle: `Usuario eliminado: ${anterior.email}`
      });

      headersNoStore(res);
      return res.json({ message: 'Usuario eliminado' });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// PATCH /:id/toggle-activo  → alternar activo
// ============================================================
router.patch(
  '/:id/toggle-activo',
  requierePermiso('usuarios', 'editar'),
  validadorId,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      if (String(req.user.userId) === String(req.params.id)) {
        return res.status(400).json({
          error: 'No puede desactivar su propio usuario',
          codigo: 'AUTO_DESACTIVACION'
        });
      }

      const user = await req.db.collection(CONFIG.col).findOne(
        { _id },
        { projection: { email: 1, rol: 1, activo: 1 } }
      );
      if (!user) {
        return res.status(404).json({
          error: 'Usuario no encontrado',
          codigo: 'USUARIO_NOT_FOUND'
        });
      }

      const nuevoEstado = !user.activo;

      // Protección del último admin activo.
      const errorUltimoAdmin = await esUltimoAdminProtegido(req.db, _id, {
        nuevoActivo: nuevoEstado
      });
      if (errorUltimoAdmin) {
        return res.status(409).json({
          error: 'No puede desactivar al único administrador activo',
          codigo: 'ULTIMO_ADMIN'
        });
      }

      const ahora = new Date();
      await req.db.collection(CONFIG.col).updateOne(
        { _id },
        { $set: { activo: nuevoEstado, updatedAt: ahora } }
      );

      invalidarCachePorUsuario(req.params.id);
      if (nuevoEstado === false && req.io) {
        desconectarSocketsDeUsuario(req.io, req.params.id);
      }

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.col,
        documentoId: user._id,
        documentoNumero: user.email,
        datosAnteriores: { activo: user.activo },
        datosNuevos: { activo: nuevoEstado },
        detalle: `Usuario ${nuevoEstado ? 'activado' : 'desactivado'}: ${user.email}`
      });

      headersNoStore(res);
      return res.json({ activo: nuevoEstado });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._construirUsuarioPublico = construirUsuarioPublico;
module.exports._verificarEmailDisponible = verificarEmailDisponible;
module.exports._esUltimoAdminProtegido = esUltimoAdminProtegido;
module.exports._desconectarSocketsDeUsuario = desconectarSocketsDeUsuario;
module.exports._emailValido = emailValido;
module.exports._toBool = toBool;