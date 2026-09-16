// backend/tests/middleware.csrf.test.js
// ============================================================
// Tests del middleware CSRF.
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ejecutarMiddleware,
  conEnv
} = require('./helpers/mockReqRes');

// ============================================================
// CONFIG LIMPIA (para no depender del .env real)
// ============================================================
const ENV_LIMPIO = {
  CSRF_ENABLED: 'true',
  CSRF_ALLOWED_ORIGINS: '',
  CSRF_ALLOW_NO_COOKIES: 'true',
  CSRF_REQUIRE_XRW: 'true',
  CSRF_TOKEN_REQUIRED: 'false',
  CSRF_HEADER_NAME: 'x-csrf-token',
  CSRF_COOKIE_NAME: 'csrf_token',
  NODE_ENV: 'test'
};

describe('middleware/csrf', () => {
  describe('métodos seguros', () => {
    test('GET pasa sin validaciones', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { nextCalled, nextCalls } = await ejecutarMiddleware(csrf, {
          method: 'GET',
          headers: {}
        });
        assert.equal(nextCalled, true);
        assert.equal(nextCalls[0], undefined);
      });
    });

    test('OPTIONS y HEAD también pasan', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        for (const method of ['OPTIONS', 'HEAD']) {
          const { nextCalled } = await ejecutarMiddleware(csrf, { method });
          assert.equal(nextCalled, true, `${method} debe pasar`);
        }
      });
    });
  });

  describe('bearer auth', () => {
    test('Authorization: Bearer X → pasa sin más chequeos', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { nextCalled } = await ejecutarMiddleware(csrf, {
          method: 'POST',
          headers: { authorization: 'Bearer abc.def.ghi' },
          cookies: { session: 'x' } // incluso con cookie, Bearer gana
        });
        assert.equal(nextCalled, true);
      });
    });

    test('Bearer vacío NO salta el chequeo', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { res, nextCalls } = await ejecutarMiddleware(csrf, {
          method: 'POST',
          headers: { authorization: 'Bearer ' },
          cookies: { session: 'x' }
        });
        // Debe fallar por falta de X-Requested-With.
        assert.equal(res._captured.status, 403);
        assert.equal(nextCalls[0], undefined); // no pasó
      });
    });
  });

  describe('sin cookies', () => {
    test('sin cookies ni Authorization → pasa (endpoint público)', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { nextCalled } = await ejecutarMiddleware(csrf, {
          method: 'POST',
          headers: {}
        });
        assert.equal(nextCalled, true);
      });
    });

    test('con cookies pero allowNoCookies=false → no pasa solo', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_ALLOW_NO_COOKIES: 'false' },
        async (csrf) => {
          const { res } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {},
            cookies: { session: 'x' }
          });
          // Bloqueado por falta de X-Requested-With.
          assert.equal(res._captured.status, 403);
        }
      );
    });
  });

  describe('origin allowlist', () => {
    test('origin permitido exacto → pasa', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_ALLOWED_ORIGINS: 'https://app.example.com' },
        async (csrf) => {
          const { nextCalled } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {
              origin: 'https://app.example.com',
              'x-requested-with': 'XMLHttpRequest'
            },
            cookies: { session: 'x' }
          });
          assert.equal(nextCalled, true);
        }
      );
    });

    test('origin NO permitido → 403 CSRF_ORIGIN', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_ALLOWED_ORIGINS: 'https://app.example.com' },
        async (csrf) => {
          const { res } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {
              origin: 'https://evil.com',
              'x-requested-with': 'XMLHttpRequest'
            },
            cookies: { session: 'x' }
          });
          assert.equal(res._captured.status, 403);
          assert.equal(res._captured.body.codigo, 'CSRF_ORIGIN');
        }
      );
    });

    test('wildcard *.example.com matchea subdominios', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_ALLOWED_ORIGINS: '*.example.com' },
        async (csrf) => {
          const { nextCalled } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {
              origin: 'https://sub.example.com',
              'x-requested-with': 'XMLHttpRequest'
            },
            cookies: { session: 'x' }
          });
          assert.equal(nextCalled, true);
        }
      );
    });

    test('wildcard *.example.com NO matchea el apex', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_ALLOWED_ORIGINS: '*.example.com' },
        async (csrf) => {
          const { res } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {
              origin: 'https://example.com', // apex, no subdominio
              'x-requested-with': 'XMLHttpRequest'
            },
            cookies: { session: 'x' }
          });
          assert.equal(res._captured.status, 403);
        }
      );
    });
  });

  describe('X-Requested-With', () => {
    test('sin XRW → 403 CSRF_BLOCKED', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { res } = await ejecutarMiddleware(csrf, {
          method: 'POST',
          headers: {},
          cookies: { session: 'x' }
        });
        assert.equal(res._captured.status, 403);
        assert.equal(res._captured.body.codigo, 'CSRF_BLOCKED');
      });
    });

    test('XRW con valor incorrecto → 403', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { res } = await ejecutarMiddleware(csrf, {
          method: 'POST',
          headers: { 'x-requested-with': 'Fetch' },
          cookies: { session: 'x' }
        });
        assert.equal(res._captured.status, 403);
      });
    });

    test('XRW correcto → pasa', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const { nextCalled } = await ejecutarMiddleware(csrf, {
          method: 'POST',
          headers: { 'x-requested-with': 'XMLHttpRequest' },
          cookies: { session: 'x' }
        });
        assert.equal(nextCalled, true);
      });
    });
  });

  describe('double-submit token', () => {
    test('tokenRequired=true sin tokens → 403 CSRF_TOKEN', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_TOKEN_REQUIRED: 'true' },
        async (csrf) => {
          const { res } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: { 'x-requested-with': 'XMLHttpRequest' },
            cookies: { session: 'x' }
          });
          assert.equal(res._captured.status, 403);
          assert.equal(res._captured.body.codigo, 'CSRF_TOKEN');
        }
      );
    });

    test('tokenRequired=true con tokens coincidentes → pasa', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_TOKEN_REQUIRED: 'true' },
        async (csrf) => {
          const token = 'a'.repeat(64);
          const { nextCalled } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {
              'x-requested-with': 'XMLHttpRequest',
              'x-csrf-token': token
            },
            cookies: { session: 'x', csrf_token: token }
          });
          assert.equal(nextCalled, true);
        }
      );
    });

    test('tokens que NO coinciden → 403', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_TOKEN_REQUIRED: 'true' },
        async (csrf) => {
          const { res } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {
              'x-requested-with': 'XMLHttpRequest',
              'x-csrf-token': 'a'.repeat(64)
            },
            cookies: { session: 'x', csrf_token: 'b'.repeat(64) }
          });
          assert.equal(res._captured.status, 403);
        }
      );
    });
  });

  describe('CSRF_ENABLED=false', () => {
    test('pasa todo sin validaciones', async () => {
      await conEnv(
        '../middleware/csrf',
        { ...ENV_LIMPIO, CSRF_ENABLED: 'false' },
        async (csrf) => {
          const { nextCalled } = await ejecutarMiddleware(csrf, {
            method: 'POST',
            headers: {},
            cookies: { session: 'x' }
          });
          assert.equal(nextCalled, true);
        }
      );
    });
  });

  describe('helpers expuestos', () => {
    test('_compararSeguro detecta strings iguales', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        assert.equal(csrf._compararSeguro('abc', 'abc'), true);
        assert.equal(csrf._compararSeguro('abc', 'abd'), false);
        assert.equal(csrf._compararSeguro('abc', 'abcd'), false);
        assert.equal(csrf._compararSeguro(null, 'abc'), false);
      });
    });

    test('generarToken devuelve 64 chars hex', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const t = csrf.generarToken();
        assert.equal(t.length, 64);
        assert.match(t, /^[0-9a-f]+$/);
      });
    });

    test('generarToken no repite', async () => {
      await conEnv('../middleware/csrf', ENV_LIMPIO, async (csrf) => {
        const set = new Set();
        for (let i = 0; i < 100; i++) set.add(csrf.generarToken());
        assert.equal(set.size, 100);
      });
    });
  });
});