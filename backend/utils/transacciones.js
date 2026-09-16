// backend/utils/transacciones.js
// ============================================================
// Ejecución de operaciones en transacción MongoDB
// ------------------------------------------------------------
// Ejecuta un callback en una transacción si MongoDB lo soporta
// (replica set o mongos). Si es standalone, ejecuta sin
// transacción (con `session = null`).
//
// API pública:
//   conTransaccion(db, cb)         → degrada a no-tx si no hay soporte
//   soportaTransacciones(db)       → boolean (con cache + TTL)
//
// Extensiones:
//   runInTransaction(db, cb)       → FALLA si no hay soporte (estricto)
//   invalidarCacheSoporte(db)      → fuerza re-chequeo
//   getMetricas() / resetearMetricas()
//
// Uso típico:
//   const resultado = await conTransaccion(req.db, async (session) => {
//     const id = await col.insertOne(doc, { session });
//     await col2.updateOne({...}, {$set: {...}}, { session });
//     return id;
//   });
//
// Configuración por env:
//   TRANSACTION_TIMEOUT_MS=60000          → timeout total (default 60 s)
//   TRANSACTION_MAX_COMMIT_MS=10000       → timeout de commit (default 10 s)
//   TRANSACTION_CACHE_TTL_MS=300000       → TTL del cache de soporte (5 min)
//   TRANSACTION_LOG_STANDALONE_FALLBACK=true
//                                          → loggear cada fallback a standalone
//
// ⚠️  ADVERTENCIA SOBRE REINTENTOS
//   `session.withTransaction()` reintenta AUTOMÁTICAMENTE en errores
//   `TransientTransactionError` (típicamente conflictos de write).
//   Si tu callback NO es idempotente (por ejemplo, llama a un
//   servicio externo como el SRI o envía un email), el reintento
//   DUPLICA el efecto. Para esos casos:
//     1. Saca la llamada externa FUERA del callback.
//     2. O usa `runInTransaction(db, cb, { retryTransient: false })`.
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN (env-driven)
// ============================================================
function envNum(nombre, fallback) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /** Timeout total de una transacción (ms). */
  timeoutMs: envNum('TRANSACTION_TIMEOUT_MS', 60_000),

  /** Timeout del commit (ms). Se pasa a `withTransaction`. */
  maxCommitMs: envNum('TRANSACTION_MAX_COMMIT_MS', 10_000),

  /** TTL del cache de "¿este db soporta transacciones?" (ms). */
  cacheTtlMs: envNum('TRANSACTION_CACHE_TTL_MS', 5 * 60 * 1000),

  /** Loggear cada vez que se degrada a standalone. */
  logStandaloneFallback: envBool('TRANSACTION_LOG_STANDALONE_FALLBACK', true)
});

// ============================================================
// CÓDIGOS Y MENSAJES DE "NO SOPORTE"
// ------------------------------------------------------------
// Mensajes que el driver de MongoDB lanza cuando el servidor
// es standalone y no puede manejar transacciones.
// ============================================================
const NO_SOPORTE_REGEX = Object.freeze([
  /transaction numbers/i,
  /transactions are not supported/i,
  /does not support transactions/i,
  /replica set/i,
  /Transaction numbers are only allowed/i,
  /IllegalOperation/i
]);

/**
 * ¿El error indica que MongoDB no soporta transacciones?
 * @param {Error} err
 * @returns {boolean}
 */
function esErrorSinSoporte(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return NO_SOPORTE_REGEX.some(rx => rx.test(msg));
}

/**
 * ¿El error es transitorio? El driver reintenta automáticamente
 * cuando `err.hasErrorLabel('TransientTransactionError')`.
 * @param {Error} err
 */
function esErrorTransitorio(err) {
  return Boolean(
    err &&
    typeof err.hasErrorLabel === 'function' &&
    err.hasErrorLabel('TransientTransactionError')
  );
}

// ============================================================
// MÉTRICAS
// ============================================================
const METRICAS = {
  conTransaccion: 0,
  transaccionesOk: 0,
  transaccionesFallidas: 0,
  fallbackStandalone: 0,
  chequeosSoporte: 0,
  sinSoporteDetectado: 0
};

function getMetricas() {
  return { ...METRICAS };
}

function resetearMetricas() {
  for (const k of Object.keys(METRICAS)) METRICAS[k] = 0;
}

// ============================================================
// CACHE DE SOPORTE (con TTL)
// ------------------------------------------------------------
// Guardamos `{ soporta, expiresAt }` por instancia de `db`.
// El TTL evita que un fallo transitorio al arranque marque la
// db como "sin soporte" para siempre.
// ============================================================
const cacheSoporte = new WeakMap(); // db → { soporta, expiresAt }

function leerCache(db) {
  const entry = cacheSoporte.get(db);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cacheSoporte.delete(db);
    return null;
  }
  return entry.soporta;
}

function guardarCache(db, soporta) {
  cacheSoporte.set(db, {
    soporta: Boolean(soporta),
    expiresAt: Date.now() + CONFIG.cacheTtlMs
  });
}

/**
 * Invalida el cache de una db. Útil tras cambios de topología
 * (upgrade a replica set, failover, etc.).
 * @param {object} [db]  Si se omite, no hace nada (WeakMap no es iterable).
 */
function invalidarCacheSoporte(db) {
  if (db) cacheSoporte.delete(db);
}

// ============================================================
// CHEQUEO DE SOPORTE
// ============================================================
/**
 * ¿La db soporta transacciones?
 * - Chequea cache primero (con TTL).
 * - Si no hay cache, consulta `hello` al servidor.
 * - En caso de error de red, devuelve `false` sin cachear (para
 *   poder reintentar más tarde).
 *
 * @param {object} db
 * @returns {Promise<boolean>}
 */
