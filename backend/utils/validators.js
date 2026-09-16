// backend/utils/validators.js
// ============================================================
// Validadores de documentos ecuatorianos (SRI + normativa local)
// ------------------------------------------------------------
// Todos los validadores son PUROS, null-safe y NUNCA lanzan.
// Devuelven `boolean` (para compatibilidad histórica) o
// `{ valido, mensaje, tipo? }` según corresponda.
//
// API pública:
//   validarCedula(id)                → boolean
//   validarRUC(id)                   → boolean
//   validarIdentificacion(id)        → { valido, tipo, mensaje }
//   validarPlaca(placa)              → { valido, mensaje }
//   validarTelefono(tel)             → { valido, tipo, mensaje }
//   validarEmail(email)              → { valido, mensaje }
//   validarCodigoPostal(cp)          → { valido, mensaje }
//   validarSecuencial(sec)           → { valido, mensaje }
//   validarLogoUrl(url)              → { valido, mensaje }
//
// Extensiones:
//   validarPasaporte(passport)       → { valido, mensaje }
//   validarCodigoNumerico(cod)       → { valido, mensaje }
//   normalizarIdentificacion(id)     → { limpio, tipo, valido }
//   soloDigitos(s)                   → string
//   trimUpper(s)                     → string
//
// Configuración por env:
//   VALIDATORS_MAX_LOGO_LEN=500000      → tope del logo (bytes base64)
//   VALIDATORS_EMAIL_MAX_LEN=254        → tope de email (RFC 5321)
//   VALIDATORS_PERMITIR_SVG_LOGO=true   → aceptar data:image/svg+xml
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /** Tope de longitud para `logo_url` (chars). */
  maxLogoLen: envNum('VALIDATORS_MAX_LOGO_LEN', 500_000),

  /** Tope de longitud de email (RFC 5321). */
  emailMaxLen: envNum('VALIDATORS_EMAIL_MAX_LEN', 254),

  /** ¿Aceptar `data:image/svg+xml;base64,...` como logo? */
  permitirSvgLogo: envBool('VALIDATORS_PERMITIR_SVG_LOGO', true),

  /** Regex de solo-dígitos reutilizable. */
  soloDigitosRegex: /\D/g,

  /** Regex de caracteres de control. */
  controlRegex: /[\x00-\x1F\x7F]/,

  /** Provincias válidas de Ecuador (códigos SRI). */
  provinciasEcuador: Object.freeze(
    new Set(Array.from({ length: 24 }, (_, i) => i + 1))
  )
});

// ============================================================
// HELPERS INTERNOS
// ============================================================

/**
 * `true` si el valor es un string no vacío (sin whitespace).
 * @param {*} v
 */
function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Limpia un string dejando solo dígitos. Null-safe.
 * @param {*} s
 * @returns {string}
 */
function soloDigitos(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(CONFIG.soloDigitosRegex, '');
}

/**
 * Trim + uppercase. Null-safe.
 * @param {*} s
 * @returns {string}
 */
function trimUpper(s) {
  if (s === null || s === undefined) return '';
  return String(s).trim().toUpperCase();
}

/**
 * Devuelve `true` si el string contiene caracteres de control.
 * @param {*} s
 */
function tieneControlChars(s) {
  if (typeof s !== 'string') return false;
  return CONFIG.controlRegex.test(s);
}

/**
 * Valida que un número de provincia esté entre 01 y 24.
 * @param {string} dos
 */
function provinciaValida(dos) {
  const n = parseInt(dos, 10);
  return Number.isInteger(n) && CONFIG.provinciasEcuador.has(n);
}

// ============================================================
// CÉDULA
// ============================================================
/**
 * Valida una cédula ecuatoriana (10 dígitos, módulo 10).
 * @param {*} cedula
 * @returns {boolean}
 */
