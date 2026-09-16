// backend/routes/proveedores.js
// ============================================================
// Proveedores — CRUD
// ------------------------------------------------------------
// Endpoints:
//   GET    /            → listado (con o sin paginación)
//   GET    /:id         → detalle
//   POST   /            → crear
//   PUT    /:id         → actualizar
//   DELETE /:id         → eliminar (bloqueado si tiene docs asociados)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`proveedores:*`).
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
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONFIG = Object.freeze({
  col: 'proveedores',
  colCompras: 'compras_v2',
  colPagos: 'pagos',

  nombreMaxLen: 150,
  nombreMinLen: 2,
  direccionMaxLen: 300,
  emailMaxLen: 200,

  /** Máx. proveedores devueltos sin paginación. */
  maxSinPaginar: envNum('PROVEEDORES_MAX_SIN_PAGINAR', 2000),

  /** Tipos válidos (reservado para futura extensión). */
  tiposValidos: Object.freeze(['persona', 'empresa'])
});

// Nombre con caracteres permitidos (letras, números, puntuación común).
const NOMBRE_REGEX = /^[\p{L}\p{N}\s.,'&()#°/+-]{2,150}$/u;
const TELEFONO_MSG = 'Teléfono inválido (09XXXXXXXX celular, 0XXXXXXXXX fijo)';

/** Proyección ligera para listados. */
const PROYECCION_LISTA = Object.freeze({
  nombre: 1,
  ruc: 1,
  telefono: 1,
  email: 1,
  direccion: 1,
  createdAt: 1,
  updatedAt: 1
});

// ============================================================
// HELPERS
// ============================================================
function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function soloString(v) {
  return typeof v === 'string' ? v : undefined;
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

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar proveedor');
  }
}

// ============================================================
// VALIDADORES (express-validator)
// ============================================================
const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

const validarProveedor = [
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
    .withMessage(`La dirección no puede superar ${CONFIG.direccionMaxLen} caracteres`)
];

