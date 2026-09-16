// backend/tests/audit.test.js
// ============================================================
// Tests para utils/audit.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');

const { limpiar, extraerIP, _CONFIG, _truncarString, _convertirId } =
  require('../utils/audit');

// ============================================================
// limpiar()
// ============================================================
describe('audit · limpiar', () => {
  test('strings largos se truncan con sufijo', () => {
    const largo = 'a'.repeat(_CONFIG.maxString + 500);
    const r = limpiar(largo);
    assert.ok(r.length <= _CONFIG.maxString);
    assert.match(r, /truncado/);
  });

  test('strings cortos pasan intactos', () => {
    assert.equal(limpiar('hola'), 'hola');
  });

  test('números, booleanos y null pasan intactos', () => {
    assert.equal(limpiar(42), 42);
    assert.equal(limpiar(true), true);
    assert.equal(limpiar(null), null);
    assert.equal(limpiar(undefined), undefined);
  });

  test('BigInt → string', () => {
    assert.equal(limpiar(10n), '10n');
  });

  test('función → placeholder', () => {
    assert.equal(limpiar(() => {}), '[función]');
  });

  test('Symbol → placeholder con descripción', () => {
    assert.equal(limpiar(Symbol('miSimbolo')), '[símbolo miSimbolo]');
  });

  test('ObjectId → string', () => {
    const id = new ObjectId();
    assert.equal(limpiar(id), id.toString());
  });

  test('Date → ISO string', () => {
    const d = new Date('2025-01-15T10:30:00Z');
    assert.equal(limpiar(d), '2025-01-15T10:30:00.000Z');
  });

  test('Date inválida → placeholder', () => {
    const d = new Date('basura');
    assert.equal(limpiar(d), '[fecha inválida]');
  });

  test('Buffer → placeholder con tamaño', () => {
    const buf = Buffer.alloc(1024);
    assert.equal(limpiar(buf), '[Buffer 1024B]');
  });

  test('Error → nombre y mensaje', () => {
    const e = new Error('boom');
    assert.deepEqual(limpiar(e), { name: 'Error', message: 'boom' });
  });

  test('campo sensible → ***', () => {
    const r = limpiar({ email: 'x@y.com', password: 'secreto123' });
    assert.equal(r.email, 'x@y.com');
    assert.equal(r.password, '***');
  });

  test('campo sensible case-insensitive', () => {
    const r = limpiar({ PASSWORD: 'x', PasswordCifrado: 'y', Authorization: 'Bearer z' });
    assert.equal(r.PASSWORD, '***');
    assert.equal(r.PasswordCifrado, '***');
    assert.equal(r.Authorization, '***');
  });

  test('campo omitido → placeholder', () => {
    const r = limpiar({ xml_generado: '<xml>...</xml>', nombre: 'x' });
    assert.equal(r.xml_generado, '[omitido por tamaño]');
    assert.equal(r.nombre, 'x');
  });

  test('array se trunca al máximo', () => {
    const arr = Array.from({ length: _CONFIG.maxArray + 20 }, (_, i) => i);
    const r = limpiar(arr);
    // Debe ser maxArray + 1 (el último es el mensaje "...(N más)").
    assert.equal(r.length, _CONFIG.maxArray + 1);
    assert.match(r[r.length - 1], /20 más/);
  });

  test('array pequeño se preserva', () => {
    const r = limpiar([1, 2, 3]);
    assert.deepEqual(r, [1, 2, 3]);
  });

  test('objetos anidados se limpian recursivamente', () => {
    const r = limpiar({
      a: { b: { c: { password: 'x', publico: 'y' } } }
    });
    assert.equal(r.a.b.c.password, '***');
    assert.equal(r.a.b.c.publico, 'y');
  });

  test('referencia circular → placeholder', () => {
    const obj = { nombre: 'x' };
    obj.self = obj;
    const r = limpiar(obj);
    assert.equal(r.nombre, 'x');
    assert.equal(r.self, '[circular]');
  });

  test('array circular → placeholder', () => {
    const arr = [1, 2];
    arr.push(arr);
    const r = limpiar(arr);
    assert.equal(r[0], 1);
    assert.equal(r[1], 2);
    assert.equal(r[2], '[circular]');
  });

  test('demasiada profundidad → placeholder', () => {
    let deep = { valor: 'hoja' };
    for (let i = 0; i < _CONFIG.maxDepth + 5; i++) {
      deep = { nivel: deep };
    }
    const r = limpiar(deep);
    // Buscar el placeholder en algún nivel.
    const json = JSON.stringify(r);
    assert.match(json, /demasiado profundo/);
  });

  test('ObjectId cross-realm (por _bsontype)', () => {
    const fake = { _bsontype: 'ObjectID', toString: () => '1790012344001' };
    assert.equal(limpiar(fake), '1790012344001');
  });
});

