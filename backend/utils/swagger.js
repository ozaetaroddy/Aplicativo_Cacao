// backend/utils/swagger.js
// ============================================================
// Swagger UI + JSDoc discovery
// ------------------------------------------------------------
// Los routers exponen sus endpoints con anotaciones `@openapi`
// en comentarios arriba de cada handler. Este módulo los escanea
// y construye el spec OpenAPI 3.0.3.
//
// API pública (compat total):
//   buildSpec()          → objeto OpenAPI
//   mountSwagger(app)    → monta /api/docs + /api/docs.json
//
// Extensiones:
//   invalidarCacheSpec()   → fuerza regeneración
//   getSpecCacheStats()    → { cached, edadMs, sizeBytes }
//
// Configuración por env:
//   SWAGGER_ENABLED=true          → habilita (default: false en prod, true en dev)
//   SWAGGER_PATH=/api/docs        → ruta de la UI (default)
//   SWAGGER_TITLE="Mi API"        → título
//   SWAGGER_BASIC_AUTH=user:pass  → protege con Basic Auth
//   SWAGGER_SERVERS=/api;https://api.midominio.com/api
//                                 → lista separada por ';'
//   SWAGGER_CONTACT_EMAIL=soporte@midominio.com
//
// ⚠️  En producción, NUNCA exponer /api/docs sin auth. El spec
//     completo es un mapa del ataque: endpoints, esquemas, campos.
//     Usa SWAGGER_BASIC_AUTH o SWAGGER_ENABLED=false.
//
// 🔧 FIX 2025-XX: `_specMinimo` construía el array `security` con
//    el STRING `'[]'` en lugar del array vacío real:
//      security: [{ bearerAuth: '[]' }]   ← MAL
//      security: [{ bearerAuth: [] }]     ← BIEN
//    El spec fallback quedaba malformado y rompía los validadores
//    de OpenAPI (Swagger UI mostraba "invalid spec").
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const log = require('./logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const IS_PROD = process.env.NODE_ENV === 'production';

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

function envStr(nombre, fallback = '') {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim();
}

/**
 * Parsea `SWAGGER_SERVERS` (lista separada por `;`).
 * Cada entrada es una URL. Devuelve array de `{ url, description }`.
 */
function parseServers() {
  const raw = envStr('SWAGGER_SERVERS', '');
  if (raw) {
    return raw
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(url => ({ url }));
  }
  return [{ url: '/api', description: 'API base' }];
}

const CONFIG = Object.freeze({
  docsPath: envStr('SWAGGER_PATH', '/api/docs'),
  specPath: envStr('SWAGGER_SPEC_PATH', '/api/docs.json'),
  title: envStr('SWAGGER_TITLE', 'Cacao Backend API'),
  servers: Object.freeze(parseServers()),
  basicAuth: envStr('SWAGGER_BASIC_AUTH', ''),
  contactEmail: envStr('SWAGGER_CONTACT_EMAIL', ''),
  description: envStr(
    'SWAGGER_DESCRIPTION',
    'API para sistema contable con facturación electrónica SRI Ecuador'
  ),
  enabledByDefault: !IS_PROD,
  cacheMax: 1,
  apisGlob: Object.freeze([
    path.join(__dirname, '..', 'routes', '*.js')
  ])
});

// ============================================================
// CARGA LAZY DE DEPENDENCIAS
// ============================================================
let _swaggerJsdoc = null;
let _swaggerUi = null;

function cargarSwaggerJsdoc() {
  if (_swaggerJsdoc) return _swaggerJsdoc;
  try {
    // eslint-disable-next-line global-require
    _swaggerJsdoc = require('swagger-jsdoc');
    return _swaggerJsdoc;
  } catch (err) {
    log.warn({ err: err.message }, 'swagger-jsdoc no está instalado');
    return null;
  }
}

function cargarSwaggerUi() {
  if (_swaggerUi) return _swaggerUi;
  try {
    // eslint-disable-next-line global-require
    _swaggerUi = require('swagger-ui-express');
    return _swaggerUi;
  } catch (err) {
    log.warn({ err: err.message }, 'swagger-ui-express no está instalado');
    return null;
  }
}

// ============================================================
// VERSIÓN DEL PAQUETE (con fallback)
// ============================================================
function leerVersionPackage() {
  try {
    // eslint-disable-next-line global-require
    return require('../package.json').version || '1.0.0';
  } catch (err) {
    log.warn({ err: err.message }, 'No se pudo leer la versión de package.json, usando 1.0.0');
    return '1.0.0';
  }
}

// ============================================================
// SCHEMAS REUTILIZABLES
// ============================================================
const SCHEMAS = Object.freeze({
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'Mensaje legible para el usuario' },
      codigo: { type: 'string', description: 'Código estable para el frontend' },
      detalles: { type: 'object', additionalProperties: true, nullable: true },
      reqId: { type: 'string', nullable: true }
    }
  },

  ValidationError: {
    allOf: [
      { $ref: '#/components/schemas/Error' },
      {
        type: 'object',
        properties: {
          detalles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                campo: { type: 'string' },
                mensaje: { type: 'string' },
                ubicacion: { type: 'string' }
              }
            }
          }
        }
      }
    ]
  },

  Success: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: true },
      message: { type: 'string' }
    }
  },

  Pagination: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer', minimum: 0 },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1 },
      totalPages: { type: 'integer', minimum: 0 },
      hasNext: { type: 'boolean' },
      hasPrev: { type: 'boolean' }
    }
  },

  ObjectId: {
    type: 'string',
    pattern: '^[a-fA-F0-9]{24}$',
    example: '507f1f77bcf86cd799439011'
  }
});

