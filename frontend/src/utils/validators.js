// utils/validators.js
// ============================================================
// Validadores de documentos ecuatorianos (SRI + normativa local)
// ------------------------------------------------------------
// Todos los validadores son:
//   - PUROS (sin efectos secundarios)
//   - NULL-SAFE (aceptan null/undefined/number/objeto sin lanzar)
//   - Normalizan la entrada (quitan guiones, espacios, etc.)
//
// API pública:
//   validarCedula(id)                → boolean
//   validarRUC(id)                   → boolean
//   validarIdentificacion(id)        → { valido, tipo, mensaje }
//   validarPasaporte(pass)           → { valido, mensaje }
//   validarPlaca(placa)              → { valido, mensaje }
//   validarTelefono(tel)             → { valido, tipo, mensaje }
//   validarEmail(email)              → { valido, mensaje }
//   normalizarIdentificacion(id)     → { limpio, tipo, valido }
//   soloDigitos(s)                   → string
// ============================================================
'use strict'

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  emailMaxLen: 200,
  /** Provincias de Ecuador que emiten cédulas (01-24). */
  provinciasValidas: Object.freeze(
    new Set(Array.from({ length: 24 }, (_, i) => i + 1))
  ),
  /** Regex de control chars (incluye \x00 y \x1F). */
  controlRegex: /[\x00-\x1F\x7F]/,
  /** Solo dígitos. */
  noDigitosRegex: /\D/g
})

// ============================================================
// HELPERS
// ============================================================
/**
 * Quita todo lo que no sea dígito. Null-safe.
 * @param {*} s
 * @returns {string}
 */
export function soloDigitos(s) {
  if (s === null || s === undefined) return ''
  return String(s).replace(CONFIG.noDigitosRegex, '')
}

/**
 * `true` si el valor es un string no vacío (con contenido real).
 * @param {*} v
 */
function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * `true` si el string contiene caracteres de control.
 * @param {*} s
 */
function tieneControlChars(s) {
  if (typeof s !== 'string') return false
  return CONFIG.controlRegex.test(s)
}

/**
 * Valida que un número de provincia esté entre 01 y 24.
 * @param {string} dos  Dos primeros dígitos
 */
function provinciaValida(dos) {
  const n = parseInt(dos, 10)
  return Number.isInteger(n) && CONFIG.provinciasValidas.has(n)
}

// ============================================================
// CÉDULA (Módulo 10)
// ============================================================
/**
 * Valida una cédula ecuatoriana (10 dígitos, módulo 10).
 *
 * Acepta entradas con guiones, espacios o puntos, y las normaliza.
 *
 * @param {*} cedula
 * @returns {boolean}
 */
export function validarCedula(cedula) {
  const limpio = soloDigitos(cedula)
  if (limpio.length !== 10) return false

  // Provincia válida (01-24)
  if (!provinciaValida(limpio.substring(0, 2))) return false

  // Tercer dígito < 6 (persona natural) y > 0
  const tercerDigito = parseInt(limpio.charAt(2), 10)
  if (tercerDigito < 0 || tercerDigito >= 6) return false

  // Algoritmo módulo 10
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(limpio.charAt(i), 10) * coeficientes[i]
    if (valor >= 10) valor -= 9
    suma += valor
  }

  const digitoVerificador = parseInt(limpio.charAt(9), 10)
  const decenaSuperior = Math.ceil(suma / 10) * 10
  const digitoCalculado = decenaSuperior - suma

  return digitoCalculado === digitoVerificador
}

// ============================================================
// RUC (Módulo 10 para naturales, Módulo 11 para sociedades)
// ============================================================
/**
 * Aplica el algoritmo Módulo 11 con coeficientes específicos.
 * @param {string} ruc          13 dígitos normalizados
 * @param {number[]} coeficientes  9 coeficientes
 * @returns {boolean}
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
 * Valida un RUC ecuatoriano (13 dígitos, terminación 001).
 *
 * Acepta entradas con guiones, espacios o puntos, y las normaliza.
 *
 * @param {*} ruc
 * @returns {boolean}
 */
