// backend/tests/logger.test.js
// ============================================================
// Tests para utils/logger.js
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Cargamos antes de silenciar, para poder testear.
const log = require('../utils/logger');

// ============================================================
// API BÁSICA
// ============================================================
describe('logger · API', () => {
  test('expone los métodos esperados', () => {
    assert.equal(typeof log.debug, 'function');
    assert.equal(typeof log.info, 'function');
    assert.equal(typeof log.warn, 'function');
    assert.equal(typeof log.error, 'function');
    assert.equal(typeof log.child, 'function');
  });

  test('expone helpers extra', () => {
    assert.equal(typeof log.childLogger, 'function');
    assert.equal(typeof log.addRedactPath, 'function');
    assert.equal(typeof log.getRedactPaths, 'function');
    assert.equal(typeof log.flush, 'function');
    assert.equal(typeof log.close, 'function');
    assert.equal(typeof log.silent, 'function');
    assert.equal(typeof log.unsilent, 'function');
  });

  test('no lanza al llamar métodos', () => {
    log.silent();
    assert.doesNotThrow(() => log.info({ a: 1 }, 'test'));
    assert.doesNotThrow(() => log.warn('mensaje simple'));
    assert.doesNotThrow(() => log.error(new Error('x')));
    log.unsilent();
  });

  test('acepta mensaje sin objeto', () => {
    log.silent();
    assert.doesNotThrow(() => log.info('hola'));
    log.unsilent();
  });
});

// ============================================================
// CHILD LOGGER
// ============================================================
describe('logger · childLogger', () => {
  test('devuelve un logger con la misma API', () => {
    const sub = log.childLogger('miModulo');
    assert.equal(typeof sub.info, 'function');
    assert.equal(typeof sub.warn, 'function');
    assert.equal(typeof sub.error, 'function');
    assert.equal(typeof sub.child, 'function');
  });

  test('acepta bindings extra', () => {
    const sub = log.childLogger('miModulo', { version: '1.0' });
    assert.equal(typeof sub.info, 'function');
  });

  test('no lanza al loggear', () => {
    log.silent();
    const sub = log.childLogger('test');
    assert.doesNotThrow(() => sub.info('hola'));
    log.unsilent();
  });
});

// ============================================================
// REDACT
// ============================================================
describe('logger · redact paths', () => {
  beforeEach(() => log._resetRedactExtra());

  test('getRedactPaths incluye los básicos', () => {
    const paths = log.getRedactPaths();
    assert.ok(paths.includes('password'));
    assert.ok(paths.includes('*.password'));
    assert.ok(paths.includes('token'));
    assert.ok(paths.includes('CERT_ENCRYPTION_KEY'));
    assert.ok(paths.includes('SMTP_PASS'));
  });

  test('addRedactPath añade en runtime', () => {
    log.addRedactPath('mi.campo.secreto');
    const paths = log.getRedactPaths();
    assert.ok(paths.includes('mi.campo.secreto'));
  });

  test('addRedactPath ignora valores inválidos', () => {
    log.addRedactPath(null);
    log.addRedactPath('');
    log.addRedactPath(42);
    // No debe haber entradas nulas / vacías.
    const paths = log.getRedactPaths();
    assert.ok(!paths.includes(''));
    assert.ok(!paths.includes(null));
  });
});

// ============================================================
// SERIALIZERS (exportados para test)
// ============================================================
describe('logger · errSerializer', () => {
  const { _errSerializer } = log;

  test('extrae name, message, code', () => {
    const err = new Error('boom');
    err.code = 'E123';
    const out = _errSerializer(err);
    assert.equal(out.type, 'Error');
    assert.equal(out.message, 'boom');
    assert.equal(out.code, 'E123');
  });

  test('incluye stack en dev, no en prod', () => {
    const err = new Error('x');
    const out = _errSerializer(err);
    // En test IS_PROD es false → debe incluir stack.
    if (process.env.NODE_ENV !== 'production') {
      assert.ok(out.stack);
    }
  });

  test('preserva codigo y status', () => {
    const err = new Error('x');
    err.codigo = 'NOT_FOUND';
    err.status = 404;
    const out = _errSerializer(err);
    assert.equal(out.codigo, 'NOT_FOUND');
    assert.equal(out.status, 404);
  });

  test('maneja null', () => {
    assert.equal(_errSerializer(null), null);
    assert.equal(_errSerializer(undefined), undefined);
  });
});

describe('logger · reqSerializer', () => {
  const { _reqSerializer } = log;

  test('extrae lo mínimo', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/ventas',
      ip: '127.0.0.1',
      user: { userId: 'abc' }
    };
    const out = _reqSerializer(req);
    assert.equal(out.method, 'POST');
    assert.equal(out.url, '/api/ventas');
    assert.equal(out.ip, '127.0.0.1');
    assert.equal(out.userId, 'abc');
  });

  test('sin user → null', () => {
    const out = _reqSerializer({ method: 'GET', url: '/' });
    assert.equal(out.userId, null);
  });

  test('null → null', () => {
    assert.equal(_reqSerializer(null), null);
  });
});

// ============================================================
// FALLBACK / safeStringify
// ============================================================
describe('logger · safeStringify', () => {
  const { _safeStringify } = log;

  test('primitivos', () => {
    assert.equal(_safeStringify('hola'), 'hola');
    assert.equal(_safeStringify(42), '42');
    assert.equal(_safeStringify(true), 'true');
    assert.equal(_safeStringify(null), 'null');
  });

  test('Error se serializa con name/message', () => {
    const r = _safeStringify(new Error('boom'));
    assert.match(r, /Error/);
    assert.match(r, /boom/);
  });

  test('objeto circular no explota', () => {
    const obj = { a: 1 };
    obj.self = obj;
    assert.doesNotThrow(() => _safeStringify(obj));
    assert.match(_safeStringify(obj), /circular/);
  });

  test('Buffer se identifica', () => {
    const buf = Buffer.alloc(1024);
    assert.match(_safeStringify(buf), /Buffer 1024B/);
  });

  test('función → placeholder', () => {
    assert.equal(_safeStringify(() => {}), '[función]');
  });

  test('array se serializa', () => {
    assert.equal(_safeStringify([1, 2, 3]), '[1, 2, 3]');
  });

  test('profundidad limitada', () => {
    let deep = { v: 'hoja' };
    for (let i = 0; i < 20; i++) deep = { n: deep };
    assert.doesNotThrow(() => _safeStringify(deep));
  });
});

// ============================================================
// SILENT
// ============================================================
describe('logger · silent / unsilent', () => {
  test('silent apaga logs sin lanzar', () => {
    log.silent();
    assert.doesNotThrow(() => log.info('x'));
    log.unsilent();
  });

  test('unsilent reactiva', () => {
    log.silent();
    log.unsilent();
    assert.doesNotThrow(() => log.info('x'));
  });
});

// ============================================================
// CONFIG
// ============================================================
describe('logger · CONFIG', () => {
  test('expone IS_PROD y paths base', () => {
    assert.equal(typeof log._CONFIG.IS_PROD, 'boolean');
    assert.ok(Array.isArray(log._CONFIG.REDACT_BASE));
    assert.ok(log._CONFIG.REDACT_BASE.length > 10);
  });
});