function validarCedula(cedula) {
  if (typeof cedula !== 'string') return false;
  if (!/^\d{10}$/.test(cedula)) return false;

  // Provincia válida (01-24).
  if (!provinciaValida(cedula.substring(0, 2))) return false;

  // Tercer dígito < 6 (personas naturales).
  const tercerDigito = parseInt(cedula.charAt(2), 10);
  if (tercerDigito >= 6) return false;

  // Algoritmo módulo 10.
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
// RUC
// ============================================================
/**
 * Aplica el algoritmo Módulo 11 con coeficientes específicos.
 * @param {string} ruc  13 dígitos
 * @param {number[]} coeficientes  9 coeficientes
 * @returns {boolean}
 */
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

/**
 * Valida un RUC ecuatoriano (13 dígitos, terminación 001).
 * @param {*} ruc
 * @returns {boolean}
 */
function validarRUC(ruc) {
  if (typeof ruc !== 'string') return false;
  if (!/^\d{13}$/.test(ruc)) return false;
  if (!provinciaValida(ruc.substring(0, 2))) return false;
  if (!ruc.endsWith('001')) return false;

  const tercerDigito = parseInt(ruc.charAt(2), 10);

  // Persona natural: misma validación que cédula.
  if (tercerDigito < 6) {
    return validarCedula(ruc.substring(0, 10));
  }

  // Persona jurídica privada (tercer dígito 9).
  if (tercerDigito === 9) {
    return validarModulo11(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2]);
  }

  // Persona jurídica pública (tercer dígito 6).
  if (tercerDigito === 6) {
    return validarModulo11(ruc, [3, 2, 7, 6, 5, 4, 3, 2, 9]);
  }

  return false;
}

// ============================================================
// IDENTIFICACIÓN GENÉRICA
// ============================================================
/**
 * Valida cédula o RUC sin saber de antemano cuál es.
 * Acepta strings con guiones/espacios; normaliza antes.
 *
 * @param {*} identificacion
 * @returns {{ valido: boolean, tipo: 'CEDULA'|'RUC'|null, mensaje: string }}
 */
function validarIdentificacion(identificacion) {
  // Detectar si había contenido pero sin dígitos → error claro.
  if (identificacion === null || identificacion === undefined) {
    return { valido: false, tipo: null, mensaje: 'La identificación es obligatoria' };
  }

  const raw = String(identificacion).trim();
  if (!raw) {
    return { valido: false, tipo: null, mensaje: 'La identificación es obligatoria' };
  }

  const limpio = soloDigitos(raw);

  // El input tenía contenido pero ningún dígito.
  if (limpio.length === 0) {
    return {
      valido: false,
      tipo: null,
      mensaje: 'La identificación no contiene dígitos válidos'
    };
  }

  if (limpio.length === 10) {
    return validarCedula(limpio)
      ? { valido: true, tipo: 'CEDULA', mensaje: '' }
      : {
          valido: false,
          tipo: 'CEDULA',
          mensaje: 'Cédula inválida (dígito verificador incorrecto)'
        };
  }

  if (limpio.length === 13) {
    return validarRUC(limpio)
      ? { valido: true, tipo: 'RUC', mensaje: '' }
      : {
          valido: false,
          tipo: 'RUC',
          mensaje: 'RUC inválido (verifique el dígito verificador y que termine en 001)'
        };
  }

  if (limpio.length < 10) {
    return {
      valido: false,
      tipo: null,
      mensaje: `Faltan dígitos (${limpio.length}/10)`
    };
  }
  if (limpio.length > 13) {
    return {
      valido: false,
      tipo: null,
      mensaje: `Demasiados dígitos (${limpio.length}/13)`
    };
  }

  return {
    valido: false,
    tipo: null,
    mensaje: 'Debe tener 10 (cédula) o 13 (RUC) dígitos'
  };
}

/**
 * Extrae el identificador limpio (solo dígitos) y su tipo.
 * NUNCA lanza.
 *
 * @param {*} identificacion
 * @returns {{ limpio: string, tipo: 'CEDULA'|'RUC'|null, valido: boolean }}
 */
function normalizarIdentificacion(identificacion) {
  const limpio = soloDigitos(identificacion);
  if (limpio.length === 10) {
    return { limpio, tipo: 'CEDULA', valido: validarCedula(limpio) };
  }
  if (limpio.length === 13) {
    return { limpio, tipo: 'RUC', valido: validarRUC(limpio) };
  }
  return { limpio, tipo: null, valido: false };
}

