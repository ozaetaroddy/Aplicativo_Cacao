// backend/tests/helpers/mockReqRes.js
// ============================================================
// Mocks mínimos de Express (req/res) para tests de middlewares.
// No sustituye a supertest; es para unit-tests rápidos.
// ============================================================
'use strict';

const { EventEmitter } = require('node:events');

/**
 * Crea un `req` mínimo de Express.
 * @param {object} [overrides]
 */
function crearReq(overrides = {}) {
  const req = {
    method: 'GET',
    url: '/',
    originalUrl: '/',
    headers: {},
    cookies: {},
    query: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides
  };
  // `req` es un EventEmitter en Express real.
  Object.setPrototypeOf(req, EventEmitter.prototype);
  return req;
}

/**
 * Crea un `res` de Express que captura llamadas para assertions.
 * Expone `res._captured` con { status, headers, body, ended }.
 */
function crearRes() {
  const captured = {
    status: null,
    headers: {},
    body: null,
    ended: false,
    sent: null
  };

  const res = {
    headersSent: false,

    set(name, value) {
      captured.headers[name.toLowerCase()] = value;
      return this;
    },
    setHeader(name, value) {
      captured.headers[name.toLowerCase()] = value;
      return this;
    },
    get(name) {
      return captured.headers[String(name).toLowerCase()];
    },

    status(code) {
      captured.status = code;
      return this;
    },

    json(body) {
      captured.body = body;
      res.headersSent = true;
      return this;
    },

    send(body) {
      captured.sent = body;
      captured.body = body;
      res.headersSent = true;
      return this;
    },

    end(body) {
      captured.ended = true;
      if (body !== undefined) captured.sent = body;
      res.headersSent = true;
      return this;
    },

    _captured: captured
  };

  return res;
}

/**
 * Ejecuta un middleware y devuelve una promesa con el resultado.
 * Resuelve cuando se llama `next()` o cuando se envía una respuesta.
 *
 * @param {(req, res, next) => any} middleware
 * @param {object} [reqOverrides]
 * @returns {Promise<{
 *   req: object,
 *   res: object,
 *   nextCalls: Array<Error|undefined>,
 *   nextCalled: boolean
 * }>}
 */
async function ejecutarMiddleware(middleware, reqOverrides = {}) {
  const req = crearReq(reqOverrides);
  const res = crearRes();
  const nextCalls = [];
  let nextCalled = false;

  return new Promise((resolve, reject) => {
    const next = (err) => {
      nextCalled = true;
      nextCalls.push(err);
      // Esperar un tick para que el middleware termine de escribir.
      process.nextTick(() => resolve({ req, res, nextCalls, nextCalled }));
    };

    try {
      const result = middleware(req, res, next);
      if (result && typeof result.then === 'function') {
        result.catch(reject);
      }
      // Si el middleware respondió sin llamar next, resolvemos en el next tick.
      process.nextTick(() => {
        if (!nextCalled && (res.headersSent || res._captured.status !== null)) {
          resolve({ req, res, nextCalls, nextCalled: false });
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Recarga un módulo limpio (borra require.cache) con env temporal.
 * Útil para middlewares que leen `process.env` a nivel módulo.
 *
 * @param {string} moduloPath  Ruta relativa desde tests/, ej. '../middleware/csrf'
 * @param {object} envPatch    Variables a aplicar temporalmente
 * @param {(mod: any) => Promise<void>|void} fn  Callback con el módulo recargado
 */
const path = require('node:path');

/**
 * Recarga un módulo limpio (borra require.cache) con env temporal.
 * ⚠️  `moduloPath` se resuelve relativo a la carpeta `tests/`,
 *     NO a `tests/helpers/`. Por eso agregamos un `..` extra.
 */
async function conEnv(moduloPath, envPatch, fn) {
  // __dirname = tests/helpers → subimos 1 nivel a tests, y desde ahí
  // resolvemos el path relativo que dio el test (ej. '../middleware/csrf').
  const absoluto = require.resolve(path.resolve(__dirname, '..', moduloPath));
  const original = { ...process.env };

  for (const [k, v] of Object.entries(envPatch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }

  delete require.cache[absoluto];

  try {
    // eslint-disable-next-line global-require
    const mod = require(absoluto);
    await fn(mod);
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, original);
    delete require.cache[absoluto];
  }
}

module.exports = {
  crearReq,
  crearRes,
  ejecutarMiddleware,
  conEnv
};