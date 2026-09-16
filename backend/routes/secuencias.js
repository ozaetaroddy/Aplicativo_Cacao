// backend/routes/secuencias.js
// ============================================================
// ⚠️  DEPRECADO: usar /api/contadores
// ------------------------------------------------------------
// Este router mantiene la API legacy por compatibilidad, pero
// internamente usa la MISMA colección `contadores` que
// /api/contadores. Se retirará en una versión futura.
//
// Endpoints (todos GET):
//   /producto            /producto/peek
//   /factura             /factura/peek
//   /compra              /compra/peek
//   /guia                /guia/peek
//   /retencion           /retencion/peek
//   /liquidacion         /liquidacion/peek
//   /exportacion         /exportacion/peek
//
// Convenciones:
//   - Los `peek` NO reservan; los demás SÍ incrementan el contador.
//   - Todos emiten headers de deprecación (Deprecation, Link, Warning).
//   - Los errores se delegan al `errorHandler` central.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requierePermiso } = require('../utils/permisos');
const log = require('../utils/logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  col: 'contadores',
  coleccion: 'contadores',

  /** Longitud máxima de padding (defensa contra `longitud` absurda). */
  maxLongitud: 20,

  /** Tope del contador (mismo que /api/contadores). */
  valorMax: 999_999_999,

  /** Header común de deprecación. */
  deprecation: Object.freeze({
    Deprecation: 'true',
    Link: '</api/contadores>; rel="successor-version"',
    Warning: '299 - "Este endpoint está deprecado. Usar /api/contadores"'
  })
});

// ============================================================
// MAPEO legacy nombreSecuencia → contadorId
// ============================================================
const SECUENCIA_A_CONTADOR = Object.freeze({
  producto_codigo:    'producto_codigo',
  factura_numero:     'factura',
  compra_numero:      'compra',
  guia_numero:        'guia_remision',
  retencion_numero:   'retencion',
  liquidacion_numero: 'liquidacion',
  exportacion_numero: 'exportacion'
});

/**
 * Tabla única que describe TODAS las rutas.
 * El factory de abajo genera los handlers a partir de esto.
 *
 * @property {string} path         Ruta base (sin `/peek`)
 * @property {string} secuencia    Clave del mapeo legacy
 * @property {string} prefijo      Prefijo del código resultante
 * @property {number} longitud     Padding del número
 * @property {string} campo        Campo del JSON de respuesta ('codigo' | 'numero')
 * @property {[string, string]} permiso  [módulo, acción]
 */
const RUTAS = Object.freeze([
  {
    path: 'producto',
    secuencia: 'producto_codigo',
    prefijo: 'PROD-',
    longitud: 4,
    campo: 'codigo',
    permiso: ['productos', 'crear']
  },
  {
    path: 'factura',
    secuencia: 'factura_numero',
    prefijo: '',
    longitud: 7,
    campo: 'numero',
    permiso: ['ventas', 'crear']
  },
  {
    path: 'compra',
    secuencia: 'compra_numero',
    prefijo: 'COMP-',
    longitud: 4,
    campo: 'numero',
    permiso: ['compras', 'crear']
  },
  {
    path: 'guia',
    secuencia: 'guia_numero',
    prefijo: 'G-',
    longitud: 4,
    campo: 'numero',
    permiso: ['ventas', 'crear']
  },
  {
    path: 'retencion',
    secuencia: 'retencion_numero',
    prefijo: 'RET-',
    longitud: 4,
    campo: 'numero',
    permiso: ['retenciones', 'crear']
  },
  {
    path: 'liquidacion',
    secuencia: 'liquidacion_numero',
    prefijo: 'LIQ-',
    longitud: 4,
    campo: 'numero',
    permiso: ['ventas', 'crear']
  },
  {
    path: 'exportacion',
    secuencia: 'exportacion_numero',
    prefijo: 'EXP-',
    longitud: 4,
    campo: 'numero',
    permiso: ['ventas', 'crear']
  }
]);

// ============================================================
// HELPERS
// ============================================================

/** Setea headers de deprecación + no-store. */
function headersDeprecado(res) {
  res.set('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(CONFIG.deprecation)) {
    res.set(k, v);
  }
}

/** Resuelve el `_id` interno del contador a partir del nombre legacy. */
function resolverContadorId(nombreSecuencia) {
  return SECUENCIA_A_CONTADOR[nombreSecuencia] || nombreSecuencia;
}

/** Normaliza longitud (nunca mayor a `maxLongitud`). */
function normalizarLongitud(longitud) {
  const n = Number(longitud);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), CONFIG.maxLongitud);
}

