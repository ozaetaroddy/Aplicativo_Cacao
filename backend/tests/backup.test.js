// backend/tests/backup.test.js
// ============================================================
// Tests para utils/backup.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  ObjectId, Binary, Long, Decimal128, Int32, Double, Timestamp, MinKey, MaxKey, Code
} = require('mongodb');

const {
  serializarBSON,
  revivirBSON,
  extraerBufferContenido,
  comprimirBackup,
  comprimirBackupAsync,
  descomprimirBackup,
  descomprimirBackupAsync,
  calcularTamano,
  _CONFIG,
  _validarNombreColeccion,
  _errorTipado
} = require('../utils/backup');

// ============================================================
// SERIALIZACIÓN / REVIVIR
// ============================================================
describe('backup · serializarBSON', () => {
  test('primitivos pasan intactos', () => {
    assert.equal(serializarBSON('hola'), 'hola');
    assert.equal(serializarBSON(42), 42);
    assert.equal(serializarBSON(true), true);
    assert.equal(serializarBSON(null), null);
  });

  test('ObjectId → {__bsonType: "ObjectId"}', () => {
    const id = new ObjectId();
    const r = serializarBSON(id);
    assert.equal(r.__bsonType, 'ObjectId');
    assert.equal(r.value, id.toString());
  });

  test('Date → {__bsonType: "Date"}', () => {
    const d = new Date('2025-01-15T10:00:00Z');
    const r = serializarBSON(d);
    assert.equal(r.__bsonType, 'Date');
    assert.equal(r.value, '2025-01-15T10:00:00.000Z');
  });

  test('Buffer → base64', () => {
    const buf = Buffer.from('hola mundo');
    const r = serializarBSON(buf);
    assert.equal(r.__bsonType, 'Buffer');
    assert.equal(Buffer.from(r.value, 'base64').toString(), 'hola mundo');
  });

  test('Long → string', () => {
    const r = serializarBSON(Long.fromString('9223372036854775807'));
    assert.equal(r.__bsonType, 'Long');
    assert.equal(r.value, '9223372036854775807');
  });

  test('Decimal128 → string', () => {
    const r = serializarBSON(Decimal128.fromString('123.456'));
    assert.equal(r.__bsonType, 'Decimal128');
    assert.equal(r.value, '123.456');
  });

  test('Int32 y Double', () => {
    assert.equal(serializarBSON(new Int32(42)).__bsonType, 'Int32');
    assert.equal(serializarBSON(new Double(3.14)).__bsonType, 'Double');
  });

  test('Timestamp preserva t e i', () => {
    const r = serializarBSON(new Timestamp({ t: 100, i: 5 }));
    assert.equal(r.__bsonType, 'Timestamp');
    assert.equal(r.t, 100);
    assert.equal(r.i, 5);
  });

  test('MinKey y MaxKey', () => {
    assert.equal(serializarBSON(new MinKey()).__bsonType, 'MinKey');
    assert.equal(serializarBSON(new MaxKey()).__bsonType, 'MaxKey');
  });

  test('Code con scope', () => {
    const r = serializarBSON(new Code('return 1;', { x: 1 }));
    assert.equal(r.__bsonType, 'Code');
    assert.equal(r.value, 'return 1;');
  });

  test('BigInt → string', () => {
    const r = serializarBSON(10n);
    assert.equal(r.__bsonType, 'BigInt');
    assert.equal(r.value, '10');
  });

  test('RegExp → {__bsonType:"RegExp"}', () => {
    const r = serializarBSON(/abc/gi);
    assert.equal(r.__bsonType, 'RegExp');
    assert.equal(r.source, 'abc');
    assert.equal(r.flags, 'gi');
  });

  test('funciones se omiten', () => {
    const r = serializarBSON({ a: 1, fn: () => {} });
    assert.equal(r.a, 1);
    assert.equal(r.fn, undefined);
  });

  test('referencia circular → placeholder', () => {
    const obj = { nombre: 'x' };
    obj.self = obj;
    const r = serializarBSON(obj);
    assert.equal(r.nombre, 'x');
    assert.equal(r.self.__bsonType, 'Circular');
  });

  test('arrays anidados', () => {
    const r = serializarBSON([1, [2, 3], { a: 4 }]);
    assert.deepEqual(r, [1, [2, 3], { a: 4 }]);
  });
});

