// backend/utils/validators.js
// Validadores de documentos ecuatorianos según normativa del SRI

// ============================================================
// CÉDULA (10 dígitos, módulo 10)
// ============================================================
function validarCedula(cedula) {
  if (!cedula || typeof cedula !== 'string') return false;
  if (!/^\d{10}$/.test(cedula)) return false;

  const provincia = parseInt(cedula.substring(0, 2), 10);
  if (provincia < 1 || provincia > 24) return false;

  const tercerDigito = parseInt(cedula.charAt(2), 10);
  if (tercerDigito >= 6) return false;

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula.charAt(i), 10) * coeficientes[i];
    if (valor >= 10) valor -= 9;
    suma += valor;
  }

  const dv = parseInt(cedula.charAt(9), 10);
  const decenaSuperior = Math.ceil(suma / 10) * 10;
  return (decenaSuperior - suma) === dv;
}

// ============================================================
// RUC (13 dígitos)
// ============================================================
function validarModulo11(ruc, coeficientes) {
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    suma += parseInt(ruc.charAt(i), 10) * coeficientes[i];
  }
  const residuo = suma % 11;
  let dv = 11 - residuo;
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === parseInt(ruc.charAt(9), 10);
}

function validarRUC(ruc) {
  if (!ruc || typeof ruc !== 'string') return false;
  if (!/^\d{13}$/.test(ruc)) return false;
  if (!ruc.endsWith('001')) return false;

  const provincia = parseInt(ruc.substring(0, 2), 10);
  if (provincia < 1 || provincia > 24) return false;

  const tercerDigito = parseInt(ruc.charAt(2), 10);

  // Persona natural: RUC = cédula + 001
  if (tercerDigito < 6) return validarCedula(ruc.substring(0, 10));

  // Sociedad privada
  if (tercerDigito === 9) {
    return validarModulo11(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2]);
  }

  // Sociedad pública
  if (tercerDigito === 6) {
    return validarModulo11(ruc, [3, 2, 7, 6, 5, 4, 3, 2, 9]);
  }

  return false;
}

// ============================================================
// IDENTIFICACIÓN COMPLETA (auto-detecta tipo)
// ============================================================
function validarIdentificacion(identificacion) {
  const limpio = String(identificacion || '').trim().replace(/\D/g, '');
  if (!limpio) {
    return { valido: false, tipo: null, mensaje: 'La identificación es obligatoria' };
  }

  if (limpio.length === 10) {
    return validarCedula(limpio)
      ? { valido: true, tipo: 'CEDULA', mensaje: '' }
      : { valido: false, tipo: 'CEDULA', mensaje: 'Cédula inválida (dígito verificador incorrecto)' };
  }

  if (limpio.length === 13) {
    return validarRUC(limpio)
      ? { valido: true, tipo: 'RUC', mensaje: '' }
      : { valido: false, tipo: 'RUC', mensaje: 'RUC inválido (verifique el dígito verificador y que termine en 001)' };
  }

  if (limpio.length < 10) {
    return { valido: false, tipo: null, mensaje: `Faltan dígitos (${limpio.length}/10)` };
  }
  if (limpio.length > 13) {
    return { valido: false, tipo: null, mensaje: `Demasiados dígitos (${limpio.length}/13)` };
  }

  return { valido: false, tipo: null, mensaje: 'Debe tener 10 (cédula) o 13 (RUC) dígitos' };
}

// ============================================================
// PLACAS ECUATORIANAS
// ============================================================
function validarPlaca(placa) {
  const limpio = String(placa || '').trim().toUpperCase().replace(/[-\s]/g, '');
  if (!limpio) {
    return { valido: false, mensaje: 'La placa es obligatoria' };
  }
  if (/^[A-Z]{3}\d{3,4}$/.test(limpio)) return { valido: true, mensaje: '' };
  if (/^[A-Z]{2}\d{3,4}$/.test(limpio)) return { valido: true, mensaje: '' };
  return { valido: false, mensaje: 'Placa inválida (ej: ABC-1234 o AB-1234)' };
}

// ============================================================
// TELÉFONO ECUATORIANO
// ============================================================
function validarTelefono(telefono) {
  const limpio = String(telefono || '').trim().replace(/\D/g, '');
  if (!limpio) return { valido: false, mensaje: 'El teléfono es obligatorio' };

  if (/^09\d{8}$/.test(limpio)) return { valido: true, tipo: 'CELULAR', mensaje: '' };
  if (/^0[2-7]\d{7}$/.test(limpio)) return { valido: true, tipo: 'FIJO', mensaje: '' };
  return { valido: false, mensaje: 'Teléfono inválido (09XXXXXXXX para celular o 0X XXXXXXX para fijo)' };
}

// ============================================================
// EMAIL
// ============================================================
function validarEmail(email) {
  const limpio = String(email || '').trim().toLowerCase();
  if (!limpio) return { valido: false, mensaje: 'El email es obligatorio' };
  const regex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(limpio)) {
    return { valido: false, mensaje: 'Email inválido (ej: usuario@dominio.com)' };
  }
  return { valido: true, mensaje: '' };
}

// ============================================================
// CÓDIGO POSTAL ECUATORIANO (6 dígitos)
// ============================================================
function validarCodigoPostal(cp) {
  const limpio = String(cp || '').trim();
  if (!limpio) return { valido: false, mensaje: 'El código postal es obligatorio' };
  if (!/^\d{6}$/.test(limpio)) return { valido: false, mensaje: 'Código postal debe tener 6 dígitos' };
  return { valido: true, mensaje: '' };
}

// ============================================================
// NÚMERO DE FACTURA (secuencial 9 dígitos)
// ============================================================
function validarSecuencial(sec) {
  const limpio = String(sec || '').replace(/\D/g, '');
  if (!limpio) return { valido: false, mensaje: 'El secuencial es obligatorio' };
  if (limpio.length > 9) return { valido: false, mensaje: 'Máximo 9 dígitos' };
  return { valido: true, mensaje: '' };
}

module.exports = {
  validarCedula,
  validarRUC,
  validarIdentificacion,
  validarPlaca,
  validarTelefono,
  validarEmail,
  validarCodigoPostal,
  validarSecuencial
};