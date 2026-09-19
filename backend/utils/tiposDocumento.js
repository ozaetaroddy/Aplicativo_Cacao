// backend/utils/tiposDocumento.js
// ============================================================
// Fuente única de verdad para clasificación de documentos
// ------------------------------------------------------------
// Todos los tipos de documento que maneja el sistema, con sus
// categorías semánticas y metadatos (código SRI, prefijo,
// descripción).
//
// Uso típico:
//   const { SETS, esComercial, afectaStock } = require('../utils/tiposDocumento');
//
//   // Chequeo rápido O(1) en bucles grandes
//   if (SETS.TIPOS_NO_CXC.has(doc.tipo_documento)) continue;
//
//   // Helper con normalización incluida
//   if (esComercial('Factura')) { ... }
//
// API pública (compat total con la versión anterior):
//   TIPOS_NO_COMERCIALES
//   TIPOS_NO_CXC                (alias: TIPOS_NO_DEUDA)
//   TIPOS_VENTA_NO_ATS
//   TIPOS_SIN_MOVIMIENTO_STOCK
//   DOCS_CON_CLAVE
//   TIPOS_DOCUMENTO_VALIDOS
//   TIPO_COMPROBANTE_SRI
//   PREFIJOS_CONTADOR
//   matchSoloVentasComerciales()
//   matchVentasNetas()
//
// Extensiones:
//   SETS                                   → Map de Sets para O(1)
//   DESCRIPCIONES_TIPO                     → mapa tipo → nombre legible
//   esTipoValido(t)                        → boolean
//   esComercial(t)                         → boolean
//   esCuentaPorCobrar(t)                   → boolean
//   aplicaATS(t)                           → boolean
//   afectaStock(t)                         → boolean
//   requiereClaveAcceso(t)                 → boolean
//   getCodigoSRI(t)                        → '01' | null
//   getPrefijo(t)                          → 'FAC' | null
//   getDescripcion(t)                      → string
//   normalizarTipo(t)                      → 'factura' | null
//
// 🔧 FIX 2025-XX
//   Los módulos consumidores (ej. `routes/ventas.js`) hacían
//   `TIPOS_SIN_MOVIMIENTO_STOCK.has(...)` sobre el ARRAY
//   exportado → TypeError. El Set correcto SIEMPRE estuvo en
//   `SETS.TIPOS_SIN_MOVIMIENTO_STOCK`, pero se prestaba a
//   confusión. Ahora:
//     1. Se exportan aliases `*_SET` explícitos (mismo objeto
//        que `SETS.*`, así no hay duplicación de memoria).
//     2. Se exporta el helper `afectaStock(tipo)` listo para
//        usar, que internamente usa el Set correcto.
//     3. Se documenta con JSDoc qué es Array y qué es Set.
// ============================================================
'use strict';

// ============================================================
// FUENTE ÚNICA: NO COMERCIALES
// ------------------------------------------------------------
// Estos tipos de documento NO cuentan como venta comercial ni
// como deuda del cliente. La misma lista sirve para 3 propósitos
// (CxC, ATS, excluir de ventas netas), que antes se declaraban
// por separado pero eran idénticas.
// ============================================================
const _NO_COMERCIALES_BASE = Object.freeze([
  'guia_remision',
  'proforma',
  'retencion'
]);

// ============================================================
// LISTAS PÚBLICAS (todas congeladas — son ARRAYS)
// ------------------------------------------------------------
// ⚠️  Para chequeos en bucles grandes usá `SETS.*` (O(1)).
//     Estos arrays son para mantener compatibilidad con código
//     que usa `.includes()`, `.forEach()`, `.map()`, etc.
// ============================================================

/** Comprobantes que NO son comerciales: no cuentan como venta ni deuda. */
const TIPOS_NO_COMERCIALES = _NO_COMERCIALES_BASE;

/** Tipos que NO son cuenta por cobrar del cliente. */
const TIPOS_NO_CXC = _NO_COMERCIALES_BASE;