describe('backup · revivirBSON', () => {
  test('round-trip ObjectId', () => {
    const id = new ObjectId();
    const revived = revivirBSON(serializarBSON(id));
    assert.equal(revived.toString(), id.toString());
  });

  test('round-trip Date', () => {
    const d = new Date('2025-01-15T10:00:00Z');
    const revived = revivirBSON(serializarBSON(d));
    assert.equal(revived.toISOString(), d.toISOString());
  });

  test('round-trip Buffer', () => {
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    const revived = revivirBSON(serializarBSON(buf));
    assert.ok(Buffer.isBuffer(revived));
    assert.deepEqual([...revived], [1, 2, 3, 4, 5]);
  });

  test('round-trip Long', () => {
    const l = Long.fromString('123456789012345');
    const revived = revivirBSON(serializarBSON(l));
    assert.equal(revived.toString(), '123456789012345');
  });

  test('round-trip Decimal128', () => {
    const d = Decimal128.fromString('99.99');
    const revived = revivirBSON(serializarBSON(d));
    assert.equal(revived.toString(), '99.99');
  });

  test('round-trip Timestamp', () => {
    const ts = new Timestamp({ t: 200, i: 7 });
    const revived = revivirBSON(serializarBSON(ts));
    assert.equal(revived.t, 200);
    assert.equal(revived.i, 7);
  });

  test('objeto plano intacto', () => {
    const obj = { a: 1, b: 'x', c: { d: true } };
    assert.deepEqual(revivirBSON(obj), obj);
  });

  test('array mixto', () => {
    const arr = [1, 'a', new Date('2025-01-01')];
    const revived = revivirBSON(serializarBSON(arr));
    assert.equal(revived[0], 1);
    assert.equal(revived[1], 'a');
    assert.ok(revived[2] instanceof Date);
  });

  test('null/undefined pasan', () => {
    assert.equal(revivirBSON(null), null);
    assert.equal(revivirBSON(undefined), undefined);
  });
});

// ============================================================
// EXTRACCIÓN DE BUFFER
// ============================================================
describe('backup · extraerBufferContenido', () => {
  test('Buffer directo', () => {
    const buf = Buffer.from('x');
    assert.equal(extraerBufferContenido(buf), buf);
  });

  test('Binary → buffer', () => {
    const bin = new Binary(Buffer.from('abc'));
    const r = extraerBufferContenido(bin);
    assert.ok(Buffer.isBuffer(r));
    assert.equal(r.toString(), 'abc');
  });

  test('subobjeto { buffer }', () => {
    const buf = Buffer.from('y');
    assert.equal(extraerBufferContenido({ buffer: buf }), buf);
  });

  test('subobjeto { value }', () => {
    const buf = Buffer.from('z');
    assert.equal(extraerBufferContenido({ value: buf }), buf);
  });

  test('null y undefined → null', () => {
    assert.equal(extraerBufferContenido(null), null);
    assert.equal(extraerBufferContenido(undefined), null);
    assert.equal(extraerBufferContenido('no es buffer'), null);
  });

  test('_bsontype Binary con buffer', () => {
    const buf = Buffer.from('w');
    assert.equal(extraerBufferContenido({ _bsontype: 'Binary', buffer: buf }), buf);
  });
});

