// backend/utils/pagination.js
// Helpers para paginación, búsqueda y filtros

/**
 * Parsea los parámetros de paginación de req.query
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query) {
  const rawPage = parseInt(query.page, 10)
  const rawLimit = parseInt(query.limit, 10)
  const page = rawPage > 0 ? rawPage : 1
  const limit = rawLimit > 0 ? Math.min(rawLimit, 200) : 20
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

/**
 * Detecta si el cliente está pidiendo paginación explícita.
 * Si no, devolvemos todo como antes (retrocompatibilidad).
 */
function wantsPagination(query) {
  return 'page' in query || 'limit' in query
}

/**
 * Construye un filtro de rango de fechas para MongoDB
 * @param {object} query
 * @param {string} field - campo de fecha (por defecto fecha_emision)
 */
function buildDateRange(query, field = 'fecha_emision') {
  const { desde, hasta } = query
  if (!desde && !hasta) return null
  const range = {}
  if (desde) {
    const d = new Date(desde)
    if (!isNaN(d)) range.$gte = d
  }
  if (hasta) {
    const h = new Date(hasta)
    if (!isNaN(h)) {
      h.setHours(23, 59, 59, 999)
      range.$lte = h
    }
  }
  return Object.keys(range).length ? { [field]: range } : null
}

/**
 * Construye un filtro $match combinando fecha + campos exactos
 * @param {object} query - req.query
 * @param {object} options
 * @param {string} options.dateField
 * @param {object} options.exactFields - mapeo queryParam -> campo DB
 */
function buildMatch(query, options = {}) {
  const { dateField = 'fecha_emision', exactFields = {} } = options
  const match = {}

  const dateFilter = buildDateRange(query, dateField)
  if (dateFilter) Object.assign(match, dateFilter)

  Object.keys(exactFields).forEach((paramKey) => {
    const val = query[paramKey]
    if (val !== undefined && val !== null && val !== '') {
      match[exactFields[paramKey]] = val
    }
  })

  return match
}

/**
 * Parsea el ordenamiento
 * @param {object} query
 * @param {object} defaultSort
 */
function parseSort(query, defaultSort = { fecha_emision: -1 }) {
  const { sortBy, sortDir } = query
  if (!sortBy) return defaultSort
  const dir = String(sortDir).toLowerCase() === 'asc' ? 1 : -1
  return { [sortBy]: dir }
}

/**
 * Escapa caracteres especiales de regex
 */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = {
  parsePagination,
  wantsPagination,
  buildDateRange,
  buildMatch,
  parseSort,
  escapeRegex
}