export function validarRUC(ruc) {
  const limpio = soloDigitos(ruc)
  if (limpio.length !== 13) return false

  // Debe terminar en 001 (establecimiento matriz)
  if (!limpio.endsWith('001')) return false

  // Provincia válida
  if (!provinciaValida(limpio.substring(0, 2))) return false

  const tercerDigito = parseInt(limpio.charAt(2), 10)

  // Persona natural (0-5): validar los 10 primeros como cédula
  if (tercerDigito < 6) {
    return validarCedula(limpio.substring(0, 10))
  }

  // Sociedad privada (tercer dígito 9)
  if (tercerDigito === 9) {
    return validarModulo11(limpio, [4, 3, 2, 7, 6, 5, 4, 3, 2])
  }

  // Sociedad pública (tercer dígito 6)
  if (tercerDigito === 6) {
    return validarModulo11(limpio, [3, 2, 7, 6, 5, 4, 3, 2, 9])
  }

  return false
}

// ============================================================
// IDENTIFICACIÓN GENÉRICA
// ============================================================
/**
 * Valida cédula o RUC sin saber de antemano cuál es.
 * Normaliza la entrada (quita guiones, espacios, etc.).
 *
 * @param {*} identificacion
 * @returns {{ valido: boolean, tipo: 'cedula'|'ruc'|null, mensaje: string }}
 */
export function validarIdentificacion(identificacion) {
  if (identificacion === null || identificacion === undefined) {
    return { valido: false, tipo: null, mensaje: 'La identificación es obligatoria' }
  }

  const raw = String(identificacion).trim()
  if (!raw) {
    return { valido: false, tipo: null, mensaje: 'La identificación es obligatoria' }
  }

  if (tieneControlChars(raw)) {
    return { valido: false, tipo: null, mensaje: 'La identificación contiene caracteres no válidos' }
  }

  const limpio = soloDigitos(raw)
  if (limpio.length === 0) {
    return { valido: false, tipo: null, mensaje: 'La identificación no contiene dígitos válidos' }
  }

  if (limpio.length === 10) {
    return validarCedula(limpio)
      ? { valido: true, tipo: 'cedula', mensaje: '' }
      : {
          valido: false,
          tipo: 'cedula',
          mensaje: 'Cédula inválida (dígito verificador incorrecto)'
        }
  }

  if (limpio.length === 13) {
    return validarRUC(limpio)
      ? { valido: true, tipo: 'ruc', mensaje: '' }
      : {
          valido: false,
          tipo: 'ruc',
          mensaje: 'RUC inválido (verifique el dígito verificador o que termine en 001)'
        }
  }

  if (limpio.length < 10) {
    return {
      valido: false,
      tipo: null,
      mensaje: `Faltan dígitos (${limpio.length}/10)`
    }
  }

  return {
    valido: false,
    tipo: null,
    mensaje: 'Debe tener 10 (cédula) o 13 (RUC) dígitos'
  }
}

/**
 * Extrae el identificador limpio (solo dígitos) y su tipo.
 * NUNCA lanza.
 *
 * @param {*} identificacion
 * @returns {{ limpio: string, tipo: 'cedula'|'ruc'|null, valido: boolean }}
 */
export function normalizarIdentificacion(identificacion) {
  const limpio = soloDigitos(identificacion)
  if (limpio.length === 10) {
    return { limpio, tipo: 'cedula', valido: validarCedula(limpio) }
  }
  if (limpio.length === 13) {
    return { limpio, tipo: 'ruc', valido: validarRUC(limpio) }
  }
  return { limpio, tipo: null, valido: false }
}

// ============================================================
// PASAPORTE (SRI tipo 06)
// ============================================================
/**
 * Valida un número de pasaporte (alfanumérico 5-20 chars).
 * El SRI acepta pasaportes internacionales sin validación de formato específico.
 *
 * @param {*} pasaporte
 * @returns {{ valido: boolean, mensaje: string }}
 */
