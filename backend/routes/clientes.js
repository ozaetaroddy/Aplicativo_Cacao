// backend/routes/clientes.js
// ============================================================
// Clientes — CRUD
// ------------------------------------------------------------
// Endpoints:
//   GET    /            → listado (con o sin paginación)
//   GET    /:id         → detalle
//   POST   /            → crear
//   PUT    /:id         → actualizar
//   DELETE /:id         → eliminar (bloqueado si tiene docs asociados)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`clientes:*`).
//   - Los errores se delegan al `errorHandler` central.
//   - Normalización: email lowercase, RUC/nombre/telefono trim.
//   - Duplicados detectados por `ruc` (índice único recomendado).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, param } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const {
  parsePagination,
  wantsPagination,
  parseSort,
  escapeRegex
} = require('../utils/pagination');
const { validar } = require('../utils/validacion');
const { validarIdentificacion, validarTelefono } = require('../utils/validators');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  col: 'clientes',
  colVentas: 'ventas_v2',
  colPagos: 'pagos',
  nombreMaxLen: 150,
  nombreMinLen: 2,
  direccionMaxLen: 300,
  emailMaxLen: 200,
  /** Límite para listado NO paginado (evita payloads enormes). */
  listadoMax: 2000,
  tiposValidos: Object.freeze(['persona', 'empresa'])
});

// Nombre con caracteres permitidos (letras, números, puntuación común).
const NOMBRE_REGEX = /^[\p{L}\p{N}\s.,'&()#°/+-]{2,150}$/u;
const TELEFONO_MSG = 'Teléfono inválido (09XXXXXXXX celular, 0XXXXXXXXX fijo)';

/** Proyección ligera para listados (evita campos grandes o innecesarios). */
const PROYECCION_LISTA = Object.freeze({
  nombre: 1,
  ruc: 1,
  telefono: 1,
  email: 1,
  direccion: 1,
  tipo: 1,
  createdAt: 1,
  updatedAt: 1
});

// ============================================================
// HELPERS
// ============================================================
function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Trim + colapso de espacios internos (sin tocar puntuación). */
function normalizarNombre(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ');
}

/** Trim simple. */
function normalizarTexto(texto) {
  return String(texto || '').trim();
}

/** Email: trim + lowercase. */
function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** RUC/Cédula: solo dígitos (quita espacios, guiones, puntos). */
function normalizarRuc(ruc) {
  return String(ruc || '').replace(/\D/g, '');
}

/** Teléfono: solo dígitos. */
function normalizarTelefono(tel) {
  return String(tel || '').replace(/\D/g, '');
}

/** Setea headers de cache seguros. */
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id) {
  if (!ObjectId.isValid(id)) {
    const err = new Error('ID inválido');
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar cliente');
  }
}

// ============================================================
// VALIDADORES (express-validator)
// ============================================================
const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

const validarCliente = [
  body('nombre')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ min: CONFIG.nombreMinLen, max: CONFIG.nombreMaxLen })
    .withMessage(`El nombre debe tener entre ${CONFIG.nombreMinLen} y ${CONFIG.nombreMaxLen} caracteres`)
    .matches(NOMBRE_REGEX).withMessage('El nombre contiene caracteres no permitidos'),

  body('ruc')
    .trim()
    .notEmpty().withMessage('El RUC/Cédula es obligatorio')
    .custom((value) => {
      const r = validarIdentificacion(value);
      if (!r.valido) throw new Error(r.mensaje || 'RUC/Cédula inválido');
      return true;
    }),

  body('telefono')
    .trim()
    .notEmpty().withMessage('El teléfono es obligatorio')
    .custom((value) => {
      const r = validarTelefono(value);
      if (!r.valido) throw new Error(TELEFONO_MSG);
      return true;
    }),

  body('email')
    .trim()
    .notEmpty().withMessage('El email es obligatorio')
    .isLength({ max: CONFIG.emailMaxLen })
    .withMessage(`El email no puede superar ${CONFIG.emailMaxLen} caracteres`)
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),

  body('direccion')
    .optional({ nullable: true })
    .isString().withMessage('Dirección debe ser texto')
    .trim()
    .isLength({ max: CONFIG.direccionMaxLen })
    .withMessage(`La dirección no puede superar ${CONFIG.direccionMaxLen} caracteres`),

  body('tipo')
    .optional()
    .isIn(CONFIG.tiposValidos)
    .withMessage(`Tipo debe ser: ${CONFIG.tiposValidos.join(' o ')}`)
];