// ============================================================
// extraerIP()
// ============================================================
describe('audit · extraerIP', () => {
  test('Cloudflare tiene prioridad', () => {
    const req = {
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        'x-forwarded-for': '5.6.7.8'
      }
    };
    assert.equal(extraerIP(req), '1.2.3.4');
  });

  test('X-Forwarded-For toma la primera IP', () => {
    const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' } };
    assert.equal(extraerIP(req), '1.2.3.4');
  });

  test('X-Real-IP funciona', () => {
    const req = { headers: { 'x-real-ip': '10.0.0.1' } };
    assert.equal(extraerIP(req), '10.0.0.1');
  });

  test('fallback a socket.remoteAddress', () => {
    const req = { headers: {}, socket: { remoteAddress: '192.168.1.5' } };
    assert.equal(extraerIP(req), '192.168.1.5');
  });

  test('normaliza IPv4-mapped IPv6', () => {
    const req = { headers: {}, socket: { remoteAddress: '::ffff:192.168.1.5' } };
    assert.equal(extraerIP(req), '192.168.1.5');
  });

  test('req sin headers no rompe', () => {
    assert.doesNotThrow(() => extraerIP({}));
    assert.equal(extraerIP(null), '');
  });

  test('trunca IPs absurdamente largas', () => {
    const req = { headers: { 'cf-connecting-ip': 'x'.repeat(500) } };
    assert.ok(extraerIP(req).length <= 64);
  });
});

// ============================================================
// truncarString()
// ============================================================
describe('audit · truncarString', () => {
  test('string corto no cambia', () => {
    assert.equal(_truncarString('abc', 10), 'abc');
  });

  test('string largo se corta con sufijo', () => {
    const r = _truncarString('a'.repeat(100), 20);
    assert.ok(r.length <= 20);
    assert.match(r, /truncado/);
  });

  test('no-string → string vacío', () => {
    assert.equal(_truncarString(null, 10), '');
    assert.equal(_truncarString(undefined, 10), '');
    assert.equal(_truncarString(123, 10), '');
  });
});

// ============================================================
// convertirId()
// ============================================================
describe('audit · convertirId', () => {
  test('ObjectId válido pasa directo', () => {
    const id = new ObjectId();
    assert.equal(_convertirId(id), id);
  });

  test('string hex de 24 chars → ObjectId', () => {
    const hex = new ObjectId().toString();
    const r = _convertirId(hex);
    assert.ok(r instanceof ObjectId);
    assert.equal(r.toString(), hex);
  });

  test('string no-hex → string truncado', () => {
    const s = 'x'.repeat(500);
    const r = _convertirId(s);
    assert.equal(typeof r, 'string');
    assert.ok(r.length <= 100);
  });

  test('null/undefined → null', () => {
    assert.equal(_convertirId(null), null);
    assert.equal(_convertirId(undefined), null);
  });

  test('array → array de convertidos', () => {
    const ids = [new ObjectId().toString(), new ObjectId().toString()];
    const r = _convertirId(ids);
    assert.equal(r.length, 2);
    assert.ok(r[0] instanceof ObjectId);
  });

  test('array con nulls se filtran', () => {
    const r = _convertirId([null, new ObjectId(), undefined]);
    assert.equal(r.length, 1);
  });
});