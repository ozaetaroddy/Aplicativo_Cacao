// backend/utils/fechaEC.js
// Helpers de fecha con zona horaria de Ecuador (UTC-5, sin DST).
//
// ⚠️  El SRI opera con hora LOCAL de Ecuador. Si el servidor corre en UTC
// (Docker por defecto), `new Date().getDate()` da un día distinto para
// emisiones después de las 19:00 EC. Esto rompe el XML (fechaEmision) y el
// ATS aunque la clave de acceso se genere bien con Intl.

const TZ_ECUADOR = 'America/Guayaquil';

/**
 * Devuelve { year, month, day } como strings de 2 dígitos (year 4 dígitos)
 * en horario de Ecuador.
 */
function partesFechaEC(fecha) {
  const d = new Date(fecha);
  if (isNaN(d.getTime())) throw new Error('Fecha inválida');
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ECUADOR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const get = (t) => partes.find(p => p.type === t).value;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day')
  };
}

/**
 * Formato DD/MM/AAAA — usado en el XML de comprobantes y en el ATS.
 */
function fechaSRI(fecha) {
  const { year, month, day } = partesFechaEC(fecha);
  return `${day}/${month}/${year}`;
}

/**
 * Formato DDMMAAAA — usado en la clave de acceso (49 dígitos).
 */
function fechaClaveAcceso(fecha) {
  const { year, month, day } = partesFechaEC(fecha);
  return `${day}${month}${year}`;
}

/**
 * Formato MM/AAAA — periodo fiscal (retenciones, ATS).
 */
function periodoFiscal(fecha) {
  const { year, month } = partesFechaEC(fecha);
  return `${month}/${year}`;
}

/**
 * Año y mes numéricos en horario de Ecuador (para consultas a periodos).
 */
function anioMesEC(fecha) {
  const { year, month } = partesFechaEC(fecha);
  return { anio: parseInt(year, 10), mes: parseInt(month, 10) };
}

module.exports = {
  TZ_ECUADOR,
  partesFechaEC,
  fechaSRI,
  fechaClaveAcceso,
  periodoFiscal,
  anioMesEC
};