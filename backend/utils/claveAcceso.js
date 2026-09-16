// backend/utils/claveAcceso.js
// ============================================================
// Clave de acceso SRI (49 dígitos) — generación y validación
// ------------------------------------------------------------
// Estructura de la clave (49 dígitos):
//   [0-7]   fechaEmision    DDMMYYYY (8)
//   [8-9]   tipoComprobante (2)
//   [10-22] ruc             (13)
//   [23]    ambiente        (1)  1=Pruebas, 2=Producción
//   [24-29] serie           (6)  EEEPPP
//   [30-38] secuencial      (9)
//   [39-46] codigoNumerico  (8)
//   [47]    tipoEmision     (1)  1=Normal, 2=Contingencia
//   [48]    digitoVerificador (1) Módulo 11
//
// ⚠️  El SRI trabaja con hora LOCAL de Ecuador (UTC-5, sin DST).
//     Si el servidor corre en UTC (Docker), una venta emitida a las
//     22:00 EC corresponde al día siguiente en UTC. Forzamos la TZ
//     con `Intl.DateTimeFormat` explícitamente.
// ============================================================
'use strict';

const crypto = require('crypto');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const TZ_ECUADOR = 'America/Guayaquil';

const CONFIG = Object.freeze({
  longitudClave: 49,
  longitudBase: 48,

  /** Rangos permitidos para el código numérico aleatorio. */
  codigoNumericoMax: 100_000_000,

  /** Rango de años aceptable para una clave. */
  anioMin: 2000,
  anioMax: 2200,

  /** Máx. días en el futuro que se toleran por desfase de reloj. */
  toleranciaFuturoDias: 1
});

// ============================================================
// CONSTANTES DEL SRI
// ============================================================
const AMBIENTES = Object.freeze({
  1: 'Pruebas',
  2: 'Producción'
});

const TIPOS_EMISION = Object.freeze({
  1: 'Normal',
  2: 'Contingencia'
});

/**
 * Catálogo completo de tipos de comprobante del SRI.
 * Solo se exponen los que tienen código de 2 dígitos.
 * Fuente: ficha técnica del SRI para comprobantes electrónicos.
 */
const TIPOS_COMPROBANTE_NOMBRES = Object.freeze({
  '01': 'Factura',
  '02': 'Nota de Venta',
  '03': 'Liquidación de Compra',
  '04': 'Nota de Crédito',
  '05': 'Nota de Débito',
  '06': 'Guía de Remisión',
  '07': 'Comprobante de Retención',
  '08': 'Boletos o entradas a espectáculos públicos',
  '09': 'Tiquetes o vales emitidos por máquinas registradoras',
  '11': 'Pasajes expedidos por empresas de aviación',
  '12': 'Documentos emitidos por instituciones financieras',
  '15': 'Comprobante de venta emitido en el exterior',
  '16': 'Formulario Único de Exportación',
  '18': 'Nota de Crédito (física)',
  '19': 'Comprobante de Retención Presuntiva',
  '20': 'Comprobante de Retención (físico)',
  '21': 'Carta de Porte Aéreo',
  '22': 'Recibo',
  '23': 'Comprobante de Servicios Hoteleros',
  '24': 'Nota de Crédito Tributaria',
  '41': 'Comprobante de Venta en Regímenes Especiales',
  '42': 'Documento de Exportación',
  '43': 'Comprobante de Venta (RISE)',
  '44': 'Comprobante de Retención (RISE)',
  '45': 'Comprobante de Retención (RISE presuntiva)'
});

/** Pesos del algoritmo Módulo 11 (ciclo de 6). */
const PESOS_MODULO_11 = Object.freeze([2, 3, 4, 5, 6, 7]);

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorTipado(mensaje, codigo, status = 400) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  err.status = status;
  return err;
}

// ============================================================
// VALIDADORES SIMPLES
// ============================================================
/** `true` si el valor es exactamente '1' o '2'. */
function esAmbienteValido(v) {
  const s = String(v).trim();
  return s === '1' || s === '2';
}

/** `true` si el valor es exactamente '1' o '2'. */
function esTipoEmisionValido(v) {
  const s = String(v).trim();
  return s === '1' || s === '2';
}

