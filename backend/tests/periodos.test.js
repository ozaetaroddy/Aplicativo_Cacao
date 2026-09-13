// tests/periodos.test.js
const { test } = require('node:test');
const assert = require('node:assert');

test('periodos: cierre 21:00 EC del 31 marzo pertenece a Marzo (no Abril)', () => {
  // 2024-03-31 21:00 EC  =  2024-04-01 02:00 UTC
  const fechaEmision = new Date('2024-04-01T02:00:00.000Z');
  const { anioMesEC } = require('../utils/fechaEC');
  const { anio, mes } = anioMesEC(fechaEmision);
  assert.strictEqual(anio, 2024);
  assert.strictEqual(mes, 3); // ← Marzo
});

test('periodos: emisión 22:00 EC del 30 abril → Abril', () => {
  // 2024-04-30 22:00 EC  =  2024-05-01 03:00 UTC
  const fechaEmision = new Date('2024-05-01T03:00:00.000Z');
  const { anioMesEC } = require('../utils/fechaEC');
  const { anio, mes } = anioMesEC(fechaEmision);
  assert.strictEqual(anio, 2024);
  assert.strictEqual(mes, 4);
});