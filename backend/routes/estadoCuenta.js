// backend/routes/estadoCuenta.js
// ============================================================
// Estado de cuenta por cliente + resumen global de cartera (CxC)
// ------------------------------------------------------------
// Endpoints:
//   GET /                → resumen de cartera (todos los clientes)
//   GET /:clienteId      → estado de cuenta de un cliente
//
// Query params (estado de cuenta):
//   ?desde=YYYY-MM-DD    → filtra movimientos desde
//   ?hasta=YYYY-MM-DD    → filtra movimientos hasta
//
// Query params (resumen):
//   ?sort=saldo|antiguedad → ordena por saldo o por última factura
//   ?nocache=1           → ignora la caché en memoria
//
// Aging:
//   Se aplican créditos (NC + pagos) contra débitos FIFO (los más
//   antiguos primero), que es la convención contable estándar.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { requierePermiso } = require('../utils/permisos');
const { TIPOS_NO_CXC } = require('../utils/tiposDocumento');
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
  colPagos: 'pagos',
  colClientes: 'clientes',

  /** TTL de la caché de cartera global (60 s por defecto). */
  cacheCarteraMs: envNum('EST_CACHE_CARTERA_MS', 60_000),

  /** Máximo de movimientos devueltos por estado de cuenta. */
  maxMovimientos: envNum('EST_MAX_MOVIMIENTOS', 5000),

  /** Máximo de clientes devueltos en el resumen global. */
  maxClientesCartera: envNum('EST_MAX_CLIENTES_CARTERA', 2000),

  /** Umbral para considerar un saldo como cero (evita ruido por centavos). */
  umbralSaldo: 0.01,

  agingBuckets: Object.freeze(['0-30', '31-60', '61-90', '+90'])
});

// Set para chequeos O(1).
const TIPOS_NO_DEUDA_SET = new Set(TIPOS_NO_CXC);

// Descripciones legibles por tipo (fuente única).
const DESCRIPCION_TIPO = Object.freeze({
  factura: 'Factura',
  nota_credito: 'Nota de Crédito',
  nota_debito: 'Nota de Débito',
  guia_remision: 'Guía de Remisión',
  retencion: 'Comprobante de Retención',
  liquidacion: 'Liquidación de Compra',
  exportacion: 'Comprobante de Exportación',
  pago: 'Pago'
});

// ============================================================
// CACHÉ DE CARTERA (global)
// ============================================================
let cacheCartera = null;

function leerCacheCartera() {
  if (!cacheCartera) return null;
  if (cacheCartera.expiresAt <= Date.now()) {
    cacheCartera = null;
    return null;
  }
  return cacheCartera.payload;
}
function guardarCacheCartera(payload) {
  cacheCartera = { expiresAt: Date.now() + CONFIG.cacheCarteraMs, payload };
}
function invalidarCacheCartera() {
  cacheCartera = null;
}

// ============================================================
// HELPERS GENERALES
// ============================================================
function soloString(v) {
  return typeof v === 'string' ? v : undefined;
}

function requireObjectId(id, mensaje = 'ID de cliente inválido') {
  if (!ObjectId.isValid(id)) {
    const err = new Error(mensaje);
    err.status = 400;
    err.codigo = 'ID_INVALIDO';
    throw err;
  }
  return new ObjectId(id);
}