async function soportaTransacciones(db) {
  if (!db || !db.client) return false;

  const cache = leerCache(db);
  if (cache !== null) return cache;

  METRICAS.chequeosSoporte++;

  try {
    const hello = await db.admin().command({ hello: 1 });
    // `setName` → replica set. `msg === 'isdbgrid'` → mongos (sharded).
    const soporta = Boolean(hello.setName) || hello.msg === 'isdbgrid';
    guardarCache(db, soporta);
    if (!soporta) METRICAS.sinSoporteDetectado++;
    return soporta;
  } catch (err) {
    // Error de red/config → NO cacheamos para poder reintentar después.
    log.warn({ err: err.message }, 'No se pudo verificar soporte de transacciones');
    return false;
  }
}

// ============================================================
// EJECUCIÓN EN TRANSACCIÓN
// ============================================================
/**
 * Ejecuta `callback` en una transacción si `db` lo soporta.
 * Si NO lo soporta, ejecuta sin transacción con `session = null`.
 *
 * El callback **NO se ejecuta dos veces** aunque la transacción falle
 * por falta de soporte (el chequeo es proactivo, no reactivo).
 *
 * @template T
 * @param {object} db
 * @param {(session: object|null) => Promise<T>} callback
 * @param {object} [opts]
 * @param {boolean} [opts.retryTransient=true]  Permitir retry auto del driver.
 * @returns {Promise<T>}
 */
async function conTransaccion(db, callback, opts = {}) {
  if (typeof callback !== 'function') {
    throw Object.assign(new TypeError('conTransaccion espera un callback'), {
      codigo: 'CALLBACK_INVALIDO',
      status: 400
    });
  }

  METRICAS.conTransaccion++;
  // ---- Sin cliente Mongo → ejecutar directo ----
  if (!db || !db.client) {
    return await callback(null);
  }

  

  // ---- ¿Soporta? ----
  const soporta = await soportaTransacciones(db);

  if (!soporta) {
    METRICAS.fallbackStandalone++;
    if (CONFIG.logStandaloneFallback) {
      log.debug(
        { fallback: 'standalone', contador: METRICAS.fallbackStandalone },
        'Ejecutando sin transacción (Mongo standalone)'
      );
    }
    return await callback(null);
  }

  // ---- Ejecutar con transacción ----
  const session = db.client.startSession();
  const startedAt = Date.now();

  try {
    let resultado;
    const withTxOpts = {
      maxCommitTimeMS: CONFIG.maxCommitMs
    };

    // `readConcern`/`writeConcern` por defecto están OK para el 99%
    // de los casos. Si necesitas snapshot isolation estricta, se
    // puede activar aquí.

    await session.withTransaction(
      async () => {
        resultado = await callback(session);
        return true; // Necesario para que `withTransaction` no reintente por commit.
      },
      withTxOpts
    );

    METRICAS.transaccionesOk++;
    log.debug(
      { duracionMs: Date.now() - startedAt },
      'Transacción completada'
    );
    return resultado;
  } catch (err) {
    // ---- ¿Falló por no soporte? (defensa en profundidad) ----
    if (esErrorSinSoporte(err)) {
      // Aunque el chequeo proactivo dijo "sí soporta", puede haber
      // cambiado (failover, downgrade). Marcamos el cache como false
      // y ejecutamos el callback SIN transacción.
      guardarCache(db, false);
      METRICAS.fallbackStandalone++;
      if (CONFIG.logStandaloneFallback) {
        log.warn(
          { err: err.message },
          'Transacción no soportada pese a chequeo previo, degradando a standalone'
        );
      }
      // ⚠️  AQUÍ SÍ podemos ejecutar el callback otra vez porque el
      // fallo ocurrió ANTES de que se persistiera nada (el driver
      // aborta antes de enviar writes si el server no soporta tx).
      return await callback(null);
    }

    METRICAS.transaccionesFallidas++;

    // Clasificar para logs.
    const transitorio = esErrorTransitorio(err);
    log.error(
      {
        err: err.message,
        codigo: err.code,
        transitorio,
        duracionMs: Date.now() - startedAt
      },
      'Transacción falló'
    );

    throw err;
  } finally {
    try { await session.endSession(); } catch { /* noop */ }
  }
}

/**
 * Igual que `conTransaccion` pero **falla** si no hay soporte.
 * Útil para operaciones que NO deben degradarse (por ejemplo,
 * movimientos financieros que requieren atomicidad estricta).
 *
 * @template T
 * @param {object} db
 * @param {(session: object) => Promise<T>} callback
 * @param {object} [opts]
 * @param {boolean} [opts.retryTransient=true]
 * @returns {Promise<T>}
 */
async function runInTransaction(db, callback, opts = {}) {
  const soporta = await soportaTransacciones(db);
  if (!soporta) {
    const err = new Error(
      'Este MongoDB no soporta transacciones (standalone). ' +
      'Se requiere un replica set o mongos.'
    );
    err.codigo = 'TRANSACCIONES_NO_SOPORTADAS';
    err.status = 501;
    throw err;
  }
  // Delegamos a conTransaccion; el chequeo ya pasó.
  return conTransaccion(db, callback, opts);
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  conTransaccion,
  soportaTransacciones,

  // ---- Extensiones ----
  runInTransaction,
  invalidarCacheSoporte,
  getMetricas,
  resetearMetricas,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._esErrorSinSoporte = esErrorSinSoporte;
module.exports._esErrorTransitorio = esErrorTransitorio;
module.exports._leerCache = leerCache;
module.exports._guardarCache = guardarCache;
module.exports._cacheSoporte = cacheSoporte;
module.exports._METRICAS = METRICAS;
module.exports._NO_SOPORTE_REGEX = NO_SOPORTE_REGEX;