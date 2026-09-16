// backend/routes/retenciones.js
// ============================================================
// Retenciones — comprobantes recibidos de proveedores
// ------------------------------------------------------------
// Endpoints:
//   GET    /            → listado (con o sin paginación)
//   POST   /            → crear retención
//   DELETE /:id         → eliminar
//
// Convenciones:
//   - Todas las rutas requieren permisos (`retenciones:*`).
//   - Al crear con `compraId`, se valida que la compra exista
//     y que pertenezca al mismo proveedor (evita huérfanas).
//   - Si se envía `tipo_retencion`, se valida contra el catálogo
//     oficial del SRI (`TIPO_RETENCION`).
//   - Se previene duplicado lógico:
//     mismo (compraId, tipo_retencion, impuesto_retencion) activo.
//   - Los errores se delegan al `errorHandler` central.
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
const { buscarRetencion } = require('../data/catalogosSRI');
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
  col: 'retenciones',
  colCompras: 'compras_v2',
  colProveedores: 'proveedores',

  /** Máx. retenciones devueltas sin paginación. */
  maxSinPaginar: envNum('RETENCIONES_MAX_SIN_PAGINAR', 5000),

  numeroFacturaMaxLen: 50,
  observacionesMaxLen: 1000,

  /** Tipos de retención permitidos. */
  tipos: Object.freeze(['manual', 'automatica']),

  /** Proyección mínima del proveedor en el `$lookup`. */
  proyeccionProveedor: Object.freeze({
    nombre: 1, ruc: 1, telefono: 1, email: 1
  })
});

// ============================================================
// HELPERS
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Número finito o fallback. NO silencia negativos. */
function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Redondeo a 2 decimales (evita drift por EPSILON). */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Parsea fecha ISO/`YYYY-MM-DD`; devuelve `null` si inválida. */
function parseFecha(v) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Valida ObjectId o lanza error tipado (400). */
function requireObjectId(id, mensaje = 'ID inválido', codigo = 'ID_INVALIDO') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = codigo;
    throw err;
  }
  return new ObjectId(id);
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar retención');
  }
}

// ============================================================
// VALIDADORES
// ============================================================
const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

const validarRetencion = [
  body('proveedorId')
    .exists().withMessage('proveedorId es obligatorio')
    .bail()
    .isMongoId().withMessage('ID de proveedor inválido'),

  body('fecha_emision')
    .exists().withMessage('La fecha de emisión es obligatoria')
    .bail()
    .isISO8601().withMessage('Fecha de emisión inválida'),

  body('valor_retenido')
    .exists().withMessage('valor_retenido es obligatorio')
    .bail()
    .isFloat({ min: 0 }).withMessage('El valor retenido debe ser un número >= 0'),

  body('base_imponible')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('La base imponible debe ser un número >= 0'),

  body('porcentaje')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('porcentaje debe estar entre 0 y 100'),

  body('numero_factura')
    .optional({ nullable: true })
    .isString().withMessage('numero_factura debe ser texto')
    .trim()
    .isLength({ max: CONFIG.numeroFacturaMaxLen })
    .withMessage(`numero_factura no puede superar ${CONFIG.numeroFacturaMaxLen} caracteres`),

  body('compraId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('ID de compra inválido'),

  body('tipo')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(CONFIG.tipos)
    .withMessage(`tipo inválido. Válidos: ${CONFIG.tipos.join(', ')}`),

  body('tipo_retencion')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('tipo_retencion debe ser texto')
    .trim(),

  body('impuesto_retencion')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['RENTA', 'IVA', 'ISD'])
    .withMessage("impuesto_retencion debe ser 'RENTA', 'IVA' o 'ISD'"),

  body('observaciones')
    .optional({ nullable: true })
    .isString().withMessage('observaciones debe ser texto')
    .trim()
    .isLength({ max: CONFIG.observacionesMaxLen })
    .withMessage(`observaciones no puede superar ${CONFIG.observacionesMaxLen} caracteres`)
];

// ============================================================
// MIDDLEWARE
// ============================================================
// (Ninguno global; cada ruta aplica el suyo.)