/** Parsea una fecha ISO; devuelve null si inválida. */
function parseFecha(v) {
  const s = soloString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function headersNoStore(res) {
  res.set('Cache-Control', 'no-store');
}

/**
 * Días transcurridos desde `fecha` hasta hoy (enteros >= 0).
 * Devuelve 0 si la fecha es inválida (nunca NaN).
 */
function diasDesde(fecha) {
  if (!fecha) return 0;
  const f = new Date(fecha);
  if (Number.isNaN(f.getTime())) return 0;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  f.setHours(0, 0, 0, 0);

  const dias = Math.floor((hoy - f) / 86400000);
  return Number.isFinite(dias) && dias > 0 ? dias : 0;
}

/** Mapea días al rango de aging correspondiente. */
function rangoAging(dias) {
  if (dias <= 30) return '0-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

function describeTipo(tipo) {
  return DESCRIPCION_TIPO[tipo] || tipo;
}

// ============================================================
// AGING FIFO
// ------------------------------------------------------------
// Aplica créditos (NC + pagos) contra débitos (facturas y otros
// documentos que generan deuda), en orden cronológico.
// Los créditos no aplicados quedan como "a favor del cliente".
// ============================================================
/**
 * @param {Array<{fecha: Date, monto: number, dias_vencidos: number}>} facturas
 * @param {Array<{fecha: Date, monto: number}>} creditos
 * @returns {{
 *   aging: { [bucket: string]: number },
 *   totalPendiente: number,
 *   totalAplicado: number,
 *   creditoAFavor: number
 * }}
 */
function calcularAgingFIFO(facturas, creditos) {
  const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 };

  if (!Array.isArray(facturas) || facturas.length === 0) {
    const creditoAFavor = creditos.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    return { aging, totalPendiente: 0, totalAplicado: 0, creditoAFavor: round2(creditoAFavor) };
  }

  // Ordenar por fecha ascendente (más antiguos primero).
  const fac = [...facturas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const cred = [...creditos].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  let creditoIdx = 0;
  let creditoRestante = Number(cred[0]?.monto) || 0;
  let totalPendiente = 0;
  let totalAplicado = 0;

  for (const f of fac) {
    let pendiente = Number(f.monto) || 0;

    while (pendiente > CONFIG.umbralSaldo && creditoIdx < cred.length) {
      const aplicar = Math.min(creditoRestante, pendiente);
      pendiente -= aplicar;
      creditoRestante -= aplicar;
      totalAplicado += aplicar;

      if (creditoRestante <= CONFIG.umbralSaldo) {
        creditoIdx++;
        creditoRestante = Number(cred[creditoIdx]?.monto) || 0;
      }
    }

    if (pendiente > CONFIG.umbralSaldo) {
      aging[rangoAging(f.dias_vencidos)] += pendiente;
      totalPendiente += pendiente;
    }
  }

  // Créditos sobrantes (pagos a cuenta / saldo a favor del cliente).
  let creditoAFavor = creditoRestante;
  for (let i = creditoIdx + 1; i < cred.length; i++) {
    creditoAFavor += Number(cred[i].monto) || 0;
  }

  for (const k of Object.keys(aging)) aging[k] = round2(aging[k]);

  return {
    aging,
    totalPendiente: round2(totalPendiente),
    totalAplicado: round2(totalAplicado),
    creditoAFavor: round2(creditoAFavor)
  };
}

// ============================================================
// MIDDLEWARE (aplica a todo el router)
// ============================================================
router.use(requierePermiso('reportes', 'ver'));

// ============================================================
// GET /  → resumen global de cartera (CxC)
// ============================================================
router.get('/', async (req, res, next) => {
  try {
    const sinCache = req.query.nocache === '1';
    const sortParam = soloString(req.query.sort);
    const sortPorAntiguedad = sortParam === 'antiguedad';

    if (!sinCache && !sortPorAntiguedad) {
      const cached = leerCacheCartera();
      if (cached) {
        res.set('X-Cache', 'HIT');
        headersNoStore(res);
        return res.json(cached);
      }
    }

    const t0 = Date.now();
    const db = req.db;

    // Queries en paralelo: agregado de ventas + agregado de pagos.
    const [cxcAgg, pagosAgg] = await Promise.all([
      db.collection(CONFIG.colVentas).aggregate([
        { $match: { tipo_documento: { $nin: [...TIPOS_NO_CXC] } } },
        {
          $group: {
            _id: '$clienteId',
            totalDebitos: {
              $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
            },
            totalCreditosNC: {
              $sum: { $cond: [{ $eq: ['$tipo_documento', 'nota_credito'] }, '$total', 0] }
            },
            cantidadFacturas: {
              $sum: { $cond: [{ $ne: ['$tipo_documento', 'nota_credito'] }, 1, 0] }
            },
            ultimaFactura: { $max: '$fecha_emision' }
          }
        }
      ]).toArray(),
      db.collection(CONFIG.colPagos).aggregate([
        { $match: { tipo: 'cobro', anulado: { $ne: true }, clienteId: { $ne: null } } },
        { $group: { _id: '$clienteId', totalPagos: { $sum: '$monto' } } }
      ]).toArray()
    ]);

    const pagosPorCliente = new Map(pagosAgg.map(p => [String(p._id), Number(p.totalPagos) || 0]));

    // Traer clientes involucrados en una sola query.
    const clienteIds = cxcAgg.map(c => c._id).filter(Boolean);
    const clientes = clienteIds.length
      ? await db.collection(CONFIG.colClientes).find(
          { _id: { $in: clienteIds } },
          { projection: { nombre: 1, ruc: 1, telefono: 1 } }
        ).toArray()
      : [];
    const clienteMap = new Map(clientes.map(c => [String(c._id), c]));

    const resultado = cxcAgg
      .map(c => {
        const pagos = pagosPorCliente.get(String(c._id)) || 0;
        const debitos = Number(c.totalDebitos) || 0;
        const creditosNC = Number(c.totalCreditosNC) || 0;
        const saldo = debitos - creditosNC - pagos;
        const cli = clienteMap.get(String(c._id));
        return {
          clienteId: c._id,
          clienteNombre: cli?.nombre || 'Cliente eliminado',
          clienteRuc: cli?.ruc || '',
          clienteTelefono: cli?.telefono || '',
          totalDebitos: round2(debitos),
          totalCreditosNC: round2(creditosNC),
          totalPagos: round2(pagos),
          saldo: round2(saldo),
          cantidadFacturas: Number(c.cantidadFacturas) || 0,
          ultimaFactura: c.ultimaFactura,
          // Días desde la última factura (útil para ordenar por antigüedad).
          diasUltimaFactura: c.ultimaFactura ? diasDesde(c.ultimaFactura) : null
        };
      })
      .filter(r => r.saldo > CONFIG.umbralSaldo);

    // Ordenar (por saldo por defecto, por antigüedad si se pidió).
    if (sortPorAntiguedad) {
      resultado.sort((a, b) => (b.diasUltimaFactura || 0) - (a.diasUltimaFactura || 0));
    } else {
      resultado.sort((a, b) => b.saldo - a.saldo);
    }

    const recortados = resultado.length > CONFIG.maxClientesCartera
      ? resultado.slice(0, CONFIG.maxClientesCartera)
      : resultado;

    const totalCartera = round2(resultado.reduce((s, r) => s + r.saldo, 0));

    const payload = {
      totalCartera,
      clientesConDeuda: resultado.length,
      clientes: recortados,
      _meta: {
        tiempoMs: Date.now() - t0,
        cacheMs: CONFIG.cacheCarteraMs,
        truncado: resultado.length > CONFIG.maxClientesCartera
      }
    };

    // Solo cacheamos la versión por defecto (saldo).
    if (!sortPorAntiguedad) {
      guardarCacheCartera(payload);
      res.set('X-Cache', 'MISS');
    }
    headersNoStore(res);
    return res.json(payload);
  } catch (err) {
    log.error({ err: err.message }, 'Error en resumen de cartera');
    return next(err);
  }
});

// ============================================================
// GET /:clienteId  → estado de cuenta por cliente
// ============================================================
router.get('/:clienteId', async (req, res, next) => {
  try {
    const clienteObjectId = requireObjectId(req.params.clienteId);

    const desde = parseFecha(req.query.desde);
    const hasta = parseFecha(req.query.hasta);
    const hayFiltroFecha = Boolean(desde || hasta);

    // Cliente + ventas + pagos en paralelo (una sola ida y vuelta).
    const [cliente, ventas, pagos] = await Promise.all([
      req.db.collection(CONFIG.colClientes).findOne({ _id: clienteObjectId }),
      req.db.collection(CONFIG.colVentas)
        .find(
          hayFiltroFecha
            ? {
                clienteId: clienteObjectId,
                fecha_emision: {
                  ...(desde ? { $gte: desde } : {}),
                  ...(hasta ? { $lte: new Date(hasta.getTime() + 86399999) } : {})
                }
              }
            : { clienteId: clienteObjectId }
        )
        .sort({ fecha_emision: 1 })
        .limit(CONFIG.maxMovimientos)
        .toArray(),
      req.db.collection(CONFIG.colPagos)
        .find(
          hayFiltroFecha
            ? {
                clienteId: clienteObjectId,
                anulado: { $ne: true },
                fecha: {
                  ...(desde ? { $gte: desde } : {}),
                  ...(hasta ? { $lte: new Date(hasta.getTime() + 86399999) } : {})
                }
              }
            : { clienteId: clienteObjectId, anulado: { $ne: true } }
        )
        .sort({ fecha: 1 })
        .limit(CONFIG.maxMovimientos)
        .toArray()
    ]);

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado', codigo: 'CLIENTE_NOT_FOUND' });
    }

    // ---- Construir movimientos ----
    const movimientos = [];

    for (const v of ventas) {
      const tipo = v.tipo_documento || 'factura';
      if (TIPOS_NO_DEUDA_SET.has(tipo)) continue;

      const esNC = tipo === 'nota_credito';
      const total = Number(v.total) || 0;

      movimientos.push({
        _id: v._id,
        fecha: v.fecha_emision,
        tipo,
        numero: v.numero_factura || '',
        descripcion: describeTipo(tipo),
        debito: esNC ? 0 : total,
        credito: esNC ? total : 0,
        saldo: 0,
        forma_pago: v.forma_pago || '',
        estado_pago: v.estado_pago || 'pendiente',
        dias_vencidos: diasDesde(v.fecha_emision)
      });
    }

    for (const p of pagos) {
      movimientos.push({
        _id: p._id,
        fecha: p.fecha,
        tipo: 'pago',
        numero: p.numero_recibo || '',
        descripcion: `Pago ${p.forma_pago || ''}`.trim(),
        debito: 0,
        credito: Number(p.monto) || 0,
        saldo: 0,
        forma_pago: p.forma_pago || '',
        estado_pago: 'pagado',
        dias_vencidos: 0 // los pagos no tienen antigüedad
      });
    }

    // Ordenar cronológicamente.
    movimientos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    // Calcular saldo acumulado.
    let saldoAcumulado = 0;
    for (const m of movimientos) {
      saldoAcumulado += m.debito - m.credito;
      m.saldo = round2(saldoAcumulado);
    }

    // Totales.
    const totalDebitos = round2(movimientos.reduce((s, m) => s + m.debito, 0));
    const totalCreditos = round2(movimientos.reduce((s, m) => s + m.credito, 0));
    const saldoFinal = round2(totalDebitos - totalCreditos);

    // ---- Aging con FIFO ----
    const facturasDeuda = movimientos
      .filter(m => m.debito > 0)
      .map(m => ({
        fecha: m.fecha,
        monto: m.debito,
        dias_vencidos: m.dias_vencidos
      }));

    const creditos = movimientos
      .filter(m => m.credito > 0)
      .map(m => ({ fecha: m.fecha, monto: m.credito }));

    const agingResultado = calcularAgingFIFO(facturasDeuda, creditos);

    // ---- Resumen por tipo ----
    const resumenPorTipo = {};
    for (const m of movimientos) {
      if (!resumenPorTipo[m.tipo]) resumenPorTipo[m.tipo] = { cantidad: 0, total: 0 };
      resumenPorTipo[m.tipo].cantidad++;
      resumenPorTipo[m.tipo].total += Math.max(m.debito, m.credito);
    }
    for (const k of Object.keys(resumenPorTipo)) {
      resumenPorTipo[k].total = round2(resumenPorTipo[k].total);
    }

    headersNoStore(res);
    return res.json({
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        ruc: cliente.ruc,
        telefono: cliente.telefono,
        email: cliente.email,
        direccion: cliente.direccion,
        tipo: cliente.tipo
      },
      periodo: {
        desde: desde || null,
        hasta: hasta || null,
        generado: new Date()
      },
      movimientos,
      totales: {
        totalDebitos,
        totalCreditos,
        saldoFinal,
        cantidadMovimientos: movimientos.length
      },
      aging: agingResultado.aging,
      agingDetalle: {
        totalPendiente: agingResultado.totalPendiente,
        totalAplicado: agingResultado.totalAplicado,
        creditoAFavor: agingResultado.creditoAFavor
      },
      resumenPorTipo
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests / invalidación manual ----
module.exports._CONFIG = CONFIG;
module.exports._diasDesde = diasDesde;
module.exports._rangoAging = rangoAging;
module.exports._calcularAgingFIFO = calcularAgingFIFO;
module.exports._invalidarCacheCartera = invalidarCacheCartera;