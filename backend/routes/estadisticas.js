// backend/routes/estadisticas.js
// ============================================================
// Estadísticas y dashboard
// ------------------------------------------------------------
// Endpoint:
//   GET /dashboard  → métricas agregadas (ventas, compras, CxC,
//                     CxP, SRI, stock bajo, top productos)
//
// Convenciones:
//   - Todas las fechas se calculan en zona horaria EC (default -05:00).
//   - Caché en memoria por 60s (configurable con `EST_CACHE_MS`).
//     El endpoint es pesado; el dashboard lo llama constantemente.
//   - Se devuelven los mismos nombres de campo que la versión previa
//     para no romper el frontend.
//   - Query params opcionales:
//       ?fecha=YYYY-MM-DD   → fecha "hoy" (útil para tests)
//       ?nocache=1          → ignora la caché
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const { partesFechaEC } = require('../utils/fechaEC');
const {
  matchSoloVentasComerciales,
  matchVentasNetas
} = require('../utils/tiposDocumento');
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
  colVentas: 'ventas_v2',
  colCompras: 'compras_v2',
  colProductos: 'productos',
  colPagos: 'pagos',

  /** Zona horaria EC para agrupar por día. */
  timezone: process.env.EC_TIMEZONE || '-05:00',

  /** TTL de la caché en memoria (60 s por defecto). */
  cacheMs: envNum('EST_CACHE_MS', 60_000),

  /** Máximo de días devueltos por la serie temporal. */
  maxDiasSerie: envNum('EST_MAX_DIAS', 30)
});

// ============================================================
// CACHÉ EN MEMORIA
// ------------------------------------------------------------
// Estructura: { expiresAt, payload }. Una sola entrada porque el
// endpoint no recibe filtros significativos (salvo `fecha` opcional).
// ============================================================
let cacheDashboard = null;

function leerCache() {
  if (!cacheDashboard) return null;
  if (cacheDashboard.expiresAt <= Date.now()) {
    cacheDashboard = null;
    return null;
  }
  return cacheDashboard.payload;
}

function guardarCache(payload) {
  cacheDashboard = { expiresAt: Date.now() + CONFIG.cacheMs, payload };
}

function invalidarCache() {
  cacheDashboard = null;
}

// ============================================================
// HELPERS
// ============================================================
function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/** Redondea a 2 decimales como número. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula la variación porcentual entre dos valores.
 * Devuelve 0 si no hay base de comparación y no hay valor actual,
 * o 100 si hay valor actual pero base 0.
 */
function calcularVariacion(actual, anterior) {
  const a = Number(actual) || 0;
  const b = Number(anterior) || 0;
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

/** Construye el rango de un día completo (00:00:00.000 → 23:59:59.999). */
function rangoDelDia(base) {
  const inicio = new Date(base);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { inicio, fin };
}

/** "Hoy" en zona EC, ajustado por ?fecha si viene. */
function obtenerHoy(req) {
  const override = req.query.fecha;
  if (typeof override === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    const [y, m, d] = override.split('-').map(Number);
    const fecha = new Date(y, m - 1, d, 12, 0, 0, 0);
    if (!Number.isNaN(fecha.getTime())) return fecha;
  }
  return new Date();
}

// ============================================================
// CONSULTAS REUTILIZABLES
// ============================================================
/**
 * Suma `total` y cuenta documentos en un rango.
 * @param {object} db
 * @param {string} col
 * @param {Date} desde
 * @param {Date} hasta
 * @param {object} matchExtra
 * @returns {Promise<{total:number, cantidad:number}>}
 */
async function rangoTotal(db, col, desde, hasta, matchExtra = {}) {
  const r = await db.collection(col).aggregate([
    { $match: { fecha_emision: { $gte: desde, $lt: hasta }, ...matchExtra } },
    { $group: { _id: null, total: { $sum: '$total' }, cantidad: { $sum: 1 } } }
  ]).toArray();
  const doc = r[0] || {};
  return { total: Number(doc.total) || 0, cantidad: Number(doc.cantidad) || 0 };
}

/**
 * Serie diaria (7 días) agrupada por fecha en zona EC.
 */
async function serieDiaria(db, col, desde, hasta, matchExtra = {}) {
  return db.collection(col).aggregate([
    { $match: { fecha_emision: { $gte: desde, $lt: hasta }, ...matchExtra } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$fecha_emision',
            timezone: CONFIG.timezone
          }
        },
        total: { $sum: '$total' }
      }
    }
  ]).toArray();
}

