// backend/utils/claveAcceso.js
// Generador y validador de claves de acceso del SRI (49 dígitos)

// ⚠️  El SRI trabaja con hora LOCAL de Ecuador (UTC-5, sin DST).
// Si el servidor corre en UTC (Docker por defecto), una venta emitida a las
// 22:00 EC corresponde al día siguiente en UTC. Forzamos la TZ explícitamente.
const TZ_ECUADOR = 'America/Guayaquil';

function formatearFecha(fecha) {
  const d = new Date(fecha);
  if (isNaN(d.getTime())) throw new Error('Fecha inválida');
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ECUADOR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const get = (t) => partes.find(p => p.type === t).value;
  return `${get('day')}${get('month')}${get('year')}`;
}

function formatearSerie(establecimiento, puntoEmision) {
  const est = String(establecimiento || '001').padStart(3, '0');
  const pe = String(puntoEmision || '001').padStart(3, '0');
  return `${est}${pe}`;
}

// ============================================================
// DÍGITO VERIFICADOR (Módulo 11)
// ============================================================
function calcularDigitoVerificador(cadena) {
  const pesos = [2, 3, 4, 5, 6, 7];
  let suma = 0;
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

// ============================================================
// GENERAR CLAVE
// ============================================================
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

  if (!fechaEmision) throw new Error('Se requiere fechaEmision');
  if (!tipoComprobante) throw new Error('Se requiere tipoComprobante');
  if (!ruc) throw new Error('Se requiere ruc');
  if (!serie) throw new Error('Se requiere serie');
  if (secuencial === undefined || secuencial === null) throw new Error('Se requiere secuencial');

  const fechaStr = formatearFecha(fechaEmision);

  const tipoStr = String(tipoComprobante).padStart(2, '0');
  if (tipoStr.length !== 2) throw new Error(`tipoComprobante debe ser de 2 dígitos, recibido: ${tipoComprobante}`);

  const rucLimpio = String(ruc).replace(/\D/g, '');
  if (rucLimpio.length !== 13) {
    throw new Error(`RUC debe tener 13 dígitos, recibido: ${rucLimpio.length}`);
  }

  const ambienteStr = String(ambiente).charAt(0);
  if (!['1', '2'].includes(ambienteStr)) {
    throw new Error(`Ambiente debe ser "1" o "2", recibido: ${ambiente}`);
  }

  const serieLimpia = String(serie).replace(/\D/g, '');
  if (serieLimpia.length !== 6) {
    throw new Error(`Serie debe tener 6 dígitos, recibido: ${serieLimpia.length}`);
  }

  const secStr = String(secuencial).padStart(9, '0');
  if (secStr.length > 9) throw new Error('Secuencial no puede tener más de 9 dígitos');

  let codNum;
  if (codigoNumerico !== undefined && codigoNumerico !== null) {
    codNum = String(codigoNumerico).padStart(8, '0');
    if (codNum.length !== 8) throw new Error('Código numérico debe tener 8 dígitos');
  } else {
    codNum = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  }

  const tipoEmisionStr = String(tipoEmision).charAt(0);
  if (!['1', '2'].includes(tipoEmisionStr)) {
    throw new Error(`Tipo emisión debe ser "1" o "2", recibido: ${tipoEmision}`);
  }

  const base = fechaStr + tipoStr + rucLimpio + ambienteStr + serieLimpia + secStr + codNum + tipoEmisionStr;
  if (base.length !== 48) throw new Error(`La base debe tener 48 dígitos, tiene: ${base.length}`);

  const dv = calcularDigitoVerificador(base);
  const clave = base + dv;
  if (clave.length !== 49) throw new Error(`La clave debe tener 49 dígitos, tiene: ${clave.length}`);

  return clave;
}

// ============================================================
// DESCOMPONER CLAVE
// ============================================================
const TIPOS_COMPROBANTE_NOMBRES = {
  '01': 'Factura',
  '03': 'Liquidación de Compra',
  '04': 'Nota de Crédito',
  '05': 'Nota de Débito',
  '06': 'Guía de Remisión',
  '07': 'Comprobante de Retención'
};

function descomponerClave(clave) {
  if (!clave || clave.length !== 49 || !/^\d+$/.test(clave)) return null;

  const tipo = clave.substr(8, 2);
  return {
    fecha: `${clave.substr(0, 2)}/${clave.substr(2, 2)}/${clave.substr(4, 4)}`,
    tipoComprobante: tipo,
    tipoComprobanteNombre: TIPOS_COMPROBANTE_NOMBRES[tipo] || 'Desconocido',
    ruc: clave.substr(10, 13),
    ambiente: clave.charAt(23) === '1' ? 'Pruebas' : 'Producción',
    ambienteCodigo: clave.charAt(23),
    serie: clave.substr(24, 6),
    establecimiento: clave.substr(24, 3),
    puntoEmision: clave.substr(27, 3),
    secuencial: clave.substr(30, 9),
    codigoNumerico: clave.substr(39, 8),
    tipoEmision: clave.charAt(47) === '1' ? 'Normal' : 'Contingencia',
    tipoEmisionCodigo: clave.charAt(47),
    digitoVerificador: clave.charAt(48)
  };
}

// ============================================================
// VALIDAR CLAVE
// ============================================================
function validarClave(clave) {
  if (!clave || typeof clave !== 'string') return false;
  if (clave.length !== 49) return false;
  if (!/^\d+$/.test(clave)) return false;

  const base = clave.substring(0, 48);
  const dvRecibido = parseInt(clave.charAt(48), 10);
  const dvCalculado = calcularDigitoVerificador(base);
  if (dvCalculado !== dvRecibido) return false;

  const partes = descomponerClave(clave);
  if (!partes) return false;

  const [d, m, a] = partes.fecha.split('/');
  const fecha = new Date(`${a}-${m}-${d}`);
  if (isNaN(fecha.getTime())) return false;

  return true;
}

function validarEstructuraClave(clave) {
  if (!clave || typeof clave !== 'string') return { valido: false, motivo: 'Clave vacía' };
  if (clave.length !== 49) return { valido: false, motivo: `Longitud ${clave.length} (esperado 49)` };
  if (!/^\d+$/.test(clave)) return { valido: false, motivo: 'Contiene caracteres no numéricos' };

  const partes = descomponerClave(clave);
  if (!partes) return { valido: false, motivo: 'No se pudo descomponer' };

  const base = clave.substring(0, 48);
  const dvEsperado = calcularDigitoVerificador(base);
  const dvRecibido = parseInt(clave.charAt(48), 10);

  if (dvEsperado !== dvRecibido) {
    return {
      valido: false,
      motivo: `Dígito verificador incorrecto (esperado ${dvEsperado}, recibido ${dvRecibido})`,
      partes
    };
  }
  return { valido: true, partes };
}

function extraerSecuencial(clave) {
  const partes = descomponerClave(clave);
  return partes?.secuencial || null;
}

module.exports = {
  generarClaveAcceso,
  calcularDigitoVerificador,
  descomponerClave,
  validarClave,
  validarEstructuraClave,
  extraerSecuencial,
  formatearSerie,
  formatearFecha,
  TIPOS_COMPROBANTE_NOMBRES,
  TZ_ECUADOR
};