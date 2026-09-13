// backend/utils/tiposDocumento.js
// Fuente única de verdad para clasificación de documentos.

// Comprobantes que NO son comerciales: no cuentan como venta ni deuda.
const TIPOS_NO_COMERCIALES = Object.freeze(['guia_remision', 'proforma', 'retencion']);

// Tipos que sí son cuenta por cobrar del cliente (los "no deuda").
const TIPOS_NO_CXC = Object.freeze(['guia_remision', 'proforma', 'retencion']);

// Alias semántico para estado de cuenta
const TIPOS_NO_DEUDA = TIPOS_NO_CXC;

// Tipos que NO aplican al ATS de ventas (SRI no los pide ahí).
const TIPOS_VENTA_NO_ATS = Object.freeze(['guia_remision', 'proforma', 'retencion']);

// Documentos que NO mueven inventario en kardex.
const TIPOS_SIN_MOVIMIENTO_STOCK = Object.freeze([
  'guia_remision', 'proforma', 'retencion', 'nota_debito'
]);

// Documentos que requieren clave de acceso SRI (49 dígitos).
const DOCS_CON_CLAVE = Object.freeze([
  'factura', 'liquidacion', 'nota_credito', 'nota_debito',
  'guia_remision', 'retencion', 'exportacion', 'reembolso'
]);

// Whitelist de tipos aceptados por POST/PUT de ventas.
const TIPOS_DOCUMENTO_VALIDOS = Object.freeze([
  'factura', 'nota_credito', 'nota_debito', 'guia_remision',
  'retencion', 'liquidacion', 'exportacion', 'reembolso', 'proforma'
]);

// Mapeo interno → código SRI de comprobante.
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

// Prefijos usados en contadores internos.
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

// Filtro Mongo reutilizable: excluye tipos no comerciales.
function matchSoloVentasComerciales() {
  return { tipo_documento: { $nin: [...TIPOS_NO_COMERCIALES] } };
}

// Excluye además las notas de crédito (ventas netas).
function matchVentasNetas() {
  return { tipo_documento: { $nin: [...TIPOS_NO_COMERCIALES, 'nota_credito'] } };
}

module.exports = {
  TIPOS_NO_COMERCIALES,
  TIPOS_NO_CXC,
  TIPOS_NO_DEUDA,
  TIPOS_VENTA_NO_ATS,
  TIPOS_SIN_MOVIMIENTO_STOCK,
  TIPOS_DOCUMENTO_VALIDOS,
  DOCS_CON_CLAVE,
  TIPO_COMPROBANTE_SRI,
  PREFIJOS_CONTADOR,
  matchSoloVentasComerciales,
  matchVentasNetas
};