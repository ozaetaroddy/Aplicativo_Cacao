// backend/tests/middleware.errorHandler.test.js
// ============================================================
// Tests del middleware errorHandler.
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ejecutarMiddleware,
  conEnv
} = require('./helpers/mockReqRes');

// ============================================================
// HELPERS
// ============================================================
/** Crea un Error con propiedades extra. */
function crearError(msg, extra = {}) {
  const err = new Error(msg);
  Object.assign(err, extra);
  return err;
}

/** Ejecuta el errorHandler y devuelve la respuesta capturada. */
async function ejecutar(err, { env = {}, req = {} } = {}) {
  let resultado;
  await conEnv(
    '../middleware/errorHandler',
    { NODE_ENV: 'production', ...env },
    async (handler) => {
      resultado = await ejecutarMiddleware(
        (req_, res, next) => handler(err, req_, res, next),
        req
      );
    }
  );
  return resultado;
}

describe('middleware/errorHandler', () => {
  describe('status normalizado', () => {
    test('usa err.status si es válido', async () => {
      const { res } = await ejecutar(crearError('x', { status: 404 }));
      assert.equal(res._captured.status, 404);
    });

    test('usa err.statusCode si no hay status', async () => {
      const { res } = await ejecutar(crearError('x', { statusCode: 422 }));
      assert.equal(res._captured.status, 422);
    });

    test('default 500 si no hay status', async () => {
      const { res } = await ejecutar(crearError('x'));
      assert.equal(res._captured.status, 500);
    });

    test('status fuera de rango → 500', async () => {
      const { res } = await ejecutar(crearError('x', { status: 200 }));
      assert.equal(res._captured.status, 500);
    });
  });

  describe('headers de respuesta', () => {
    test('Cache-Control: no-store siempre', async () => {
      const { res } = await ejecutar(crearError('x', { status: 400 }));
      assert.equal(res._captured.headers['cache-control'], 'no-store');
    });

    test('Retry-After para 5xx con retryAfter', async () => {
      const err = crearError('x');
      err.codigo = 'CIRCUIT_OPEN';
      err.retryAfter = 42;
      const { res } = await ejecutar(err);
      assert.equal(res._captured.headers['retry-after'], '42');
    });
  });

  describe('traductor · Mongo duplicado (E11000)', () => {
    test('MongoServerError 11000 → 400 DUPLICADO', async () => {
      const err = crearError('E11000 duplicate key', {
        name: 'MongoServerError',
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: 'test@x.com' }
      });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 400);
      assert.equal(res._captured.body.codigo, 'DUPLICADO');
      assert.match(res._captured.body.error, /email/);
    });
  });

  describe('traductor · Mongo red', () => {
    test('MongoNetworkError → 503 DB_NO_DISPONIBLE', async () => {
      const err = crearError('network', { name: 'MongoNetworkError' });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 503);
      assert.equal(res._captured.body.codigo, 'DB_NO_DISPONIBLE');
    });
  });

  describe('traductor · JWT', () => {
    test('JsonWebTokenError → 401 TOKEN_INVALIDO', async () => {
      const err = crearError('jwt', { name: 'JsonWebTokenError' });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 401);
      assert.equal(res._captured.body.codigo, 'TOKEN_INVALIDO');
    });

    test('TokenExpiredError → 401 TOKEN_EXPIRADO', async () => {
      const err = crearError('jwt', { name: 'TokenExpiredError' });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.body.codigo, 'TOKEN_EXPIRADO');
    });
  });

  describe('traductor · express-validator', () => {
    test('errores de validación → 400 con detalles', async () => {
      const err = crearError('validación', {
        errors: [
          { msg: 'Email inválido', path: 'email', location: 'body' },
          { msg: 'Nombre requerido', param: 'nombre', location: 'body' }
        ]
      });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 400);
      assert.equal(res._captured.body.codigo, 'VALIDACION');
      assert.match(res._captured.body.error, /Email inválido/);
      assert.match(res._captured.body.error, /Nombre requerido/);
      assert.equal(res._captured.body.detalles.length, 2);
    });
  });

  describe('traductor · Axios', () => {
    test('isAxiosError → 502 SERVICIO_EXTERNO', async () => {
      const err = crearError('timeout', {
        isAxiosError: true,
        code: 'ECONNABORTED',
        config: { url: 'https://api.example.com', method: 'post' }
      });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 502);
      assert.equal(res._captured.body.codigo, 'SERVICIO_EXTERNO');
      assert.match(res._captured.body.error, /[Tt]imeout/);
    });
  });

  describe('traductor · circuit breaker', () => {
    test('CIRCUIT_OPEN → 503 con retryAfter', async () => {
      const err = crearError('circuito abierto', {
        codigo: 'CIRCUIT_OPEN',
        retryAfter: 30
      });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 503);
      assert.equal(res._captured.body.codigo, 'CIRCUIT_OPEN');
      assert.equal(res._captured.body.detalles.retryAfter, 30);
    });
  });

  describe('producción: sanitización de 5xx', () => {
    test('en producción, 5xx sin marca → mensaje genérico', async () => {
      const err = crearError('Cannot read property x of undefined at /home/user/app/secret.js');
      const { res } = await ejecutar(err);
      assert.equal(res._captured.status, 500);
      assert.equal(res._captured.body.error, 'Error interno del servidor');
      // No debe filtrar la ruta interna.
      assert.doesNotMatch(res._captured.body.error, /secret\.js/);
    });

    test('err.public=true preserva el mensaje', async () => {
      const err = crearError('Error público controlado', { public: true, status: 500 });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.body.error, 'Error público controlado');
    });
  });

  describe('desarrollo: stack traces', () => {
    test('en dev (no test), 5xx incluye stack', async () => {
      // Cambiamos a NODE_ENV=development para ver el stack.
      const err = crearError('boom', { status: 500 });
      const { res } = await ejecutar(err, { env: { NODE_ENV: 'development' } });
      assert.ok(typeof res._captured.body.stack === 'string');
      assert.match(res._captured.body.stack, /boom/);
    });
  });

  describe('reqId', () => {
    test('se incluye si req.reqId existe', async () => {
      const { res } = await ejecutar(crearError('x', { status: 400 }), {
        req: { reqId: 'req-abc-123' }
      });
      assert.equal(res._captured.body.reqId, 'req-abc-123');
    });
  });

  describe('4xx', () => {
    test('4xx preserva el mensaje original', async () => {
      const err = crearError('Cliente no encontrado', {
        status: 404,
        codigo: 'CLIENTE_NOT_FOUND'
      });
      const { res } = await ejecutar(err);
      assert.equal(res._captured.body.error, 'Cliente no encontrado');
      assert.equal(res._captured.body.codigo, 'CLIENTE_NOT_FOUND');
    });
  });

  describe('helpers expuestos', () => {
    test('_normalizarStatus valida rangos', async () => {
      await conEnv('../middleware/errorHandler', { NODE_ENV: 'test' }, async (h) => {
        assert.equal(h._normalizarStatus({ status: 404 }), 404);
        assert.equal(h._normalizarStatus({ status: 600 }), 500);
        assert.equal(h._normalizarStatus({ status: 'abc' }), 500);
        assert.equal(h._normalizarStatus({}), 500);
      });
    });

    test('_esMensajeSeguro reconoce públic/seguro', async () => {
      await conEnv('../middleware/errorHandler', { NODE_ENV: 'test' }, async (h) => {
        assert.equal(h._esMensajeSeguro({ public: true }), true);
        assert.equal(h._esMensajeSeguro({ expose: true }), true);
        assert.equal(h._esMensajeSeguro({ status: 400 }), true);
        assert.equal(h._esMensajeSeguro({ message: 'Error interno del servidor' }), true);
        assert.equal(h._esMensajeSeguro({ message: 'stack trace secreto' }), false);
      });
    });
  });
});