// backend/tests/transacciones.test.js
// ============================================================
// Tests para utils/transacciones.js
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  conTransaccion,
  soportaTransacciones,
  runInTransaction,
  invalidarCacheSoporte,
  getMetricas,
  resetearMetricas,
  CONFIG,
  _esErrorSinSoporte,
  _esErrorTransitorio,
  _guardarCache,
  _leerCache,
  _METRICAS
} = require('../utils/transacciones');

// ============================================================
// HELPERS: mocks
// ============================================================
/** Crea un mock de db que soporta transacciones. */
function crearDbConSoporte({ fallarEnCallback = false } = {}) {
  const sessionObj = {
    endSession: async () => { sessionObj._ended = true; },
    _ended: false
  };
  return {
    client: {
      startSession: () => sessionObj
    },
    admin: () => ({
      command: async () => ({ setName: 'rs0' }) // replica set
    }),
    _session: sessionObj
  };
}

/** Crea un mock de db que NO soporta transacciones. */
function crearDbSinSoporte() {
  return {
    client: {
      startSession: () => ({
        withTransaction: async () => {
          const err = new Error('Transaction numbers are only allowed on a replica set member or mongos');
          throw err;
        },
        endSession: async () => {}
      })
    },
    admin: () => ({
      command: async () => ({}) // standalone, sin setName ni msg
    })
  };
}

// ============================================================
// CONFIG
// ============================================================
describe('transacciones · CONFIG', () => {
  test('valores por defecto sensatos', () => {
    assert.ok(CONFIG.timeoutMs > 0);
    assert.ok(CONFIG.maxCommitMs > 0);
    assert.ok(CONFIG.cacheTtlMs > 0);
    assert.equal(typeof CONFIG.logStandaloneFallback, 'boolean');
  });

  test('está congelado', () => {
    assert.equal(Object.isFrozen(CONFIG), true);
  });
});

// ============================================================
// esErrorSinSoporte / esErrorTransitorio
// ============================================================
describe('transacciones · esErrorSinSoporte', () => {
  test('detecta "transaction numbers"', () => {
    const err = new Error('Transaction numbers are only allowed on a replica set member or mongos');
    assert.equal(_esErrorSinSoporte(err), true);
  });

  test('detecta "does not support transactions"', () => {
    const err = new Error('This MongoDB deployment does not support transactions');
    assert.equal(_esErrorSinSoporte(err), true);
  });

  test('detecta "replica set" en el mensaje', () => {
    const err = new Error('Not a replica set');
    assert.equal(_esErrorSinSoporte(err), true);
  });

  test('detecta "IllegalOperation"', () => {
    const err = new Error('IllegalOperation on this deployment');
    assert.equal(_esErrorSinSoporte(err), true);
  });

  test('errores genéricos → false', () => {
    assert.equal(_esErrorSinSoporte(new Error('Connection refused')), false);
    assert.equal(_esErrorSinSoporte(new Error('Timeout')), false);
  });

  test('null/undefined → false', () => {
    assert.equal(_esErrorSinSoporte(null), false);
    assert.equal(_esErrorSinSoporte(undefined), false);
  });
});

describe('transacciones · esErrorTransitorio', () => {
  test('detecta label TransientTransactionError', () => {
    const err = new Error('write conflict');
    err.hasErrorLabel = (label) => label === 'TransientTransactionError';
    assert.equal(_esErrorTransitorio(err), true);
  });

  test('rechaza errores sin label', () => {
    const err = new Error('real error');
    err.hasErrorLabel = () => false;
    assert.equal(_esErrorTransitorio(err), false);
  });

  test('rechaza errores sin hasErrorLabel', () => {
    assert.equal(_esErrorTransitorio(new Error('x')), false);
    assert.equal(_esErrorTransitorio(null), false);
  });
});

// ============================================================
// cache de soporte
// ============================================================
describe('transacciones · cache de soporte', () => {
  test('guardar y leer', () => {
    const db = {};
    _guardarCache(db, true);
    assert.equal(_leerCache(db), true);

    _guardarCache(db, false);
    assert.equal(_leerCache(db), false);
  });

  test('cache expira por TTL', async () => {
    const db = {};
    // Forzamos TTL de 1ms sobreescribiendo el cache manualmente.
    const { _cacheSoporte } = require('../utils/transacciones');
    _cacheSoporte.set(db, { soporta: true, expiresAt: Date.now() - 1 });
    assert.equal(_leerCache(db), null);
    assert.equal(_cacheSoporte.has(db), false, 'debe haberse eliminado');
  });

  test('invalidarCacheSoporte borra la entrada', () => {
    const db = {};
    _guardarCache(db, true);
    invalidarCacheSoporte(db);
    assert.equal(_leerCache(db), null);
  });
});

// ============================================================
// soportaTransacciones
// ============================================================
describe('transacciones · soportaTransacciones', () => {
  beforeEach(() => resetearMetricas());

  test('replica set → true', async () => {
    const db = crearDbConSoporte();
    assert.equal(await soportaTransacciones(db), true);
  });

  test('mongos → true', async () => {
    const db = {
      client: {},
      admin: () => ({
        command: async () => ({ msg: 'isdbgrid' })
      })
    };
    assert.equal(await soportaTransacciones(db), true);
  });

  test('standalone → false', async () => {
    const db = crearDbSinSoporte();
    assert.equal(await soportaTransacciones(db), false);
  });

  test('sin db → false', async () => {
    assert.equal(await soportaTransacciones(null), false);
    assert.equal(await soportaTransacciones({}), false);
  });

  test('error al consultar hello → false sin cachear', async () => {
    const db = {
      admin: () => ({
        command: async () => { throw new Error('network'); }
      })
    };
    assert.equal(await soportaTransacciones(db), false);
    // No se cacheó (debe poder reintentar).
    const { _cacheSoporte } = require('../utils/transacciones');
    assert.equal(_cacheSoporte.has(db), false);
  });

  test('usa cache en segunda llamada', async () => {
    let llamadas = 0;
    const db = {
      client: {},
      admin: () => ({
        command: async () => { llamadas++; return { setName: 'rs0' }; }
      })
    };
    await soportaTransacciones(db);
    await soportaTransacciones(db);
    assert.equal(llamadas, 1, 'solo debe consultar hello una vez');
  });

  test('incrementa métricas', async () => {
    resetearMetricas();
    await soportaTransacciones(crearDbConSoporte());
    assert.equal(getMetricas().chequeosSoporte, 1);
  });
});

