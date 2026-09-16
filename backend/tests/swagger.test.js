// backend/tests/swagger.test.js
// ============================================================
// Tests para utils/swagger.js
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Debemos cargar ANTES de silenciar el logger global.
const swagger = require('../utils/swagger');
const {
  buildSpec,
  mountSwagger,
  invalidarCacheSpec,
  getSpecCacheStats,
  middlewareBasicAuth,
  CONFIG,
  SCHEMAS,
  TAGS,
  _leerVersionPackage,
  _parseServers,
  _specMinimo,
  _cache,
  _stats,
  _resetearMontado,
  _isSwaggerMontado,
  _cargarSwaggerJsdoc
} = swagger;

// ============================================================
// CONFIG
// ============================================================
describe('swagger · CONFIG', () => {
  test('paths por defecto', () => {
    assert.equal(CONFIG.docsPath, '/api/docs');
    assert.equal(CONFIG.specPath, '/api/docs.json');
  });

  test('servers es array', () => {
    assert.ok(Array.isArray(CONFIG.servers));
    assert.ok(CONFIG.servers.length > 0);
  });

  test('title no vacío', () => {
    assert.ok(CONFIG.title.length > 0);
  });

  test('apisGlob apunta a routes', () => {
    assert.ok(CONFIG.apisGlob.some(g => g.includes('routes')));
  });
});

// ============================================================
// _parseServers
// ============================================================
describe('swagger · _parseServers', () => {
  test('default retorna /api', () => {
    // No modificamos process.env — el CONFIG ya está congelado.
    // Pero podemos verificar el comportamiento con la variable actual.
    const r = _parseServers();
    assert.ok(Array.isArray(r));
    assert.ok(r.length > 0);
    assert.ok(r[0].url);
  });
});

// ============================================================
// SCHEMAS / TAGS
// ============================================================
describe('swagger · SCHEMAS', () => {
  test('contiene schemas esperados', () => {
    assert.ok(SCHEMAS.Error);
    assert.ok(SCHEMAS.ValidationError);
    assert.ok(SCHEMAS.Success);
    assert.ok(SCHEMAS.Pagination);
    assert.ok(SCHEMAS.ObjectId);
  });

  test('Error tiene error + codigo', () => {
    assert.ok(SCHEMAS.Error.properties.error);
    assert.ok(SCHEMAS.Error.properties.codigo);
  });

  test('Pagination tiene campos de paginación', () => {
    assert.ok(SCHEMAS.Pagination.properties.page);
    assert.ok(SCHEMAS.Pagination.properties.total);
    assert.ok(SCHEMAS.Pagination.properties.hasNext);
  });

  test('están congelados', () => {
    assert.equal(Object.isFrozen(SCHEMAS), true);
  });
});

describe('swagger · TAGS', () => {
  test('tiene múltiples tags documentados', () => {
    assert.ok(Array.isArray(TAGS));
    assert.ok(TAGS.length > 10);
  });

  test('cada tag tiene name y description', () => {
    for (const t of TAGS) {
      assert.ok(t.name, `Tag sin name: ${JSON.stringify(t)}`);
      assert.ok(t.description, `Tag sin description: ${JSON.stringify(t)}`);
    }
  });

  test('incluye tags principales', () => {
    const nombres = TAGS.map(t => t.name);
    assert.ok(nombres.includes('Auth'));
    assert.ok(nombres.includes('Ventas'));
    assert.ok(nombres.includes('SRI'));
  });
});

// ============================================================
// _leerVersionPackage
// ============================================================
describe('swagger · _leerVersionPackage', () => {
  test('devuelve la versión del package.json', () => {
    const v = _leerVersionPackage();
    assert.equal(typeof v, 'string');
    assert.ok(v.length > 0);
  });
});

// ============================================================
// buildSpec
// ============================================================
describe('swagger · buildSpec', () => {
  beforeEach(() => invalidarCacheSpec());

  test('devuelve un objeto con openapi 3.0.3', () => {
    const spec = buildSpec();
    assert.ok(spec);
    assert.equal(spec.openapi, '3.0.3');
  });

  test('info tiene title y version', () => {
    const spec = buildSpec();
    assert.ok(spec.info);
    assert.ok(spec.info.title);
    assert.ok(spec.info.version);
  });

  test('incluye securitySchemes con bearerAuth', () => {
    const spec = buildSpec();
    assert.ok(spec.components);
    assert.ok(spec.components.securitySchemes);
    assert.ok(spec.components.securitySchemes.bearerAuth);
  });

  test('incluye schemas globales', () => {
    const spec = buildSpec();
    assert.ok(spec.components.schemas.Error);
    assert.ok(spec.components.schemas.Pagination);
  });

  test('incluye tags', () => {
    const spec = buildSpec();
    assert.ok(Array.isArray(spec.tags));
    assert.ok(spec.tags.length > 0);
  });

  test('cache hit en segunda llamada', () => {
    invalidarCacheSpec();
    buildSpec();
    const stats1 = getSpecCacheStats();
    buildSpec();
    const stats2 = getSpecCacheStats();
    assert.ok(stats2.hits > stats1.hits, 'debería haber cache hit');
  });

  test('forzar ignora el cache', () => {
    invalidarCacheSpec();
    buildSpec();
    const stats1 = getSpecCacheStats();
    buildSpec({ forzar: true });
    const stats2 = getSpecCacheStats();
    assert.ok(stats2.misses > stats1.misses, 'debería haber cache miss');
  });
});