// ============================================================
// PASAPORTE (SRI tipo 06)
// ============================================================
/**
 * Valida un número de pasaporte.
 * El SRI acepta alfanuméricos de 5 a 20 caracteres (sin espacios internos).
 *
 * @param {*} pasaporte
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validarPasaporte(pasaporte) {
  if (!esStringNoVacio(pasaporte)) {
    return { valido: false, mensaje: 'El pasaporte es obligatorio' };
  }

  // Solo trim + uppercase. NO eliminamos espacios internos: si el
  // usuario los puso, el regex de formato los rechaza.
  const limpio = trimUpper(pasaporte);

  if (limpio.length < 5 || limpio.length > 20) {
    return { valido: false, mensaje: 'El pasaporte debe tener entre 5 y 20 caracteres' };
  }
  if (!/^[A-Z0-9]+$/.test(limpio)) {
    return { valido: false, mensaje: 'El pasaporte solo admite letras y números' };
  }
  return { valido: true, mensaje: '' };
}

// ============================================================
// PLACA
// ============================================================
/**
 * Valida una placa ecuatoriana.
 * Formatos aceptados: ABC1234, ABC123, AB1234, AB123 (con o sin guiones).
 *
 * @param {*} placa
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validarPlaca(placa) {
  if (!esStringNoVacio(placa)) {
    return { valido: false, mensaje: 'La placa es obligatoria' };
  }
  const limpio = trimUpper(placa).replace(/[-\s]/g, '');
  if (/^[A-Z]{3}\d{3,4}$/.test(limpio)) return { valido: true, mensaje: '' };
  if (/^[A-Z]{2}\d{3,4}$/.test(limpio)) return { valido: true, mensaje: '' };
  return { valido: false, mensaje: 'Placa inválida (ej: ABC-1234 o AB-1234)' };
}

// ============================================================
// TELÉFONO
// ============================================================
/**
 * Valida un teléfono ecuatoriano (celular 09XXXXXXXX o fijo 0X XXXXXXX).
 * @param {*} telefono
 * @returns {{ valido: boolean, tipo?: 'CELULAR'|'FIJO', mensaje: string }}
 */
