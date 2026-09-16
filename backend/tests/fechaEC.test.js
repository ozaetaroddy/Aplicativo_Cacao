// backend/tests/fechaEC.test.js
// ============================================================
// Tests para utils/fechaEC.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  TZ_ECUADOR,
  partesFechaEC,
  fechaSRI,
  fechaClaveAcceso,
  periodoFiscal,
  anioMesEC,
  formatearFechaISO,
  esFechaValida,
  ahoraPartesEC,
  hoyEC,
  rangoDelDiaEC,
  rangoDelMesEC,
  diasEntreEC,
  compararFechasEC,
  sumarDiasEC,
  _CONFIG
} = require('../utils/fechaEC');

// ============================================================
// CONSTANTES
// ============================================================
describe('fechaEC · constantes', () => {
  test('TZ_ECUADOR es America/Guayaquil', () => {
    assert.equal(TZ_ECUADOR, 'America/Guayaquil');
    assert.equal(_CONFIG.timezone, 'America/Guayaquil');
  });

  test('locale en-CA (para YYYY-MM-DD estable)', () => {
    assert.equal(_CONFIG.locale, 'en-CA');
  });
});

// ============================================================
// CONVERSIÓN UTC → EC (tests originales)
// ============================================================
describe('fechaEC · emisión 22:00 EC (UTC-5) → mismo día en XML', () => {
  test('fechaSRI convierte correctamente', () => {
    // 2024-03-15 22:00 EC = 2024-03-16 03:00 UTC
    const fecha = new Date('2024-03-16T03:00:00.000Z');
    assert.equal(fechaSRI(fecha), '15/03/2024');
  });

  test('periodoFiscal usa mes EC', () => {
    // 2024-03-31 23:30 EC = 2024-04-01 04:30 UTC
    const fecha = new Date('2024-04-01T04:30:00.000Z');
    assert.equal(periodoFiscal(fecha), '03/2024');
  });

  test('partes individuales', () => {
    const fecha = new Date('2024-04-01T04:30:00.000Z');
    assert.deepEqual(
      partesFechaEC(fecha),
      { year: '2024', month: '03', day: '31' }
    );
  });

  test('anioMesEC con cierre 21:00 EC del 31 marzo', () => {
    // 2024-03-31 21:00 EC = 2024-04-01 02:00 UTC
    const fecha = new Date('2024-04-01T02:00:00.000Z');
    const { anio, mes } = anioMesEC(fecha);
    assert.equal(anio, 2024);
    assert.equal(mes, 3);
  });

  test('anioMesEC con emisión 22:00 EC del 30 abril → Abril', () => {
    // 2024-04-30 22:00 EC = 2024-05-01 03:00 UTC
    const fecha = new Date('2024-05-01T03:00:00.000Z');
    const { anio, mes } = anioMesEC(fecha);
    assert.equal(anio, 2024);
    assert.equal(mes, 4);
  });
});

// ============================================================
// FORMATOS
// ============================================================
describe('fechaEC · formatos', () => {
  const fecha = new Date('2024-06-15T10:00:00-05:00');

  test('fechaSRI → DD/MM/YYYY', () => {
    assert.equal(fechaSRI(fecha), '15/06/2024');
  });

  test('fechaClaveAcceso → DDMMYYYY', () => {
    assert.equal(fechaClaveAcceso(fecha), '15062024');
  });

  test('periodoFiscal → MM/YYYY', () => {
    assert.equal(periodoFiscal(fecha), '06/2024');
  });

  test('formatearFechaISO → YYYY-MM-DD', () => {
    assert.equal(formatearFechaISO(fecha), '2024-06-15');
  });
});

