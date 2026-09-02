
/**
 * Redondea un número a 2 decimales
 * @param {number} valor - Número a redondear
 * @returns {number} Número redondeado a 2 decimales
 */
export const roundTo2 = (valor) => {
  if (isNaN(valor) || valor === undefined || valor === null) return 0
  return Math.round(valor * 100) / 100
}

/**
 * Formatea un número a 2 decimales con signo $
 * @param {number} valor - Número a formatear
 * @returns {string} Cadena formateada
 */
export const formatCurrency = (valor) => {
  return `$${roundTo2(valor).toFixed(2)}`
}

/**
 * Formatea un número a 2 decimales sin signo
 * @param {number} valor - Número a formatear
 * @returns {string} Cadena con 2 decimales
 */
export const formatNumber = (valor) => {
  return roundTo2(valor).toFixed(2)
}