// backend/utils/fechaEC.js
// ============================================================
// Helpers de fecha con zona horaria de Ecuador (UTC-5, sin DST)
// ------------------------------------------------------------
// ⚠️  El SRI opera con hora LOCAL de Ecuador. Si el servidor
//     corre en UTC (Docker por defecto), `new Date().getDate()`
//     devuelve un día distinto para emisiones después de las
//     19:00 EC. Esto rompe el XML (`fechaEmision`) y el ATS
//     aunque la clave de acceso se genere bien con `Intl`.
//
// Todos los helpers respetan la TZ de Ecuador y son seguros
// frente a entradas inválidas (lanzan error tipado, no `NaN`
// silencioso).
//
// API pública:
//   partesFechaEC(fecha)      → { year, month, day } strings
//   fechaSRI(fecha)           → 'DD/MM/YYYY'
//   fechaClaveAcceso(fecha)   → 'DDMMYYYY'
//   periodoFiscal(fecha)      → 'MM/YYYY'
//   anioMesEC(fecha)          → { anio, mes } números
//
// Extensiones:
//   formatearFechaISO(fecha)  → 'YYYY-MM-DD'
//   esFechaValida(fecha)      → boolean
//   ahoraPartesEC()           → partes de "ahora"
//   hoyEC()                   → Date a mediodía EC del día actual
//   rangoDelDiaEC(fecha)      → { inicio, fin } (UTC para Mongo)
//   rangoDelMesEC(anio, mes)  → { inicio, fin } (UTC para Mongo)
//   diasEntreEC(a, b)         → número de días calendario
//   compararFechasEC(a, b)    → -1 | 0 | 1
//   sumarDiasEC(fecha, dias)  → Date
// ============================================================
'use strict';

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = Object.freeze({
  /**
   * Zona horaria oficial del SRI. Ecuador es UTC-5 sin DST y no
   * ha cambiado desde 1993, pero se permite override por env
   * para soportar escenarios de testing o multicountry.
   */
  timezone: process.env.EC_TIMEZONE || 'America/Guayaquil',

  /** Milisegundos de un día. */
  msPorDia: 86_400_000,

  /** Locale usado por Intl (en-CA garantiza YYYY-MM-DD). */
  locale: 'en-CA'
});

// Alias de compatibilidad — el módulo exporta `TZ_ECUADOR`.
const TZ_ECUADOR = CONFIG.timezone;

// ============================================================
// ERRORES TIPADOS
// ============================================================
function errorFechaInvalida(fecha) {
  const err = new Error(`Fecha inválida: ${String(fecha)}`);
  err.codigo = 'FECHA_INVALIDA';
  err.status = 400;
  return err;
}

// ============================================================
// FORMATTER CACHEADO
// ------------------------------------------------------------
// Construir un `Intl.DateTimeFormat` es costoso (~50× el uso).
// Se crea una sola vez a nivel de módulo.
// ============================================================
const _formatter = new Intl.DateTimeFormat(CONFIG.locale, {
  timeZone: CONFIG.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Convierte cualquier entrada en un `Date` válido o lanza.
 *
 * ⚠️  Para strings `YYYY-MM-DD` se interpreta la fecha como **calendario EC**
 *     (00:00 EC = 05:00 UTC). Sin esto, `new Date('2024-06-15')` interpreta
 *     UTC midnight y al formatear en Guayaquil da día 14 (off-by-one).
 *
 * @param {Date|string|number} fecha
 * @returns {Date}
 * @throws {Error} con codigo='FECHA_INVALIDA'
 */
function normalizarDate(fecha) {
  if (fecha === null || fecha === undefined) {
    throw errorFechaInvalida(fecha);
  }

  // ---- String YYYY-MM-DD: interpretar como fecha EC ----
  if (typeof fecha === 'string') {
    const s = fecha.trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, y, mo, dd] = m.map(Number);
      // Validar que sea fecha real (evita 2024-02-30).
      const check = new Date(Date.UTC(y, mo - 1, dd));
      if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== dd
      ) {
        throw errorFechaInvalida(fecha);
      }
      // 00:00 EC = 05:00 UTC.
      return new Date(Date.UTC(y, mo - 1, dd, 5, 0, 0, 0));
    }
  }

  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) {
    throw errorFechaInvalida(fecha);
  }
  return d;
}