// ============================================================
// TAGS GLOBALES
// ============================================================
const TAGS = Object.freeze([
  { name: 'Auth', description: 'Login, refresh, logout, perfil' },
  { name: 'Usuarios', description: 'CRUD de usuarios + roles' },
  { name: 'Clientes', description: 'CRUD de clientes' },
  { name: 'Proveedores', description: 'CRUD de proveedores' },
  { name: 'Productos', description: 'CRUD de productos e inventario' },
  { name: 'Categorías', description: 'Categorías de productos' },
  { name: 'Ventas', description: 'Facturación electrónica' },
  { name: 'Compras', description: 'Compras a proveedores' },
  { name: 'Pagos', description: 'Cobros y pagos' },
  { name: 'Retenciones', description: 'Comprobantes de retención' },
  { name: 'Contadores', description: 'Secuenciales de documentos' },
  { name: 'Kardex', description: 'Movimientos de inventario' },
  { name: 'SRI', description: 'Envío/consulta de comprobantes al SRI' },
  { name: 'Reportes', description: 'Reportes y estados financieros' },
  { name: 'Anexos', description: 'Anexos tributarios (ATS)' },
  { name: 'Configuración', description: 'Configuración de la empresa' },
  { name: 'Backups', description: 'Backups de la base de datos' },
  { name: 'Auditoría', description: 'Registro de acciones' },
  { name: 'Catálogos', description: 'Catálogos oficiales del SRI' },
  { name: 'Diagnóstico', description: 'Health checks y estado del sistema' }
]);

// ============================================================
// CACHE DEL SPEC
// ============================================================
const _cache = new Map();
const _stats = { hits: 0, misses: 0, invalidaciones: 0 };

/** Invalida el cache (fuerza regeneración en la próxima llamada). */
function invalidarCacheSpec() {
  _cache.clear();
  _stats.invalidaciones++;
}

/** Snapshot del cache (para /health o tests). */
function getSpecCacheStats() {
  const entrada = _cache.get('spec');
  return {
    cached: Boolean(entrada),
    edadMs: entrada ? Date.now() - entrada.creadoEn : null,
    sizeBytes: entrada ? entrada.sizeBytes : 0,
    hits: _stats.hits,
    misses: _stats.misses,
    invalidaciones: _stats.invalidaciones
  };
}

// ============================================================
// BUILD SPEC
// ============================================================
/**
 * Construye el spec OpenAPI.
 * El resultado se cachea en memoria — llama a `invalidarCacheSpec()`
 * si modificas los routers en runtime.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.forzar=false]  Ignora el cache.
 * @returns {object} Spec OpenAPI 3.0.3
 */
function buildSpec(opts = {}) {
  const { forzar = false } = opts;

  if (!forzar) {
    const hit = _cache.get('spec');
    if (hit) {
      _stats.hits++;
      return hit.spec;
    }
  }
  _stats.misses++;

  const swaggerJsdoc = cargarSwaggerJsdoc();
  if (!swaggerJsdoc) {
    log.warn('swagger-jsdoc no disponible, devolviendo spec mínimo');
    return _specMinimo();
  }

  const info = {
    title: CONFIG.title,
    version: leerVersionPackage(),
    description: CONFIG.description
  };
  if (CONFIG.contactEmail) {
    info.contact = { email: CONFIG.contactEmail };
  }

  const definition = {
    openapi: '3.0.3',
    info,
    servers: CONFIG.servers,
    tags: TAGS,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token JWT (cookie httpOnly o header Authorization)'
        }
      },
      schemas: SCHEMAS
    },
    security: [{ bearerAuth: [] }]
  };

  // Validar que existan los archivos de rutas.
  const apisValidos = CONFIG.apisGlob.filter(p => {
    try {
      const dir = p.includes('*') ? path.dirname(p) : p;
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });

  if (apisValidos.length === 0) {
    log.warn({ apis: CONFIG.apisGlob }, 'No se encontraron archivos de rutas para Swagger');
    return _specMinimo(definition);
  }

  let spec;
  try {
    spec = swaggerJsdoc({
      definition,
      apis: apisValidos
    });
  } catch (err) {
    log.error({ err: err.message }, 'swagger-jsdoc falló al construir el spec');
    return _specMinimo(definition);
  }

  const sizeBytes = Buffer.byteLength(JSON.stringify(spec), 'utf-8');
  _cache.set('spec', { spec, creadoEn: Date.now(), sizeBytes });

  if (_cache.size > CONFIG.cacheMax) {
    const primero = _cache.keys().next().value;
    if (primero !== undefined && primero !== 'spec') _cache.delete(primero);
  }

  return spec;
}

