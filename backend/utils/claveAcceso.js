// backend/utils/claveAcceso.js
// Generador de clave de acceso de 49 dígitos para comprobantes electrónicos del SRI

/**
 * Formatea una fecha como ddmmaaaa
 */
function formatearFecha(fecha) {
  const d = new Date(fecha);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}${mes}${anio}`;
}

/**
 * Calcula el dígito verificador usando el algoritmo módulo 11 del SRI.
 * @param {string} cadena - Cadena de 48 dígitos
 * @returns {number} Dígito verificador (0-9)
 */
function calcularDigitoVerificador(cadena) {
  const pesos = [2, 3, 4, 5, 6, 7];
  let suma = 0;

  // Recorrer de derecha a izquierda
  for (let i = cadena.length - 1, j = 0; i >= 0; i--, j++) {
    const digito = parseInt(cadena.charAt(i), 10);
    const peso = pesos[j % 6];
    suma += digito * peso;
  }

  const resto = suma % 11;
  let dv = 11 - resto;

  if (dv === 11) dv = 0;
  if (dv === 10) dv = 1;

  return dv;
}

/**
 * Genera la clave de acceso de 49 dígitos.
 *
 * @param {object} params
 * @param {Date|string} params.fechaEmision - Fecha de emisión
 * @param {string} params.tipoComprobante - Código SRI (01, 03, 04, 05, 06, 07)
 * @param {string} params.ruc - RUC del emisor (13 dígitos)
 * @param {string} params.ambiente - '1' pruebas, '2' producción
 * @param {string} params.serie - 6 dígitos (establecimiento + punto emisión)
 * @param {number|string} params.secuencial - Número secuencial del comprobante
 * @param {number|string} [params.codigoNumerico] - 8 dígitos aleatorios (si no se pasa, se genera)
 * @param {string} [params.tipoEmision] - '1' normal, '2' contingencia
 * @returns {string} Clave de acceso de 49 dígitos
 */
function generarClaveAcceso(params) {
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

  // Validaciones básicas
  if (!fechaEmision) throw new Error('Se requiere fechaEmision');
  if (!tipoComprobante) throw new Error('Se requiere tipoComprobante');
  if (!ruc) throw new Error('Se requiere ruc');
  if (!serie) throw new Error('Se requiere serie');
  if (secuencial === undefined || secuencial === null) throw new Error('Se requiere secuencial');

  // 1. Fecha (8 dígitos)
  const fechaStr = formatearFecha(fechaEmision);

  // 2. Tipo comprobante (2 dígitos)
  const tipoStr = String(tipoComprobante).padStart(2, '0');

  // 3. RUC (13 dígitos)
  const rucLimpio = String(ruc).replace(/\D/g, '');
  if (rucLimpio.length !== 13) {
    throw new Error(`RUC debe tener 13 dígitos, recibido: ${rucLimpio.length}`);
  }
  const rucStr = rucLimpio;

  // 4. Ambiente (1 dígito)
  const ambienteStr = String(ambiente).charAt(0);

  // 5. Serie (6 dígitos: 3 establecimiento + 3 punto emisión)
  const serieLimpia = String(serie).replace(/\D/g, '');
  if (serieLimpia.length !== 6) {
    throw new Error(`Serie debe tener 6 dígitos, recibido: ${serieLimpia.length}`);
  }
  const serieStr = serieLimpia;

  // 6. Secuencial (9 dígitos)
  const secStr = String(secuencial).padStart(9, '0');
  if (secStr.length > 9) {
    throw new Error('Secuencial no puede tener más de 9 dígitos');
  }

  // 7. Código numérico (8 dígitos) - si no se pasa, generar aleatorio
  let codNum;
  if (codigoNumerico !== undefined && codigoNumerico !== null) {
    codNum = String(codigoNumerico).padStart(8, '0');
  } else {
    codNum = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  }
  if (codNum.length !== 8) {
    throw new Error('Código numérico debe tener 8 dígitos');
  }

  // 8. Tipo emisión (1 dígito)
  const tipoEmisionStr = String(tipoEmision).charAt(0);

  // Base de 48 dígitos
  const base = fechaStr + tipoStr + rucStr + ambienteStr + serieStr + secStr + codNum + tipoEmisionStr;

  if (base.length !== 48) {
    throw new Error(`La base debe tener 48 dígitos, tiene: ${base.length}`);
  }

  // 9. Dígito verificador módulo 11
  const dv = calcularDigitoVerificador(base);

  // Clave de acceso completa
  const clave = base + dv;

  if (clave.length !== 49) {
    throw new Error(`La clave debe tener 49 dígitos, tiene: ${clave.length}`);
  }

  return clave;
}

/**
 * Descompone una clave de acceso en sus partes.
 * Útil para validaciones o debugging.
 */
function descomponerClave(clave) {
  if (!clave || clave.length !== 49 || !/^\d+$/.test(clave)) {
    return null;
  }

  const tiposComp = {
    '01': 'Factura',
    '03': 'Liquidación de Compra',
    '04': 'Nota de Crédito',
    '05': 'Nota de Débito',
    '06': 'Guía de Remisión',
    '07': 'Comprobante de Retención'
  };

  return {
    fecha: `${clave.substr(0, 2)}/${clave.substr(2, 2)}/${clave.substr(4, 4)}`,
    tipoComprobante: clave.substr(8, 2),
    tipoComprobanteNombre: tiposComp[clave.substr(8, 2)] || 'Desconocido',
    ruc: clave.substr(10, 13),
    ambiente: clave.charAt(23) === '1' ? 'Pruebas' : 'Producción',
    ambienteCodigo: clave.charAt(23),
    serie: clave.substr(24, 6),
    establecimiento: clave.substr(24, 3),
    puntoEmision: clave.substr(27, 3),
    secuencial: clave.substr(30, 9),
    codigoNumerico: clave.substr(39, 8),
    tipoEmision: clave.charAt(47) === '1' ? 'Normal' : 'Contingencia',
    digitoVerificador: clave.charAt(48)
  };
}

/**
 * Valida que una clave de acceso sea correcta.
 */
function validarClave(clave) {
  if (!clave || typeof clave !== 'string') return false;
  if (clave.length !== 49) return false;
  if (!/^\d+$/.test(clave)) return false;

  const base = clave.substring(0, 48);
  const dvRecibido = parseInt(clave.charAt(48), 10);
  const dvCalculado = calcularDigitoVerificador(base);

  return dvCalculado === dvRecibido;
}

/**
 * Formatea una serie de 6 dígitos desde establecimiento y punto de emisión.
 * Ej: formatearSerie('001', '002') => '001002'
 */
function formatearSerie(establecimiento, puntoEmision) {
  const est = String(establecimiento || '001').padStart(3, '0');
  const pe = String(puntoEmision || '001').padStart(3, '0');
  return `${est}${pe}`;
}

module.exports = {
  generarClaveAcceso,
  calcularDigitoVerificador,
  descomponerClave,
  validarClave,
  formatearSerie,
  formatearFecha
};