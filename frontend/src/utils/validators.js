// utils/validators.js
// Validadores de identificación ecuatoriana según normativa del SRI

/**
 * Valida una cédula ecuatoriana usando el algoritmo módulo 10
 * @param {string} cedula - 10 dígitos
 * @returns {boolean}
 */
export function validarCedula(cedula) {
  if (!cedula || typeof cedula !== 'string') return false
  if (!/^\d{10}$/.test(cedula)) return false

  // Provincia válida (01-24)
  const provincia = parseInt(cedula.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false

  // Tercer dígito < 6 (persona natural)
  const tercerDigito = parseInt(cedula.charAt(2), 10)
  if (tercerDigito >= 6) return false

  // Algoritmo módulo 10
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula.charAt(i), 10) * coeficientes[i]
    if (valor >= 10) valor -= 9
    suma += valor
  }

  const digitoVerificador = parseInt(cedula.charAt(9), 10)
  const decenaSuperior = Math.ceil(suma / 10) * 10
  const digitoCalculado = decenaSuperior - suma

  return digitoCalculado === digitoVerificador
}

/**
 * Valida la parte de módulo 11 del RUC (sociedades privadas y públicas)
 */
function validarModulo11(ruc, coeficientes) {
  let suma = 0
  for (let i = 0; i < 9; i++) {
    suma += parseInt(ruc.charAt(i), 10) * coeficientes[i]
  }
  const residuo = suma % 11
  let digitoCalculado = 11 - residuo
  if (digitoCalculado === 11) digitoCalculado = 0
  if (digitoCalculado === 10) return false

  const digitoVerificador = parseInt(ruc.charAt(9), 10)
  return digitoCalculado === digitoVerificador
}

/**
 * Valida un RUC ecuatoriano de 13 dígitos
 * @param {string} ruc
 * @returns {boolean}
 */
export function validarRUC(ruc) {
  if (!ruc || typeof ruc !== 'string') return false
  if (!/^\d{13}$/.test(ruc)) return false

  // Debe terminar en 001
  if (!ruc.endsWith('001')) return false

  // Provincia válida
  const provincia = parseInt(ruc.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false

  const tercerDigito = parseInt(ruc.charAt(2), 10)

  // Persona natural (0-5): validar como cédula + 001
  if (tercerDigito < 6) {
    return validarCedula(ruc.substring(0, 10))
  }

  // Sociedad privada (9)
  if (tercerDigito === 9) {
    return validarModulo11(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2])
  }

  // Sociedad pública (6)
  if (tercerDigito === 6) {
    return validarModulo11(ruc, [3, 2, 7, 6, 5, 4, 3, 2, 9])
  }

  return false
}

/**
 * Valida cualquier identificación ecuatoriana (cédula o RUC)
 * Devuelve un objeto con el resultado detallado
 * @param {string} identificacion
 * @returns {{ valido: boolean, tipo: 'cedula'|'ruc'|null, mensaje: string }}
 */
export function validarIdentificacion(identificacion) {
  const limpio = String(identificacion || '').trim()

  if (!limpio) {
    return { valido: false, tipo: null, mensaje: 'La identificación es obligatoria' }
  }
  if (!/^\d+$/.test(limpio)) {
    return { valido: false, tipo: null, mensaje: 'Solo se permiten dígitos numéricos' }
  }

  if (limpio.length === 10) {
    if (validarCedula(limpio)) {
      return { valido: true, tipo: 'cedula', mensaje: '' }
    }
    return { valido: false, tipo: 'cedula', mensaje: 'Cédula inválida (dígito verificador incorrecto)' }
  }

  if (limpio.length === 13) {
    if (validarRUC(limpio)) {
      return { valido: true, tipo: 'ruc', mensaje: '' }
    }
    return { valido: false, tipo: 'ruc', mensaje: 'RUC inválido (verifique el dígito verificador o que termine en 001)' }
  }

  return { valido: false, tipo: null, mensaje: 'Debe tener 10 (cédula) o 13 (RUC) dígitos' }
}