// ============================================================
// GET /  → listado (con o sin paginación)
// ============================================================
router.get('/', requierePermiso('clientes', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = String(req.query.search || '').trim();

    const match = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { nombre: regex },
        { ruc: regex },
        { telefono: regex },
        { email: regex }
      ];
    }

    const sort = parseSort(req.query, { nombre: 1 });
    const coleccion = req.db.collection(CONFIG.col);

    // ---- Modo sin paginación (compatibilidad con el frontend actual) ----
    if (!paginar) {
      const clientes = await coleccion
        .find(match, { projection: PROYECCION_LISTA })
        .sort(sort)
        .limit(CONFIG.listadoMax)
        .toArray();

      headersNoStore(res);
      return res.json(clientes);
    }

    // ---- Modo paginado ----
    const [total, data] = await Promise.all([
      coleccion.countDocuments(match),
      coleccion
        .find(match, { projection: PROYECCION_LISTA })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    headersNoStore(res);
    return res.json({
      data,
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
router.get('/:id', requierePermiso('clientes', 'ver'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;
  try {
    const _id = new ObjectId(req.params.id);
    const cliente = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }
    return res.json(cliente);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /  → crear
// ============================================================
router.post('/', requierePermiso('clientes', 'crear'), validarCliente, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const nombre = normalizarNombre(req.body.nombre);
    const ruc = normalizarRuc(req.body.ruc);
    const telefono = normalizarTelefono(req.body.telefono);
    const email = normalizarEmail(req.body.email);
    const direccion = normalizarTexto(req.body.direccion);
    const tipo = req.body.tipo || 'persona';

    // Duplicado por RUC. Si existe índice único en `ruc`, el insert fallará
    // con E11000 → el errorHandler traduce a `DUPLICADO`.
    const existente = await req.db.collection(CONFIG.col).findOne(
      { ruc },
      { projection: { _id: 1, nombre: 1 } }
    );
    if (existente) {
      return res.status(409).json({
        error: `Ya existe un cliente con ese RUC: ${existente.nombre}`,
        codigo: 'CLIENTE_DUPLICADO',
        clienteId: existente._id
      });
    }

    const ahora = new Date();
    const nuevo = {
      nombre,
      ruc,
      telefono,
      email,
      direccion,
      tipo,
      createdAt: ahora,
      updatedAt: ahora
    };

    const result = await req.db.collection(CONFIG.col).insertOne(nuevo);

    await auditarSeguro(req.db, req, {
      accion: 'crear',
      coleccion: CONFIG.col,
      documentoId: result.insertedId,
      documentoNumero: ruc,
      datosNuevos: { nombre, ruc, telefono, email, direccion, tipo },
      detalle: `Cliente creado: ${nombre}`
    });

    return res.status(201).json({ _id: result.insertedId, ...nuevo });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// PUT /:id  → actualizar
// ============================================================
router.put('/:id', requierePermiso('clientes', 'editar'), validadorId, validarCliente, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const _id = new ObjectId(req.params.id);
    const nombre = normalizarNombre(req.body.nombre);
    const ruc = normalizarRuc(req.body.ruc);
    const telefono = normalizarTelefono(req.body.telefono);
    const email = normalizarEmail(req.body.email);
    const direccion = normalizarTexto(req.body.direccion);
    const tipo = req.body.tipo || 'persona';

    // Leer primero (para auditoría y para evitar updates innecesarios).
    const anterior = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!anterior) {
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }

    // No-op: si nada cambió, evitamos el update + audit.
    const sinCambios =
      anterior.nombre === nombre &&
      anterior.ruc === ruc &&
      anterior.telefono === telefono &&
      anterior.email === email &&
      (anterior.direccion || '') === direccion &&
      (anterior.tipo || 'persona') === tipo;

    if (sinCambios) {
      return res.json({ message: 'Sin cambios', cliente: anterior });
    }

    // Duplicado por RUC (excluyendo el propio id).
    if (ruc !== anterior.ruc) {
      const duplicado = await req.db.collection(CONFIG.col).findOne(
        { _id: { $ne: _id }, ruc },
        { projection: { _id: 1, nombre: 1 } }
      );
      if (duplicado) {
        return res.status(409).json({
          error: `Ya existe otro cliente con ese RUC: ${duplicado.nombre}`,
          codigo: 'CLIENTE_DUPLICADO',
          clienteId: duplicado._id
        });
      }
    }

    const update = {
      nombre,
      ruc,
      telefono,
      email,
      direccion,
      tipo,
      updatedAt: new Date()
    };

    const result = await req.db.collection(CONFIG.col).updateOne({ _id }, { $set: update });
    if (result.matchedCount === 0) {
      // Otra request lo eliminó entre el findOne y el updateOne.
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }

    await auditarSeguro(req.db, req, {
      accion: 'actualizar',
      coleccion: CONFIG.col,
      documentoId: anterior._id,
      documentoNumero: ruc,
      datosAnteriores: {
        nombre: anterior.nombre,
        ruc: anterior.ruc,
        telefono: anterior.telefono,
        email: anterior.email,
        direccion: anterior.direccion,
        tipo: anterior.tipo
      },
      datosNuevos: { nombre, ruc, telefono, email, direccion, tipo },
      detalle: `Cliente actualizado: ${nombre}`
    });

    return res.json({
      message: 'Cliente actualizado',
      cliente: { _id: anterior._id, ...update }
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// DELETE /:id  → eliminar (con guards de integridad)
// ============================================================
router.delete('/:id', requierePermiso('clientes', 'eliminar'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const _id = new ObjectId(req.params.id);

    const cliente = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }

    // Verificamos dependencias en paralelo (más rápido que secuencial).
    const [ventasAsociadas, pagosAsociados] = await Promise.all([
      req.db.collection(CONFIG.colVentas).countDocuments({ clienteId: _id }),
      req.db.collection(CONFIG.colPagos).countDocuments({ clienteId: _id, anulado: { $ne: true } })
    ]);

    if (ventasAsociadas > 0 || pagosAsociados > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: el cliente tiene ${ventasAsociadas} documento${ventasAsociadas === 1 ? '' : 's'} y ${pagosAsociados} pago${pagosAsociados === 1 ? '' : 's'} asociado${pagosAsociados === 1 ? '' : 's'}.`,
        codigo: 'CLIENTE_CON_DOCUMENTOS',
        ventasAsociadas,
        pagosAsociados
      });
    }

    const result = await req.db.collection(CONFIG.col).deleteOne({ _id });
    if (result.deletedCount === 0) {
      // Otra request lo eliminó entre el findOne y el deleteOne.
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }

    await auditarSeguro(req.db, req, {
      accion: 'eliminar',
      coleccion: CONFIG.col,
      documentoId: cliente._id,
      documentoNumero: cliente.ruc || '',
      datosAnteriores: {
        nombre: cliente.nombre,
        ruc: cliente.ruc,
        telefono: cliente.telefono,
        email: cliente.email
      },
      detalle: `Cliente eliminado: ${cliente.nombre || ''}`
    });

    return res.json({ message: 'Cliente eliminado' });
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
module.exports._NOMBRE_REGEX = NOMBRE_REGEX;
module.exports._normalizarNombre = normalizarNombre;
module.exports._normalizarEmail = normalizarEmail;
module.exports._normalizarRuc = normalizarRuc;
module.exports._normalizarTelefono = normalizarTelefono;