/**
 * `true` si la fecha (yyyy-mm-dd) es real (no acepta 2024-02-30).
 * @param {string} yyyy
 * @param {string} mm
 * @param {string} dd
 */
function esFechaReal(yyyy, mm, dd) {
  const y = Number(yyyy);
  const m = Number(mm);
  const d = Number(dd);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < CONFIG.anioMin || y > CONFIG.anioMax) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return (
    fecha.getUTCFullYear() === y &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d
  );
}

// ============================================================
// FORMATEO DE FECHA (TZ Ecuador)
// ============================================================
/**
 * Devuelve `DDMMYYYY` en zona horaria de Ecuador.
 * @param {Date|string|number} fecha
 * @returns {string}
 * @throws {Error} con codigo='FECHA_INVALIDA'
 */
function formatearFecha(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) {
    throw errorTipado(`Fecha inválida: ${fecha}`, 'FECHA_INVALIDA');
  }

  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ECUADOR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);

  const get = (t) => partes.find(p => p.type === t)?.value;
  const dd = get('day');
  const mm = get('month');
  const yyyy = get('year');

  if (!dd || !mm || !yyyy) {
    throw errorTipado(`No se pudo formatear la fecha: ${fecha}`, 'FECHA_INVALIDA');
  }
  return `${dd}${mm}${yyyy}`;
}

/**
 * Devuelve la fecha en formato ISO (YYYY-MM-DD) según TZ Ecuador.
 * Útil para persistencia y logs.
 * @param {Date|string|number} fecha
 * @returns {string}
 */
function formatearFechaISO(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) {
    throw errorTipado(`Fecha inválida: ${fecha}`, 'FECHA_INVALIDA');
  }

  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ECUADOR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);

  const get = (t) => partes.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ============================================================
// FORMATEO DE SERIE
// ============================================================
/**
 * Construye una serie EEEPPP (6 dígitos).
 * @param {string|number} establecimiento
 * @param {string|number} puntoEmision
 * @param {object} [opts]
 * @param {boolean} [opts.estricto=true]  Si true, lanza error si excede 3 dígitos.
 * @returns {string}
 */
function formatearSerie(establecimiento, puntoEmision, opts = {}) {
  const { estricto = true } = opts;

  const pad3 = (v, nombre) => {
    const s = String(v ?? '001').trim();
    if (!/^\d+$/.test(s)) {
      throw errorTipado(`${nombre} debe ser numérico (recibido: "${v}")`, 'SERIE_INVALIDA');
    }
    if (s.length > 3) {
      if (estricto) {
        throw errorTipado(
          `${nombre} no puede tener más de 3 dígitos (recibido: "${s}")`,
          'SERIE_INVALIDA'
        );
      }
      // Modo no estricto: trunca a la derecha (mantiene el último).
      return s.slice(-3);
    }
    return s.padStart(3, '0');
  };

  const est = pad3(establecimiento, 'establecimiento');
  const pe = pad3(puntoEmision, 'puntoEmision');
  return `${est}${pe}`;
}

// ============================================================
// DÍGITO VERIFICADOR (Módulo 11)
// ============================================================
/**
 * Calcula el dígito verificador Módulo 11 del SRI.
 * @param {string} cadena  Cadena numérica (típicamente 48 dígitos).
 * @returns {number} 0-9
 * @throws {Error} si la cadena no es numérica o está vacía.
 */
function calcularDigitoVerificador(cadena) {
  if (typeof cadena !== 'string' || cadena.length === 0) {
    throw errorTipado('calcularDigitoVerificador espera un string no vacío', 'CADENA_INVALIDA');
  }
  if (!/^\d+$/.test(cadena)) {
    throw errorTipado(
      'calcularDigitoVerificador espera solo dígitos',
      'CADENA_INVALIDA'
    );
  }

  let suma = 0;
  for (let i = cadena.length - 1, j = 0; i >= 0; i--, j++) {
    const digito = cadena.charCodeAt(i) - 48; // '0' = 48
    const peso = PESOS_MODULO_11[j % 6];
    suma += digito * peso;
  }

  const resto = suma % 11;
  let dv = 11 - resto;
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 1;
  return dv;
}