/**
 * Cuenta documentos por estado_sri en una sola pasada.
 */
async function contarEstadosSRI(db) {
  const r = await db.collection(CONFIG.colVentas).aggregate([
    { $match: { estado_sri: { $exists: true, $ne: null } } },
    { $group: { _id: '$estado_sri', total: { $sum: 1 } } }
  ]).toArray();

  const mapa = {};
  for (const x of r) mapa[x._id] = x.total || 0;

  return {
    pendientes: mapa['PENDIENTE'] || 0,
    firmados: mapa['FIRMADO'] || 0,
    autorizados: mapa['AUTORIZADO'] || 0,
    rechazados: (mapa['RECHAZADA'] || 0) + (mapa['DEVUELTA'] || 0)
  };
}

/**
 * Top productos del mes (por cantidad vendida).
 */
async function topProductosDelMes(db, inicioMes, inicioMesSig) {
  return db.collection(CONFIG.colVentas).aggregate([
    {
      $match: {
        fecha_emision: { $gte: inicioMes, $lt: inicioMesSig },
        ...matchVentasNetas()
      }
    },
    { $unwind: '$detalles' },
    {
      $group: {
        _id: '$detalles.productoId',
        cantidad: { $sum: '$detalles.cantidad' },
        total: {
          $sum: {
            $multiply: [
              { $ifNull: ['$detalles.cantidad', 0] },
              { $ifNull: ['$detalles.precio_unitario', 0] }
            ]
          }
        }
      }
    },
    { $match: { _id: { $ne: null } } },
    { $sort: { cantidad: -1 } },
    { $limit: 5 },
    { $lookup: { from: CONFIG.colProductos, localField: '_id', foreignField: '_id', as: 'producto' } },
    { $unwind: { path: '$producto', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productoId: '$_id',
        nombre: { $ifNull: ['$producto.nombre', 'Producto eliminado'] },
        codigo: '$producto.codigo',
        cantidad: 1,
        total: { $round: ['$total', 2] }
      }
    }
  ]).toArray();
}

/**
 * CxC: saldo pendiente agrupado por cliente.
 * @returns {{ total: number, clientes: number, documentos: number }}
 */
async function calcularCuentasPorCobrar(db) {
  const [agregado, pagosAgg] = await Promise.all([
    db.collection(CONFIG.colVentas).aggregate([
      { $match: matchSoloVentasComerciales() },
      {
        $group: {
          _id: '$clienteId',
          debitos: {
            $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          creditosNC: {
            $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
          },
          cantidadDocumentos: {
            $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, 1, 0] }
          }
        }
      }
    ]).toArray(),
    db.collection(CONFIG.colPagos).aggregate([
      { $match: { tipo: 'cobro', anulado: { $ne: true }, clienteId: { $ne: null } } },
      { $group: { _id: '$clienteId', total: { $sum: '$monto' } } }
    ]).toArray()
  ]);

  const pagosPorCliente = new Map(pagosAgg.map(p => [String(p._id), Number(p.total) || 0]));

  let total = 0;
  let clientes = 0;
  let documentos = 0;
  for (const c of agregado) {
    if (!c._id) continue;
    const pagos = pagosPorCliente.get(String(c._id)) || 0;
    const saldo = (Number(c.debitos) || 0) - (Number(c.creditosNC) || 0) - pagos;
    if (saldo > 0.01) {
      total += saldo;
      clientes += 1;
      // NOTA: `cantidadDocumentos` cuenta TODOS los documentos del cliente
      // (pagados o no). Es una aproximación aceptable para dashboard.
      documentos += Number(c.cantidadDocumentos) || 0;
    }
  }
  return { total: round2(total), clientes, documentos };
}

