// utils/formatters.js
// ============================================================
// Formateo de números, monedas, fechas y bytes.
// ------------------------------------------------------------
// Reglas:
//   - Todos aceptan strings numéricos ("123.45") además de números.
//   - Todos son null-safe (devuelven "0.00" / "" en vez de lanzar).
//   - roundTo2 usa EPSILON para evitar el bug clásico de 1.005.
//   - Formato local es-EC (punto de miles, coma decimal) por defecto.
// ============================================================
'use strict'

// ============================================================
// CONSTANTES
// ============================================================
const LOCALE_EC = 'es-EC'
const TZ_EC = 'America/Guayaquil'

// ============================================================
// HELPERS INTERNOS
// ============================================================
/**
 * Convierte un valor a número finito. Devuelve `fallback` si no se puede.
 *
 * Reemplaza el patrón roto `isNaN(valor)`:
 *   - `Number.isFinite(Number("abc"))` → false   ✅
 *   - `Number.isFinite(Number(""))`    → true (0) ⚠️ lo controlamos
 *   - `Number.isFinite(Number(null))`  → true (0) ⚠️ lo controlamos
 *
 * @param {*} v
 * @param {number} [fallback=0]
 * @returns {number}
 */
function toNumberSeguro(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// ============================================================
// NÚMEROS
// ============================================================
/**
 * Redondea a 2 decimales.
 *
 * 🐛 BUG FIX: `Math.round(valor * 100) / 100` falla con valores como
 * 1.005 → 1 (debería ser 1.01) por representación IEEE 754.
 * Se usa `Number.EPSILON` para compensar.
 *
 * @param {*} valor
 * @returns {number}
 */
export function roundTo2(valor) {
  const n = toNumberSeguro(valor)
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Redondea a N decimales (genérico).
 * @param {*} valor
 * @param {number} [decimales=2]
 * @returns {number}
 */
export function roundTo(valor, decimales = 2) {
  const n = toNumberSeguro(valor)
  const factor = Math.pow(10, decimales)
  return Math.round((n + Number.EPSILON) * factor) / factor
}

/**
 * Formatea un número con separador de miles y `decimales` decimales.
 *
 * @param {*} valor
 * @param {object} [opts]
 * @param {number} [opts.decimales=2]
 * @param {boolean} [opts.miles=true]  Mostrar separador de miles
 * @returns {string}  Ej: "1.234,56"
 */
export function formatNumber(valor, { decimales = 2, miles = true } = {}) {
  const n = toNumberSeguro(valor)
  return n.toLocaleString(LOCALE_EC, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: miles
  })
}

/**
 * Formatea un número SIN separador de miles (útil para inputs, XMLs).
 * @param {*} valor
 * @param {number} [decimales=2]
 * @returns {string}  Ej: "1234.56"
 */
export function formatNumberPlain(valor, decimales = 2) {
  return roundTo(valor, decimales).toFixed(decimales)
}

// ============================================================
// MONEDA
// ============================================================
/**
 * Formatea un valor como moneda.
 *
 * @param {*} valor
 * @param {object} [opts]
 * @param {string} [opts.simbolo='$']
 * @param {number} [opts.decimales=2]
 * @param {boolean} [opts.miles=true]
 * @param {boolean} [opts.signoNegativo=true]  `-$5.00` en vez de `$-5.00`
 * @returns {string}
 */
export function formatCurrency(valor, opts = {}) {
  const {
    simbolo = '$',
    decimales = 2,
    miles = true,
    signoNegativo = true
  } = opts

  const n = roundTo(valor, decimales)
  const abs = Math.abs(n)
  const cuerpo = abs.toLocaleString(LOCALE_EC, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: miles
  })

  const negativo = n < 0
  if (negativo && signoNegativo) return `-${simbolo}${cuerpo}`
  return `${simbolo}${cuerpo}`
}

/**
 * Formatea un valor como porcentaje.
 * @param {*} valor         Ej: 15  →  "15%"
 * @param {object} [opts]
 * @param {number} [opts.decimales=0]
 * @param {boolean} [opts.espacio=false]  `15 %` si true
 * @returns {string}
 */
export function formatPercent(valor, { decimales = 0, espacio = false } = {}) {
  const n = roundTo(valor, decimales)
  const sep = espacio ? ' ' : ''
  return `${formatNumberPlain(n, decimales)}${sep}%`
}

// ============================================================
// FECHAS
// ============================================================
/**
 * Formatea una fecha en es-EC (dd/mm/yyyy).
 * @param {*} fecha
 * @param {object} [opts]
 * @param {string} [opts.locale='es-EC']
 * @param {string} [opts.timeZone='America/Guayaquil']
 * @returns {string}
 */
