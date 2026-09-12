// backend/tests/pagination.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  parsePagination,
  wantsPagination,
  buildDateRange,
  parseSort,
  escapeRegex,
  CAMPOS_ORDENABLES
} = require('../utils/pagination');

describe('parsePagination', () => {
  test('usa defaults si no hay params', () => {
    const r = parsePagination({});
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.limit, 20);
    assert.strictEqual(r.skip, 0);
  });

  test('respeta page y limit válidos', () => {
    const r = parsePagination({ page: '3', limit: '50' });
    assert.strictEqual(r.page, 3);
    assert.strictEqual(r.limit, 50);
    assert.strictEqual(r.skip, 100);
  });

  test('limita el máximo a 200', () => {
    const r = parsePagination({ limit: '99999' });
    assert.strictEqual(r.limit, 200);
  });

  test('ignora valores negativos', () => {
    const r = parsePagination({ page: '-5', limit: '-10' });
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.limit, 20);
  });
});

describe('wantsPagination', () => {
  test('detecta page o limit', () => {
    assert.strictEqual(wantsPagination({ page: '1' }), true);
    assert.strictEqual(wantsPagination({ limit: '10' }), true);
    assert.strictEqual(wantsPagination({ search: 'x' }), false);
    assert.strictEqual(wantsPagination({}), false);
  });
});

describe('parseSort', () => {
  test('usa default si no hay sortBy', () => {
    const r = parseSort({}, { nombre: 1 });
    assert.deepStrictEqual(r, { nombre: 1 });
  });

  test('acepta campos de la whitelist', () => {
    assert.deepStrictEqual(parseSort({ sortBy: 'nombre', sortDir: 'asc' }), { nombre: 1 });
    assert.deepStrictEqual(parseSort({ sortBy: 'total', sortDir: 'desc' }), { total: -1 });
    assert.deepStrictEqual(parseSort({ sortBy: 'fecha', sortDir: 'desc' }), { fecha: -1 });
    assert.deepStrictEqual(parseSort({ sortBy: 'monto', sortDir: 'asc' }), { monto: 1 });
  });

  test('rechaza campos fuera de la whitelist', () => {
    const defaultSort = { fecha_emision: -1 };
    assert.deepStrictEqual(parseSort({ sortBy: 'password' }, defaultSort), defaultSort);
    assert.deepStrictEqual(parseSort({ sortBy: '__proto__' }, defaultSort), defaultSort);
  });

  test('default sortDir es desc', () => {
    assert.deepStrictEqual(parseSort({ sortBy: 'nombre' }), { nombre: -1 });
  });
});

describe('CAMPOS_ORDENABLES', () => {
  test('incluye los campos que necesitan los módulos nuevos', () => {
    assert.ok(CAMPOS_ORDENABLES.has('fecha'));
    assert.ok(CAMPOS_ORDENABLES.has('monto'));
    assert.ok(CAMPOS_ORDENABLES.has('numero_recibo'));
    assert.ok(CAMPOS_ORDENABLES.has('numero_factura'));
    assert.ok(CAMPOS_ORDENABLES.has('clave_acceso'));
  });
});

describe('escapeRegex', () => {
  test('escapa caracteres especiales de regex', () => {
    assert.strictEqual(escapeRegex('a.b'), 'a\\.b');
    assert.strictEqual(escapeRegex('a*b'), 'a\\*b');
    assert.strictEqual(escapeRegex('$100'), '\\$100');
    assert.strictEqual(escapeRegex('(test)'), '\\(test\\)');
  });
});

describe('buildDateRange', () => {
  test('devuelve null si no hay fechas', () => {
    assert.strictEqual(buildDateRange({}), null);
  });

  test('construye $gte y $lte', () => {
    const r = buildDateRange({ desde: '2024-01-01', hasta: '2024-01-31' });
    assert.ok(r.fecha_emision);
    assert.ok(r.fecha_emision.$gte instanceof Date);
    assert.ok(r.fecha_emision.$lte instanceof Date);
  });
});