/**
 * CxP: saldo pendiente agrupado por proveedor.
 */
async function calcularCuentasPorPagar(db) {
  const [agregado, pagosAgg] = await Promise.all([
    db.collection(CONFIG.colCompras).aggregate([
      {
        $group: {
          _id: '$proveedorId',
          total: { $sum: '$total' },
          cantidadDocumentos: { $sum: 1 }
        }
      }
    ]).toArray(),
    db.collection(CONFIG.colPagos).aggregate([
      { $match: { tipo: 'pago', anulado: { $ne: true }, proveedorId: { $ne: null } } },
      { $group: { _id: '$proveedorId', total: { $sum: '$monto' } } }
    ]).toArray()
  ]);

  const pagosPorProveedor = new Map(pagosAgg.map(p => [String(p._id), Number(p.total) || 0]));

  let total = 0;
  let proveedores = 0;
  let documentos = 0;
  for (const c of agregado) {
    if (!c._id) continue;
    const pagos = pagosPorProveedor.get(String(c._id)) || 0;
    const saldo = (Number(c.total) || 0) - pagos;
    if (saldo > 0.01) {
      total += saldo;
      proveedores += 1;
      documentos += Number(c.cantidadDocumentos) || 0;
    }
  }
  return { total: round2(total), proveedores, documentos };
}

/**
 * Cuenta productos con stock <= stock_minimo (y stock_minimo > 0).
 */
async function contarStockBajo(db) {
  return db.collection(CONFIG.colProductos).countDocuments({
    stock_minimo: { $gt: 0 },
    $expr: { $lte: ['$stock', '$stock_minimo'] }
  });
}

