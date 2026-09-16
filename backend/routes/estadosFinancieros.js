// backend/routes/estadosFinancieros.js
// ============================================================
// Estados financieros: Estado de Resultados y Balance General
// ------------------------------------------------------------
// Endpoints:
//   GET /resultados  → estado de resultados del período
//   GET /balance     → balance general a una fecha de corte
//
// Query params /resultados:
//   ?desde=YYYY-MM-DD   (obligatorio)
//   ?hasta=YYYY-MM-DD   (obligatorio)
//   ?comparar=true      → incluye período anterior equivalente
//
// Query params /balance:
//   ?fecha=YYYY-MM-DD   (obligatorio)
//
// Convenciones:
//   - Todas las fechas se interpretan en zona local del servidor.
//   - El balance muestra `diferencia` y `cuadra` para auditar que
//     Activo = Pasivo + Patrimonio. Diferencias son normales si el
//     sistema no registra capital social ni apertura explícita.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const {
  TIPOS_NO_COMERCIALES,
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
  colPagos: 'pagos',
  colProductos: 'productos',
  colKardex: 'kardex',
  colProveedores: 'proveedores',

  /** Máx. días del período para /resultados (evita escanear años). */
  maxDiasPeriodo: envNum('EEFF_MAX_DIAS_PERIODO', 366 * 3),
  /** Máx. proveedores en el desglose. */
  maxDesgloseProveedores: envNum('EEFF_MAX_DESGLOSE', 20),
  /** Umbral para considerar un saldo cero. */
  umbralSaldo: 0.01
});

// Set para chequeos O(1).
const TIPOS_NO_COMERCIALES_SET = new Set(TIPOS_NO_COMERCIALES);

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

function toBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return Boolean(v);
}

/** Parsea fecha `YYYY-MM-DD` o ISO; devuelve null si inválida. */
function parseFecha(v, { finDelDia = false } = {}) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  if (finDelDia) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Valida que un período tenga sentido (desde <= hasta) y no exceda el máximo.
 * Devuelve { ok: true, desde, hasta } o { ok: false, error, codigo }.
 */
function validarPeriodo(desdeRaw, hastaRaw, { maxDias = CONFIG.maxDiasPeriodo } = {}) {
  const desde = parseFecha(desdeRaw);
  const hasta = parseFecha(hastaRaw, { finDelDia: true });

  if (!desde) return { ok: false, error: 'Fecha "desde" inválida o ausente', codigo: 'DESDE_INVALIDO' };
  if (!hasta) return { ok: false, error: 'Fecha "hasta" inválida o ausente', codigo: 'HASTA_INVALIDO' };
  if (desde > hasta) {
    return { ok: false, error: '"desde" no puede ser posterior a "hasta"', codigo: 'RANGO_INVALIDO' };
  }
  const dias = Math.ceil((hasta.getTime() - desde.getTime()) / 86400000);
  if (dias > maxDias) {
    return {
      ok: false,
      error: `El período no puede exceder ${maxDias} días (se pidieron ${dias})`,
      codigo: 'PERIODO_DEMASIADO_LARGO'
    };
  }
  return { ok: true, desde, hasta, dias };
}

/** Match base de ventas comerciales + rango de fechas. */
function matchVentasEnRango(desde, hasta) {
  return {
    fecha_emision: { $gte: desde, $lte: hasta },
    ...matchVentasNetas()
  };
}

// ============================================================
// CONSULTAS REUTILIZABLES
// ============================================================
/** Suma subtotal, iva, total y cantidad de ventas en un rango. */
async function agregarVentas(db, desde, hasta) {
  const r = await db.collection(CONFIG.colVentas).aggregate([
    { $match: matchVentasEnRango(desde, hasta) },
    {
      $group: {
        _id: null,
        subtotal: { $sum: '$subtotal' },
        iva: { $sum: '$iva' },
        total: { $sum: '$total' },
        cantidad: { $sum: 1 }
      }
    }
  ]).toArray();
  const d = r[0] || {};
  return {
    subtotal: Number(d.subtotal) || 0,
    iva: Number(d.iva) || 0,
    total: Number(d.total) || 0,
    cantidad: Number(d.cantidad) || 0
  };
}

