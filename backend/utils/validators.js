// backend/utils/validators.js

function validarCedula(cedula) {
  if (!cedula || typeof cedula !== 'string') return false
  if (!/^\d{10}$/.test(cedula)) return false
  const provincia = parseInt(cedula.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false
  const tercerDigito = parseInt(cedula.charAt(2), 10)
  if (tercerDigito >= 6) return false
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula.charAt(i), 10) * coeficientes[i]
    if (valor >= 10) valor -= 9
    suma += valor
  }
  const dv = parseInt(cedula.charAt(9), 10)
  const decenaSuperior = Math.ceil(suma / 10) * 10
  return (decenaSuperior - suma) === dv
}

function validarModulo11(ruc, coeficientes) {
  let suma = 0
  for (let i = 0; i < 9; i++) {
    suma += parseInt(ruc.charAt(i), 10) * coeficientes[i]
  }
  const residuo = suma % 11
  let dv = 11 - residuo
  if (dv === 11) dv = 0
  if (dv === 10) return false
  return dv === parseInt(ruc.charAt(9), 10)
}

function validarRUC(ruc) {
  if (!ruc || typeof ruc !== 'string') return false
  if (!/^\d{13}$/.test(ruc)) return false
  if (!ruc.endsWith('001')) return false
  const provincia = parseInt(ruc.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false
  const tercerDigito = parseInt(ruc.charAt(2), 10)
  if (tercerDigito < 6) return validarCedula(ruc.substring(0, 10))
  if (tercerDigito === 9) return validarModulo11(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2])
  if (tercerDigito === 6) return validarModulo11(ruc, [3, 2, 7, 6, 5, 4, 3, 2, 9])
  return false
}

function validarIdentificacion(identificacion) {
  const limpio = String(identificacion || '').trim()
  if (!limpio) return { valido: false, mensaje: 'Identificación obligatoria' }
  if (!/^\d+$/.test(limpio)) return { valido: false, mensaje: 'Solo dígitos' }
  if (limpio.length === 10) {
    return validarCedula(limpio)
      ? { valido: true, mensaje: '' }
      : { valido: false, mensaje: 'Cédula inválida (dígito verificador)' }
  }
  if (limpio.length === 13) {
    return validarRUC(limpio)
      ? { valido: true, mensaje: '' }
      : { valido: false, mensaje: 'RUC inválido (dígito verificador o terminación 001)' }
  }
  return { valido: false, mensaje: 'Debe tener 10 (cédula) o 13 (RUC) dígitos' }
}

module.exports = { validarCedula, validarRUC, validarIdentificacion }