// ============================================================
// VALIDACIÓN
// ============================================================
describe('fechaEC · esFechaValida', () => {
  test('fechas válidas', () => {
    assert.equal(esFechaValida(new Date()), true);
    assert.equal(esFechaValida('2024-06-15'), true);
    assert.equal(esFechaValida(Date.now()), true);
  });

  test('fechas inválidas', () => {
    assert.equal(esFechaValida('no es fecha'), false);
    assert.equal(esFechaValida(null), false);
    assert.equal(esFechaValida(undefined), false);
    assert.equal(esFechaValida(new Date('invalid')), false);
  });

  test('no lanza nunca', () => {
    for (const v of [null, undefined, NaN, {}, [], 'x']) {
      assert.doesNotThrow(() => esFechaValida(v));
    }
  });
});

// ============================================================
// ERRORES TIPADOS
// ============================================================
describe('fechaEC · errores tipados', () => {
  test('fechaSRI con null lanza FECHA_INVALIDA', () => {
    assert.throws(
      () => fechaSRI(null),
      (err) => err.codigo === 'FECHA_INVALIDA' && err.status === 400
    );
  });

  test('partesFechaEC con basura lanza FECHA_INVALIDA', () => {
    assert.throws(() => partesFechaEC('basura'), (err) => err.codigo === 'FECHA_INVALIDA');
  });

  test('rangoDelMesEC con mes 13 lanza FECHA_INVALIDA', () => {
    assert.throws(() => rangoDelMesEC(2024, 13), (err) => err.codigo === 'FECHA_INVALIDA');
  });

  test('sumarDiasEC con días no entero lanza DIAS_INVALIDOS', () => {
    assert.throws(
      () => sumarDiasEC(new Date(), 1.5),
      (err) => err.codigo === 'DIAS_INVALIDOS'
    );
  });
});

// ============================================================
// "AHORA" y "HOY"
// ============================================================
describe('fechaEC · ahoraPartesEC / hoyEC', () => {
  test('ahoraPartesEC devuelve strings', () => {
    const p = ahoraPartesEC();
    assert.match(p.year, /^\d{4}$/);
    assert.match(p.month, /^\d{2}$/);
    assert.match(p.day, /^\d{2}$/);
  });

  test('hoyEC devuelve mediodía UTC del día EC', () => {
    const h = hoyEC();
    assert.ok(h instanceof Date);
    assert.equal(h.getUTCHours(), 12);
    assert.equal(h.getUTCMinutes(), 0);
  });

  test('hoyEC y ahoraPartesEC coinciden en el día', () => {
    const p = ahoraPartesEC();
    const h = hoyEC();
    assert.equal(String(h.getUTCFullYear()), p.year);
    assert.equal(String(h.getUTCMonth() + 1).padStart(2, '0'), p.month);
    assert.equal(String(h.getUTCDate()).padStart(2, '0'), p.day);
  });
});

// ============================================================
// RANGOS (Mongo queries)
// ============================================================
describe('fechaEC · rangoDelDiaEC', () => {
  test('cubre exactamente un día EC', () => {
    const r = rangoDelDiaEC('2024-06-15');
    // 00:00 EC = 05:00 UTC.
    assert.equal(r.inicio.toISOString(), '2024-06-15T05:00:00.000Z');
    // 23:59:59.999 EC = 04:59:59.999 UTC del día siguiente.
    assert.equal(r.fin.toISOString(), '2024-06-16T04:59:59.999Z');
  });

  test('inicio y fin son Date', () => {
    const r = rangoDelDiaEC(new Date());
    assert.ok(r.inicio instanceof Date);
    assert.ok(r.fin instanceof Date);
  });

  test('fin > inicio', () => {
    const r = rangoDelDiaEC('2024-01-01');
    assert.ok(r.fin > r.inicio);
  });
});