/** Suma de notas de crédito en un rango. */
async function agregarNotasCredito(db, desde, hasta) {
  const r = await db.collection(CONFIG.colVentas).aggregate([
    {
      $match: {
        fecha_emision: { $gte: desde, $lte: hasta },
        tipo_documento: 'nota_credito'
      }
    },
    {
      $group: {
        _id: null,
        subtotal: { $sum: '$subtotal' },
        total: { $sum: '$total' }
      }
    }
  ]).toArray();
  const d = r[0] || {};
  return { subtotal: Number(d.subtotal) || 0, total: Number(d.total) || 0 };
}

/** Costo de ventas desde kardex (usa `$abs(cantidad) * costo_unitario`). */
async function agregarCostoVentas(db, desde, hasta) {
  const r = await db.collection(CONFIG.colKardex).aggregate([
    { $match: { fecha: { $gte: desde, $lte: hasta }, tipo_movimiento: 'venta' } },
    {
      $group: {
        _id: null,
        costo: { $sum: { $multiply: [{ $abs: '$cantidad' }, '$costo_unitario'] } }
      }
    }
  ]).toArray();
  return Number(r[0]?.costo) || 0;
}

/** Compras de tipo `gasto` en un rango (subtotal, iva, total, cantidad). */
async function agregarGastos(db, desde, hasta) {
  const r = await db.collection(CONFIG.colCompras).aggregate([
    { $match: { fecha_emision: { $gte: desde, $lte: hasta }, tipo_compra: 'gasto' } },
    {
      $group: {
        _id: null,
        subtotal: { $sum: '$subtotal' },
        iva: { $sum: '$iva' },
        total: { $sum: '$total' },
        cantidad: { $sum: 1 }
      }
    }
  ]).toArray();
  const d = r[0] || {};
  return {
    subtotal: Number(d.subtotal) || 0,
    iva: Number(d.iva) || 0,
    total: Number(d.total) || 0,
    cantidad: Number(d.cantidad) || 0
  };
}

