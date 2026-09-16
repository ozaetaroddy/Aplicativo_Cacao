// backend/tests/scripts.utils.test.js
// ============================================================
// Tests para scripts/_utils.js (parseArgs y helpers).
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, pad, round2 } = require('../scripts/_utils');

describe('scripts/_utils · parseArgs', () => {
  test('sin argumentos → defaults', () => {
    const r = parseArgs([]);
    assert.equal(r.dryRun, false);
    assert.equal(r.confirmado, false);
    assert.equal(r.limit, null);
    assert.equal(r.only, null);
    assert.equal(r.desde, null);
    assert.equal(r.hasta, null);
    assert.equal(r.flags.size, 0);
  });

  test('--dry-run y --confirm', () => {
    const r = parseArgs(['--dry-run', '--confirm']);
    assert.equal(r.dryRun, true);
    assert.equal(r.confirmado, true);
  });

  test('--limit=100 parsea entero', () => {
    const r = parseArgs(['--limit=100']);
    assert.equal(r.limit, 100);
  });

  test('--limit=abc ignora valor inválido', () => {
    const r = parseArgs(['--limit=abc']);
    assert.equal(r.limit, null);
  });

  test('--limit=-5 ignora valor negativo', () => {
    const r = parseArgs(['--limit=-5']);
    assert.equal(r.limit, null);
  });

  test('--only=a,b,c → array', () => {
    const r = parseArgs(['--only=ventas,compras,pagos']);
    assert.deepEqual(r.only, ['ventas', 'compras', 'pagos']);
  });

  test('--only con espacios los elimina', () => {
    const r = parseArgs(['--only=ventas, compras , pagos']);
    assert.deepEqual(r.only, ['ventas', 'compras', 'pagos']);
  });

  test('--desde y --hasta', () => {
    const r = parseArgs(['--desde=2025-01-01', '--hasta=2025-01-31']);
    assert.equal(r.desde, '2025-01-01');
    assert.equal(r.hasta, '2025-01-31');
  });

  test('combina flags y kv', () => {
    const r = parseArgs([
      '--dry-run',
      '--limit=50',
      '--only=factura',
      '--confirm'
    ]);
    assert.equal(r.dryRun, true);
    assert.equal(r.confirmado, true);
    assert.equal(r.limit, 50);
    assert.deepEqual(r.only, ['factura']);
  });

  test('ignora argumentos que no empiezan con --', () => {
    const r = parseArgs(['foo', 'bar', '--dry-run']);
    assert.equal(r.dryRun, true);
    assert.equal(r.flags.size, 1);
  });

  test('--sin-backup se guarda en flags', () => {
    const r = parseArgs(['--sin-backup']);
    assert.equal(r.flags.has('sin-backup'), true);
  });

  test('kv extra queda accesible', () => {
    const r = parseArgs(['--tipo=factura', '--custom=valor']);
    assert.equal(r.kv.tipo, 'factura');
    assert.equal(r.kv.custom, 'valor');
  });
});

describe('scripts/_utils · pad', () => {
  test('rellena a la derecha', () => {
    assert.equal(pad('abc', 6), 'abc   ');
  });

  test('trunca si excede', () => {
    assert.equal(pad('abcdefg', 3), 'abc');
  });

  test('null/undefined → cadena vacía', () => {
    assert.equal(pad(null, 5), '     ');
    assert.equal(pad(undefined, 3), '   ');
  });
});

describe('scripts/_utils · round2', () => {
  test('redondea a 2 decimales', () => {
    assert.equal(round2(1.234), 1.23);
    assert.equal(round2(1.235), 1.24);
    assert.equal(round2(1.005), 1.01);
  });

  test('valores no numéricos → 0', () => {
    assert.equal(round2(null), 0);
    assert.equal(round2(undefined), 0);
    assert.equal(round2('abc'), 0);
    assert.equal(round2(NaN), 0);
    assert.equal(round2(Infinity), 0);
  });

  test('negativos', () => {
    assert.equal(round2(-1.235), -1.23);
  });
});