describe('fechaEC · rangoDelMesEC', () => {
  test('cubre el mes completo', () => {
    const r = rangoDelMesEC(2024, 6);
    assert.equal(r.inicio.toISOString(), '2024-06-01T05:00:00.000Z');
    // 30/06 23:59:59.999 EC = 01/07 04:59:59.999 UTC.
    assert.equal(r.fin.toISOString(), '2024-07-01T04:59:59.999Z');
  });

  test('febrero bisiesto tiene 29 días', () => {
    const r = rangoDelMesEC(2024, 2);
    const dias = (r.fin - r.inicio) / 86_400_000;
    assert.ok(dias > 28 && dias < 30);
  });

  test('rechaza mes 0 y mes 13', () => {
    assert.throws(() => rangoDelMesEC(2024, 0));
    assert.throws(() => rangoDelMesEC(2024, 13));
  });
});

// ============================================================
// CÁLCULOS
// ============================================================
describe('fechaEC · diasEntreEC', () => {
  test('mismo día → 0', () => {
    assert.equal(diasEntreEC('2024-06-15', '2024-06-15'), 0);
  });

  test('un día después → 1', () => {
    assert.equal(diasEntreEC('2024-06-16', '2024-06-15'), 1);
  });

  test('un día antes → -1', () => {
    assert.equal(diasEntreEC('2024-06-14', '2024-06-15'), -1);
  });

  test('respeta TZ EC: 22:00 EC vs 03:00 UTC siguiente', () => {
    // 15/06 22:00 EC = 16/06 03:00 UTC
    const a = new Date('2024-06-16T03:00:00Z');
    // 16/06 10:00 EC = 16/06 15:00 UTC
    const b = new Date('2024-06-16T15:00:00Z');
    // En EC, ambos son 15 vs 16 → 1 día de diferencia.
    assert.equal(diasEntreEC(b, a), 1);
  });
});

describe('fechaEC · compararFechasEC', () => {
  test('mismo día → 0', () => {
    assert.equal(compararFechasEC('2024-06-15', '2024-06-15'), 0);
  });

  test('a > b → 1', () => {
    assert.equal(compararFechasEC('2024-06-16', '2024-06-15'), 1);
  });

  test('a < b → -1', () => {
    assert.equal(compararFechasEC('2024-06-14', '2024-06-15'), -1);
  });
});

describe('fechaEC · sumarDiasEC', () => {
  test('suma 1 día', () => {
    const r = sumarDiasEC('2024-06-15', 1);
    assert.equal(formatearFechaISO(r), '2024-06-16');
  });

  test('resta 1 día', () => {
    const r = sumarDiasEC('2024-06-15', -1);
    assert.equal(formatearFechaISO(r), '2024-06-14');
  });

  test('cruza fin de mes', () => {
    const r = sumarDiasEC('2024-06-30', 1);
    assert.equal(formatearFechaISO(r), '2024-07-01');
  });

  test('cruza fin de año', () => {
    const r = sumarDiasEC('2024-12-31', 1);
    assert.equal(formatearFechaISO(r), '2025-01-01');
  });

  test('febrero bisiesto', () => {
    const r = sumarDiasEC('2024-02-28', 1);
    assert.equal(formatearFechaISO(r), '2024-02-29');
  });

  test('sumar 0 días devuelve el mismo día EC', () => {
    const r = sumarDiasEC('2024-06-15', 0);
    assert.equal(formatearFechaISO(r), '2024-06-15');
  });

  test('no entero lanza', () => {
    assert.throws(() => sumarDiasEC('2024-06-15', 1.5));
  });
});

// ============================================================
// NORMALIZACIÓN
// ============================================================
describe('fechaEC · normalizarDate', () => {
  test('acepta Date, string, number', () => {
    assert.ok(require('../utils/fechaEC')._normalizarDate(new Date()) instanceof Date);
    assert.ok(require('../utils/fechaEC')._normalizarDate('2024-06-15') instanceof Date);
    assert.ok(require('../utils/fechaEC')._normalizarDate(Date.now()) instanceof Date);
  });

  test('rechaza null y basura', () => {
    assert.throws(() => require('../utils/fechaEC')._normalizarDate(null));
    assert.throws(() => require('../utils/fechaEC')._normalizarDate('x'));
  });
});