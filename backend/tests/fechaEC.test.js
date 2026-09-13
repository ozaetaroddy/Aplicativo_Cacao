// tests/fechaEC.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { fechaSRI, periodoFiscal, partesFechaEC } = require('../utils/fechaEC');

test('fechaEC: emisión 22:00 EC (UTC-5) → mismo día en XML', () => {
  // 2024-03-15 22:00 EC  =  2024-03-16 03:00 UTC
  const fecha = new Date('2024-03-16T03:00:00.000Z');
  assert.strictEqual(fechaSRI(fecha), '15/03/2024');
});

test('fechaEC: periodo fiscal usa mes EC', () => {
  // 2024-03-31 23:30 EC  =  2024-04-01 04:30 UTC
  const fecha = new Date('2024-04-01T04:30:00.000Z');
  assert.strictEqual(periodoFiscal(fecha), '03/2024');
});

test('fechaEC: partes individuales', () => {
  const fecha = new Date('2024-04-01T04:30:00.000Z');
  assert.deepStrictEqual(partesFechaEC(fecha), { year: '2024', month: '03', day: '31' });
});