export function formatDate(fecha, { locale = LOCALE_EC, timeZone = TZ_EC } = {}) {
  if (!fecha) return ''
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

/**
 * Formatea una fecha con hora en es-EC.
 * @param {*} fecha
 * @returns {string}  Ej: "15/06/2024, 14:30"
 */
export function formatDateTime(fecha, { locale = LOCALE_EC, timeZone = TZ_EC } = {}) {
  if (!fecha) return ''
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(locale, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

/**
 * Formatea una hora (HH:MM).
 * @param {*} fecha
 * @returns {string}
 */
export function formatTime(fecha, { locale = LOCALE_EC, timeZone = TZ_EC } = {}) {
  if (!fecha) return ''
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

/**
 * Formatea una fecha a ISO corto (YYYY-MM-DD) en TZ Ecuador.
 * @param {*} fecha
 * @returns {string}
 */
export function formatDateISO(fecha) {
  if (!fecha) return ''
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha)
    if (Number.isNaN(d.getTime())) return ''
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ_EC,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d)
    const get = (t) => partes.find((p) => p.type === t)?.value
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return ''
  }
}

/**
 * Tiempo relativo legible ("hace 2 horas", "en 3 días").
 * @param {*} fecha
 * @param {*} [ahora=new Date()]
 * @returns {string}
 */
export function formatRelative(fecha, ahora = new Date()) {
  if (!fecha) return ''
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha)
    const ref = ahora instanceof Date ? ahora : new Date(ahora)
    if (Number.isNaN(d.getTime()) || Number.isNaN(ref.getTime())) return ''

    const diff = d.getTime() - ref.getTime()
    const abs = Math.abs(diff)
    const futuro = diff > 0
    const prefijo = futuro ? 'en' : 'hace'

    const min = 60_000
    const hora = 60 * min
    const dia = 24 * hora

    if (abs < min) return 'hace un momento'
    if (abs < hora) {
      const n = Math.floor(abs / min)
      return `${prefijo} ${n} minuto${n === 1 ? '' : 's'}`
    }
    if (abs < dia) {
      const n = Math.floor(abs / hora)
      return `${prefijo} ${n} hora${n === 1 ? '' : 's'}`
    }
    if (abs < 30 * dia) {
      const n = Math.floor(abs / dia)
      return `${prefijo} ${n} día${n === 1 ? '' : 's'}`
    }
    // > 30 días → fecha absoluta
    return formatDate(d)
  } catch {
    return ''
  }
}

// ============================================================
// BYTES
// ============================================================
/**
 * Formatea un tamaño en bytes con unidad legible.
 * @param {*} bytes
 * @param {object} [opts]
 * @param {number} [opts.decimales]  Default: auto (0 B, 1 KB, 2 MB)
 * @returns {string}
 */
export function formatBytes(bytes, { decimales } = {}) {
  const n = toNumberSeguro(bytes, -1)
  if (n < 0) return '—'
  if (n === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1)

  // Auto: 0 decimales para bytes, 1 para KB, 2 para MB+
  const dec = decimales !== undefined
    ? decimales
    : (i === 0 ? 0 : i === 1 ? 1 : 2)

  return `${(n / Math.pow(k, i)).toFixed(dec)} ${sizes[i]}`
}

// ============================================================
// TRUNCAR TEXTO
// ============================================================
/**
 * Trunca un string a `max` chars con elipsis.
 * @param {*} texto
 * @param {number} [max=50]
 * @param {string} [sufijo='…']
 * @returns {string}
 */
export function truncate(texto, max = 50, sufijo = '…') {
  if (texto === null || texto === undefined) return ''
  const s = String(texto)
  if (s.length <= max) return s
  if (max <= sufijo.length) return sufijo.slice(0, max)
  return s.slice(0, max - sufijo.length) + sufijo
}

// ============================================================
// DEFAULTS EXPORTADOS (compatibilidad)
// ============================================================
/**
 * Alias histórico — antes `formatNumber` hacía lo que hoy hace
 * `formatNumberPlain`. Se mantiene por compatibilidad, pero se
 * recomienda usar `formatNumberPlain` para no confundir con el
 * `formatNumber` con separador de miles.
 *
 * @deprecated
 */
export const formatNumberLegacy = formatNumberPlain

// ---- Solo para tests ----
export const _toNumberSeguro = toNumberSeguro
export const _LOCALE_EC = LOCALE_EC
export const _TZ_EC = TZ_EC