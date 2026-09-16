// backend/routes/reportesMensuales.js
// ============================================================
// Reportes mensuales — declaración de IVA (compras + retenciones)
// ------------------------------------------------------------
// Endpoint:
//   GET /declaracion/:mes/:anio → resumen de compras y retenciones
//
// Devuelve:
//   {
//     mes, anio, nombre,
//     periodo: { desde, hasta },
//     totales: {
//       comprasInventario, comprasGasto, comprasTotal,
//       baseImponibleIva, iva, retenido,
//       cantidadCompras, cantidadRetenciones
//     },
//     compras:      [ ... ],   // hasta CONFIG.maxDetalleMes
//     retenciones:  [ ... ],   // hasta CONFIG.maxDetalleMes
//     _meta: { tiempoMs, truncado, maxDetalle }
//   }
//
// Convenciones:
//   - Requiere permiso `reportes:ver`.
//   - Los agregados se calculan SIEMPRE en Mongo (no en JS).
//   - Las compras sin proveedor (proveedor eliminado) SE INCLUYEN
//     en los totales; solo el `$lookup` las deja como `null`.
//   - Los errores se delegan al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const { requierePermiso } = require('../utils/permisos');
const { validar } = require('../utils/validacion');
const { MESES } = require('../utils/periodos');
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
  colCompras: 'compras_v2',
  colProveedores: 'proveedores',
  colRetenciones: 'retenciones',

  anioMin: 2000,
  anioMax: 2100,

  /** Máx. documentos detallados devueltos por sección. */
  maxDetalleMes: envNum('REPORTES_MES_MAX_DETALLE', 5000),

  /** Proyección mínima del proveedor en el `$lookup`. */
  proyeccionProveedor: Object.freeze({
    nombre: 1, ruc: 1, telefono: 1, email: 1
  })
});

// ============================================================
// HELPERS
// ============================================================
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Redondeo a 2 decimales (nunca NaN). */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Nombre del mes en español (fallback si el índice está fuera de rango). */
function nombreMes(mes) {
  return MESES[mes - 1] || `Mes ${mes}`;
}

/** Rango `[inicio, fin]` inclusive para un mes/año dado (TZ local). */
function rangoDelMes(anio, mes) {
  const inicio = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
  const fin = new Date(anio, mes, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    const { logAudit } = require('../utils/audit');
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar reporte mensual');
  }
}

// ============================================================
// VALIDADORES
// ============================================================
const validarPeriodo = [
  param('mes')
    .isInt({ min: 1, max: 12 }).withMessage('Mes inválido (1-12)')
    .toInt(),
  param('anio')
    .isInt({ min: CONFIG.anioMin, max: CONFIG.anioMax })
    .withMessage(`Año fuera de rango (${CONFIG.anioMin}-${CONFIG.anioMax})`)
    .toInt()
];

// ============================================================
// CONSULTAS
// ============================================================

/**
 * Agregado de compras: totales por tipo + base imponible + IVA + detalle.
 * Todo en un solo pipeline con `$facet` (evita traer doc por doc).
 */