// ============================================================
// GET /  → listado (con o sin paginación)
// ============================================================
router.get('/', requierePermiso('proveedores', 'ver'), async (req, res, next) => {
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
      const proveedores = await coleccion
        .find(match, { projection: PROYECCION_LISTA })
        .sort(sort)
        .limit(CONFIG.maxSinPaginar)
        .toArray();

      headersNoStore(res);
      return res.json(proveedores);
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
router.get('/:id', requierePermiso('proveedores', 'ver'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const _id = new ObjectId(req.params.id);
    const proveedor = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!proveedor) {
      return res.status(404).json({
        error: 'Proveedor no encontrado',
        codigo: 'PROVEEDOR_NOT_FOUND'
      });
    }

    headersNoStore(res);
    return res.json(proveedor);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /  → crear
// ============================================================
router.post('/', requierePermiso('proveedores', 'crear'), validarProveedor, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const nombre = normalizarNombre(req.body.nombre);
    const ruc = normalizarRuc(req.body.ruc);
    const telefono = normalizarTelefono(req.body.telefono);
    const email = normalizarEmail(req.body.email);
    const direccion = normalizarTexto(req.body.direccion);

    // Duplicado por RUC. Si existe índice único en `ruc`, el insert
    // fallará con E11000 → el errorHandler lo traduce a `DUPLICADO`.
    const existente = await req.db.collection(CONFIG.col).findOne(
      { ruc },
      { projection: { _id: 1, nombre: 1 } }
    );
    if (existente) {
      return res.status(409).json({
        error: `Ya existe un proveedor con ese RUC: ${existente.nombre}`,
        codigo: 'PROVEEDOR_DUPLICADO',
        proveedorId: existente._id
      });
    }

    const ahora = new Date();
    const nuevo = {
      nombre,
      ruc,
      telefono,
      email,
      direccion,
      createdAt: ahora,
      updatedAt: ahora
    };

    let insertedId;
    try {
      const result = await req.db.collection(CONFIG.col).insertOne(nuevo);
      insertedId = result.insertedId;
    } catch (err) {
      // Race condition: alguien insertó el mismo RUC entre el pre-check y el insert.
      if (err && err.code === 11000) {
        return res.status(409).json({
          error: 'Ya existe un proveedor con ese RUC',
          codigo: 'PROVEEDOR_DUPLICADO'
        });
      }
      throw err;
    }

    await auditarSeguro(req.db, req, {
      accion: 'crear',
      coleccion: CONFIG.col,
      documentoId: insertedId,
      documentoNumero: ruc,
      datosNuevos: { nombre, ruc, telefono, email, direccion },
      detalle: `Proveedor creado: ${nombre}`
    });

    headersNoStore(res);
    return res.status(201).json({ _id: insertedId, ...nuevo });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// PUT /:id  → actualizar
// ============================================================
router.put(
  '/:id',
  requierePermiso('proveedores', 'editar'),
  validadorId,
  validarProveedor,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      const nombre = normalizarNombre(req.body.nombre);
      const ruc = normalizarRuc(req.body.ruc);
      const telefono = normalizarTelefono(req.body.telefono);
      const email = normalizarEmail(req.body.email);
      const direccion = normalizarTexto(req.body.direccion);

      const anterior = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!anterior) {
        return res.status(404).json({
          error: 'Proveedor no encontrado',
          codigo: 'PROVEEDOR_NOT_FOUND'
        });
      }

      // No-op: si nada cambió, evitamos el update + audit.
      const sinCambios =
        anterior.nombre === nombre &&
        anterior.ruc === ruc &&
        anterior.telefono === telefono &&
        anterior.email === email &&
        (anterior.direccion || '') === direccion;

      if (sinCambios) {
        return res.json({ message: 'Sin cambios', proveedor: anterior });
      }

      // Duplicado por RUC (excluyendo el propio id).
      if (ruc !== anterior.ruc) {
        const duplicado = await req.db.collection(CONFIG.col).findOne(
          { _id: { $ne: _id }, ruc },
          { projection: { _id: 1, nombre: 1 } }
        );
        if (duplicado) {
          return res.status(409).json({
            error: `Ya existe otro proveedor con ese RUC: ${duplicado.nombre}`,
            codigo: 'PROVEEDOR_DUPLICADO',
            proveedorId: duplicado._id
          });
        }
      }

      const update = {
        nombre,
        ruc,
        telefono,
        email,
        direccion,
        updatedAt: new Date()
      };

      const result = await req.db.collection(CONFIG.col).updateOne(
        { _id },
        { $set: update }
      );

      if (result.matchedCount === 0) {
        // Otra request lo eliminó entre el findOne y el updateOne.
        return res.status(404).json({
          error: 'Proveedor no encontrado',
          codigo: 'PROVEEDOR_NOT_FOUND'
        });
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
          direccion: anterior.direccion
        },
        datosNuevos: { nombre, ruc, telefono, email, direccion },
        detalle: `Proveedor actualizado: ${nombre}`
      });

      headersNoStore(res);
      return res.json({
        message: 'Proveedor actualizado',
        proveedor: { _id: anterior._id, ...update }
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → eliminar (con guards de integridad)
// ============================================================
router.delete('/:id', requierePermiso('proveedores', 'eliminar'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const _id = new ObjectId(req.params.id);

    const proveedor = await req.db.collection(CONFIG.col).findOne({ _id });
    if (!proveedor) {
      return res.status(404).json({
        error: 'Proveedor no encontrado',
        codigo: 'PROVEEDOR_NOT_FOUND'
      });
    }

    // Verificamos dependencias en paralelo.
    const [comprasAsociadas, pagosAsociados] = await Promise.all([
      req.db.collection(CONFIG.colCompras).countDocuments({ proveedorId: _id }),
      req.db.collection(CONFIG.colPagos).countDocuments({
        proveedorId: _id,
        anulado: { $ne: true }
      })
    ]);

    if (comprasAsociadas > 0 || pagosAsociados > 0) {
      return res.status(409).json({
        error:
          `No se puede eliminar: el proveedor tiene ${comprasAsociadas} ` +
          `compra${comprasAsociadas === 1 ? '' : 's'} y ${pagosAsociados} ` +
          `pago${pagosAsociados === 1 ? '' : 's'} asociado${pagosAsociados === 1 ? '' : 's'}.`,
        codigo: 'PROVEEDOR_CON_DOCUMENTOS',
        comprasAsociadas,
        pagosAsociados
      });
    }

    const result = await req.db.collection(CONFIG.col).deleteOne({ _id });
    if (result.deletedCount === 0) {
      // Otra request lo eliminó entre el findOne y el deleteOne.
      return res.status(404).json({
        error: 'Proveedor no encontrado',
        codigo: 'PROVEEDOR_NOT_FOUND'
      });
    }

    await auditarSeguro(req.db, req, {
      accion: 'eliminar',
      coleccion: CONFIG.col,
      documentoId: proveedor._id,
      documentoNumero: proveedor.ruc || '',
      datosAnteriores: {
        nombre: proveedor.nombre,
        ruc: proveedor.ruc,
        telefono: proveedor.telefono,
        email: proveedor.email
      },
      detalle: `Proveedor eliminado: ${proveedor.nombre || ''}`
    });

    headersNoStore(res);
    return res.json({ message: 'Proveedor eliminado' });
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
module.exports._PROYECCION_LISTA = PROYECCION_LISTA;
module.exports._normalizarNombre = normalizarNombre;
module.exports._normalizarEmail = normalizarEmail;
module.exports._normalizarRuc = normalizarRuc;
module.exports._normalizarTelefono = normalizarTelefono;
module.exports._normalizarTexto = normalizarTexto;
module.exports._esStringNoVacio = esStringNoVacio;