/** Desglose de gastos por proveedor (top N). */
async function desgloseGastosPorProveedor(db, desde, hasta, limit) {
  return db.collection(CONFIG.colCompras).aggregate([
    { $match: { fecha_emision: { $gte: desde, $lte: hasta }, tipo_compra: 'gasto' } },
    { $group: { _id: '$proveedorId', total: { $sum: '$subtotal' }, cantidad: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: limit },
    { $lookup: { from: CONFIG.colProveedores, localField: '_id', foreignField: '_id', as: 'proveedor' } },
    { $unwind: { path: '$proveedor', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        proveedorId: '$_id',
        proveedorNombre: { $ifNull: ['$proveedor.nombre', 'Proveedor eliminado'] },
        proveedorRuc: { $ifNull: ['$proveedor.ruc', ''] },
        total: 1,
        cantidad: 1
      }
    }
  ]).toArray();
}

/**
 * Suma de IVA de TODAS las compras (gasto + inventario) en un rango.
 * ⚠️  El original solo contaba `tipo_compra: 'gasto'`. En facturación
 *     electrónica ecuatoriana, AMBAS generan IVA crédito tributario.
 *     Mantengo `ivaComprasGasto` (compatibilidad) + añado
 *     `ivaComprasTotal` (correcto fiscalmente).
 */
async function agregarIVACompras(db, desde, hasta) {
  const r = await db.collection(CONFIG.colCompras).aggregate([
    {
      $match: {
        fecha_emision: { $gte: desde, $lte: hasta },
        tipo_compra: { $in: ['gasto', 'inventario'] }
      }
    },
    {
      $group: {
        _id: null,
        ivaTotal: { $sum: '$iva' },
        ivaGasto: { $sum: { $cond: [{ $eq: ['$tipo_compra', 'gasto'] }, '$iva', 0] } },
        ivaInventario: { $sum: { $cond: [{ $eq: ['$tipo_compra', 'inventario'] }, '$iva', 0] } }
      }
    }
  ]).toArray();
  const d = r[0] || {};
  return {
    ivaTotal: Number(d.ivaTotal) || 0,
    ivaGasto: Number(d.ivaGasto) || 0,
    ivaInventario: Number(d.ivaInventario) || 0
  };
}

// ============================================================
// ESTADO DE RESULTADOS
// ============================================================
router.use(requierePermiso('reportes', 'ver'));

router.get('/resultados', async (req, res, next) => {
  try {
    const validacion = validarPeriodo(req.query.desde, req.query.hasta);
    if (!validacion.ok) {
      return res.status(400).json({ error: validacion.error, codigo: validacion.codigo });
    }
    const { desde, hasta, dias } = validacion;
    const comparar = toBool(req.query.comparar, false);

    const t0 = Date.now();

    // ---- Bloque 1: métricas del período en paralelo ----
    const [
      ingresos,
      devoluciones,
      costoDeVentas,
      gastos,
      desglosePorProveedor,
      ivaCompras
    ] = await Promise.all([
      agregarVentas(req.db, desde, hasta),
      agregarNotasCredito(req.db, desde, hasta),
      agregarCostoVentas(req.db, desde, hasta),
      agregarGastos(req.db, desde, hasta),
      desgloseGastosPorProveedor(req.db, desde, hasta, CONFIG.maxDesgloseProveedores),
      agregarIVACompras(req.db, desde, hasta)
    ]);

    const ingresosNetos = round2(ingresos.subtotal - devoluciones.subtotal);
    const utilidadBruta = round2(ingresosNetos - costoDeVentas);
    const margenBruto = ingresosNetos > 0 ? round2((utilidadBruta / ingresosNetos) * 100) : 0;

    const gastosOperativos = round2(gastos.subtotal);
    const utilidadNeta = round2(utilidadBruta - gastosOperativos);
    const margenNeto = ingresosNetos > 0 ? round2((utilidadNeta / ingresosNetos) * 100) : 0;

    const ivaVentas = round2(ingresos.iva);
    const ivaPorPagar = round2(ivaVentas - ivaCompras.ivaTotal);

    // ---- Comparación con período anterior (opcional) ----
    let comparacion = null;
    if (comparar) {
      const duracion = hasta.getTime() - desde.getTime();
      const anteriorDesde = new Date(desde.getTime() - duracion - 1);
      anteriorDesde.setHours(0, 0, 0, 0);
      const anteriorHasta = new Date(desde.getTime() - 1);
      anteriorHasta.setHours(23, 59, 59, 999);

      const [ventasAnt, devolucionesAnt, gastosAnt, costoAnt] = await Promise.all([
        agregarVentas(req.db, anteriorDesde, anteriorHasta),
        agregarNotasCredito(req.db, anteriorDesde, anteriorHasta),
        agregarGastos(req.db, anteriorDesde, anteriorHasta),
        agregarCostoVentas(req.db, anteriorDesde, anteriorHasta)
      ]);

      const ingresosNetosAnt = round2(ventasAnt.subtotal - devolucionesAnt.subtotal);
      const utilidadBrutaAnt = round2(ingresosNetosAnt - costoAnt);
      const utilidadNetaAnt = round2(utilidadBrutaAnt - gastosAnt.subtotal);

      const variacion = (actual, anterior) => {
        if (anterior === 0) return actual > 0 ? 100 : 0;
        return round2(((actual - anterior) / Math.abs(anterior)) * 100);
      };

      comparacion = {
        periodo_anterior: { desde: anteriorDesde, hasta: anteriorHasta },
        // Compatibilidad con shape original:
        ingresosNetos: ingresosNetosAnt,
        gastosOperativos: round2(gastosAnt.subtotal),
        // Extendido:
        utilidadBruta: utilidadBrutaAnt,
        utilidadNeta: utilidadNetaAnt,
        costoDeVentas: round2(costoAnt),
        variaciones: {
          ingresosNetos: variacion(ingresosNetos, ingresosNetosAnt),
          gastosOperativos: variacion(gastosOperativos, round2(gastosAnt.subtotal)),
          utilidadBruta: variacion(utilidadBruta, utilidadBrutaAnt),
          utilidadNeta: variacion(utilidadNeta, utilidadNetaAnt)
        }
      };
    }

    headersNoStore(res);
    return res.json({
      periodo: {
        desde,
        hasta,
        dias,
        comparando: comparar
      },
      ingresos: {
        subtotal: round2(ingresos.subtotal),
        cantidadFacturas: ingresos.cantidad,
        devoluciones: round2(devoluciones.subtotal),
        ingresosNetos
      },
      costos: {
        costoDeVentas: round2(costoDeVentas),
        margenBruto
      },
      gastos: {
        gastosOperativos,
        cantidadCompras: gastos.cantidad,
        desglosePorProveedor
      },
      utilidad: {
        utilidadBruta,
        utilidadNeta,
        margenNeto
      },
      iva: {
        ivaVentas,
        // Compatibilidad con el original: solo gasto.
        ivaCompras: round2(ivaCompras.ivaGasto),
        // Extendido:
        ivaComprasGasto: round2(ivaCompras.ivaGasto),
        ivaComprasInventario: round2(ivaCompras.ivaInventario),
        ivaComprasTotal: round2(ivaCompras.ivaTotal),
        ivaPorPagar
      },
      comparacion,
      _meta: { tiempoMs: Date.now() - t0, generado: new Date() }
    });
  } catch (err) {
    log.error({ err: err.message }, 'Error en estado de resultados');
    return next(err);
  }
});

// ============================================================
// BALANCE GENERAL
// ============================================================
router.get('/balance', async (req, res, next) => {
  try {
    const fechaCorte = parseFecha(req.query.fecha, { finDelDia: true });
    if (!fechaCorte) {
      return res.status(400).json({
        error: 'Se requiere la fecha de corte (YYYY-MM-DD)',
        codigo: 'FECHA_REQUERIDA'
      });
    }

    const t0 = Date.now();

    // ---- Bloque 1: todos los agregados en paralelo ----
    const [
      productos,
      cxcAgg,
      pagosClientesAgg,
      ivaComprasAgg,
      cxpAgg,
      pagosProvAgg,
      ivaVentasAgg,
      ventasAcumAgg,
      notasCreditoAcumAgg,
      costoAcumAgg,
      gastosAcumAgg
    ] = await Promise.all([
      // Proyección mínima: solo los campos usados.
      req.db.collection(CONFIG.colProductos).find(
        { stock: { $gt: 0 } },
        { projection: { stock: 1, precio_compra: 1, precio_venta: 1 } }
      ).toArray(),

      req.db.collection(CONFIG.colVentas).aggregate([
        {
          $match: {
            fecha_emision: { $lte: fechaCorte },
            tipo_documento: { $nin: [...TIPOS_NO_COMERCIALES] }
          }
        },
        {
          $group: {
            _id: '$clienteId',
            debitos: { $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] } },
            creditosNC: { $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] } }
          }
        }
      ]).toArray(),

      req.db.collection(CONFIG.colPagos).aggregate([
        {
          $match: {
            tipo: 'cobro',
            anulado: { $ne: true },
            clienteId: { $ne: null },
            fecha: { $lte: fechaCorte }
          }
        },
        { $group: { _id: '$clienteId', total: { $sum: '$monto' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colCompras).aggregate([
        { $match: { fecha_emision: { $lte: fechaCorte } } },
        { $group: { _id: null, iva: { $sum: '$iva' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colCompras).aggregate([
        { $match: { fecha_emision: { $lte: fechaCorte } } },
        { $group: { _id: '$proveedorId', total: { $sum: '$total' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colPagos).aggregate([
        {
          $match: {
            tipo: 'pago',
            anulado: { $ne: true },
            proveedorId: { $ne: null },
            fecha: { $lte: fechaCorte }
          }
        },
        { $group: { _id: '$proveedorId', total: { $sum: '$monto' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colVentas).aggregate([
        { $match: { fecha_emision: { $lte: fechaCorte }, ...matchVentasNetas() } },
        { $group: { _id: null, iva: { $sum: '$iva' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colVentas).aggregate([
        { $match: { fecha_emision: { $lte: fechaCorte }, ...matchVentasNetas() } },
        { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colVentas).aggregate([
        { $match: { fecha_emision: { $lte: fechaCorte }, tipo_documento: 'nota_credito' } },
        { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
      ]).toArray(),

      req.db.collection(CONFIG.colKardex).aggregate([
        { $match: { fecha: { $lte: fechaCorte }, tipo_movimiento: 'venta' } },
        { $group: { _id: null, costo: { $sum: { $multiply: [{ $abs: '$cantidad' }, '$costo_unitario'] } } } }
      ]).toArray(),

      req.db.collection(CONFIG.colCompras).aggregate([
        { $match: { fecha_emision: { $lte: fechaCorte }, tipo_compra: 'gasto' } },
        { $group: { _id: null, subtotal: { $sum: '$subtotal' } } }
      ]).toArray()
    ]);

    // ---- ACTIVOS ----
    let inventarioValorCompra = 0;
    let inventarioValorVenta = 0;
    for (const p of productos) {
      const stock = Number(p.stock) || 0;
      inventarioValorCompra += stock * (Number(p.precio_compra) || 0);
      inventarioValorVenta += stock * (Number(p.precio_venta) || 0);
    }
    inventarioValorCompra = round2(inventarioValorCompra);
    inventarioValorVenta = round2(inventarioValorVenta);

    const pagosPorCliente = new Map(pagosClientesAgg.map(p => [String(p._id), Number(p.total) || 0]));
    let cuentasPorCobrar = 0;
    let cantidadCxC = 0;
    for (const c of cxcAgg) {
      if (!c._id) continue;
      const pagos = pagosPorCliente.get(String(c._id)) || 0;
      const saldo = (Number(c.debitos) || 0) - (Number(c.creditosNC) || 0) - pagos;
      if (saldo > CONFIG.umbralSaldo) {
        cuentasPorCobrar += saldo;
        cantidadCxC++;
      }
    }
    cuentasPorCobrar = round2(cuentasPorCobrar);

    const ivaCredito = round2(Number(ivaComprasAgg[0]?.iva) || 0);
    const totalActivos = round2(inventarioValorCompra + cuentasPorCobrar + ivaCredito);

    // ---- PASIVOS ----
    const pagosPorProveedor = new Map(pagosProvAgg.map(p => [String(p._id), Number(p.total) || 0]));
    let cuentasPorPagar = 0;
    let cantidadCxP = 0;
    for (const c of cxpAgg) {
      if (!c._id) continue;
      const pagos = pagosPorProveedor.get(String(c._id)) || 0;
      const saldo = (Number(c.total) || 0) - pagos;
      if (saldo > CONFIG.umbralSaldo) {
        cuentasPorPagar += saldo;
        cantidadCxP++;
      }
    }
    cuentasPorPagar = round2(cuentasPorPagar);

    const ivaVentas = round2(Number(ivaVentasAgg[0]?.iva) || 0);
    const ivaPorPagar = round2(Math.max(0, ivaVentas - ivaCredito));

    const totalPasivos = round2(cuentasPorPagar + ivaPorPagar);

    // ---- PATRIMONIO ----
    const ingresosAcum = round2(Number(ventasAcumAgg[0]?.subtotal) || 0);
    const devolucionesAcum = round2(Number(notasCreditoAcumAgg[0]?.subtotal) || 0);
    const costoVentasAcum = round2(Number(costoAcumAgg[0]?.costo) || 0);
    const gastosTotales = round2(Number(gastosAcumAgg[0]?.subtotal) || 0);

    const utilidadesAcumuladas = round2(
      (ingresosAcum - devolucionesAcum) - costoVentasAcum - gastosTotales
    );
    const totalPatrimonio = utilidadesAcumuladas;

    // ---- Verificación contable ----
    const totalPasivoPatrimonio = round2(totalPasivos + totalPatrimonio);
    const diferencia = round2(totalActivos - totalPasivoPatrimonio);
    const cuadra = Math.abs(diferencia) < CONFIG.umbralSaldo;

    headersNoStore(res);
    return res.json({
      fecha_corte: fechaCorte,
      activos: {
        inventario: inventarioValorCompra,
        inventarioValorVenta,
        cuentasPorCobrar,
        cantidadCxC,
        ivaCreditoTributario: ivaCredito,
        total: totalActivos
      },
      pasivos: {
        cuentasPorPagar,
        cantidadCxP,
        ivaPorPagar,
        total: totalPasivos
      },
      patrimonio: {
        utilidadesAcumuladas,
        total: totalPatrimonio
      },
      verificacion: {
        totalActivos,
        totalPasivoPatrimonio,
        diferencia,
        cuadra,
        // Nota útil para el usuario:
        nota: cuadra
          ? null
          : 'La diferencia refleja que el sistema no registra capital social ni ' +
            'asientos de apertura. Es normal en empresas recién migradas.'
      },
      _meta: { tiempoMs: Date.now() - t0, generado: new Date() }
    });
  } catch (err) {
    log.error({ err: err.message }, 'Error en balance general');
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._validarPeriodo = validarPeriodo;
module.exports._parseFecha = parseFecha;
module.exports._round2 = round2;
module.exports._agregarIVACompras = agregarIVACompras;