// ============================================================
// GENERAR CLAVE
// ============================================================
/**
 * Genera una clave de acceso del SRI.
 *
 * @param {object} params
 * @param {Date|string|number} params.fechaEmision
 * @param {string|number}       params.tipoComprobante  2 dígitos (ej. '01')
 * @param {string|number}       params.ruc              13 dígitos
 * @param {string|number}       [params.ambiente='1']   '1'|'2'
 * @param {string|number}       params.serie            EEEPPP (6 dígitos)
 * @param {string|number}       params.secuencial       1-9 dígitos
 * @param {string|number}       [params.codigoNumerico] 8 dígitos (o se genera random)
 * @param {string|number}       [params.tipoEmision='1'] '1'|'2'
 * @returns {string} clave de 49 dígitos
 * @throws {Error} con codigo estable en caso de parámetro inválido.
 */
function generarClaveAcceso(params = {}) {
  const {
    fechaEmision,
    tipoComprobante,
    ruc,
    ambiente = '1',
    serie,
    secuencial,
    codigoNumerico,
    tipoEmision = '1'
  } = params;

  // ---- Validaciones básicas ----
  if (fechaEmision === undefined || fechaEmision === null) {
    throw errorTipado('Se requiere fechaEmision', 'FECHA_REQUERIDA');
  }
  if (tipoComprobante === undefined || tipoComprobante === null || tipoComprobante === '') {
    throw errorTipado('Se requiere tipoComprobante', 'TIPO_COMPROBANTE_REQUERIDO');
  }
  if (!ruc) {
    throw errorTipado('Se requiere ruc', 'RUC_REQUERIDO');
  }
  if (!serie) {
    throw errorTipado('Se requiere serie', 'SERIE_REQUERIDA');
  }
  if (secuencial === undefined || secuencial === null || secuencial === '') {
    throw errorTipado('Se requiere secuencial', 'SECUENCIAL_REQUERIDO');
  }

  // ---- Fecha ----
  const fechaStr = formatearFecha(fechaEmision);

  // ---- Tipo comprobante (2 dígitos exactos) ----
  const tipoStr = String(tipoComprobante).trim();
  if (!/^\d{2}$/.test(tipoStr)) {
    throw errorTipado(
      `tipoComprobante debe ser de 2 dígitos, recibido: "${tipoComprobante}"`,
      'TIPO_COMPROBANTE_INVALIDO'
    );
  }

  // ---- RUC (13 dígitos) ----
  const rucLimpio = String(ruc).replace(/\D/g, '');
  if (rucLimpio.length !== 13) {
    throw errorTipado(
      `RUC debe tener 13 dígitos, recibido: ${rucLimpio.length}`,
      'RUC_INVALIDO'
    );
  }

  // ---- Ambiente (exactamente '1' o '2') ----
  const ambienteStr = String(ambiente).trim();
  if (!esAmbienteValido(ambienteStr)) {
    throw errorTipado(
      `Ambiente debe ser "1" o "2", recibido: "${ambiente}"`,
      'AMBIENTE_INVALIDO'
    );
  }

  // ---- Serie (6 dígitos, no re-formateamos: ya viene lista) ----
  const serieLimpia = String(serie).replace(/\D/g, '');
  if (serieLimpia.length !== 6) {
    throw errorTipado(
      `Serie debe tener 6 dígitos, recibido: "${serie}" (${serieLimpia.length} tras limpiar)`,
      'SERIE_INVALIDA'
    );
  }

  // ---- Secuencial (1-9 dígitos, positivo) ----
  const secNum = Number(secuencial);
  if (!Number.isInteger(secNum) || secNum < 0) {
    throw errorTipado(
      `Secuencial debe ser un entero >= 0, recibido: "${secuencial}"`,
      'SECUENCIAL_INVALIDO'
    );
  }
  const secStr = String(secNum).padStart(9, '0');
  if (secStr.length > 9) {
    throw errorTipado('Secuencial no puede tener más de 9 dígitos', 'SECUENCIAL_INVALIDO');
  }

  // ---- Código numérico (8 dígitos) ----
  let codNum;
  if (codigoNumerico !== undefined && codigoNumerico !== null && codigoNumerico !== '') {
    const s = String(codigoNumerico).trim();
    if (!/^\d+$/.test(s)) {
      throw errorTipado(
        `codigoNumerico debe ser numérico (recibido: "${codigoNumerico}")`,
        'CODIGO_NUMERICO_INVALIDO'
      );
    }
    if (s.length > 8) {
      throw errorTipado(
        `codigoNumerico no puede tener más de 8 dígitos (recibido: "${s}")`,
        'CODIGO_NUMERICO_INVALIDO'
      );
    }
    codNum = s.padStart(8, '0');
  } else {
    // Uso criptográficamente seguro.
    codNum = String(crypto.randomInt(0, CONFIG.codigoNumericoMax)).padStart(8, '0');
  }

  // ---- Tipo emisión (exactamente '1' o '2') ----
  const tipoEmisionStr = String(tipoEmision).trim();
  if (!esTipoEmisionValido(tipoEmisionStr)) {
    throw errorTipado(
      `Tipo emisión debe ser "1" o "2", recibido: "${tipoEmision}"`,
      'TIPO_EMISION_INVALIDO'
    );
  }

  // ---- Base + DV ----
  const base =
    fechaStr +
    tipoStr +
    rucLimpio +
    ambienteStr +
    serieLimpia +
    secStr +
    codNum +
    tipoEmisionStr;

  if (base.length !== CONFIG.longitudBase) {
    throw errorTipado(
      `La base debe tener ${CONFIG.longitudBase} dígitos, tiene: ${base.length}`,
      'BASE_INVALIDA'
    );
  }

  const dv = calcularDigitoVerificador(base);
  const clave = base + dv;

  if (clave.length !== CONFIG.longitudClave) {
    throw errorTipado(
      `La clave debe tener ${CONFIG.longitudClave} dígitos, tiene: ${clave.length}`,
      'CLAVE_INVALIDA'
    );
  }

  return clave;
}