// ============================================================
// GET /  → listado (con o sin paginación)
// ============================================================
router.get('/', requierePermiso('retenciones', 'ver'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const paginar = wantsPagination(req.query);
    const search = (soloString(req.query.search) || '').trim();

    const desde = parseFecha(req.query.desde);
    const hasta = parseFecha(req.query.hasta);
    const hayFiltroFecha = Boolean(desde || hasta);

    const match = {};
    if (hayFiltroFecha) {
      match.fecha_emision = {};
      if (desde) match.fecha_emision.$gte = desde;
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        match.fecha_emision.$lte = h;
      }
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: CONFIG.colProveedores,
          localField: 'proveedorId',
          foreignField: '_id',
          as: 'proveedor',
          pipeline: [{ $project: { ...CONFIG.proyeccionProveedor } }]
        }
      },
      { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } }
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { numero_factura: regex },
            { 'proveedor.nombre': regex },
            { 'proveedor.ruc': regex },
            { tipo_retencion: regex }
          ]
        }
      });
    }

    const sort = parseSort(req.query, { fecha_emision: -1, _id: -1 });
    const col = req.db.collection(CONFIG.col);

    // ---- Sin paginación (compatibilidad legacy) ----
    if (!paginar) {
      const retenciones = await col.aggregate([
        ...pipeline,
        { $sort: sort },
        { $limit: CONFIG.maxSinPaginar }
      ]).toArray();

      headersNoStore(res);
      return res.json(retenciones);
    }

    // ---- Paginado ----
    const [countRes, data] = await Promise.all([
      col.aggregate([...pipeline, { $count: 'total' }]).toArray(),
      col.aggregate([
        ...pipeline,
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]).toArray()
    ]);

    const total = countRes[0]?.total || 0;
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
// POST /  → crear retención
// ============================================================
router.post(
  '/',
  requierePermiso('retenciones', 'crear'),
  validarRetencion,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const {
        compraId,
        proveedorId,
        numero_factura,
        fecha_emision,
        valor_retenido,
        porcentaje,
        tipo,
        tipo_retencion,
        impuesto_retencion,
        base_imponible,
        observaciones
      } = req.body;

      const proveedorObjectId = new ObjectId(proveedorId);
      const fecha = new Date(fecha_emision);
      const valorRetenidoNum = round2(toNumber(valor_retenido));
      const baseImponibleNum = round2(toNumber(base_imponible));
      const porcentajeNum = round2(toNumber(porcentaje));
      const numeroFactura = (numero_factura || '').trim();
      const tipoRetencion = (tipo_retencion || '').trim();
      const impuestoRetencion = (impuesto_retencion || '').trim().toUpperCase();

      // ---- 1. Verificar compra (si viene) ----
      let compraRefId = null;
      if (compraId) {
        const compraObjectId = new ObjectId(compraId);
        const compraExiste = await req.db.collection(CONFIG.colCompras).findOne(
          { _id: compraObjectId },
          { projection: { _id: 1, proveedorId: 1, numero_factura: 1 } }
        );

        if (!compraExiste) {
          return res.status(400).json({
            error: 'La compra referenciada no existe',
            codigo: 'COMPRA_NO_EXISTE'
          });
        }
        if (compraExiste.proveedorId &&
            String(compraExiste.proveedorId) !== String(proveedorObjectId)) {
          return res.status(400).json({
            error: 'El proveedorId no coincide con el proveedor de la compra',
            codigo: 'PROVEEDOR_NO_COINCIDE'
          });
        }
        compraRefId = compraObjectId;
      }

      // ---- 2. Verificar proveedor existe ----
      const proveedorExiste = await req.db.collection(CONFIG.colProveedores).findOne(
        { _id: proveedorObjectId },
        { projection: { _id: 1 } }
      );
      if (!proveedorExiste) {
        return res.status(404).json({
          error: 'Proveedor no encontrado',
          codigo: 'PROVEEDOR_NOT_FOUND'
        });
      }

      // ---- 3. Verificar catálogo SRI (si viene tipo_retencion) ----
      let retencionCatalogo = null;
      let advertenciaPorcentaje = null;
      if (tipoRetencion) {
        retencionCatalogo = buscarRetencion(
          tipoRetencion,
          impuestoRetencion || undefined
        );

        if (!retencionCatalogo) {
          return res.status(400).json({
            error:
              `Código de retención "${tipoRetencion}" no existe en el catálogo del SRI` +
              (impuestoRetencion ? ` para el impuesto "${impuestoRetencion}"` : ''),
            codigo: 'RETENCION_CATALOGO_INVALIDO'
          });
        }

        // Advertencia (no error): el porcentaje del usuario difiere del catálogo.
        if (
          porcentajeNum > 0 &&
          retencionCatalogo.porcentaje !== undefined &&
          Math.abs(retencionCatalogo.porcentaje - porcentajeNum) > 0.01
        ) {
          advertenciaPorcentaje =
            `El porcentaje enviado (${porcentajeNum}%) difiere del catálogo SRI ` +
            `(${retencionCatalogo.porcentaje}% — ${retencionCatalogo.nombre}).`;
        }
      }

      // ---- 4. Detección de duplicado lógico ----
      // Mismo compraId + tipo_retencion + impuesto_retencion activos → duplicado.
      if (compraRefId && tipoRetencion) {
        const filtroDup = {
          compraId: compraRefId,
          tipo_retencion: tipoRetencion,
          anulado: { $ne: true }
        };
        if (impuestoRetencion) filtroDup.impuesto_retencion = impuestoRetencion;

        const duplicada = await req.db.collection(CONFIG.col).findOne(
          filtroDup,
          { projection: { _id: 1, numero_factura: 1, valor_retenido: 1 } }
        );

        if (duplicada) {
          return res.status(409).json({
            error:
              `Ya existe una retención activa para esta compra con el mismo ` +
              `tipo (${tipoRetencion}${impuestoRetencion ? ' / ' + impuestoRetencion : ''}).`,
            codigo: 'RETENCION_DUPLICADA',
            retencionId: duplicada._id,
            valor_retenido: duplicada.valor_retenido
          });
        }
      }

      // ---- 5. Persistir ----
      const ahora = new Date();
      const retencion = {
        compraId: compraRefId,
        proveedorId: proveedorObjectId,
        numero_factura: numeroFactura,
        fecha_emision: fecha,
        base_imponible: baseImponibleNum,
        valor_retenido: valorRetenidoNum,
        porcentaje: porcentajeNum,
        tipo: tipo || 'manual',
        tipo_retencion: tipoRetencion,
        impuesto_retencion: impuestoRetencion || (retencionCatalogo?.impuesto || ''),
        observaciones: (observaciones || '').trim(),
        anulado: false,
        createdAt: ahora,
        updatedAt: ahora
      };

      const result = await req.db.collection(CONFIG.col).insertOne(retencion);

      // ---- 6. Auditoría ----
      await auditarSeguro(req.db, req, {
        accion: 'crear',
        coleccion: CONFIG.col,
        documentoId: result.insertedId,
        documentoNumero: numeroFactura,
        datosNuevos: { ...retencion, _id: result.insertedId },
        detalle:
          `Retención creada: ${numeroFactura || '(sin nº)'} por $${valorRetenidoNum.toFixed(2)}`
      });

      headersNoStore(res);
      return res.status(201).json({
        ...retencion,
        _id: result.insertedId,
        _catalogo: retencionCatalogo
          ? {
              codigo: retencionCatalogo.codigo,
              nombre: retencionCatalogo.nombre,
              porcentaje: retencionCatalogo.porcentaje
            }
          : null,
        _advertencia: advertenciaPorcentaje
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → eliminar retención
// ------------------------------------------------------------
// GUARD opcional: si la retención ya fue enviada al SRI (estado
// AUTORIZADO), no se permite borrar. Descomenta el bloque cuando
// implementes ese flujo de envío.
// ============================================================
router.delete(
  '/:id',
  requierePermiso('retenciones', 'eliminar'),
  validadorId,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const _id = new ObjectId(req.params.id);

      const retencion = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!retencion) {
        return res.status(404).json({
          error: 'Retención no encontrada',
          codigo: 'RETENCION_NOT_FOUND'
        });
      }

      // ---- GUARD opcional (descomentar cuando aplique) ----
      /*
      if (retencion.estado_sri === 'AUTORIZADO') {
        return res.status(409).json({
          error: 'No se puede eliminar una retención autorizada por el SRI.',
          codigo: 'RETENCION_AUTORIZADA'
        });
      }
      */

      const r = await req.db.collection(CONFIG.col).deleteOne({ _id });
      if (r.deletedCount === 0) {
        return res.status(404).json({
          error: 'Retención no encontrada',
          codigo: 'RETENCION_NOT_FOUND'
        });
      }

      await auditarSeguro(req.db, req, {
        accion: 'eliminar',
        coleccion: CONFIG.col,
        documentoId: retencion._id,
        documentoNumero: retencion.numero_factura || '',
        datosAnteriores: retencion,
        detalle: `Retención eliminada: ${retencion.numero_factura || ''}`
      });

      headersNoStore(res);
      return res.json({ message: 'Retención eliminada' });
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
module.exports._parseFecha = parseFecha;
module.exports._round2 = round2;
module.exports._toNumber = toNumber;