/** Alias semántico para estado de cuenta. */
const TIPOS_NO_DEUDA = _NO_COMERCIALES_BASE;

/** Tipos que NO aplican al ATS de ventas (el SRI no los pide ahí). */
const TIPOS_VENTA_NO_ATS = _NO_COMERCIALES_BASE;

/** Documentos que NO mueven inventario en kardex. */
const TIPOS_SIN_MOVIMIENTO_STOCK = Object.freeze([
  'guia_remision',
  'proforma',
  'retencion',
  'nota_debito'
]);

/** Documentos que requieren clave de acceso SRI (49 dígitos). */
const DOCS_CON_CLAVE = Object.freeze([
  'factura',
  'liquidacion',
  'nota_credito',
  'nota_debito',
  'guia_remision',
  'retencion',
  'exportacion',
  'reembolso'
]);

/** Whitelist de tipos aceptados por POST/PUT de ventas. */
const TIPOS_DOCUMENTO_VALIDOS = Object.freeze([
  'factura',
  'nota_credito',
  'nota_debito',
  'guia_remision',
  'retencion',
  'liquidacion',
  'exportacion',
  'reembolso',
  'proforma'
]);

// ============================================================
// MAPEOS
// ============================================================

/** Mapeo interno → código SRI de comprobante. */
const TIPO_COMPROBANTE_SRI = Object.freeze({
  factura: '01',
  liquidacion: '03',
  nota_credito: '04',
  nota_debito: '05',
  guia_remision: '06',
  retencion: '07',
  exportacion: '01',
  reembolso: '01',
  proforma: null
});

/** Prefijos usados en contadores internos. */
const PREFIJOS_CONTADOR = Object.freeze({
  factura: 'FAC',
  guia_remision: 'GUI',
  exportacion: 'EXP',
  reembolso: 'REB',
  retencion: 'RET',
  liquidacion: 'LIQ',
  nota_credito: 'NCR',
  nota_debito: 'NDB',
  proforma: 'PRO',
  compra: 'COM'
});

/** Descripciones legibles (para logs, reportes y UI). */
const DESCRIPCIONES_TIPO = Object.freeze({
  factura: 'Factura',
  nota_credito: 'Nota de Crédito',
  nota_debito: 'Nota de Débito',
  guia_remision: 'Guía de Remisión',
  retencion: 'Comprobante de Retención',
  liquidacion: 'Liquidación de Compra',
  exportacion: 'Comprobante de Exportación',
  reembolso: 'Comprobante de Reembolso',
  proforma: 'Proforma',
  compra: 'Compra'
});

// ============================================================
// SETS PARA O(1) — fuente canónica
// ------------------------------------------------------------
// Se exponen como `SETS.*` (API preferida) y también como
// `*_SET` (aliases explícitos, misma referencia en memoria).
// ============================================================
const SETS = Object.freeze({
  TIPOS_NO_COMERCIALES:        Object.freeze(new Set(TIPOS_NO_COMERCIALES)),
  TIPOS_NO_CXC:                Object.freeze(new Set(TIPOS_NO_CXC)),
  TIPOS_NO_DEUDA:              Object.freeze(new Set(TIPOS_NO_DEUDA)),
  TIPOS_VENTA_NO_ATS:          Object.freeze(new Set(TIPOS_VENTA_NO_ATS)),
  TIPOS_SIN_MOVIMIENTO_STOCK:  Object.freeze(new Set(TIPOS_SIN_MOVIMIENTO_STOCK)),
  DOCS_CON_CLAVE:              Object.freeze(new Set(DOCS_CON_CLAVE)),
  TIPOS_DOCUMENTO_VALIDOS:     Object.freeze(new Set(TIPOS_DOCUMENTO_VALIDOS))
});