function validarTelefono(telefono) {
  if (telefono === null || telefono === undefined || String(telefono).trim() === '') {
    return { valido: false, mensaje: 'El teléfono es obligatorio' };
  }
  const limpio = soloDigitos(telefono);
  if (!limpio) {
    return { valido: false, mensaje: 'El teléfono no contiene dígitos' };
  }
  if (limpio.length > 15) {
    return { valido: false, mensaje: 'El teléfono es demasiado largo' };
  }

  // Celular Ecuador: 09XXXXXXXX (10 dígitos).
  if (/^09\d{8}$/.test(limpio)) {
    return { valido: true, tipo: 'CELULAR', mensaje: '' };
  }
  // Fijo Ecuador: 0X XXXXXXX donde X ∈ 2-7 (área).
  if (/^0[2-7]\d{7}$/.test(limpio)) {
    return { valido: true, tipo: 'FIJO', mensaje: '' };
  }
  return {
    valido: false,
    mensaje: 'Teléfono inválido (09XXXXXXXX para celular o 0X XXXXXXX para fijo)'
  };
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
function validarEmail(email) {
  if (!esStringNoVacio(email)) {
    return { valido: false, mensaje: 'El email es obligatorio' };
  }
  const limpio = String(email).trim().toLowerCase();

  if (limpio.length > CONFIG.emailMaxLen) {
    return {
      valido: false,
      mensaje: `El email no puede superar ${CONFIG.emailMaxLen} caracteres`
    };
  }
  if (tieneControlChars(limpio)) {
    return { valido: false, mensaje: 'El email contiene caracteres no válidos' };
  }

  // Local part @ dominio . tld
  // - Local: 1-64 chars de [a-z0-9._%+-], sin punto inicial/final ni doble punto
  // - Dominio: labels alfanuméricos separados por punto
  // - TLD: al menos 2 letras
  const regex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

  if (!regex.test(limpio)) {
    return { valido: false, mensaje: 'Email inválido (ej: usuario@dominio.com)' };
  }
  return { valido: true, mensaje: '' };
}

// ============================================================
// CÓDIGO POSTAL
// ============================================================
/**
 * Valida un código postal ecuatoriano (6 dígitos, formato INEC).
 * @param {*} cp
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validarCodigoPostal(cp) {
  if (cp === null || cp === undefined || String(cp).trim() === '') {
    return { valido: false, mensaje: 'El código postal es obligatorio' };
  }
  const limpio = soloDigitos(cp);
  if (!/^\d{6}$/.test(limpio)) {
    return { valido: false, mensaje: 'Código postal debe tener 6 dígitos' };
  }
  return { valido: true, mensaje: '' };
}

// ============================================================
// SECUENCIAL
// ============================================================
/**
 * Valida un número secuencial SRI (máx 9 dígitos).
 * @param {*} sec
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validarSecuencial(sec) {
  if (sec === null || sec === undefined || String(sec).trim() === '') {
    return { valido: false, mensaje: 'El secuencial es obligatorio' };
  }
  const limpio = soloDigitos(sec);
  if (!limpio) {
    return { valido: false, mensaje: 'El secuencial no contiene dígitos' };
  }
  if (limpio.length > 9) {
    return { valido: false, mensaje: 'Máximo 9 dígitos' };
  }
  return { valido: true, mensaje: '' };
}

/**
 * Valida un código numérico del SRI (8 dígitos exactos).
 * @param {*} cod
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validarCodigoNumerico(cod) {
  if (cod === null || cod === undefined || String(cod).trim() === '') {
    return { valido: false, mensaje: 'El código numérico es obligatorio' };
  }
  const limpio = soloDigitos(cod);
  if (!/^\d{8}$/.test(limpio)) {
    return { valido: false, mensaje: 'El código numérico debe tener 8 dígitos' };
  }
  return { valido: true, mensaje: '' };
}

// ============================================================
// LOGO URL
// ============================================================
/**
 * Valida una URL de logo.
 *
 * Acepta:
 *   - http(s)://... (URL remota)
 *   - data:image/(png|jpeg|jpg|gif|webp);base64,...
 *   - data:image/svg+xml;base64,...   ⚠️ solo si `permitirSvgLogo`
 *
 * Rechaza:
 *   - otros esquemas (javascript:, data:text/html, file:, etc.)
 *   - longitudes > `maxLogoLen`
 *   - caracteres de control
 *
 * @param {*} url
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validarLogoUrl(url) {
  if (url === undefined || url === null || url === '') {
    return { valido: true, mensaje: '' }; // campo opcional
  }
  if (typeof url !== 'string') {
    return { valido: false, mensaje: 'logo_url debe ser un string' };
  }
  if (url.length > CONFIG.maxLogoLen) {
    return {
      valido: false,
      mensaje: `logo_url demasiado largo (máx ${Math.round(CONFIG.maxLogoLen / 1024)} KB)`
    };
  }
  if (tieneControlChars(url)) {
    return { valido: false, mensaje: 'logo_url contiene caracteres de control' };
  }

  // URL remota http(s).
  if (/^https?:\/\/[^\s]+$/i.test(url)) {
    return { valido: true, mensaje: '' };
  }

  // data:image base64 — SVG opcional.
  const mimePermitidos = CONFIG.permitirSvgLogo
    ? 'png|jpe?g|gif|webp|svg\\+xml'
    : 'png|jpe?g|gif|webp';
  const dataRegex = new RegExp(
    `^data:image/(${mimePermitidos});base64,[A-Za-z0-9+/=]+$`,
    'i'
  );
  if (dataRegex.test(url)) {
    if (/svg\+xml/i.test(url)) {
      log.warn(
        'logo_url contiene SVG embebido. Asegúrate de sanitizarlo antes de renderizarlo inline.'
      );
    }
    return { valido: true, mensaje: '' };
  }

  return {
    valido: false,
    mensaje:
      'logo_url debe ser http(s)://... o data:image/(png|jpeg|gif|webp' +
      (CONFIG.permitirSvgLogo ? '|svg+xml' : '') +
      ');base64,...'
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  validarCedula,
  validarRUC,
  validarIdentificacion,
  validarPlaca,
  validarTelefono,
  validarEmail,
  validarCodigoPostal,
  validarSecuencial,
  validarLogoUrl,

  // ---- Extensiones ----
  validarPasaporte,
  validarCodigoNumerico,
  normalizarIdentificacion,
  soloDigitos,
  trimUpper,
  esStringNoVacio,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._validarModulo11 = validarModulo11;
module.exports._provinciaValida = provinciaValida;
module.exports._tieneControlChars = tieneControlChars;
module.exports._PROVINCIAS_EC = CONFIG.provinciasEcuador;