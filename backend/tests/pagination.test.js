// backend/tests/pagination.test.js
// ============================================================
// Tests para utils/pagination.js
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');

const {
  parsePagination,
  wantsPagination,
  buildDateRange,
  parseSort,
  escapeRegex,
  escapeRegexCached,
  CAMPOS_ORDENABLES,
  getPaginationMeta,
  parseFecha,
  parseFields,
  parseIdsList,
  parseBool,
  buildSort,
  CONFIG,
  _parseEnteroEstricto,
  _resetCacheEscape
} = require('../utils/pagination');

// ============================================================
// parsePagination
// ============================================================
describe('parsePagination', () => {
  test('usa defaults si no hay params', () => {
    const r = parsePagination({});
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.limit, CONFIG.defaultLimit);
    assert.strictEqual(r.skip, 0);
  });

  test('respeta page y limit válidos', () => {
    const r = parsePagination({ page: '3', limit: '50' });
    assert.strictEqual(r.page, 3);
    assert.strictEqual(r.limit, 50);
    assert.strictEqual(r.skip, 100);
  });

  test('limita el máximo de limit', () => {
    const r = parsePagination({ limit: '99999' });
    assert.strictEqual(r.limit, CONFIG.defaultLimit);
  });

  test('ignora valores negativos', () => {
    const r = parsePagination({ page: '-5', limit: '-10' });
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.limit, CONFIG.defaultLimit);
  });

  test('rechaza notación científica', () => {
    const r = parsePagination({ page: '1e5', limit: '2e3' });
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.limit, CONFIG.defaultLimit);
  });

  test('rechaza strings mixtos', () => {
    const r = parsePagination({ page: '12abc', limit: '50x' });
    assert.strictEqual(r.page, 1);
    assert.strictEqual(r.limit, CONFIG.defaultLimit);
  });

  test('rechaza leading zeros', () => {
    const r = parsePagination({ page: '012' });
    assert.strictEqual(r.page, 1);
  });

  test('acepta maxLimit custom', () => {
    const r = parsePagination({ limit: '500' }, { maxLimit: 1000 });
    assert.strictEqual(r.limit, 500);
  });

  test('acota page al maxPage', () => {
    const r = parsePagination({ page: '999999999' }, { maxPage: 1000 });
    assert.strictEqual(r.page, 1); // rechazado > 1000 → default 1
  });
});

// ============================================================
// wantsPagination
// ============================================================
describe('wantsPagination', () => {
  test('detecta page o limit con valor', () => {
    assert.strictEqual(wantsPagination({ page: '1' }), true);
    assert.strictEqual(wantsPagination({ limit: '10' }), true);
    assert.strictEqual(wantsPagination({ search: 'x' }), false);
    assert.strictEqual(wantsPagination({}), false);
  });

  test('page vacío no cuenta', () => {
    assert.strictEqual(wantsPagination({ page: '' }), false);
    assert.strictEqual(wantsPagination({ page: '   ' }), false);
  });

  test('null/undefined no rompen', () => {
    assert.strictEqual(wantsPagination(null), false);
    assert.strictEqual(wantsPagination(undefined), false);
  });
});

// ============================================================
// parseSort
// ============================================================
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

  test('sortDir case-insensitive', () => {
    assert.deepStrictEqual(parseSort({ sortBy: 'nombre', sortDir: 'ASC' }), { nombre: 1 });
    assert.deepStrictEqual(parseSort({ sortBy: 'nombre', sortDir: 'Asc' }), { nombre: 1 });
  });

  test('whitelist custom', () => {
    const r = parseSort({ sortBy: 'miCampo' }, {}, { permitidos: new Set(['miCampo']) });
    assert.deepStrictEqual(r, { miCampo: -1 });
  });

  test('múltiples campos con coma', () => {
    const r = parseSort(
      { sortBy: 'nombre,ruc' },
      {},
      { array: true }
    );
    assert.deepStrictEqual(r, [{ nombre: -1 }, { ruc: -1 }]);
  });

  test('múltiples campos merged (sin array)', () => {
    const r = parseSort({ sortBy: 'nombre,ruc' }, {});
    assert.deepStrictEqual(r, { nombre: -1, ruc: -1 });
  });

  test('ignora campos no válidos en la lista', () => {
    const r = parseSort({ sortBy: 'nombre,password,ruc' }, {}, { array: true });
    assert.deepStrictEqual(r, [{ nombre: -1 }, { ruc: -1 }]);
  });

  test('si todos son inválidos → default', () => {
    const def = { fecha_emision: -1 };
    assert.deepStrictEqual(parseSort({ sortBy: 'x,y,z' }, def), def);
  });

  test('buildSort es alias', () => {
    assert.deepStrictEqual(
      buildSort({ sortBy: 'nombre' }),
      parseSort({ sortBy: 'nombre' })
    );
  });
});