// ============================================================
// ALIASES EXPLÍCITOS (`*_SET`)
// ------------------------------------------------------------
// Misma referencia que `SETS.*`. Existen para que el import
// sea autoexplicativo en el código consumidor:
//
//   const { TIPOS_SIN_MOVIMIENTO_STOCK_SET } = require('...');
//   if (TIPOS_SIN_MOVIMIENTO_STOCK_SET.has(tipo)) { ... }
//
// Es imposible confundirse con el array homónimo.
// ============================================================
const TIPOS_NO_COMERCIALES_SET       = SETS.TIPOS_NO_COMERCIALES;
const TIPOS_NO_CXC_SET               = SETS.TIPOS_NO_CXC;
const TIPOS_NO_DEUDA_SET             = SETS.TIPOS_NO_DEUDA;
const TIPOS_VENTA_NO_ATS_SET         = SETS.TIPOS_VENTA_NO_ATS;
const TIPOS_SIN_MOVIMIENTO_STOCK_SET = SETS.TIPOS_SIN_MOVIMIENTO_STOCK;
const DOCS_CON_CLAVE_SET             = SETS.DOCS_CON_CLAVE;
const TIPOS_DOCUMENTO_VALIDOS_SET    = SETS.TIPOS_DOCUMENTO_VALIDOS;

// ============================================================
// HELPERS
// ============================================================
/**
 * Normaliza un tipo de documento recibido del usuario o de la BD.
 * - trim
 * - lowercase
 * - rechaza no-strings
 *
 * @param {*} tipo
 * @returns {string|null}
 */
function normalizarTipo(tipo) {
  if (typeof tipo !== 'string') return null;
  const s = tipo.trim().toLowerCase();
  return s.length > 0 ? s : null;
}

/**
 * ¿Es un tipo de documento reconocido por el sistema?
 * @param {*} tipo
 * @returns {boolean}
 */
function esTipoValido(tipo) {
  const t = normalizarTipo(tipo);
  return t !== null && SETS.TIPOS_DOCUMENTO_VALIDOS.has(t);
}

/**
 * ¿Es un comprobante comercial (cuenta como venta/deuda)?
 * @param {*} tipo
 * @returns {boolean}
 */
function esComercial(tipo) {
  const t = normalizarTipo(tipo);
  if (t === null) return false;
  // Debe ser un tipo válido Y no estar en la lista de no-comerciales.
  return SETS.TIPOS_DOCUMENTO_VALIDOS.has(t) && !SETS.TIPOS_NO_COMERCIALES.has(t);
}

/**
 * ¿El tipo representa una cuenta por cobrar del cliente?
 * @param {*} tipo
 * @returns {boolean}
 */
function esCuentaPorCobrar(tipo) {
  return esComercial(tipo);
}

/**
 * ¿El tipo aplica al ATS de ventas?
 * @param {*} tipo
 * @returns {boolean}
 */
function aplicaATS(tipo) {
  return esComercial(tipo);
}

/**
 * ¿El tipo genera movimiento de stock en kardex?
 *
 * 🔧 FIX: antes algunos consumidores intentaban `.has()` sobre el
 *    ARRAY `TIPOS_SIN_MOVIMIENTO_STOCK` (TypeError). Este helper
 *    usa el Set correcto y es la forma recomendada de chequear.
 *
 * @param {*} tipo
 * @returns {boolean}
 */
function afectaStock(tipo) {
  const t = normalizarTipo(tipo);
  if (t === null) return false;
  return !SETS.TIPOS_SIN_MOVIMIENTO_STOCK.has(t);
}

/**
 * ¿El tipo requiere clave de acceso SRI (49 dígitos)?
 * @param {*} tipo
 * @returns {boolean}
 */
function requiereClaveAcceso(tipo) {
  const t = normalizarTipo(tipo);
  if (t === null) return false;
  return SETS.DOCS_CON_CLAVE.has(t);
}

/**
 * Código SRI (2 dígitos) asociado a un tipo interno.
 * @param {*} tipo
 * @returns {string|null}
 */