export function validarPasaporte(pasaporte) {
  if (!esStringNoVacio(pasaporte)) {
    return { valido: false, mensaje: 'El pasaporte es obligatorio' }
  }

  const limpio = String(pasaporte).trim().toUpperCase()

  if (limpio.length < 5 || limpio.length > 20) {
    return { valido: false, mensaje: 'El pasaporte debe tener entre 5 y 20 caracteres' }
  }
  if (!/^[A-Z0-9]+$/.test(limpio)) {
    return { valido: false, mensaje: 'El pasaporte solo admite letras y números' }
  }

  return { valido: true, mensaje: '' }
}

// ============================================================
// PLACA
// ============================================================
/**
 * Valida una placa ecuatoriana.
 * Formatos: ABC1234, ABC123, AB1234, AB123 (con o sin guiones).
 *
 * @param {*} placa
 * @returns {{ valido: boolean, mensaje: string }}
 */
export function validarPlaca(placa) {
  if (!esStringNoVacio(placa)) {
    return { valido: false, mensaje: 'La placa es obligatoria' }
  }

  const limpio = String(placa).toUpperCase().replace(/[-\s]/g, '')

  if (/^[A-Z]{3}\d{3,4}$/.test(limpio)) return { valido: true, mensaje: '' }
  if (/^[A-Z]{2}\d{3,4}$/.test(limpio)) return { valido: true, mensaje: '' }

  return { valido: false, mensaje: 'Placa inválida (ej: ABC-1234 o AB-1234)' }
}

// ============================================================
// TELÉFONO
// ============================================================
/**
 * Valida un teléfono ecuatoriano (celular 09XXXXXXXX o fijo 0X XXXXXXX).
 *
 * @param {*} telefono
 * @returns {{ valido: boolean, tipo?: 'celular'|'fijo', mensaje: string }}
 */
export function validarTelefono(telefono) {
  if (telefono === null || telefono === undefined || String(telefono).trim() === '') {
    return { valido: false, mensaje: 'El teléfono es obligatorio' }
  }

  const limpio = soloDigitos(telefono)
  if (!limpio) {
    return { valido: false, mensaje: 'El teléfono no contiene dígitos' }
  }
  if (limpio.length > 15) {
    return { valido: false, mensaje: 'El teléfono es demasiado largo' }
  }

  // Celular Ecuador: 09XXXXXXXX
  if (/^09\d{8}$/.test(limpio)) {
    return { valido: true, tipo: 'celular', mensaje: '' }
  }
  // Fijo Ecuador: 0X XXXXXXX donde X ∈ 2-7 (área)
  if (/^0[2-7]\d{7}$/.test(limpio)) {
    return { valido: true, tipo: 'fijo', mensaje: '' }
  }

  return {
    valido: false,
    mensaje: 'Teléfono inválido (09XXXXXXXX para celular o 0X XXXXXXX para fijo)'
  }
}

// ============================================================
// EMAIL
// ============================================================
/**
 * Valida un email con reglas básicas tipo RFC 5321.
 * Rechaza doble punto, inicio/fin con punto, y caracteres raros.
 *
 * @param {*} email
 * @returns {{ valido: boolean, mensaje: string }}
 */
export function validarEmail(email) {
  if (!esStringNoVacio(email)) {
    return { valido: false, mensaje: 'El email es obligatorio' }
  }

  const limpio = String(email).trim().toLowerCase()

  if (limpio.length > CONFIG.emailMaxLen) {
    return { valido: false, mensaje: `El email no puede superar ${CONFIG.emailMaxLen} caracteres` }
  }
  if (tieneControlChars(limpio)) {
    return { valido: false, mensaje: 'El email contiene caracteres no válidos' }
  }

  // Local part @ dominio . tld
  const regex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

  if (!regex.test(limpio)) {
    return { valido: false, mensaje: 'Email inválido (ej: usuario@dominio.com)' }
  }

  return { valido: true, mensaje: '' }
}

// ============================================================
// EXPORTS PARA TESTS
// ============================================================
export const _CONFIG = CONFIG
export const _validarModulo11 = validarModulo11
export const _provinciaValida = provinciaValida
export const _tieneControlChars = tieneControlChars
export const _esStringNoVacio = esStringNoVacio