// backend/routes/categorias.js
// ============================================================
// Categorías — CRUD
// ------------------------------------------------------------
// Endpoints:
//   GET    /            → listado (con conteo de productos)
//   GET    /:id         → detalle
//   POST   /            → crear
//   PUT    /:id         → actualizar
//   DELETE /:id         → eliminar (bloqueado si tiene productos)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`categorias:*`).
//   - Los errores se delegan al `errorHandler` central.
//   - Nombres normalizados (trim + colapso de espacios).
//   - Duplicados detectados con índice único case-insensitive (`nombreNorm`).
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, param } = require('express-validator');
const { logAudit } = require('../utils/audit');
const { requierePermiso } = require('../utils/permisos');
const { validar } = require('../utils/validacion');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  colCategorias: 'categorias',
  colProductos: 'productos',
  nombreMaxLen: 100,
  descripcionMaxLen: 500,
  /** Límite de categorías devueltas por defecto (evita payloads enormes). */
  listadoMax: 500
});

// ============================================================
// HELPERS
// ============================================================

/** Valida y convierte un id a ObjectId; lanza error tipado si inválido. */
function requireObjectId(id) {
  if (!ObjectId.isValid(id)) {
    const err = new Error('ID inválido');
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/**
 * Normaliza un nombre: trim + colapsa espacios internos.
 * @example normalizarNombre('  Bebidas   Frías  ') → 'Bebidas Frías'
 */
function normalizarNombre(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ');
}

/** Normaliza un texto libre: trim (sin colapsar). */
function normalizarTexto(texto) {
  return String(texto || '').trim();
}

/** Proyección ligera para no devolver todo el doc en listados masivos. */
const PROYECCION_LISTA = Object.freeze({
  nombre: 1,
  descripcion: 1,
  createdAt: 1,
  updatedAt: 1
});

/** Auditoría que nunca rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar categoría');
  }
}

/**
 * Añade `productosCount` a cada categoría usando un solo aggregate.
 * Devuelve un nuevo array (no muta la entrada).
 */
async function conConteoProductos(db, categorias) {
  if (categorias.length === 0) return [];

  const ids = categorias.map(c => c._id);
  const conteos = await db.collection(CONFIG.colProductos).aggregate([
    { $match: { categoriaId: { $in: ids } } },
    { $group: { _id: '$categoriaId', cantidad: { $sum: 1 } } }
  ]).toArray();

  const mapa = new Map();
  for (const c of conteos) {
    if (c._id) mapa.set(String(c._id), c.cantidad);
  }

  return categorias.map(c => ({
    ...c,
    productosCount: mapa.get(String(c._id)) || 0
  }));
}

// ============================================================
// VALIDADORES REUTILIZABLES
// ============================================================
const validadorNombre = body('nombre')
  .trim()
  .notEmpty().withMessage('Nombre obligatorio')
  .isLength({ max: CONFIG.nombreMaxLen })
  .withMessage(`El nombre no puede superar ${CONFIG.nombreMaxLen} caracteres`);

const validadorDescripcion = body('descripcion')
  .optional({ nullable: true })
  .isString().withMessage('Descripción debe ser texto')
  .trim()
  .isLength({ max: CONFIG.descripcionMaxLen })
  .withMessage(`La descripción no puede superar ${CONFIG.descripcionMaxLen} caracteres`);

const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

// ============================================================
// GET /  → listado con conteo de productos
// ============================================================
router.get('/', requierePermiso('categorias', 'ver'), async (req, res, next) => {
  try {
    const categorias = await req.db.collection(CONFIG.colCategorias)
      .find({}, { projection: PROYECCION_LISTA })
      .sort({ nombre: 1 })
      .limit(CONFIG.listadoMax)
      .toArray();

    const conConteo = await conConteoProductos(req.db, categorias);

    res.set('Cache-Control', 'private, max-age=30');
    return res.json(conConteo);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /:id  → detalle
// ============================================================
router.get('/:id', requierePermiso('categorias', 'ver'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;
  try {
    const _id = new ObjectId(req.params.id);
    const categoria = await req.db.collection(CONFIG.colCategorias).findOne({ _id });
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada', codigo: 'CATEGORIA_NOT_FOUND' });
    }
    return res.json(categoria);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// POST /  → crear
// ============================================================
router.post(
  '/',
  requierePermiso('categorias', 'crear'),
  validadorNombre,
  validadorDescripcion,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const nombre = normalizarNombre(req.body.nombre);
      const descripcion = normalizarTexto(req.body.descripcion);
      const nombreNorm = nombre.toLowerCase();

      // Duplicado (case-insensitive). Si existe índice único en nombreNorm,
      // el insert fallará con E11000 → el errorHandler lo traduce.
      const existente = await req.db.collection(CONFIG.colCategorias).findOne(
        { nombreNorm },
        { projection: { _id: 1, nombre: 1 } }
      );
      if (existente) {
        return res.status(409).json({
          error: `Ya existe una categoría con el nombre "${existente.nombre}"`,
          codigo: 'CATEGORIA_DUPLICADA',
          categoriaId: existente._id
        });
      }

      const ahora = new Date();
      const nueva = {
        nombre,
        nombreNorm,                    // clave para índice único
        descripcion,
        createdAt: ahora,
        updatedAt: ahora
      };

      const result = await req.db.collection(CONFIG.colCategorias).insertOne(nueva);

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.colCategorias,
        documentoId: result.insertedId,
        documentoNumero: nueva.nombre,
        datosNuevos: { nombre, descripcion },
        detalle: `Categoría creada: ${nueva.nombre}`
      });

      return res.status(201).json({ _id: result.insertedId, ...nueva });
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
  requierePermiso('categorias', 'editar'),
  validadorId,
  validadorNombre,
  validadorDescripcion,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);
      const nombre = normalizarNombre(req.body.nombre);
      const descripcion = normalizarTexto(req.body.descripcion);
      const nombreNorm = nombre.toLowerCase();

      // Leer primero para tener los datos anteriores en auditoría.
      const anterior = await req.db.collection(CONFIG.colCategorias).findOne({ _id });
      if (!anterior) {
        return res.status(404).json({ error: 'Categoría no encontrada', codigo: 'CATEGORIA_NOT_FOUND' });
      }

      // No-op: nada cambió → evita update + audit innecesarios.
      const sinCambios =
        anterior.nombre === nombre && (anterior.descripcion || '') === descripcion;
      if (sinCambios) {
        return res.json({ message: 'Sin cambios', categoria: anterior });
      }

      // Duplicado excluyendo el propio id.
      const duplicado = await req.db.collection(CONFIG.colCategorias).findOne(
        { _id: { $ne: _id }, nombreNorm },
        { projection: { _id: 1, nombre: 1 } }
      );
      if (duplicado) {
        return res.status(409).json({
          error: `Ya existe otra categoría con el nombre "${duplicado.nombre}"`,
          codigo: 'CATEGORIA_DUPLICADA',
          categoriaId: duplicado._id
        });
      }

      const update = {
        nombre,
        nombreNorm,
        descripcion,
        updatedAt: new Date()
      };

      await req.db.collection(CONFIG.colCategorias).updateOne({ _id }, { $set: update });

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.colCategorias,
        documentoId: anterior._id,
        documentoNumero: nombre,
        datosAnteriores: { nombre: anterior.nombre, descripcion: anterior.descripcion },
        datosNuevos: { nombre, descripcion },
        detalle: `Categoría actualizada: ${nombre}`
      });

      return res.json({
        message: 'Categoría actualizada',
        categoria: { _id: anterior._id, ...update }
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → eliminar (bloquea si tiene productos)
// ============================================================
router.delete('/:id', requierePermiso('categorias', 'eliminar'), validadorId, async (req, res, next) => {
  if (validar(req, res)) return;

  try {
    const _id = new ObjectId(req.params.id);

    const categoria = await req.db.collection(CONFIG.colCategorias).findOne({ _id });
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada', codigo: 'CATEGORIA_NOT_FOUND' });
    }

    const productosAsociados = await req.db.collection(CONFIG.colProductos)
      .countDocuments({ categoriaId: _id });

    if (productosAsociados > 0) {
      return res.status(409).json({
        error: `No se puede eliminar. Hay ${productosAsociados} producto${productosAsociados === 1 ? '' : 's'} en esta categoría.`,
        codigo: 'CATEGORIA_CON_PRODUCTOS',
        productosAsociados
      });
    }

    const r = await req.db.collection(CONFIG.colCategorias).deleteOne({ _id });
    if (r.deletedCount === 0) {
      // Otra request lo borró entre el findOne y el deleteOne.
      return res.status(404).json({ error: 'Categoría no encontrada', codigo: 'CATEGORIA_NOT_FOUND' });
    }

    await auditarSeguro(req.db, req, {
      accion: 'eliminar',
      coleccion: CONFIG.colCategorias,
      documentoId: categoria._id,
      documentoNumero: categoria.nombre || '',
      datosAnteriores: { nombre: categoria.nombre, descripcion: categoria.descripcion },
      detalle: `Categoría eliminada: ${categoria.nombre || ''}`
    });

    return res.json({ message: 'Categoría eliminada' });
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
module.exports._normalizarNombre = normalizarNombre;
module.exports._normalizarTexto = normalizarTexto;
module.exports._conConteoProductos = conConteoProductos;