// ============================================================
// PARTES DE FECHA (TZ EC)
// ============================================================
/**
 * Devuelve `{ year, month, day }` como strings en horario de Ecuador.
 * - `year`: 4 dígitos (`'2024'`).
 * - `month` y `day`: 2 dígitos (`'03'`).
 *
 * @param {Date|string|number} fecha
 * @returns {{ year: string, month: string, day: string }}
 * @throws {Error} con codigo='FECHA_INVALIDA'
 */
function partesFechaEC(fecha) {
  const d = normalizarDate(fecha);
  const partes = _formatter.formatToParts(d);

  let year = null;
  let month = null;
  let day = null;
  for (const p of partes) {
    if (p.type === 'year') year = p.value;
    else if (p.type === 'month') month = p.value;
    else if (p.type === 'day') day = p.value;
  }

  if (!year || !month || !day) {
    throw errorFechaInvalida(fecha);
  }

  return { year, month, day };
}

// ============================================================
// FORMATOS SRI
// ============================================================
/**
 * Formato `DD/MM/AAAA` — usado en el XML de comprobantes y en el ATS.
 * @param {Date|string|number} fecha
 * @returns {string}
 */
function fechaSRI(fecha) {
  const { year, month, day } = partesFechaEC(fecha);
  return `${day}/${month}/${year}`;
}

/**
 * Formato `DDMMAAAA` — usado en la clave de acceso (49 dígitos).
 * @param {Date|string|number} fecha
 * @returns {string}
 */
function fechaClaveAcceso(fecha) {
  const { year, month, day } = partesFechaEC(fecha);
  return `${day}${month}${year}`;
}

/**
 * Formato `MM/AAAA` — período fiscal (retenciones, ATS).
 * @param {Date|string|number} fecha
 * @returns {string}
 */
function periodoFiscal(fecha) {
  const { year, month } = partesFechaEC(fecha);
  return `${month}/${year}`;
}

/**
 * Formato `YYYY-MM-DD` (ISO 8601 sin hora) — persistencia y logs.
 * @param {Date|string|number} fecha
 * @returns {string}
 */
function formatearFechaISO(fecha) {
  const { year, month, day } = partesFechaEC(fecha);
  return `${year}-${month}-${day}`;
}

// ============================================================
// AÑO/MES NUMÉRICOS
// ============================================================
/**
 * Año y mes numéricos en horario de Ecuador.
 * @param {Date|string|number} fecha
 * @returns {{ anio: number, mes: number }}
 * @throws {Error} con codigo='FECHA_INVALIDA' si no se puede parsear.
 */
function anioMesEC(fecha) {
  const { year, month } = partesFechaEC(fecha);
  const anio = parseInt(year, 10);
  const mes = parseInt(month, 10);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw errorFechaInvalida(fecha);
  }
  return { anio, mes };
}

// ============================================================
// VALIDACIÓN
// ============================================================
/**
 * `true` si la entrada es una fecha válida. NUNCA lanza.
 * @param {*} fecha
 * @returns {boolean}
 */
function esFechaValida(fecha) {
  if (fecha === null || fecha === undefined) return false;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return !Number.isNaN(d.getTime());
}

// ============================================================
// "AHORA" Y "HOY" EN TZ EC
// ============================================================
/**
 * Partes de la fecha actual en TZ EC.
 * @returns {{ year: string, month: string, day: string }}
 */
function ahoraPartesEC() {
  return partesFechaEC(new Date());
}

/**
 * Devuelve un `Date` a **mediodía EC** del día actual.
 * Útil como referencia estable para cálculos (evita problemas de
 * DST y de cambio de día por diferencias de milisegundos).
 *
 * @returns {Date}
 */
function hoyEC() {
  const { year, month, day } = ahoraPartesEC();
  // Construimos un Date en UTC a mediodía UTC del día EC — así
  // cualquier operación con +/- horas se mantiene dentro del
  // mismo día calendario EC.
  return new Date(Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    12, 0, 0, 0
  ));
}

// ============================================================
// RANGOS (para queries de Mongo)
// ============================================================
/**
 * Rango `[inicio, fin]` que cubre un día calendario EC, expresado
 * en UTC para poder usarlo en queries de Mongo (`$gte`/`$lte`).
 *
 * Ejemplo: `2024-06-15` en EC → `[2024-06-15T05:00:00Z, 2024-06-16T04:59:59.999Z]`
 *
 * @param {Date|string|number} fecha
 * @returns {{ inicio: Date, fin: Date }}
 */
