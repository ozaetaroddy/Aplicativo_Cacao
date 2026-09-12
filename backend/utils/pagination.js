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

function buildMatch(query, options = {}) {
  const { dateField = 'fecha_emision', exactFields = {} } = options;
  const match = {};
  const dateFilter = buildDateRange(query, dateField);
  if (dateFilter) Object.assign(match, dateFilter);
  Object.keys(exactFields).forEach((paramKey) => {
    const val = query[paramKey];
    if (val !== undefined && val !== null && val !== '') {
      match[exactFields[paramKey]] = val;
    }
  });
  return match;
}

// Whitelist de campos ordenables. Se aplica en TODOS los módulos.
const CAMPOS_ORDENABLES = new Set([
  // Fechas
  'fecha', 'fecha_emision', 'fecha_pago', 'fecha_firma', 'fecha_autorizacion',
  'createdAt', 'updatedAt',
  // Documentos
  'numero_factura', 'numero_recibo', 'clave_acceso', 'numero_autorizacion',
  // Montos
  'total', 'subtotal', 'iva', 'monto', 'monto_pagado',
  // Entidades
  'nombre', 'ruc', 'codigo', 'codigo_barras', 'email',
  // Producto / inventario
  'stock', 'stock_minimo', 'precio_venta', 'precio_compra',
  // Estados
  'estado_sri', 'estado_pago', 'tipo_documento', 'tipo_compra', 'tipo',
  // Auditoría
  'accion', 'coleccion',
  // Otros
  'rol', 'activo'
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

function paginarPipeline(pipeline, query) {
  const { skip, limit, page } = parsePagination(query);
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });
  return { page, limit };
}

module.exports = {
  parsePagination,
  wantsPagination,
  buildDateRange,
  buildMatch,
  parseSort,
  escapeRegex,
  paginarPipeline,
  CAMPOS_ORDENABLES
};