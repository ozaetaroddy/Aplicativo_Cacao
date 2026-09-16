// backend/tests/cookies.test.js
// ============================================================
// Tests para utils/cookies.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_PATH,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  parseDuration,
  baseOptions,
  getCookieOptions,
  validarToken,
  SAMESITE_VALUES,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
  _sanitizarDominio,
  _MAX_DURACION_MS
} = require('../utils/cookies');

// ============================================================
// CONSTANTES
// ============================================================
describe('cookies · constantes', () => {
  test('nombres de cookies esperados', () => {
    assert.equal(ACCESS_COOKIE, 'sc_at');
    assert.equal(REFRESH_COOKIE, 'sc_rt');
  });

  test('refresh path por defecto es /api/auth', () => {
    assert.equal(REFRESH_PATH, '/api/auth');
  });

  test('duraciones son positivas', () => {
    assert.ok(ACCESS_MAX_AGE > 0);
    assert.ok(REFRESH_MAX_AGE > 0);
  });

  test('samesite contiene los 3 valores válidos', () => {
    assert.deepEqual([...SAMESITE_VALUES], ['strict', 'lax', 'none']);
  });
});

// ============================================================
// parseDuration()
// ============================================================
describe('cookies · parseDuration', () => {
  const DEF = 12345;

  test('undefined / vacío → default', () => {
    assert.equal(parseDuration(undefined, DEF), DEF);
    assert.equal(parseDuration(null, DEF), DEF);
    assert.equal(parseDuration('', DEF), DEF);
  });

  test('milisegundos', () => {
    assert.equal(parseDuration('500ms', DEF), 500);
    assert.equal(parseDuration('1500ms', DEF), 1500);
  });

  test('segundos', () => {
    assert.equal(parseDuration('30s', DEF), 30_000);
  });

  test('minutos', () => {
    assert.equal(parseDuration('15m', DEF), 15 * 60_000);
  });

  test('horas', () => {
    assert.equal(parseDuration('2h', DEF), 2 * 3_600_000);
  });

  test('días', () => {
    assert.equal(parseDuration('7d', DEF), 7 * 86_400_000);
  });

  test('acepta espacios internos', () => {
    assert.equal(parseDuration('15 m', DEF), 15 * 60_000);
    assert.equal(parseDuration('  2h  ', DEF), 2 * 3_600_000);
  });

  test('mayúsculas / minúsculas', () => {
    assert.equal(parseDuration('15M', DEF), 15 * 60_000);
    assert.equal(parseDuration('2H', DEF), 2 * 3_600_000);
  });

  test('formato inválido → default', () => {
    assert.equal(parseDuration('15', DEF), DEF);         // sin unidad
    assert.equal(parseDuration('abc', DEF), DEF);
    assert.equal(parseDuration('1.5h', DEF), DEF);       // decimal no soportado
    assert.equal(parseDuration('15x', DEF), DEF);        // unidad desconocida
  });

  test('"0s" → default (evita cookie autodestructiva)', () => {
    assert.equal(parseDuration('0s', DEF), DEF);
    assert.equal(parseDuration('0m', DEF), DEF);
  });

  test('duración gigante se acota a 1 año', () => {
    const huge = parseDuration('99999d', DEF);
    assert.equal(huge, _MAX_DURACION_MS);
  });
});

// ============================================================
// sanitizarDominio()
// ============================================================
describe('cookies · sanitizarDominio', () => {
  test('dominios válidos pasan', () => {
    assert.equal(_sanitizarDominio('.example.com'), '.example.com');
    assert.equal(_sanitizarDominio('example.com'), 'example.com');
    assert.equal(_sanitizarDominio('sub.example.co.uk'), 'sub.example.co.uk');
  });

  test('quita protocolo', () => {
    assert.equal(_sanitizarDominio('https://example.com'), 'example.com');
    assert.equal(_sanitizarDominio('http://example.com'), 'example.com');
  });

  test('quita path', () => {
    assert.equal(_sanitizarDominio('.example.com/foo'), '.example.com');
  });

  test('quita puerto', () => {
    assert.equal(_sanitizarDominio('example.com:3000'), 'example.com');
  });

  test('combina todas las limpiezas', () => {
    assert.equal(
      _sanitizarDominio('https://sub.example.com:8080/path'),
      'sub.example.com'
    );
  });

  test('null / vacío → null', () => {
    assert.equal(_sanitizarDominio(null), null);
    assert.equal(_sanitizarDominio(undefined), null);
    assert.equal(_sanitizarDominio(''), null);
    assert.equal(_sanitizarDominio('   '), null);
  });

  test('con caracteres raros → null', () => {
    assert.equal(_sanitizarDominio('exa mple.com'), null);
    assert.equal(_sanitizarDominio('ñandu.com'), null); // dominio con tilde
    assert.equal(_sanitizarDominio('hola<>mundo'), null);
  });
});