/**
 * Spec mínimo (sin escaneo de rutas). Útil si swagger-jsdoc no está.
 *
 * 🔧 FIX: antes se generaba `security: [{ bearerAuth: '[]' }]` (string)
 *    y los validadores de OpenAPI lo rechazaban. Ahora es un array
 *    vacío real.
 */
function _specMinimo(definitionOverride = null) {
  const definition = definitionOverride || {
    openapi: '3.0.3',
    info: {
      title: CONFIG.title,
      version: leerVersionPackage(),
      description: CONFIG.description
    },
    servers: CONFIG.servers,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: SCHEMAS
    },
    security: [{ bearerAuth: [] }]
  };
  return {
    ...definition,
    paths: definition.paths || {}
  };
}

// ============================================================
// BASIC AUTH (opcional)
// ============================================================
/**
 * Middleware Basic Auth para proteger `/api/docs`.
 * Si `SWAGGER_BASIC_AUTH` no está configurado, no hace nada.
 */
function middlewareBasicAuth(req, res, next) {
  if (!CONFIG.basicAuth) return next();

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) {
    return _responderNoAuth(res);
  }

  let decoded;
  try {
    decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  } catch {
    return _responderNoAuth(res);
  }

  // Comparación timing-safe.
  const a = Buffer.from(decoded);
  const b = Buffer.from(CONFIG.basicAuth);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return _responderNoAuth(res);

  return next();
}

function _responderNoAuth(res) {
  res.set('WWW-Authenticate', 'Basic realm="API Docs", charset="UTF-8"');
  res.set('Cache-Control', 'no-store');
  return res.status(401).send('Autenticación requerida');
}

// ============================================================
// MOUNT
// ============================================================
let _swaggerMontado = false;

/**
 * Monta la UI de Swagger + el endpoint JSON con el spec.
 *
 * @param {import('express').Express} app
 * @param {object} [opts]
 * @param {boolean} [opts.forzarHabilitado]  Ignora el env y monta.
 * @returns {boolean} `true` si se montó, `false` si estaba deshabilitado.
 */
function mountSwagger(app, opts = {}) {
  const enabledEnv = process.env.SWAGGER_ENABLED;
  const enabled = opts.forzarHabilitado === true
    ? true
    : (enabledEnv === undefined
        ? CONFIG.enabledByDefault
        : String(enabledEnv).trim().toLowerCase() === 'true');

  if (!enabled) return false;

  if (_swaggerMontado) {
    log.warn('Swagger ya estaba montado, se omite');
    return false;
  }

  const swaggerUi = cargarSwaggerUi();
  if (!swaggerUi) {
    log.warn('swagger-ui-express no instalado, /api/docs deshabilitado');
    return false;
  }

  const spec = buildSpec();

  app.get(CONFIG.specPath, middlewareBasicAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.json(spec);
  });

  const swaggerOptions = {
    customSiteTitle: `API — ${CONFIG.title}`,
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2
    }
  };

  app.use(
    CONFIG.docsPath,
    middlewareBasicAuth,
    swaggerUi.serve,
    swaggerUi.setup(spec, swaggerOptions)
  );

  _swaggerMontado = true;

  log.info(
    { docsPath: CONFIG.docsPath, specPath: CONFIG.specPath, basicAuth: Boolean(CONFIG.basicAuth) },
    `📚 Swagger disponible en ${CONFIG.docsPath}`
  );

  return true;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  buildSpec,
  mountSwagger,
  invalidarCacheSpec,
  getSpecCacheStats,
  middlewareBasicAuth,
  CONFIG,
  SCHEMAS,
  TAGS,
  IS_PROD
};

// ---- Solo para tests ----
module.exports._cargarSwaggerJsdoc = cargarSwaggerJsdoc;
module.exports._cargarSwaggerUi = cargarSwaggerUi;
module.exports._leerVersionPackage = leerVersionPackage;
module.exports._specMinimo = _specMinimo;
module.exports._parseServers = parseServers;
module.exports._cache = _cache;
module.exports._stats = _stats;
module.exports._resetearMontado = () => { _swaggerMontado = false; };
module.exports._isSwaggerMontado = () => _swaggerMontado;