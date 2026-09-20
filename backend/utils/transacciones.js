// backend/utils/transacciones.js
// ============================================================
// Ejecución de operaciones en transacción MongoDB
// ------------------------------------------------------------
// Ejecuta un callback en una transacción si MongoDB lo soporta
// (replica set o mongos). Si es standalone, ejecuta sin
// transacción (con `session = null`).
//
// API pública:
//   conTransaccion(db, cb, opts?)   → degrada a no-tx si no hay soporte
//   soportaTransacciones(db)        → boolean (con cache + TTL)
//
// Extensiones:
//   runInTransaction(db, cb, opts?) → FALLA si no hay soporte (estricto)
//   invalidarCacheSoporte(db)       → fuerza re-chequeo
//   getMetricas() / resetearMetricas()
//
// Uso típico:
//   const resultado = await conTransaccion(req.db, async (session) => {
//     const id = await col.insertOne(doc, { session });
//     await col2.updateOne({...}, {$set: {...}}, { session });
//     return id;
//   });
//
// ============================================================
// ⚠️  ADVERTENCIA SOBRE REINTENTOS
// ------------------------------------------------------------
// `session.withTransaction()` (modo DEFAULT) reintenta AUTOMÁTICAMENTE
// en errores `TransientTransactionError` y `UnknownTransactionCommitResult`.
// Esto significa que tu callback PUEDE EJECUTARSE MÁS DE UNA VEZ.
//
// Si tu callback NO es idempotente (llama a un servicio externo como
// el SRI, envía un email, escribe a un archivo, etc.), el reintento
// DUPLICA el efecto.
//
// Para esos casos:
//
//   1. RECOMENDADO: saca la llamada externa FUERA del callback.
//        const resultadoDb = await conTransaccion(db, async (s) => { ... });
//        await enviarEmail(resultadoDb);  // ← fuera
//
//   2. ALTERNATIVA: usa `retryTransient: false`. Esto ejecuta la
//      transacción con `startTransaction()` manual SIN reintentos.
//      Si el driver lanza `TransientTransactionError`, se propaga
//      tal cual y el caller decide.
//        await conTransaccion(db, cb, { retryTransient: false });
//
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
  logStandaloneFallback: envBool('TRANSACTION_LOG_STANDALONE_FALLBACK', true),

  /**
   * Read concern por defecto en modo manual (`retryTransient: false`).
   * `snapshot` da el aislamiento más fuerte; `local` es más rápido.
   */
  readConcernManual: process.env.TRANSACTION_READ_CONCERN || 'snapshot',

  /**
   * Write concern por defecto en modo manual.
   * `majority` es lo correcto para consistencia entre réplicas.
   */
  writeConcernManual: process.env.TRANSACTION_WRITE_CONCERN || 'majority'
});

// ============================================================
// CÓDIGOS Y MENSAJES DE "NO SOPORTE"
// ------------------------------------------------------------
// MongoDB lanza distintos errores cuando el servidor no puede
// manejar transacciones. Cubrimos tanto el código numérico como
// el mensaje (algunos drivers solo exponen uno u otro).
// ============================================================
const NO_SOPORTE_CODES = Object.freeze(new Set([
  20,     // IllegalOperation
  251,    // NoSuchTransaction
  40415   // Transaction numbers are only allowed on a replica set member or mongos
]));

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

  // Chequeo por código numérico (más confiable).
  if (typeof err.code === 'number' && NO_SOPORTE_CODES.has(err.code)) {
    return true;
  }

  // Fallback: chequeo por mensaje (drivers antiguos).
  const msg = String(err.message || '');
  return NO_SOPORTE_REGEX.some(rx => rx.test(msg));
}

/**
 * ¿El error es transitorio?
 *
 * Cubre DOS labels:
 *   - `TransientTransactionError`: conflicto de write, el driver
 *     reintenta toda la transacción.
 *   - `UnknownTransactionCommitResult`: el commit quedó en estado
 *     desconocido, el driver reintenta SOLO el commit.
 *
 * @param {Error} err
 */
function esErrorTransitorio(err) {
  if (!err || typeof err.hasErrorLabel !== 'function') return false;
  try {
    return (
      err.hasErrorLabel('TransientTransactionError') ||
      err.hasErrorLabel('UnknownTransactionCommitResult')
    );
  } catch {
    return false;
  }
}

/**
 * Clasifica un error transitorio en un string estable para logs/métricas.
 * @param {Error} err
 * @returns {'transient' | 'commit_unknown' | null}
 */
function clasificarTransitorio(err) {
  if (!err || typeof err.hasErrorLabel !== 'function') return null;
  try {
    if (err.hasErrorLabel('TransientTransactionError')) return 'transient';
    if (err.hasErrorLabel('UnknownTransactionCommitResult')) return 'commit_unknown';
    return null;
  } catch {
    return null;
  }
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
  sinSoporteDetectado: 0,
  // ---- Nuevas ----
  transaccionesManuales: 0,
  duracionTotalMs: 0,
  abortadasManuales: 0
};

