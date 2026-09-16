// backend/routes/productos.js
// ============================================================
// Productos — CRUD + códigos de barras + stock bajo
// ------------------------------------------------------------
// Endpoints:
//   GET    /stock/bajo              → productos en/bajo stock mínimo
//   GET    /barras/:codigo          → buscar por código de barras
//   GET    /                        → listado (con/sin paginación)
//   GET    /:id                     → detalle
//   POST   /                        → crear
//   PUT    /:id                     → actualizar (nunca toca stock)
//   DELETE /:id                     → eliminar (soft-delete si hay kardex)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`productos:*`).
//   - `stock` SOLO cambia vía kardex (no se acepta en POST/PUT).
//   - Duplicados: por `codigo`, `nombre` (case-insensitive) y
//     `codigo_barras`. Se previenen con pre-check + índices únicos.
//   - Errores delegados al `errorHandler` central.
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
const { TIPO_MEDIDA } = require('../data/catalogosSRI');
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
  col: 'productos',
  colKardex: 'kardex',

  nombreMaxLen: 200,
  nombreMinLen: 2,
  codigoMaxLen: 50,
  codigoMinLen: 1,
  descripcionMaxLen: 1000,
  observacionesMaxLen: 1000,
  codigoBarrasMaxLen: 100,
  unidadMedidaMaxLen: 50,
  fotoMaxLen: 500 * 1024, // 500 KB — suficiente para URL o data URL corto

  /** Máx. productos devueltos sin paginación. */
  maxSinPaginar: envNum('PRODUCTOS_MAX_SIN_PAGINAR', 5000),

  /** Máx. productos en /stock/bajo. */
  maxStockBajo: envNum('PRODUCTOS_MAX_STOCK_BAJO', 2000),

  /** Estados permitidos. */
  estados: Object.freeze(['activo', 'inactivo']),

  /** Tipos de medida permitidos (deriva de catálogo SRI). */
  tiposMedida: Object.freeze(TIPO_MEDIDA.map(t => t.codigo))
});

// ============================================================
// HELPERS
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Booleano tolerante: 'true'/'1'/true → true; 'false'/'0'/false → false. */
function toBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return Boolean(v);
}

