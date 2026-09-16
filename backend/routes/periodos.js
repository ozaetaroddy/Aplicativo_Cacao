// backend/routes/periodos.js
// ============================================================
// Períodos contables — cierre y reapertura
// ------------------------------------------------------------
// Endpoints:
//   GET    /                        → listado de períodos cerrados
//   GET    /verificar/:anio/:mes    → ¿está cerrado?
//   POST   /                        → cerrar un período
//   DELETE /:id                     → reabrir (requiere confirmación)
//
// Convenciones:
//   - Todas las rutas requieren permisos (`periodos:*`).
//   - Un período cerrado bloquea escrituras en su rango; lo
//     verifican otros módulos con `verificarPeriodoAbierto()`.
//   - El cierre es idempotente por diseño: si el período ya
//     estaba cerrado, se responde 409 con código estable.
//   - La reapertura es una acción sensible: exige confirmación
//     textual y se audita con énfasis.
//   - Todos los errores se delegan al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { body, param } = require('express-validator');
const { requierePermiso } = require('../utils/permisos');
const { logAudit } = require('../utils/audit');
const { validar } = require('../utils/validacion');
const { MESES } = require('../utils/periodos');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  col: 'periodos_cerrados',
  colVentas: 'ventas_v2',

  anioMin: 2020,
  anioMax: 2100,

  observacionesMaxLen: 1000,

  /** Tipos de documento que deben tener clave de acceso al cierre. */
  tiposDocumentoConClave: Object.freeze(['factura', 'nota_credito', 'nota_debito']),

  /** Máx. períodos devueltos en el listado (evita payloads enormes). */
  maxListado: 500,

  /** Confirmación textual exacta para reabrir (🚧 BACKWARD-COMPAT: opcional). */
  confirmacionReabrir: 'REABRIR PERIODO',

  /** Si `true`, se exige confirmación textual al reabrir. */
  requerirConfirmacionReabrir:
    String(process.env.PERIODOS_REQUIRE_CONFIRMATION ?? 'false').toLowerCase() === 'true'
});

// ============================================================
// HELPERS
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

/** Parsea un entero con validación de rango. Devuelve null si inválido. */
function parseIntSeguro(v, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
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
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar período');
  }
}

/** `MESES[mes-1]` seguro (nunca lanza). */
function nombreMes(mes) {
  const i = Number(mes) - 1;
  return MESES[i] || `Mes ${mes}`;
}

/** Construye `"Enero 2025"`. */
function nombrePeriodo(anio, mes) {
  return `${nombreMes(mes)} ${anio}`;
}