function getMetricas() {
  const m = { ...METRICAS };
  // Añadimos un promedio calculado (no almacenado) para comodidad.
  m.duracionPromedioMs = METRICAS.transaccionesOk > 0
    ? Math.round(METRICAS.duracionTotalMs / METRICAS.transaccionesOk)
    : 0;
  return m;
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
 * @param {object} [db]
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
// MODO AUTO-RETRY (default): session.withTransaction()
// ============================================================
/**
 * Ejecuta el callback con `session.withTransaction()`, que
 * reintenta AUTOMÁTICAMENTE en errores transitorios.
 *
 * ⚠️  El callback PUEDE ejecutarse más de una vez. Ver header.
 *
 * @private
 * @template T
 * @param {object} session
 * @param {(session: object) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function _ejecutarConWithTransaction(session, callback) {
  let resultado;

  await session.withTransaction(
    async () => {
      resultado = await callback(session);
      // `return true` indica al driver que el callback terminó OK
      // y puede commitear. Retornar falsy provoca un retry.
      return true;
    },
    { maxCommitTimeMS: CONFIG.maxCommitMs }
  );

  return resultado;
}

// ============================================================
// MODO MANUAL (retryTransient: false): startTransaction + commit
// ============================================================
/**
 * Ejecuta el callback con `startTransaction()` + `commitTransaction()`
 * manual. NO reintenta automáticamente.
 *
 * Si el driver lanza `TransientTransactionError` o
 * `UnknownTransactionCommitResult`, se propaga tal cual al caller.
 *
 * ⚠️  El callback se ejecuta EXACTAMENTE UNA VEZ.
 *
 * @private
 * @template T
 * @param {object} session
 * @param {(session: object) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function _ejecutarConTxManual(session, callback) {
  METRICAS.transaccionesManuales++;

  session.startTransaction({
    readConcern: { level: CONFIG.readConcernManual },
    writeConcern: { w: CONFIG.writeConcernManual },
    maxCommitTimeMS: CONFIG.maxCommitMs
  });

  try {
    const resultado = await callback(session);
    await session.commitTransaction();
    return resultado;
  } catch (err) {
    try {
      await session.abortTransaction();
      METRICAS.abortadasManuales++;
    } catch (abortErr) {
      // Si el abort falla, es probable que la transacción ya se haya
      // cerrado (timeout, error de red). Lo dejamos como warning.
      log.warn(
        { err: abortErr.message, errorOriginal: err.message },
        'Fallo abortando transacción manual'
      );
    }
    throw err;
  }
}

// ============================================================
// EJECUCIÓN EN TRANSACCIÓN
// ============================================================
/**
 * Ejecuta `callback` en una transacción si `db` lo soporta.
 * Si NO lo soporta, ejecuta sin transacción con `session = null`.
 *
 * @template T
 * @param {object} db
 * @param {(session: object|null) => Promise<T>} callback
 * @param {object} [opts]
 * @param {boolean} [opts.retryTransient=true]
 *   - `true` (default): usa `withTransaction()` con auto-retry del driver.
 *     El callback puede ejecutarse MÚLTIPLES veces.
 *   - `false`: usa `startTransaction()` + `commitTransaction()` manual.
 *     El callback se ejecuta EXACTAMENTE UNA VEZ. Los errores transitorios
 *     se propagan tal cual.
 * @returns {Promise<T>}
 */
async function conTransaccion(db, callback, opts = {}) {
  if (typeof callback !== 'function') {
    throw Object.assign(new TypeError('conTransaccion espera un callback'), {
      codigo: 'CALLBACK_INVALIDO',
      status: 400
    });
  }

  const { retryTransient = true } = opts;

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
    const resultado = retryTransient
      ? await _ejecutarConWithTransaction(session, callback)
      : await _ejecutarConTxManual(session, callback);

    const duracionMs = Date.now() - startedAt;
    METRICAS.transaccionesOk++;
    METRICAS.duracionTotalMs += duracionMs;

    log.info(
      { duracionMs, modo: retryTransient ? 'auto-retry' : 'manual' },
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
    const clasif = clasificarTransitorio(err);
    const duracionMs = Date.now() - startedAt;

    log.error(
      {
        err: err.message,
        codigo: err.code,
        transitorio: clasif,
        modo: retryTransient ? 'auto-retry' : 'manual',
        duracionMs
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
 * @param {object} [opts]  Mismas opciones que `conTransaccion`.
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
module.exports._clasificarTransitorio = clasificarTransitorio;
module.exports._leerCache = leerCache;
module.exports._guardarCache = guardarCache;
module.exports._cacheSoporte = cacheSoporte;
module.exports._METRICAS = METRICAS;
module.exports._NO_SOPORTE_REGEX = NO_SOPORTE_REGEX;
module.exports._NO_SOPORTE_CODES = NO_SOPORTE_CODES;
module.exports._ejecutarConWithTransaction = _ejecutarConWithTransaction;
module.exports._ejecutarConTxManual = _ejecutarConTxManual;