// ============================================================
// validarToken()
// ============================================================
describe('cookies · validarToken', () => {
  test('token válido pasa', () => {
    assert.doesNotThrow(() => validarToken('abc.def.ghi', 'test'));
    assert.doesNotThrow(() => validarToken('a'.repeat(500), 'test'));
  });

  test('null / undefined / vacío → error', () => {
    for (const v of [null, undefined, '']) {
      assert.throws(
        () => validarToken(v, 'test'),
        (err) => err.codigo === 'TOKEN_COOKIE_INVALIDO'
      );
    }
  });

  test('no-string → error', () => {
    assert.throws(() => validarToken(42, 'test'));
    assert.throws(() => validarToken({}, 'test'));
  });

  test('caracteres peligrosos → error', () => {
    assert.throws(() => validarToken('abc;xyz', 'test'));
    assert.throws(() => validarToken('abc\r\nxyz', 'test'));
    assert.throws(() => validarToken('abc"xyz', 'test'));
    assert.throws(() => validarToken('abc\\xyz', 'test'));
  });
});

// ============================================================
// baseOptions()
// ============================================================
describe('cookies · baseOptions', () => {
  test('shape correcto', () => {
    const opts = baseOptions('/foo');
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.path, '/foo');
    assert.ok(['lax', 'none'].includes(opts.sameSite));
  });

  test('path por defecto es "/"', () => {
    const opts = baseOptions();
    assert.equal(opts.path, '/');
  });

  test('secure es true en cross-site', () => {
    // No podemos cambiar process.env aquí sin re-require.
    // Verificamos la coherencia actual.
    const opts = baseOptions('/');
    if (opts.sameSite === 'none') {
      assert.equal(opts.secure, true, 'secure debe ser true si sameSite=none');
    }
  });
});

// ============================================================
// getCookieOptions()
// ============================================================
describe('cookies · getCookieOptions', () => {
  test('devuelve snapshot completo', () => {
    const opts = getCookieOptions();
    assert.equal(typeof opts.isProd, 'boolean');
    assert.equal(typeof opts.crossSite, 'boolean');
    assert.equal(opts.accessCookie, 'sc_at');
    assert.equal(opts.refreshCookie, 'sc_rt');
    assert.equal(opts.refreshPath, '/api/auth');
    assert.equal(typeof opts.accessMaxAgeMs, 'number');
    assert.equal(typeof opts.refreshMaxAgeMs, 'number');
    assert.ok(opts.baseOptionsRoot);
    assert.ok(opts.baseOptionsRefresh);
  });

  test('baseOptionsRefresh usa el path del refresh', () => {
    const opts = getCookieOptions();
    assert.equal(opts.baseOptionsRefresh.path, '/api/auth');
  });
});

// ============================================================
// SETTERS (con mock de res)
// ============================================================
function crearMockRes() {
  const cookies = [];
  const cleared = [];
  return {
    cookie(name, value, opts) { cookies.push({ name, value, opts }); return this; },
    clearCookie(name, opts) { cleared.push({ name, opts }); return this; },
    _cookies: cookies,
    _cleared: cleared
  };
}

describe('cookies · setAccessCookie', () => {
  test('setea cookie con nombre y opciones correctas', () => {
    const res = crearMockRes();
    setAccessCookie(res, 'mi-token');
    assert.equal(res._cookies.length, 1);
    assert.equal(res._cookies[0].name, 'sc_at');
    assert.equal(res._cookies[0].value, 'mi-token');
    assert.equal(res._cookies[0].opts.httpOnly, true);
    assert.equal(res._cookies[0].opts.path, '/');
    assert.equal(res._cookies[0].opts.maxAge, ACCESS_MAX_AGE);
  });

  test('rechaza token vacío', () => {
    const res = crearMockRes();
    assert.throws(() => setAccessCookie(res, ''));
    assert.throws(() => setAccessCookie(res, null));
  });

  test('rechaza token con caracteres peligrosos', () => {
    const res = crearMockRes();
    assert.throws(() => setAccessCookie(res, 'abc;xyz'));
  });
});

describe('cookies · setRefreshCookie', () => {
  test('setea cookie con path /api/auth', () => {
    const res = crearMockRes();
    setRefreshCookie(res, 'refresh-token');
    assert.equal(res._cookies.length, 1);
    assert.equal(res._cookies[0].name, 'sc_rt');
    assert.equal(res._cookies[0].opts.path, '/api/auth');
    assert.equal(res._cookies[0].opts.maxAge, REFRESH_MAX_AGE);
  });

  test('rechaza token vacío', () => {
    const res = crearMockRes();
    assert.throws(() => setRefreshCookie(res, ''));
  });
});

describe('cookies · clearAuthCookies', () => {
  test('limpia ambas cookies con opciones consistentes', () => {
    const res = crearMockRes();
    clearAuthCookies(res);
    assert.equal(res._cleared.length, 2);

    const access = res._cleared.find(c => c.name === 'sc_at');
    const refresh = res._cleared.find(c => c.name === 'sc_rt');

    assert.ok(access, 'debe limpiar sc_at');
    assert.ok(refresh, 'debe limpiar sc_rt');
    assert.equal(access.opts.path, '/');
    assert.equal(refresh.opts.path, '/api/auth');
    // Las opciones de seguridad deben ser idénticas al set.
    assert.equal(access.opts.httpOnly, true);
    assert.equal(refresh.opts.httpOnly, true);
  });
});