/** Número finito o fallback. NO silencia negativos. */
function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Redondeo a 2 decimales. */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Valida ObjectId o lanza error tipado. */
function requireObjectId(id, mensaje = 'ID inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/** Trim + colapso de espacios internos. */
function normalizarNombre(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

/** Trim + uppercase para código (case-insensitive). */
function normalizarCodigo(s) {
  return String(s || '').trim().toUpperCase();
}

/** Trim simple. */
function normalizarTexto(s) {
  return String(s || '').trim();
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar producto');
  }
}

/** Proyección ligera para listados: excluye `foto` (puede ser base64). */
const PROYECCION_LISTA = Object.freeze({
  nombre: 1,
  codigo: 1,
  codigo_barras: 1,
  categoriaId: 1,
  descripcion: 1,
  precio_compra: 1,
  precio_venta: 1,
  stock: 1,
  stock_minimo: 1,
  unidad_medida: 1,
  tipo_medida: 1,
  aplica_iva: 1,
  estado: 1,
  createdAt: 1,
  updatedAt: 1
});

/** Normaliza un documento entrante a formato de BD (crear/editar). */
function construirDocumento(body, { paraCrear = false } = {}) {
  const nombre = normalizarNombre(body.nombre);
  const codigo = normalizarCodigo(body.codigo);
  const codigo_barras = normalizarTexto(body.codigo_barras);

  const doc = {
    nombre,
    nombreNorm: nombre.toLowerCase(),
    codigo,
    codigoNorm: codigo.toLowerCase(),
    categoriaId: body.categoriaId ? new ObjectId(body.categoriaId) : null,
    descripcion: normalizarTexto(body.descripcion),
    precio_compra: toNumber(body.precio_compra),
    precio_venta: toNumber(body.precio_venta),
    stock_minimo: toNumber(body.stock_minimo),
    unidad_medida: normalizarTexto(body.unidad_medida) || 'unidad',
    tipo_medida: normalizarTexto(body.tipo_medida) || 'unidad',
    codigo_barras,
    codigoBarrasNorm: codigo_barras.toLowerCase(),
    foto: normalizarTexto(body.foto),
    observaciones: normalizarTexto(body.observaciones),
    aplica_iva: body.aplica_iva !== undefined ? toBool(body.aplica_iva, true) : true,
    updatedAt: new Date()
  };

  if (paraCrear) {
    doc.stock = 0;           // solo se modifica vía kardex
    doc.estado = 'activo';
    doc.createdAt = doc.updatedAt;
  }

  return doc;
}

// ============================================================
// VALIDADORES
// ============================================================
const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

/** Valida un string opcional con longitud máxima. */
function validadorTextoOpcional(campo, maxLen, etiqueta = campo) {
  return body(campo)
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage(`${etiqueta} debe ser texto`)
    .trim()
    .isLength({ max: maxLen })
    .withMessage(`${etiqueta} no puede superar ${maxLen} caracteres`);
}

const validarProducto = [
  body('nombre')
    .exists({ checkFalsy: true }).withMessage('Nombre obligatorio')
    .isString().withMessage('Nombre debe ser texto')
    .trim()
    .isLength({ min: CONFIG.nombreMinLen, max: CONFIG.nombreMaxLen })
    .withMessage(`Nombre debe tener entre ${CONFIG.nombreMinLen} y ${CONFIG.nombreMaxLen} caracteres`),

  body('codigo')
    .exists({ checkFalsy: true }).withMessage('Código obligatorio')
    .isString().withMessage('Código debe ser texto')
    .trim()
    .isLength({ min: CONFIG.codigoMinLen, max: CONFIG.codigoMaxLen })
    .withMessage(`Código debe tener entre ${CONFIG.codigoMinLen} y ${CONFIG.codigoMaxLen} caracteres`),

  body('precio_venta')
    .exists().withMessage('Precio de venta obligatorio')
    .isFloat({ min: 0 }).withMessage('Precio de venta debe ser número >= 0'),

  body('precio_compra')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Precio de compra debe ser número >= 0'),

  body('stock_minimo')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Stock mínimo debe ser número >= 0'),

  body('categoriaId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('categoriaId inválido'),

  body('tipo_medida')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(CONFIG.tiposMedida)
    .withMessage(`tipo_medida inválido. Válidos: ${CONFIG.tiposMedida.join(', ')}`),

  body('aplica_iva')
    .optional()
    .custom(v => {
      const ok = typeof v === 'boolean' || v === 'true' || v === 'false' ||
                 v === '1' || v === '0' || v === 1 || v === 0;
      if (!ok) throw new Error('aplica_iva debe ser booleano');
      return true;
    }),

  validadorTextoOpcional('descripcion', CONFIG.descripcionMaxLen, 'Descripción'),
  validadorTextoOpcional('observaciones', CONFIG.observacionesMaxLen, 'Observaciones'),
  validadorTextoOpcional('unidad_medida', CONFIG.unidadMedidaMaxLen, 'Unidad de medida'),
  validadorTextoOpcional('codigo_barras', CONFIG.codigoBarrasMaxLen, 'Código de barras'),
  validadorTextoOpcional('foto', CONFIG.fotoMaxLen, 'Foto')
];

// ============================================================
// GET /stock/bajo
// ============================================================
router.get('/stock/bajo', requierePermiso('productos', 'ver'), async (req, res, next) => {
  try {
    const productos = await req.db.collection(CONFIG.col)
      .find(
        {
          estado: { $ne: 'inactivo' },
          stock_minimo: { $gt: 0 },
          $expr: { $lte: ['$stock', '$stock_minimo'] }
        },
        { projection: PROYECCION_LISTA }
      )
      .sort({ stock: 1 })
      .limit(CONFIG.maxStockBajo)
      .toArray();

    headersNoStore(res);
    return res.json(productos);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /barras/:codigo
// ============================================================
router.get('/barras/:codigo', requierePermiso('productos', 'ver'), async (req, res, next) => {
  try {
    const codigo = normalizarTexto(req.params.codigo);
    if (!codigo) {
      return res.status(400).json({
        error: 'Código requerido',
        codigo: 'CODIGO_REQUERIDO'
      });
    }

    const producto = await req.db.collection(CONFIG.col).findOne({
      codigoBarrasNorm: codigo.toLowerCase()
    });

    if (!producto) {
      return res.status(404).json({
        error: 'Producto no encontrado',
        codigo: 'PRODUCTO_NOT_FOUND'
      });
    }

    headersNoStore(res);
    return res.json(producto);
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /  → listado
// ============================================================
router.get('/', requierePermiso('productos', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (soloString(req.query.search) || '').trim();
    const categoriaId = soloString(req.query.categoriaId);
    const estado = soloString(req.query.estado);

    const match = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { nombre: regex },
        { codigo: regex },
        { codigo_barras: regex }
      ];
    }
    if (categoriaId && ObjectId.isValid(categoriaId)) {
      match.categoriaId = new ObjectId(categoriaId);
    }
    if (estado && CONFIG.estados.includes(estado)) {
      match.estado = estado;
    }

    const sort = parseSort(req.query, { nombre: 1 });
    const col = req.db.collection(CONFIG.col);

    // ---- Sin paginación (compatibilidad legacy) ----
    if (!paginar) {
      const productos = await col
        .find(match, { projection: PROYECCION_LISTA })
        .sort(sort)
        .limit(CONFIG.maxSinPaginar)
        .toArray();

      headersNoStore(res);
      return res.json(productos);
    }

    // ---- Paginado ----
    const [total, data] = await Promise.all([
      col.countDocuments(match),
      col.find(match, { projection: PROYECCION_LISTA })
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
router.get(
  '/:id',
  requierePermiso('productos', 'ver'),
  validadorId,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);
      const producto = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!producto) {
        return res.status(404).json({
          error: 'Producto no encontrado',
          codigo: 'PRODUCTO_NOT_FOUND'
        });
      }

      headersNoStore(res);
      return res.json(producto);
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// POST /  → crear
// ============================================================
router.post(
  '/',
  requierePermiso('productos', 'crear'),
  validarProducto,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const doc = construirDocumento(req.body, { paraCrear: true });

      // Pre-check de duplicados (mejor UX que esperar al E11000).
      const dupFiltros = [
        { codigoNorm: doc.codigoNorm },
        { nombreNorm: doc.nombreNorm }
      ];
      if (doc.codigo_barras) dupFiltros.push({ codigoBarrasNorm: doc.codigoBarrasNorm });

      const existente = await req.db.collection(CONFIG.col).findOne(
        { $or: dupFiltros },
        { projection: { _id: 1, nombre: 1, codigo: 1, codigo_barras: 1 } }
      );

      if (existente) {
        const esCodigoBarras = doc.codigo_barras &&
          existente.codigo_barras &&
          existente.codigo_barras.toLowerCase() === doc.codigoBarrasNorm;

        return res.status(409).json({
          error: esCodigoBarras
            ? 'Ya existe un producto con ese código de barras'
            : 'Ya existe un producto con ese código o nombre',
          codigo: esCodigoBarras ? 'CODIGO_BARRAS_DUPLICADO' : 'PRODUCTO_DUPLICADO',
          productoId: existente._id,
          productoNombre: existente.nombre
        });
      }

      let insertedId;
      try {
        const result = await req.db.collection(CONFIG.col).insertOne(doc);
        insertedId = result.insertedId;
      } catch (err) {
        // Race condition: alguien insertó lo mismo entre pre-check e insert.
        if (err && err.code === 11000) {
          const campo = Object.keys(err.keyPattern || {})[0] || 'campo';
          return res.status(409).json({
            error: `Ya existe un producto con ese ${campo}`,
            codigo: 'PRODUCTO_DUPLICADO'
          });
        }
        throw err;
      }

      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.col,
        documentoId: insertedId,
        documentoNumero: doc.codigo,
        datosNuevos: { ...doc, _id: insertedId },
        detalle: `Producto creado: ${doc.nombre}`
      });

      headersNoStore(res);
      return res.status(201).json({ ...doc, _id: insertedId });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// PUT /:id  → actualizar
// ------------------------------------------------------------
// ⚠️  `stock` NO se modifica aquí (solo vía kardex/ajustes).
// ============================================================
router.put(
  '/:id',
  requierePermiso('productos', 'editar'),
  validadorId,
  validarProducto,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      const anterior = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!anterior) {
        return res.status(404).json({
          error: 'Producto no encontrado',
          codigo: 'PRODUCTO_NOT_FOUND'
        });
      }

      const update = construirDocumento(req.body);

      // Pre-check duplicados excluyendo el propio _id.
      const dupFiltros = [
        { codigoNorm: update.codigoNorm },
        { nombreNorm: update.nombreNorm }
      ];
      if (update.codigo_barras) {
        dupFiltros.push({ codigoBarrasNorm: update.codigoBarrasNorm });
      }

      const duplicado = await req.db.collection(CONFIG.col).findOne(
        { _id: { $ne: _id }, $or: dupFiltros },
        { projection: { _id: 1, nombre: 1, codigo: 1, codigo_barras: 1 } }
      );

      if (duplicado) {
        const esCodigoBarras = update.codigo_barras &&
          duplicado.codigo_barras &&
          duplicado.codigo_barras.toLowerCase() === update.codigoBarrasNorm;

        return res.status(409).json({
          error: esCodigoBarras
            ? 'Ya existe otro producto con ese código de barras'
            : 'Ya existe otro producto con ese código o nombre',
          codigo: esCodigoBarras ? 'CODIGO_BARRAS_DUPLICADO' : 'PRODUCTO_DUPLICADO',
          productoId: duplicado._id,
          productoNombre: duplicado.nombre
        });
      }

      // `$set` sin `stock`/`estado`/`createdAt`: preservados del doc original.
      const result = await req.db.collection(CONFIG.col).updateOne(
        { _id },
        { $set: update }
      );

      if (result.matchedCount === 0) {
        // Otra request lo eliminó entre el findOne y el updateOne.
        return res.status(404).json({
          error: 'Producto no encontrado',
          codigo: 'PRODUCTO_NOT_FOUND'
        });
      }

      await auditarSeguro(req.db, req, {
        accion: 'actualizar',
        coleccion: CONFIG.col,
        documentoId: anterior._id,
        documentoNumero: update.codigo,
        datosAnteriores: anterior,
        datosNuevos: update,
        detalle: `Producto actualizado: ${update.nombre}`
      });

      headersNoStore(res);
      return res.json({
        message: 'Producto actualizado',
        producto: { ...anterior, ...update }
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → eliminar (soft si tiene kardex)
// ============================================================
router.delete(
  '/:id',
  requierePermiso('productos', 'eliminar'),
  validadorId,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      const anterior = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!anterior) {
        return res.status(404).json({
          error: 'Producto no encontrado',
          codigo: 'PRODUCTO_NOT_FOUND'
        });
      }

      const movimientos = await req.db.collection(CONFIG.colKardex)
        .countDocuments({ productoId: _id });

      // ---- Con historial → soft delete ----
      if (movimientos > 0) {
        // Idempotente: si ya estaba inactivo, no re-auditamos.
        if (anterior.estado === 'inactivo') {
          return res.json({
            message: 'El producto ya estaba desactivado',
            softDeleted: true,
            yaInactivo: true
          });
        }

        await req.db.collection(CONFIG.col).updateOne(
          { _id },
          { $set: { estado: 'inactivo', updatedAt: new Date() } }
        );

        await auditarSeguro(req.db, req, {
          accion: 'desactivar',
          coleccion: CONFIG.col,
          documentoId: anterior._id,
          documentoNumero: anterior.codigo || '',
          datosAnteriores: anterior,
          datosNuevos: { estado: 'inactivo' },
          detalle: `Producto desactivado (${movimientos} movimientos): ${anterior.nombre}`
        });

        headersNoStore(res);
        return res.json({
          message: 'Producto desactivado (conserva historial)',
          softDeleted: true,
          movimientos
        });
      }

      // ---- Sin historial → hard delete ----
      const r = await req.db.collection(CONFIG.col).deleteOne({ _id });
      if (r.deletedCount === 0) {
        return res.status(404).json({
          error: 'Producto no encontrado',
          codigo: 'PRODUCTO_NOT_FOUND'
        });
      }

      await auditarSeguro(req.db, req, {
        accion: 'eliminar',
        coleccion: CONFIG.col,
        documentoId: anterior._id,
        documentoNumero: anterior.codigo || '',
        datosAnteriores: anterior,
        detalle: `Producto eliminado: ${anterior.nombre || ''}`
      });

      headersNoStore(res);
      return res.json({
        message: 'Producto eliminado',
        softDeleted: false
      });
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
module.exports._PROYECCION_LISTA = PROYECCION_LISTA;
module.exports._construirDocumento = construirDocumento;
module.exports._normalizarNombre = normalizarNombre;
module.exports._normalizarCodigo = normalizarCodigo;
module.exports._toBool = toBool;
module.exports._toNumber = toNumber;
module.exports._round2 = round2;