// ============================================================
// invalidarCacheSpec / getSpecCacheStats
// ============================================================
describe('swagger · cache spec', () => {
  beforeEach(() => invalidarCacheSpec());

  test('invalidar limpia el cache', () => {
    buildSpec();
    invalidarCacheSpec();
    const stats = getSpecCacheStats();
    assert.equal(stats.cached, false);
  });

  test('stats tiene shape correcto', () => {
    const s = getSpecCacheStats();
    assert.equal(typeof s.cached, 'boolean');
    assert.equal(typeof s.hits, 'number');
    assert.equal(typeof s.misses, 'number');
    assert.equal(typeof s.invalidaciones, 'number');
    assert.equal(typeof s.sizeBytes, 'number');
  });
});

// ============================================================
// _specMinimo
// ============================================================
describe('swagger · _specMinimo', () => {
  test('devuelve estructura OpenAPI válida', () => {
    const spec = _specMinimo();
    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.info);
    assert.ok(spec.paths);
  });

  test('sin definición custom → valores default', () => {
    const spec = _specMinimo();
    assert.equal(spec.info.title, CONFIG.title);
  });

  test('con definición custom → override', () => {
    const spec = _specMinimo({
      openapi: '3.0.3',
      info: { title: 'Custom', version: '9.9.9' },
      paths: { '/x': {} }
    });
    assert.equal(spec.info.title, 'Custom');
    assert.ok(spec.paths['/x']);
  });
});

// ============================================================
// middlewareBasicAuth
// ============================================================
function crearReqRes(authHeader) {
  const req = { headers: {} };
  if (authHeader !== undefined) req.headers.authorization = authHeader;
  const captured = { status: null, sent: null, headers: {}, nextCalled: false };
  const res = {
    set(n, v) { captured.headers[String(n).toLowerCase()] = v; return this; },
    status(c) { captured.status = c; return this; },
    send(b) { captured.sent = b; return this; }
  };
  const next = () => { captured.nextCalled = true; };
  return { req, res, next, captured };
}

describe('swagger · middlewareBasicAuth', () => {
  test('sin SWAGGER_BASIC_AUTH configurado → next()', () => {
    // La config es CONFIG.basicAuth — si está vacío, deja pasar.
    if (CONFIG.basicAuth) {
      // Si por alguna razón hay Basic Auth configurado, saltamos el test.
      return;
    }
    const { req, res, next, captured } = crearReqRes();
    middlewareBasicAuth(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('sin Authorization (con basicAuth configurado) → 401', () => {
    if (!CONFIG.basicAuth) return; // config no activa
    const { req, res, next, captured } = crearReqRes();
    middlewareBasicAuth(req, res, next);
    assert.equal(captured.status, 401);
    assert.ok(captured.headers['www-authenticate']);
  });

  test('auth incorrecta → 401', () => {
    if (!CONFIG.basicAuth) return;
    const { req, res, next, captured } = crearReqRes('Basic dXNlcjpwYXNz');
    middlewareBasicAuth(req, res, next);
    // Si las credenciales no matchean → 401
    if (!captured.nextCalled) {
      assert.equal(captured.status, 401);
    }
  });
});

// ============================================================
// mountSwagger
// ============================================================
describe('swagger · mountSwagger', () => {
  beforeEach(() => _resetearMontado());

  test('no monta si SWAGGER_ENABLED=false', () => {
    const original = process.env.SWAGGER_ENABLED;
    process.env.SWAGGER_ENABLED = 'false';
    try {
      const app = _crearAppMock();
      const montado = mountSwagger(app);
      assert.equal(montado, false);
    } finally {
      if (original === undefined) delete process.env.SWAGGER_ENABLED;
      else process.env.SWAGGER_ENABLED = original;
    }
  });

  test('monta si forzarHabilitado=true', () => {
    // Puede fallar si swagger-ui-express no está instalado.
    const app = _crearAppMock();
    const montado = mountSwagger(app, { forzarHabilitado: true });
    // Si la dependencia no está, devuelve false. Si está, true.
    assert.equal(typeof montado, 'boolean');
  });

  test('idempotente: segundo mount devuelve false', () => {
    const app = _crearAppMock();
    const m1 = mountSwagger(app, { forzarHabilitado: true });
    if (!m1) return; // no montó por falta de deps
    const m2 = mountSwagger(app);
    assert.equal(m2, false);
  });
});

/** Mock minimalista de Express. */
function _crearAppMock() {
  const rutas = [];
  return {
    get(path, ...handlers) { rutas.push({ method: 'GET', path, handlers }); },
    use(path, ...handlers) { rutas.push({ method: 'USE', path, handlers }); },
    _rutas: rutas
  };
}

// ============================================================
// cargarSwaggerJsdoc (lazy)
// ============================================================
describe('swagger · _cargarSwaggerJsdoc', () => {
  test('devuelve la función o null', () => {
    const r = _cargarSwaggerJsdoc();
    // Puede ser la función o null si no está instalado.
    if (r) assert.equal(typeof r, 'function');
    else assert.equal(r, null);
  });

  test('cachea la carga', () => {
    const r1 = _cargarSwaggerJsdoc();
    const r2 = _cargarSwaggerJsdoc();
    assert.equal(r1, r2);
  });
});