// ============================================================
// GET /dashboard
// ============================================================
router.get('/dashboard', requierePermiso('reportes', 'ver'), async (req, res, next) => {
  try {
    const sinCache = req.query.nocache === '1';
    if (!sinCache) {
      const cached = leerCache();
      if (cached) {
        res.set('X-Cache', 'HIT');
        headersNoStore(res);
        return res.json(cached);
      }
    }

    const t0 = Date.now();
    const db = req.db;

    // ---- Rangos de fechas ----
    const hoy = obtenerHoy(req);
    const { inicio: inicioHoy, fin: inicioManana } = rangoDelDia(hoy);

    const ayer = new Date(inicioHoy);
    ayer.setDate(ayer.getDate() - 1);
    const { inicio: inicioAyer } = rangoDelDia(ayer);

    const hace7 = new Date(inicioHoy);
    hace7.setDate(hace7.getDate() - 6);

    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0, 0);
    const inicioMesSig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1, 0, 0, 0, 0);
    const inicioMesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1, 0, 0, 0, 0);

    const matchVentas = matchVentasNetas();

    // ---- Bloque 1: totales (rango hoy/ayer/mes) en paralelo ----
    const [
      ventasHoy, ventasAyer, ventasMes, ventasMesPrev,
      comprasHoy, comprasAyer, comprasMes, comprasMesPrev
    ] = await Promise.all([
      rangoTotal(db, CONFIG.colVentas, inicioHoy, inicioManana, matchVentas),
      rangoTotal(db, CONFIG.colVentas, inicioAyer, inicioHoy, matchVentas),
      rangoTotal(db, CONFIG.colVentas, inicioMes, inicioMesSig, matchVentas),
      rangoTotal(db, CONFIG.colVentas, inicioMesPrev, inicioMes, matchVentas),
      rangoTotal(db, CONFIG.colCompras, inicioHoy, inicioManana),
      rangoTotal(db, CONFIG.colCompras, inicioAyer, inicioHoy),
      rangoTotal(db, CONFIG.colCompras, inicioMes, inicioMesSig),
      rangoTotal(db, CONFIG.colCompras, inicioMesPrev, inicioMes)
    ]);

    // ---- Bloque 2: series diarias + SRI + stock + CxC + CxP + top productos ----
    const [
      ventas7d,
      compras7d,
      estadosSRI,
      stockBajo,
      cxc,
      cxp,
      topProductos
    ] = await Promise.all([
      serieDiaria(db, CONFIG.colVentas, hace7, inicioManana, matchVentas),
      serieDiaria(db, CONFIG.colCompras, hace7, inicioManana),
      contarEstadosSRI(db),
      contarStockBajo(db),
      calcularCuentasPorCobrar(db),
      calcularCuentasPorPagar(db),
      topProductosDelMes(db, inicioMes, inicioMesSig)
    ]);

    // ---- Construir arrays diarios (7 días, orden cronológico) ----
    const ventasMap = new Map(ventas7d.map(x => [x._id, Number(x.total) || 0]));
    const comprasMap = new Map(compras7d.map(x => [x._id, Number(x.total) || 0]));

    const dias = [];
    const ventasDiarias = [];
    const comprasDiarias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(inicioHoy);
      d.setDate(d.getDate() - i);
      const { year, month, day } = partesFechaEC(d);
      const iso = `${year}-${month}-${day}`;
      dias.push(d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' }));
      ventasDiarias.push(ventasMap.get(iso) || 0);
      comprasDiarias.push(comprasMap.get(iso) || 0);
    }

    // ---- Tendencias ----
    const tendenciaVentas = calcularVariacion(ventasHoy.total, ventasAyer.total);
    const tendenciaCompras = calcularVariacion(comprasHoy.total, comprasAyer.total);
    const varMesVentas = calcularVariacion(ventasMes.total, ventasMesPrev.total);
    const varMesCompras = calcularVariacion(comprasMes.total, comprasMesPrev.total);

    const payload = {
      // --- Ventas ---
      ventasHoy: round2(ventasHoy.total),
      ventasAyer: round2(ventasAyer.total),
      facturasHoy: ventasHoy.cantidad,
      ventasMes: round2(ventasMes.total),
      facturasMes: ventasMes.cantidad,
      ventasMesPrev: round2(ventasMesPrev.total),
      varMesVentas,
      tendenciaVentas,

      // --- Compras ---
      comprasHoy: round2(comprasHoy.total),
      comprasAyer: round2(comprasAyer.total),
      comprasMes: round2(comprasMes.total),
      comprasDelMes: comprasMes.cantidad,
      comprasMesPrev: round2(comprasMesPrev.total),
      varMesCompras,
      tendenciaCompras,

      // --- Serie temporal ---
      ventasDiarias,
      comprasDiarias,
      dias,

      // --- Top productos ---
      topProductos,

      // --- Cuentas por cobrar ---
      cuentasPorCobrar: cxc.total,
      cuentasPorCobrarDocs: cxc.documentos,
      clientesConSaldo: cxc.clientes,

      // --- Cuentas por pagar ---
      cuentasPorPagar: cxp.total,
      cuentasPorPagarDocs: cxp.documentos,
      proveedoresConSaldo: cxp.proveedores,

      // --- Stock ---
      stockBajo,

      // --- Estado SRI ---
      sri: estadosSRI,

      // --- Meta ---
      generado: new Date(),
      _meta: {
        tiempoMs: Date.now() - t0,
        cacheMs: CONFIG.cacheMs
      }
    };

    guardarCache(payload);
    res.set('X-Cache', 'MISS');
    headersNoStore(res);
    return res.json(payload);
  } catch (err) {
    log.error({ err: err.message }, 'Error en /estadisticas/dashboard');
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests / invalidación manual ----
module.exports._CONFIG = CONFIG;
module.exports._invalidarCache = invalidarCache;
module.exports._calcularVariacion = calcularVariacion;
module.exports._rangoTotal = rangoTotal;
module.exports._calcularCuentasPorCobrar = calcularCuentasPorCobrar;
module.exports._calcularCuentasPorPagar = calcularCuentasPorPagar;