// ============================================================
// DESCOMPONER CLAVE
// ============================================================
/**
 * Descompone una clave de acceso.
 * @param {string} clave
 * @returns {object|null} null si la clave no tiene 49 dígitos numéricos.
 */
function descomponerClave(clave) {
  if (typeof clave !== 'string') return null;
  if (clave.length !== CONFIG.longitudClave) return null;
  if (!/^\d+$/.test(clave)) return null;

  const dd = clave.slice(0, 2);
  const mm = clave.slice(2, 4);
  const yyyy = clave.slice(4, 8);

  const tipo = clave.slice(8, 10);
  const ruc = clave.slice(10, 23);
  const ambienteCodigo = clave.charAt(23);
  const serie = clave.slice(24, 30);
  const establecimiento = clave.slice(24, 27);
  const puntoEmision = clave.slice(27, 30);
  const secuencial = clave.slice(30, 39);
  const codigoNumerico = clave.slice(39, 47);
  const tipoEmisionCodigo = clave.charAt(47);
  const digitoVerificador = clave.charAt(48);

  return {
    // ---- Formatos originales (retrocompatibles) ----
    fecha: `${dd}/${mm}/${yyyy}`,
    tipoComprobante: tipo,
    tipoComprobanteNombre: TIPOS_COMPROBANTE_NOMBRES[tipo] || 'Desconocido',
    ruc,
    ambiente: ambienteCodigo === '1' ? 'Pruebas' : 'Producción',
    ambienteCodigo,
    serie,
    establecimiento,
    puntoEmision,
    secuencial,
    codigoNumerico,
    tipoEmision: tipoEmisionCodigo === '1' ? 'Normal' : 'Contingencia',
    tipoEmisionCodigo,
    digitoVerificador,

    // ---- Extendidos ----
    fechaISO: `${yyyy}-${mm}-${dd}`,
    fechaPartes: { dd, mm, yyyy }
  };
}

// ============================================================
// VALIDAR CLAVE
// ============================================================
/**
 * Valida una clave de acceso (longitud + dígitos + DV + fecha real).
 * @param {string} clave
 * @returns {boolean}
 */