// ============================================================
// conTransaccion
// ============================================================
describe('transacciones · conTransaccion', () => {
  beforeEach(() => resetearMetricas());

  test('lanza si el callback no es función', async () => {
    await assert.rejects(
      () => conTransaccion({}, null),
      (err) => err.codigo === 'CALLBACK_INVALIDO'
    );
  });

  test('sin db.client → callback(null) sin transacción', async () => {
    let sessionRecibida = 'no-llamado';
    const r = await conTransaccion({}, async (session) => {
      sessionRecibida = session;
      return 'ok';
    });
    assert.equal(r, 'ok');
    assert.equal(sessionRecibida, null);
  });

  test('db=null → callback(null) sin transacción', async () => {
    const r = await conTransaccion(null, async (s) => {
      assert.equal(s, null);
      return 42;
    });
    assert.equal(r, 42);
  });

  test('standalone → callback(null) sin transacción', async () => {
    const db = crearDbSinSoporte();
    let sessionRecibida = 'no-llamado';
    const r = await conTransaccion(db, async (session) => {
      sessionRecibida = session;
      return 'ok';
    });
    assert.equal(r, 'ok');
    assert.equal(sessionRecibida, null);
    assert.equal(getMetricas().fallbackStandalone, 1);
  });

  test('replica set → callback(session) con transacción', async () => {
    const db = crearDbConSoporte();
    // Parcheamos withTransaction para que ejecute el callback.
    db.client.startSession = () => ({
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    });
    let sessionRecibida = 'no-llamado';
    const r = await conTransaccion(db, async (session) => {
      sessionRecibida = session;
      return 'hecho';
    });
    assert.equal(r, 'hecho');
    assert.notEqual(sessionRecibida, null);
    assert.equal(getMetricas().transaccionesOk, 1);
  });

  test('session.endSession se llama incluso en error', async () => {
    const db = crearDbConSoporte();
    const sessionObj = {
      withTransaction: async () => { throw new Error('boom'); },
      endSession: async () => { sessionObj._ended = true; },
      _ended: false
    };
    db.client.startSession = () => sessionObj;

    await assert.rejects(() => conTransaccion(db, async () => 'x'));
    assert.equal(sessionObj._ended, true, 'endSession debe llamarse');
  });

  test('error del callback → propagado', async () => {
    const db = crearDbConSoporte();
    db.client.startSession = () => ({
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    });

    await assert.rejects(
      () => conTransaccion(db, async () => { throw new Error('cb falla'); }),
      /cb falla/
    );
    assert.equal(getMetricas().transaccionesFallidas, 1);
  });

  test('error de "no soporte" durante la transacción → fallback', async () => {
    const db = {
      client: {
        startSession: () => ({
          withTransaction: async () => {
            const e = new Error('Transaction numbers are only allowed on a replica set member or mongos');
            throw e;
          },
          endSession: async () => {}
        })
      },
      admin: () => ({
        command: async () => ({ setName: 'rs0' }) // dice que sí soporta
      })
    };
    // El callback se ejecutará SIN transacción.
    const r = await conTransaccion(db, async (session) => 'ok');
    assert.equal(r, 'ok');
  });

  test('métricas contabilizadas', async () => {
    resetearMetricas();
    await conTransaccion(null, async () => 'a');
    await conTransaccion({}, async () => 'b');
    assert.equal(getMetricas().conTransaccion, 2);
  });
});

// ============================================================
// runInTransaction
// ============================================================
describe('transacciones · runInTransaction', () => {
  test('lanza si no hay soporte (estricto)', async () => {
    const db = crearDbSinSoporte();
    await assert.rejects(
      () => runInTransaction(db, async () => 'x'),
      (err) => err.codigo === 'TRANSACCIONES_NO_SOPORTADAS' && err.status === 501
    );
  });

  test('funciona si hay soporte', async () => {
    const db = crearDbConSoporte();
    db.client.startSession = () => ({
      withTransaction: async (fn) => await fn(),
      endSession: async () => {}
    });
    const r = await runInTransaction(db, async () => 'ok');
    assert.equal(r, 'ok');
  });
});

// ============================================================
// Métricas
// ============================================================
describe('transacciones · métricas', () => {
  test('shape completo', () => {
    const m = getMetricas();
    assert.equal(typeof m.conTransaccion, 'number');
    assert.equal(typeof m.transaccionesOk, 'number');
    assert.equal(typeof m.transaccionesFallidas, 'number');
    assert.equal(typeof m.fallbackStandalone, 'number');
    assert.equal(typeof m.chequeosSoporte, 'number');
  });

  test('reset limpia todo', () => {
    resetearMetricas();
    const m = getMetricas();
    for (const k of Object.keys(m)) {
      assert.equal(m[k], 0, `m.${k} debería ser 0`);
    }
  });
});