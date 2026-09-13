// backend/utils/pagination.js
// Helpers para paginación, búsqueda y filtros

function parsePagination(query) {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);
  const page = rawPage > 0 ? rawPage : 1;
  const limit = rawLimit > 0 ? Math.min(rawLimit, 200) : 20;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function wantsPagination(query) {
  return 'page' in query || 'limit' in query;
}

function buildDateRange(query, field = 'fecha_emision') {
  const { desde, hasta } = query;
  if (!desde && !hasta) return null;
  const range = {};
  if (desde) {
    const d = new Date(desde);
    if (!isNaN(d)) range.$gte = d;
  }
  if (hasta) {
    const h = new Date(hasta);
    if (!isNaN(h)) {
      h.setHours(23, 59, 59, 999);
      range.$lte = h;
    }
  }
  return Object.keys(range).length ? { [field]: range } : null;
}

// Whitelist de campos ordenables. Se aplica en TODOS los módulos.
// Si `sortBy` no está aquí, se ignora silenciosamente y se usa el default.
const CAMPOS_ORDENABLES = new Set([
  'fecha', 'fecha_emision', 'fecha_pago', 'fecha_firma', 'fecha_autorizacion',
  'ultimo_envio_sri', 'ultima_consulta_sri',
  'createdAt', 'updatedAt',
  'numero_factura', 'numero_recibo', 'numero_guia', 'numero_retencion',
  'clave_acceso', 'numero_autorizacion', 'referencia',
  'total', 'subtotal', 'iva', 'monto', 'monto_pagado',
  'precio_unitario', 'precio_venta', 'precio_compra',
  'cantidad', 'saldo', 'saldoPendiente', 'retencion_valor',
  'nombre', 'razon_social', 'nombre_comercial', 'ruc', 'codigo', 'codigo_barras', 'email',
  'stock', 'stock_minimo',
  'estado_sri', 'estado_pago', 'tipo_documento', 'tipo_compra', 'tipo', 'anulado',
  'accion', 'coleccion', 'usuarioEmail', 'documentoNumero',
  'rol', 'activo', 'dias'
]);

function parseSort(query, defaultSort = { fecha_emision: -1 }) {
  const { sortBy, sortDir } = query;
  if (!sortBy) return defaultSort;
  if (!CAMPOS_ORDENABLES.has(sortBy)) return defaultSort;
  const dir = String(sortDir).toLowerCase() === 'asc' ? 1 : -1;
  return { [sortBy]: dir };
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  parsePagination,
  wantsPagination,
  buildDateRange,
  parseSort,
  escapeRegex,
  CAMPOS_ORDENABLES
};