/** Construye el código a partir de prefijo + valor + padding. */
function construirCodigo(prefijo, valor, longitud) {
  const len = normalizarLongitud(longitud);
  const num = String(valor).padStart(len, '0');
  return `${prefijo || ''}${num}`;
}

/** Extrae `valor` numérico compatible con driver v3 (`{value}`) y v4+. */
function extraerValor(result) {
  if (!result) return null;
  // Driver v3: { value: doc } | { lastErrorObject, value }
  // Driver v4+: doc directo (o null)
  const doc = result && result.value !== undefined ? result.value : result;
  const valor = Number(doc?.valor);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Reserva el siguiente valor de un contador (atómico).
 * @throws Error tipado si el contador devuelve un valor inválido o se agota.
 */
async function getNextSequence(db, nombreSecuencia, prefijo = '', longitud = 4) {
  const contadorId = resolverContadorId(nombreSecuencia);

  const r = await db.collection(CONFIG.col).findOneAndUpdate(
    { _id: contadorId },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  const valor = extraerValor(r);
  if (valor === null) {
    const err = new Error(`Contador "${contadorId}" devolvió un valor inválido`);
    err.status = 500;
    err.codigo = 'CONTADOR_INVALIDO';
    throw err;
  }
  if (valor > CONFIG.valorMax) {
    const err = new Error(
      `El contador "${contadorId}" alcanzó el máximo permitido (${CONFIG.valorMax}).`
    );
    err.status = 409;
    err.codigo = 'CONTADOR_AGOTADO';
    throw err;
  }

  return { valor, codigo: construirCodigo(prefijo, valor, longitud) };
}

/**
 * Muestra el próximo valor SIN reservarlo.
 */
async function peekSequence(db, nombreSecuencia, prefijo = '', longitud = 4) {
  const contadorId = resolverContadorId(nombreSecuencia);

  const doc = await db.collection(CONFIG.col).findOne({ _id: contadorId });
  const actual = Number(doc?.valor) || 0;
  const valor = actual + 1;

  return { valor, codigo: construirCodigo(prefijo, valor, longitud) };
}

/** Auditoría que NUNCA rompe la request. */
async function auditarSeguro(db, req, payload) {
  try {
    const { logAudit } = require('../utils/audit');
    await logAudit(db, req, payload);
  } catch (err) {
    log.warn({ err: err.message, accion: payload?.accion }, 'Fallo al auditar secuencia');
  }
}

// ============================================================
// MIDDLEWARE GLOBAL — aviso de deprecación
// ============================================================
router.use((req, res, next) => {
  headersDeprecado(res);
  next();
});

// ============================================================
// FACTORY DE HANDLERS
// ============================================================
/**
 * Genera el handler de reserva (`GET /<path>`).
 * @param {object} ruta — entrada de `RUTAS`.
 */
function handlerReservar(ruta) {
  const { secuencia, prefijo, longitud, campo } = ruta;
  return async (req, res, next) => {
    try {
      const { valor, codigo } = await getNextSequence(req.db, secuencia, prefijo, longitud);
      return res.json({ [campo]: codigo, valor });
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Genera el handler de peek (`GET /<path>/peek`).
 * @param {object} ruta — entrada de `RUTAS`.
 */
function handlerPeek(ruta) {
  const { secuencia, prefijo, longitud, campo } = ruta;
  return async (req, res, next) => {
    try {
      const { valor, codigo } = await peekSequence(req.db, secuencia, prefijo, longitud);
      return res.json({
        [campo]: codigo,
        valor,
        peek: true,
        nota: 'Valor NO reservado'
      });
    } catch (err) {
      return next(err);
    }
  };
}

// ============================================================
// REGISTRO DE RUTAS
// ------------------------------------------------------------
// Importante: registrar `/peek` ANTES que la ruta base por si el
// router cambia en el futuro (aunque hoy no colisionan, es la
// convención segura).
// ============================================================
for (const ruta of RUTAS) {
  const [modulo, accion] = ruta.permiso;
  const middlewarePermiso = requierePermiso(modulo, accion);

  router.get(`/${ruta.path}/peek`, middlewarePermiso, handlerPeek(ruta));
  router.get(`/${ruta.path}`,      middlewarePermiso, handlerReservar(ruta));
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._RUTAS = RUTAS;
module.exports._SECUENCIA_A_CONTADOR = SECUENCIA_A_CONTADOR;
module.exports._resolverContadorId = resolverContadorId;
module.exports._construirCodigo = construirCodigo;
module.exports._normalizarLongitud = normalizarLongitud;
module.exports._extraerValor = extraerValor;
module.exports._getNextSequence = getNextSequence;
module.exports._peekSequence = peekSequence;