/** Rango `[inicio, fin]` inclusive para un período dado (TZ local del server). */
function rangoDelPeriodo(anio, mes) {
  const inicio = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
  const fin = new Date(anio, mes, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

/** Agrega `nombre` legible a un documento de período. */
function conNombre(p) {
  return { ...p, nombre: nombrePeriodo(p.anio, p.mes) };
}

// ============================================================
// VALIDADORES
// ============================================================
const validadorCerrar = [
  body('anio')
    .exists().withMessage('anio es obligatorio')
    .bail()
    .isInt({ min: CONFIG.anioMin, max: CONFIG.anioMax })
    .withMessage(`anio debe ser un entero entre ${CONFIG.anioMin} y ${CONFIG.anioMax}`)
    .toInt(),

  body('mes')
    .exists().withMessage('mes es obligatorio')
    .bail()
    .isInt({ min: 1, max: 12 })
    .withMessage('mes debe ser un entero entre 1 y 12')
    .toInt(),

  body('observaciones')
    .optional({ nullable: true })
    .isString().withMessage('observaciones debe ser texto')
    .trim()
    .isLength({ max: CONFIG.observacionesMaxLen })
    .withMessage(`observaciones no puede superar ${CONFIG.observacionesMaxLen} caracteres`)
];

const validadorPeriodoParams = [
  param('anio')
    .isInt({ min: CONFIG.anioMin, max: CONFIG.anioMax })
    .withMessage(`anio inválido (${CONFIG.anioMin}-${CONFIG.anioMax})`)
    .toInt(),
  param('mes')
    .isInt({ min: 1, max: 12 })
    .withMessage('mes inválido (1-12)')
    .toInt()
];

const validadorId = param('id').custom((v) => {
  if (!ObjectId.isValid(v)) throw new Error('ID inválido');
  return true;
});

// ============================================================
// GET /  → listado de períodos cerrados
// ============================================================
router.get('/', requierePermiso('periodos', 'ver'), async (req, res, next) => {
  try {
    const anioRaw = soloString(req.query.anio);
    const match = {};

    // Filtro por año: si es válido, lo aplicamos; si no, ignoramos.
    if (anioRaw) {
      const anio = parseIntSeguro(anioRaw, { min: CONFIG.anioMin, max: CONFIG.anioMax });
      if (anio !== null) match.anio = anio;
    }

    const periodos = await req.db.collection(CONFIG.col)
      .find(match)
      .sort({ anio: -1, mes: -1 })
      .limit(CONFIG.maxListado)
      .toArray();

    headersNoStore(res);
    return res.json(periodos.map(conNombre));
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// GET /verificar/:anio/:mes  → ¿está cerrado?
// ============================================================
router.get(
  '/verificar/:anio/:mes',
  requierePermiso('periodos', 'ver'),
  validadorPeriodoParams,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const anio = req.params.anio; // ya casteado a int por express-validator
      const mes = req.params.mes;

      const periodo = await req.db.collection(CONFIG.col).findOne({ anio, mes });

      headersNoStore(res);
      if (!periodo) return res.json({ cerrado: false, anio, mes });

      return res.json({
        cerrado: true,
        anio,
        mes,
        periodo: conNombre(periodo)
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// POST /  → cerrar un período
// ============================================================
router.post(
  '/',
  requierePermiso('periodos', 'cerrar'),
  validadorCerrar,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const anio = req.body.anio; // int (coercionado por express-validator)
      const mes = req.body.mes;
      const observaciones = (req.body.observaciones || '').trim();

      const nombre = nombrePeriodo(anio, mes);

      // ---- No se puede cerrar un período futuro ----
      const primerDiaDelMes = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
      if (primerDiaDelMes > new Date()) {
        return res.status(400).json({
          error: `No se puede cerrar un período futuro: ${nombre}`,
          codigo: 'PERIODO_FUTURO'
        });
      }

      // ---- No se puede cerrar dos veces el mismo período ----
      const existente = await req.db.collection(CONFIG.col).findOne({ anio, mes });
      if (existente) {
        return res.status(409).json({
          error: `${nombre} ya está cerrado`,
          codigo: 'PERIODO_YA_CERRADO',
          periodo: conNombre(existente)
        });
      }

      // ---- Contar documentos sin clave en el rango ----
      const { inicio, fin } = rangoDelPeriodo(anio, mes);
      const sinClave = await req.db.collection(CONFIG.colVentas).countDocuments({
        fecha_emision: { $gte: inicio, $lte: fin },
        tipo_documento: { $in: [...CONFIG.tiposDocumentoConClave] },
        $or: [
          { clave_acceso: '' },
          { clave_acceso: { $exists: false } },
          { clave_acceso: null }
        ]
      });

      // ---- Persistir cierre ----
      const ahora = new Date();
      const nuevoPeriodo = {
        anio,
        mes,
        fecha_cierre: ahora,
        cerrado_por: req.user.email,
        cerrado_por_id: new ObjectId(req.user.userId),
        observaciones,
        documentos_sin_clave_al_cerrar: sinClave,
        createdAt: ahora
      };

      let insertedId;
      try {
        const result = await req.db.collection(CONFIG.col).insertOne(nuevoPeriodo);
        insertedId = result.insertedId;
      } catch (err) {
        // Race condition: alguien cerró el mismo período entre el pre-check y el insert.
        if (err && err.code === 11000) {
          return res.status(409).json({
            error: `${nombre} ya está cerrado`,
            codigo: 'PERIODO_YA_CERRADO'
          });
        }
        throw err;
      }

      // ---- Auditoría ----
      const advertencia = sinClave > 0
        ? `Hay ${sinClave} documento${sinClave === 1 ? '' : 's'} sin clave de acceso en este período`
        : null;

      await auditarSeguro(req.db, req, {
        accion: 'cerrar-periodo',
        coleccion: CONFIG.col,
        documentoId: insertedId,
        documentoNumero: nombre,
        datosNuevos: nuevoPeriodo,
        detalle: `Período cerrado: ${nombre}${sinClave > 0 ? ` (${sinClave} doc. sin clave)` : ''}`
      });

      headersNoStore(res);
      return res.status(201).json({
        ...nuevoPeriodo,
        _id: insertedId,
        nombre,
        advertencia
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================
// DELETE /:id  → reabrir un período cerrado
// ============================================================
router.delete(
  '/:id',
  requierePermiso('periodos', 'reabrir'),
  validadorId,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      // 🚧 BACKWARD-COMPAT: la confirmación es opcional y se activa
      // con PERIODOS_REQUIRE_CONFIRMATION=true. Si el frontend aún
      // no envía body, se omite la verificación.
      if (CONFIG.requerirConfirmacionReabrir) {
        const confirmacion = req.body?.confirmacion;
        if (confirmacion !== CONFIG.confirmacionReabrir) {
          return res.status(400).json({
            error: `Debe enviar { "confirmacion": "${CONFIG.confirmacionReabrir}" } para reabrir el período`,
            codigo: 'CONFIRMACION_REQUERIDA'
          });
        }
      }

      const _id = new ObjectId(req.params.id);

      const periodo = await req.db.collection(CONFIG.col).findOne({ _id });
      if (!periodo) {
        return res.status(404).json({
          error: 'Período no encontrado',
          codigo: 'PERIODO_NOT_FOUND'
        });
      }

      const nombre = nombrePeriodo(periodo.anio, periodo.mes);

      const r = await req.db.collection(CONFIG.col).deleteOne({ _id });
      if (r.deletedCount === 0) {
        // Otra request lo reabrió entre el findOne y el deleteOne.
        return res.status(404).json({
          error: 'Período no encontrado',
          codigo: 'PERIODO_NOT_FOUND'
        });
      }

      await auditarSeguro(req.db, req, {
        accion: 'reabrir-periodo',
        coleccion: CONFIG.col,
        documentoId: periodo._id,
        documentoNumero: nombre,
        datosAnteriores: periodo,
        detalle: `⚠️  Período REABIERTO: ${nombre} por ${req.user.email}`
      });

      headersNoStore(res);
      return res.json({
        message: 'Período reabierto correctamente',
        periodo: { _id: periodo._id, anio: periodo.anio, mes: periodo.mes, nombre }
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
module.exports._nombreMes = nombreMes;
module.exports._nombrePeriodo = nombrePeriodo;
module.exports._rangoDelPeriodo = rangoDelPeriodo;
module.exports._conNombre = conNombre;
module.exports._parseIntSeguro = parseIntSeguro;