// ============================================================
// CAMPOS_ORDENABLES
// ============================================================
describe('CAMPOS_ORDENABLES', () => {
  test('incluye campos conocidos', () => {
    assert.ok(CAMPOS_ORDENABLES.has('fecha'));
    assert.ok(CAMPOS_ORDENABLES.has('monto'));
    assert.ok(CAMPOS_ORDENABLES.has('numero_recibo'));
    assert.ok(CAMPOS_ORDENABLES.has('numero_factura'));
    assert.ok(CAMPOS_ORDENABLES.has('clave_acceso'));
    assert.ok(CAMPOS_ORDENABLES.has('nombreNorm'));
    assert.ok(CAMPOS_ORDENABLES.has('codigoNorm'));
  });
});

// ============================================================
// escapeRegex
// ============================================================
describe('escapeRegex', () => {
  test('escapa caracteres especiales', () => {
    assert.strictEqual(escapeRegex('a.b'), 'a\\.b');
    assert.strictEqual(escapeRegex('a*b'), 'a\\*b');
    assert.strictEqual(escapeRegex('$100'), '\\$100');
    assert.strictEqual(escapeRegex('(test)'), '\\(test\\)');
  });

  test('strings sin especiales no cambian', () => {
    assert.strictEqual(escapeRegex('abc123'), 'abc123');
  });

  test('null/undefined → "null"/"undefined" (comportamiento previo)', () => {
    assert.strictEqual(escapeRegex(null), 'null');
    assert.strictEqual(escapeRegex(undefined), 'undefined');
    assert.strictEqual(new RegExp(escapeRegex(null), 'i').test('null'), false);
  assert.strictEqual(new RegExp(escapeRegex(null), 'i').test('cualquier cosa'), false);
  });
});

describe('escapeRegexCached', () => {
  beforeEach(() => _resetCacheEscape());

  test('mismo resultado que escapeRegex', () => {
    assert.strictEqual(escapeRegexCached('a.b'), escapeRegex('a.b'));
  });

  test('cachea el resultado', () => {
    const r1 = escapeRegexCached('test.busqueda');
    const r2 = escapeRegexCached('test.busqueda');
    assert.strictEqual(r1, r2);
    assert.ok(_parseEnteroEstricto('1')); // sanity check
  });
});

// ============================================================
// parseFecha
// ============================================================
describe('parseFecha', () => {
  test('YYYY-MM-DD válida', () => {
    const d = parseFecha('2024-06-15');
    assert.ok(d instanceof Date);
    assert.strictEqual(d.getFullYear(), 2024);
    assert.strictEqual(d.getMonth(), 5);
    assert.strictEqual(d.getDate(), 15);
  });

  test('rechaza fecha imposible (2024-02-30)', () => {
    assert.strictEqual(parseFecha('2024-02-30'), null);
  });

  test('rechaza mes 13', () => {
    assert.strictEqual(parseFecha('2024-13-01'), null);
  });

  test('rechaza basura', () => {
    assert.strictEqual(parseFecha('no-es-fecha'), null);
    assert.strictEqual(parseFecha(''), null);
    assert.strictEqual(parseFecha(null), null);
  });

  test('finDelDia aplica 23:59:59.999', () => {
    const d = parseFecha('2024-06-15', { finDelDia: true });
    assert.strictEqual(d.getHours(), 23);
    assert.strictEqual(d.getMinutes(), 59);
    assert.strictEqual(d.getSeconds(), 59);
  });
});

// ============================================================
// buildDateRange
// ============================================================
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

  test('campo custom', () => {
    const r = buildDateRange({ desde: '2024-01-01' }, 'fecha');
    assert.ok(r.fecha);
  });

  test('null si desde > hasta (modo tolerante)', () => {
    const r = buildDateRange({ desde: '2024-12-31', hasta: '2024-01-01' });
    assert.strictEqual(r, null);
  });

  test('lanza en strict si desde > hasta', () => {
    assert.throws(
      () => buildDateRange({ desde: '2024-12-31', hasta: '2024-01-01' }, 'fecha_emision', { strict: true }),
      (err) => err.codigo === 'RANGO_INVALIDO'
    );
  });

  test('null si fecha inválida (tolerante)', () => {
    assert.strictEqual(buildDateRange({ desde: 'basura' }), null);
    assert.strictEqual(buildDateRange({ hasta: '2024-02-30' }), null);
  });

  test('lanza en strict si fecha inválida', () => {
    assert.throws(
      () => buildDateRange({ desde: 'basura' }, 'fecha_emision', { strict: true }),
      (err) => err.codigo === 'DESDE_INVALIDO'
    );
  });

  test('rechaza rango demasiado largo (por defecto 3 años)', () => {
    const r = buildDateRange({ desde: '2000-01-01', hasta: '2024-12-31' });
    assert.strictEqual(r, null);
  });

  test('maxDias custom permite rangos más largos', () => {
    const r = buildDateRange(
      { desde: '2000-01-01', hasta: '2024-12-31' },
      'fecha_emision',
      { maxDias: 0 }
    );
    assert.ok(r);
  });
});