function validarClave(clave) {
  if (typeof clave !== 'string') return false;
  if (clave.length !== CONFIG.longitudClave) return false;
  if (!/^\d+$/.test(clave)) return false;

  // 1. Dígito verificador.
  const base = clave.slice(0, CONFIG.longitudBase);
  let dvCalculado;
  try {
    dvCalculado = calcularDigitoVerificador(base);
  } catch {
    return false;
  }
  const dvRecibido = clave.charCodeAt(CONFIG.longitudBase) - 48;
  if (dvCalculado !== dvRecibido) return false;

  // 2. Fecha real (evita 2024-02-30, 2024-13-45, etc.).
  const partes = descomponerClave(clave);
  if (!partes) return false;
  if (!esFechaReal(partes.fechaPartes.yyyy, partes.fechaPartes.mm, partes.fechaPartes.dd)) {
    return false;
  }

  // 3. Fecha no futura (con tolerancia por desfase de reloj).
  const [yyyy, mm, dd] = partes.fechaISO.split('-');
  const fechaClave = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
  const limite = new Date(Date.now() + CONFIG.toleranciaFuturoDias * 86_400_000);
  if (fechaClave > limite) return false;

  return true;
}

/**
 * Alias semántico de `validarClave`.
 * @param {string} clave
 * @returns {boolean}
 */
function esClaveValida(clave) {
  return validarClave(clave);
}

/**
 * Valida la estructura de una clave y explica el motivo del rechazo.
 * @param {string} clave
 * @returns {{valido: boolean, motivo?: string, partes?: object}}
 */
function validarEstructuraClave(clave) {
  if (typeof clave !== 'string') {
    return { valido: false, motivo: 'Clave no es un string' };
  }
  if (clave.length === 0) {
    return { valido: false, motivo: 'Clave vacía' };
  }
  if (clave.length !== CONFIG.longitudClave) {
    return { valido: false, motivo: `Longitud ${clave.length} (esperado ${CONFIG.longitudClave})` };
  }
  if (!/^\d+$/.test(clave)) {
    return { valido: false, motivo: 'Contiene caracteres no numéricos' };
  }

  const partes = descomponerClave(clave);
  if (!partes) {
    return { valido: false, motivo: 'No se pudo descomponer la clave' };
  }

  // 1. Dígito verificador.
  const base = clave.slice(0, CONFIG.longitudBase);
  const dvEsperado = calcularDigitoVerificador(base);
  const dvRecibido = clave.charCodeAt(CONFIG.longitudBase) - 48;

  if (dvEsperado !== dvRecibido) {
    return {
      valido: false,
      motivo: `Dígito verificador incorrecto (esperado ${dvEsperado}, recibido ${dvRecibido})`,
      partes
    };
  }

  // 2. Fecha real.
  if (!esFechaReal(partes.fechaPartes.yyyy, partes.fechaPartes.mm, partes.fechaPartes.dd)) {
    return {
      valido: false,
      motivo: `Fecha inválida: ${partes.fechaISO}`,
      partes
    };
  }

  // 3. Ambiente.
  if (!esAmbienteValido(partes.ambienteCodigo)) {
    return {
      valido: false,
      motivo: `Ambiente inválido: ${partes.ambienteCodigo}`,
      partes
    };
  }

  // 4. Tipo emisión.
  if (!esTipoEmisionValido(partes.tipoEmisionCodigo)) {
    return {
      valido: false,
      motivo: `Tipo de emisión inválido: ${partes.tipoEmisionCodigo}`,
      partes
    };
  }

  return { valido: true, partes };
}

// ============================================================
// EXTRACCIÓN DE CAMPOS
// ============================================================
/** Extrae el secuencial (`'000000042'`) de la clave. */
function extraerSecuencial(clave) {
  return descomponerClave(clave)?.secuencial || null;
}

/** Extrae el RUC de la clave. */
function extraerRUC(clave) {
  return descomponerClave(clave)?.ruc || null;
}

/** Extrae la fecha ISO (YYYY-MM-DD) de la clave. */
function extraerFechaISO(clave) {
  return descomponerClave(clave)?.fechaISO || null;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  generarClaveAcceso,
  calcularDigitoVerificador,
  descomponerClave,
  validarClave,
  validarEstructuraClave,
  extraerSecuencial,
  formatearSerie,
  formatearFecha,
  TIPOS_COMPROBANTE_NOMBRES,
  TZ_ECUADOR,

  // ---- Extensiones ----
  formatearFechaISO,
  esClaveValida,
  esAmbienteValido,
  esTipoEmisionValido,
  esFechaReal,
  extraerRUC,
  extraerFechaISO,

  // ---- Constantes ----
  AMBIENTES,
  TIPOS_EMISION,
  PESOS_MODULO_11
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._errorTipado = errorTipado;