async function agregarCompras(db, inicio, fin) {
  const [result] = await db.collection(CONFIG.colCompras).aggregate([
    { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
    {
      $facet: {
        // ---------- Totales ----------
        totales: [
          {
            $group: {
              _id: null,
              comprasInventario: {
                $sum: { $cond: [{ $eq: ['$tipo_compra', 'inventario'] }, '$total', 0] }
              },
              comprasGasto: {
                $sum: { $cond: [{ $eq: ['$tipo_compra', 'gasto'] }, '$total', 0] }
              },
              comprasTotal: { $sum: '$total' },
              baseImponibleIva: {
                $sum: { $cond: [{ $gt: ['$iva', 0] }, '$subtotal', 0] }
              },
              iva: { $sum: '$iva' },
              cantidad: { $sum: 1 }
            }
          }
        ],
        // ---------- Detalle (con proveedor poblado) ----------
        detalle: [
          { $sort: { fecha_emision: -1, _id: -1 } },
          { $limit: CONFIG.maxDetalleMes },
          {
            $lookup: {
              from: CONFIG.colProveedores,
              localField: 'proveedorId',
              foreignField: '_id',
              as: 'proveedor',
              pipeline: [{ $project: { ...CONFIG.proyeccionProveedor } }]
            }
          },
          {
            $unwind: {
              path: '$proveedor',
              preserveNullAndEmptyArrays: true  // ← BUG FIX: no pierde compras huérfanas
            }
          }
        ]
      }
    }
  ]).toArray();

  const t = result?.totales?.[0] || {};
  return {
    totales: {
      comprasInventario: round2(t.comprasInventario),
      comprasGasto: round2(t.comprasGasto),
      comprasTotal: round2(t.comprasTotal),
      baseImponibleIva: round2(t.baseImponibleIva),
      iva: round2(t.iva),
      cantidad: Number(t.cantidad) || 0
    },
    detalle: result?.detalle || []
  };
}

/**
 * Agregado de retenciones: total retenido + detalle topeado.
 */
async function agregarRetenciones(db, inicio, fin) {
  const [result] = await db.collection(CONFIG.colRetenciones).aggregate([
    { $match: { fecha_emision: { $gte: inicio, $lte: fin } } },
    {
      $facet: {
        totales: [
          {
            $group: {
              _id: null,
              totalRetenido: { $sum: '$valor_retenido' },
              cantidad: { $sum: 1 }
            }
          }
        ],
        detalle: [
          { $sort: { fecha_emision: -1, _id: -1 } },
          { $limit: CONFIG.maxDetalleMes }
        ]
      }
    }
  ]).toArray();

  const t = result?.totales?.[0] || {};
  return {
    totales: {
      totalRetenido: round2(t.totalRetenido),
      cantidad: Number(t.cantidad) || 0
    },
    detalle: result?.detalle || []
  };
}

// ============================================================
// MIDDLEWARE
// ============================================================
router.use(requierePermiso('reportes', 'ver'));

// ============================================================
// GET /declaracion/:mes/:anio
// ============================================================
router.get(
  '/declaracion/:mes/:anio',
  validarPeriodo,
  async (req, res, next) => {
    if (validar(req, res)) return;

    try {
      const mes = req.params.mes;   // ya casteado a int por express-validator
      const anio = req.params.anio;
      const { inicio, fin } = rangoDelMes(anio, mes);

      const t0 = Date.now();

      // Compras y retenciones en paralelo.
      const [compras, retenciones] = await Promise.all([
        agregarCompras(req.db, inicio, fin),
        agregarRetenciones(req.db, inicio, fin)
      ]);

      const truncado =
        compras.detalle.length >= CONFIG.maxDetalleMes ||
        retenciones.detalle.length >= CONFIG.maxDetalleMes;

      // (Opcional) Auditoría del acceso al reporte — no bloquea.
      // Descomentar si quieres trazabilidad de quién consulta la declaración.
      /*
      await auditarSeguro(req.db, req, {
        accion: 'consultar',
        coleccion: 'reportes_mensuales',
        documentoNumero: `${nombreMes(mes)} ${anio}`,
        detalle: `Declaración IVA consultada: ${nombreMes(mes)} ${anio}`
      });
      */

      headersNoStore(res);
      return res.json({
        mes,
        anio,
        nombre: `${nombreMes(mes)} ${anio}`,
        periodo: { desde: inicio, hasta: fin },

        totales: {
          comprasInventario: compras.totales.comprasInventario,
          comprasGasto: compras.totales.comprasGasto,
          comprasTotal: compras.totales.comprasTotal,
          baseImponibleIva: compras.totales.baseImponibleIva,
          iva: compras.totales.iva,
          retenido: retenciones.totales.totalRetenido,
          cantidadCompras: compras.totales.cantidad,
          cantidadRetenciones: retenciones.totales.cantidad
        },

        compras: compras.detalle,
        retenciones: retenciones.detalle,

        _meta: {
          tiempoMs: Date.now() - t0,
          maxDetalle: CONFIG.maxDetalleMes,
          truncado
        }
      });
    } catch (err) {
      log.error({ err: err.message }, 'Error en reporte mensual');
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
module.exports._rangoDelMes = rangoDelMes;
module.exports._agregarCompras = agregarCompras;
module.exports._agregarRetenciones = agregarRetenciones;