function getCodigoSRI(tipo) {
  const t = normalizarTipo(tipo);
  if (t === null) return null;
  return Object.prototype.hasOwnProperty.call(TIPO_COMPROBANTE_SRI, t)
    ? TIPO_COMPROBANTE_SRI[t]
    : null;
}

/**
 * Prefijo del contador para un tipo dado (ej. `'FAC'`).
 * @param {*} tipo
 * @returns {string|null}
 */
function getPrefijo(tipo) {
  const t = normalizarTipo(tipo);
  if (t === null) return null;
  return Object.prototype.hasOwnProperty.call(PREFIJOS_CONTADOR, t)
    ? PREFIJOS_CONTADOR[t]
    : null;
}

/**
 * Descripción legible del tipo (`'factura'` → `'Factura'`).
 * Si no está en el mapa, devuelve el tipo tal cual o `'Desconocido'`.
 * @param {*} tipo
 * @returns {string}
 */
function getDescripcion(tipo) {
  const t = normalizarTipo(tipo);
  if (t === null) return 'Desconocido';
  return DESCRIPCIONES_TIPO[t] || t;
}

// ============================================================
// MATCHES MONGO
// ============================================================

/**
 * Filtro Mongo reutilizable: excluye tipos no comerciales.
 * Útil para queries que cuentan "ventas comerciales".
 *
 * @returns {{ tipo_documento: { $nin: string[] } }}
 */
function matchSoloVentasComerciales() {
  return { tipo_documento: { $nin: TIPOS_NO_COMERCIALES } };
}

/**
 * Excluye además las notas de crédito (ventas netas).
 * Útil para estados de resultados y resúmenes de ingresos.
 *
 * @returns {{ tipo_documento: { $nin: string[] } }}
 */
function matchVentasNetas() {
  // El array se construye una vez y se reutiliza. Mongo no lo muta.
  return { tipo_documento: { $nin: TIPOS_NO_COMERCIALES.concat(['nota_credito']) } };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- Arrays (compat con código que usa `.includes()` / `.map()`) ----
  TIPOS_NO_COMERCIALES,
  TIPOS_NO_CXC,
  TIPOS_NO_DEUDA,
  TIPOS_VENTA_NO_ATS,
  TIPOS_SIN_MOVIMIENTO_STOCK,
  TIPOS_DOCUMENTO_VALIDOS,
  DOCS_CON_CLAVE,

  // ---- Sets canónicos (API preferida) ----
  SETS,

  // ---- Aliases explícitos `*_SET` (misma referencia que SETS.*) ----
  // Usar estos cuando el import debe ser autoexplicativo.
  TIPOS_NO_COMERCIALES_SET,
  TIPOS_NO_CXC_SET,
  TIPOS_NO_DEUDA_SET,
  TIPOS_VENTA_NO_ATS_SET,
  TIPOS_SIN_MOVIMIENTO_STOCK_SET,
  DOCS_CON_CLAVE_SET,
  TIPOS_DOCUMENTO_VALIDOS_SET,

  // ---- Mapas ----
  TIPO_COMPROBANTE_SRI,
  PREFIJOS_CONTADOR,
  DESCRIPCIONES_TIPO,

  // ---- Helpers ----
  normalizarTipo,
  esTipoValido,
  esComercial,
  esCuentaPorCobrar,
  aplicaATS,
  afectaStock,
  requiereClaveAcceso,
  getCodigoSRI,
  getPrefijo,
  getDescripcion,

  // ---- Matches Mongo ----
  matchSoloVentasComerciales,
  matchVentasNetas,

  // ---- Config congelado ----
  CONFIG: Object.freeze({
    tiposDocumento: TIPOS_DOCUMENTO_VALIDOS,
    docsConClave: DOCS_CON_CLAVE,
    noComerciales: TIPOS_NO_COMERCIALES
  })
};

// ---- Solo para tests ----
module.exports._NO_COMERCIALES_BASE = _NO_COMERCIALES_BASE;