// ============================================================
// COMPRESIÓN
// ============================================================
describe('backup · compresión', () => {
  test('comprimir → descomprimir round-trip', () => {
    const snapshot = { hola: 'mundo', n: 42, arr: [1, 2, 3] };
    const buf = comprimirBackup(snapshot);
    assert.ok(Buffer.isBuffer(buf));
    assert.deepEqual(descomprimirBackup(buf), snapshot);
  });

  test('comprimirBackup con yaSerializado evita doble stringify', () => {
    const json = '{"a":1}';
    const buf = comprimirBackup({}, { yaSerializado: json });
    const revived = descomprimirBackup(buf);
    assert.deepEqual(revived, { a: 1 });
  });

  test('comprimirBackupAsync hace lo mismo', async () => {
    const snapshot = { test: 'async' };
    const buf = await comprimirBackupAsync(snapshot);
    assert.ok(Buffer.isBuffer(buf));
    assert.deepEqual(descomprimirBackup(buf), snapshot);
  });

  test('descomprimirBackupAsync round-trip', async () => {
    const snapshot = { async: true };
    const buf = comprimirBackup(snapshot);
    const revived = await descomprimirBackupAsync(buf);
    assert.deepEqual(revived, snapshot);
  });

  test('descomprimir gzip corrupto → error tipado', () => {
    assert.throws(
      () => descomprimirBackup(Buffer.from('no es gzip')),
      (err) => err.codigo === 'BACKUP_CORRUPTO' && err.status === 400
    );
  });

  test('descomprimir JSON inválido → error tipado', () => {
    const zlib = require('node:zlib');
    const bad = zlib.gzipSync(Buffer.from('no es JSON'));
    assert.throws(
      () => descomprimirBackup(bad),
      (err) => err.codigo === 'BACKUP_CORRUPTO'
    );
  });
});

// ============================================================
// TAMAÑO
// ============================================================
describe('backup · calcularTamano', () => {
  test('string vacío → 2 bytes ("{}")', () => {
    assert.equal(calcularTamano({}), 2);
  });

  test('string ASCII → bytes correctos', () => {
    const json = '{"a":1}';
    const r = calcularTamano({ a: 1 });
    assert.equal(r, Buffer.byteLength(json, 'utf-8'));
  });

  test('acentos cuentan como múltiples bytes', () => {
    const ascii = calcularTamano({ s: 'abc' });
    const utf8 = calcularTamano({ s: 'áéí' });
    assert.ok(utf8 > ascii);
  });

  test('yaSerializado no re-serializa', () => {
    const json = '{"custom":"json"}';
    assert.equal(calcularTamano({}, { yaSerializado: json }), Buffer.byteLength(json));
  });
});

// ============================================================
// VALIDACIÓN DE NOMBRES
// ============================================================
describe('backup · validarNombreColeccion', () => {
  test('nombres válidos pasan', () => {
    for (const n of ['ventas_v2', 'compras-v2', 'productos', 'a123']) {
      assert.doesNotThrow(() => _validarNombreColeccion(n));
    }
  });

  test('vacío / no-string → error 400', () => {
    for (const n of ['', null, undefined, 42]) {
      assert.throws(
        () => _validarNombreColeccion(n),
        (err) => err.codigo === 'NOMBRE_COLECCION_INVALIDO'
      );
    }
  });

  test('system.* y $ prefijos rechazados', () => {
    for (const n of ['system.users', '$cmd', 'system.']) {
      assert.throws(() => _validarNombreColeccion(n));
    }
  });

  test('slashes y null bytes rechazados', () => {
    assert.throws(() => _validarNombreColeccion('foo/bar'));
    assert.throws(() => _validarNombreColeccion('foo\0bar'));
  });

  test('nombres demasiado largos rechazados', () => {
    assert.throws(() => _validarNombreColeccion('a'.repeat(200)));
  });

  test('no puede empezar con número', () => {
    assert.throws(() => _validarNombreColeccion('123abc'));
  });
});

// ============================================================
// CONFIG EXPUESTA
// ============================================================
describe('backup · CONFIG', () => {
  test('tiene los valores esperados por defecto', () => {
    assert.equal(_CONFIG.schemaVersion, 3);
    assert.ok(_CONFIG.batchSize > 0);
    assert.ok(_CONFIG.maxJsonBytes > 0);
    assert.ok(_CONFIG.gzipLevel >= 1 && _CONFIG.gzipLevel <= 9);
  });

  test('excluidasRestore incluye backups y auditoria', () => {
    assert.ok(_CONFIG.excluidasRestore.has('backups'));
    assert.ok(_CONFIG.excluidasRestore.has('auditoria'));
    assert.ok(_CONFIG.excluidasRestore.has('cache_consultas'));
  });
});