function rangoDelDiaEC(fecha) {
  const { year, month, day } = partesFechaEC(fecha);

  // Inicio del día EC = 00:00 EC = 05:00 UTC (UTC-5, sin DST).
  // Construimos en UTC y dejamos que el offset se aplique naturalmente.
  const inicio = new Date(Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    5, 0, 0, 0    // 00:00 EC = 05:00 UTC
  ));
  const fin = new Date(inicio.getTime() + CONFIG.msPorDia - 1);

  return { inicio, fin };
}

/**
 * Rango `[inicio, fin]` que cubre un mes EC completo, en UTC.
 *
 * @param {number} anio
 * @param {number} mes  1-12
 * @returns {{ inicio: Date, fin: Date }}
 * @throws {Error} si el mes es inválido.
 */
function rangoDelMesEC(anio, mes) {
  const y = Number(anio);
  const m = Number(mes);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    const err = new Error(`Año/mes inválidos: ${anio}/${mes}`);
    err.codigo = 'FECHA_INVALIDA';
    throw err;
  }

  // 00:00 EC del primer día del mes = 05:00 UTC.
  const inicio = new Date(Date.UTC(y, m - 1, 1, 5, 0, 0, 0));
  // 23:59:59.999 EC del último día = (fin de mes + 1 día) 05:00 UTC - 1ms.
  const finExclusivo = new Date(Date.UTC(y, m, 1, 5, 0, 0, 0));
  const fin = new Date(finExclusivo.getTime() - 1);

  return { inicio, fin };
}

// ============================================================
// CÁLCULOS
// ============================================================
/**
 * Diferencia de días calendario EC entre `a` y `b`.
 * Positivo si `a` es posterior a `b`, negativo si anterior.
 *
 * @param {Date|string|number} a
 * @param {Date|string|number} b
 * @returns {number}
 */
function diasEntreEC(a, b) {
  const pa = partesFechaEC(a);
  const pb = partesFechaEC(b);
  const msA = Date.UTC(
    parseInt(pa.year, 10), parseInt(pa.month, 10) - 1, parseInt(pa.day, 10)
  );
  const msB = Date.UTC(
    parseInt(pb.year, 10), parseInt(pb.month, 10) - 1, parseInt(pb.day, 10)
  );
  return Math.round((msA - msB) / CONFIG.msPorDia);
}

/**
 * Compara dos fechas por día calendario EC.
 * @returns {-1 | 0 | 1}
 */
function compararFechasEC(a, b) {
  const d = diasEntreEC(a, b);
  if (d === 0) return 0;
  return d > 0 ? 1 : -1;
}

/**
 * Suma `dias` (puede ser negativo) a una fecha, respetando TZ EC.
 * @param {Date|string|number} fecha
 * @param {number} dias
 * @returns {Date}
 */
function sumarDiasEC(fecha, dias) {
  const n = Number(dias);
  if (!Number.isInteger(n)) {
    const err = new Error(`Días debe ser un entero, recibido: ${dias}`);
    err.codigo = 'DIAS_INVALIDOS';
    throw err;
  }
  const { year, month, day } = partesFechaEC(fecha);
  // Construimos a mediodía UTC del día EC — así el +/- días no
  // cruza el límite del día calendario.
  const base = new Date(Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    12, 0, 0, 0
  ));
  return new Date(base.getTime() + n * CONFIG.msPorDia);
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  TZ_ECUADOR,
  partesFechaEC,
  fechaSRI,
  fechaClaveAcceso,
  periodoFiscal,
  anioMesEC,

  // ---- Extensiones ----
  formatearFechaISO,
  esFechaValida,
  ahoraPartesEC,
  hoyEC,
  rangoDelDiaEC,
  rangoDelMesEC,
  diasEntreEC,
  compararFechasEC,
  sumarDiasEC
};

// ---- Solo para tests ----
module.exports._CONFIG = CONFIG;
module.exports._normalizarDate = normalizarDate;
module.exports._errorFechaInvalida = errorFechaInvalida;
module.exports._formatter = _formatter;