// ============================================================
// getPaginationMeta
// ============================================================
describe('getPaginationMeta', () => {
  test('shape completo', () => {
    const m = getPaginationMeta({ page: '2', limit: '10' }, 100);
    assert.strictEqual(m.total, 100);
    assert.strictEqual(m.page, 2);
    assert.strictEqual(m.limit, 10);
    assert.strictEqual(m.totalPages, 10);
    assert.strictEqual(m.hasNext, true);
    assert.strictEqual(m.hasPrev, true);
  });

  test('última página', () => {
    const m = getPaginationMeta({ page: '10', limit: '10' }, 100);
    assert.strictEqual(m.hasNext, false);
    assert.strictEqual(m.hasPrev, true);
  });

  test('primera página', () => {
    const m = getPaginationMeta({ page: '1', limit: '10' }, 100);
    assert.strictEqual(m.hasPrev, false);
  });

  test('total=0', () => {
    const m = getPaginationMeta({}, 0);
    assert.strictEqual(m.total, 0);
    assert.strictEqual(m.totalPages, 0);
    assert.strictEqual(m.hasNext, false);
  });
});

// ============================================================
// parseFields
// ============================================================
describe('parseFields', () => {
  test('lista básica', () => {
    const r = parseFields('nombre,ruc');
    assert.deepStrictEqual(r, { nombre: 1, ruc: 1 });
  });

  test('whitelist filtra', () => {
    const r = parseFields('nombre,password,ruc', new Set(['nombre', 'ruc']));
    assert.deepStrictEqual(r, { nombre: 1, ruc: 1 });
  });

  test('sin valor → null', () => {
    assert.strictEqual(parseFields(null), null);
    assert.strictEqual(parseFields(''), null);
    assert.strictEqual(parseFields('   '), null);
  });

  test('whitelist vacía el resultado → null', () => {
    const r = parseFields('password,secret', new Set(['nombre']));
    assert.strictEqual(r, null);
  });

  test('rechaza nombres inválidos', () => {
    const r = parseFields('nombre,123bad,$weird');
    assert.deepStrictEqual(r, { nombre: 1 });
  });

  test('soporta notación con punto (nested)', () => {
    const r = parseFields('cliente.nombre,cliente.ruc');
    assert.deepStrictEqual(r, { 'cliente.nombre': 1, 'cliente.ruc': 1 });
  });
});

// ============================================================
// parseIdsList
// ============================================================
describe('parseIdsList', () => {
  test('ObjectIds válidos', () => {
    const id1 = new ObjectId().toString();
    const id2 = new ObjectId().toString();
    const r = parseIdsList(`${id1},${id2}`);
    assert.strictEqual(r.length, 2);
    assert.ok(r[0] instanceof ObjectId);
  });

  test('comoObjectId=false → strings', () => {
    const r = parseIdsList('abc,def', { comoObjectId: false });
    assert.deepStrictEqual(r, ['abc', 'def']);
  });

  test('ignora inválidos en ObjectId mode', () => {
    const id1 = new ObjectId().toString();
    const r = parseIdsList(`${id1},basura`);
    assert.strictEqual(r.length, 1);
  });

  test('excede max → null', () => {
    const ids = Array.from({ length: 200 }, () => new ObjectId().toString()).join(',');
    assert.strictEqual(parseIdsList(ids, { max: 50 }), null);
  });

  test('vacío → null', () => {
    assert.strictEqual(parseIdsList(''), null);
    assert.strictEqual(parseIdsList('   '), null);
    assert.strictEqual(parseIdsList(null), null);
  });
});

// ============================================================
// parseBool
// ============================================================
describe('parseBool', () => {
  test('true valores', () => {
    for (const v of [true, 'true', '1', 1, 'TRUE', 'True']) {
      assert.strictEqual(parseBool(v), true, `parseBool(${v})`);
    }
  });

  test('false valores', () => {
    for (const v of [false, 'false', '0', 0, 'FALSE', 'False']) {
      assert.strictEqual(parseBool(v), false, `parseBool(${v})`);
    }
  });

  test('default para indefinidos', () => {
    assert.strictEqual(parseBool(undefined), false);
    assert.strictEqual(parseBool(null), false);
    assert.strictEqual(parseBool(''), false);
    assert.strictEqual(parseBool(undefined, true), true);
  });
});

// ============================================================
// _parseEnteroEstricto
// ============================================================
describe('_parseEnteroEstricto', () => {
  test('acepta enteros válidos', () => {
    assert.strictEqual(_parseEnteroEstricto('42'), 42);
    assert.strictEqual(_parseEnteroEstricto(42), 42);
    assert.strictEqual(_parseEnteroEstricto('1'), 1);
  });

  test('rechaza negativos, cero y no-enteros', () => {
    assert.strictEqual(_parseEnteroEstricto('-1'), null);
    assert.strictEqual(_parseEnteroEstricto('0'), null);
    assert.strictEqual(_parseEnteroEstricto('1.5'), null);
    assert.strictEqual(_parseEnteroEstricto('1e5'), null);
  });

  test('respeta max', () => {
    assert.strictEqual(_parseEnteroEstricto('999', { max: 100 }), null);
    assert.strictEqual(_parseEnteroEstricto('99', { max: 100 }), 99);
  });
});