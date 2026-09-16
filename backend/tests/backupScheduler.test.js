// backend/tests/backupScheduler.test.js
// ============================================================
// Tests para utils/backupScheduler.js
// Sólo cubren funciones puras / helpers. La integración con
// Mongo se prueba con mongodb-memory-server o mocks.
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  _CONFIG,
  _validarCron,
  _debeAlertar,
  _esErrorTransitorio,
  _conTimeout,
  _construirCuerpoAlerta,
  _LockManager
} = require('../utils/backupScheduler');

// ============================================================
// CONFIG
// ============================================================
describe('backupScheduler · CONFIG', () => {
  test('valores por defecto son sensatos', () => {
    assert.ok(_CONFIG.maxAutomaticos >= 1);
    assert.ok(_CONFIG.lockMinutos >= 5);
    assert.ok(_CONFIG.timeoutMs >= 60_000);
    assert.ok(_CONFIG.reintentosMax >= 0);
    assert.ok(_CONFIG.cronDefault.length > 0);
  });

  test('colores son strings', () => {
    assert.equal(typeof _CONFIG.colBackups, 'string');
    assert.equal(typeof _CONFIG.colConfig, 'string');
    assert.equal(typeof _CONFIG.colLock, 'string');
  });
});

// ============================================================
// VALIDACIÓN DE CRON
// ============================================================
describe('backupScheduler · validarCron', () => {
  test('crones válidos', () => {
    assert.equal(_validarCron('0 3 * * *'), true);
    assert.equal(_validarCron('*/5 * * * *'), true);
    assert.equal(_validarCron('0 0 1 1 *'), true);
  });

  test('4 campos → inválido', () => {
    assert.equal(_validarCron('0 3 * *'), false);
  });

  test('6 campos → inválido', () => {
    assert.equal(_validarCron('0 0 3 * * *'), false);
  });

  test('no-string → inválido', () => {
    assert.equal(_validarCron(null), false);
    assert.equal(_validarCron(42), false);
    assert.equal(_validarCron({}), false);
  });

  test('string basura → inválido', () => {
    assert.equal(_validarCron('a b c d e'), false);
    assert.equal(_validarCron('99 99 * * *'), false);
  });
});

// ============================================================
// DEBE ALERTAR
// ============================================================
describe('backupScheduler · debeAlertar', () => {
  const fallosAntes = _CONFIG.fallosAntesDeAlerta;
  const alertaCada = _CONFIG.alertaCadaFallos;

  test('no alerta antes del umbral', () => {
    for (let i = 1; i < fallosAntes; i++) {
      assert.equal(_debeAlertar({}, i), false, `fallos=${i} no debería alertar`);
    }
  });

  test('alerta exactamente en el umbral', () => {
    assert.equal(_debeAlertar({}, fallosAntes), true);
  });

  test('no re-alerta en el siguiente fallo', () => {
    assert.equal(_debeAlertar({}, fallosAntes + 1), false);
  });

  test('re-alerta cada N fallos', () => {
    const siguientePunto = fallosAntes + alertaCada;
    assert.equal(_debeAlertar({}, siguientePunto), true);
    assert.equal(_debeAlertar({}, siguientePunto + 1), false);
  });

  test('throttle respeta ultima_alerta reciente', () => {
    const config = { ultima_alerta: new Date() }; // hace un instante
    assert.equal(_debeAlertar(config, fallosAntes), false);
  });

  test('throttle permite alerta si pasó suficiente tiempo', () => {
    const haceMucho = new Date(Date.now() - _CONFIG.alertaThrottleMs - 1000);
    const config = { ultima_alerta: haceMucho };
    assert.equal(_debeAlertar(config, fallosAntes), true);
  });
});

// ============================================================
// ERRORES TRANSITORIOS
// ============================================================
describe('backupScheduler · esErrorTransitorio', () => {
  test('reconoce errores de red de Mongo', () => {
    assert.equal(_esErrorTransitorio({ name: 'MongoNetworkError' }), true);
    assert.equal(_esErrorTransitorio({ name: 'MongoTimeoutError' }), true);
    assert.equal(_esErrorTransitorio({ name: 'MongoServerSelectionError' }), true);
  });

  test('reconoce por código numérico', () => {
    assert.equal(_esErrorTransitorio({ code: 6 }), true);
    assert.equal(_esErrorTransitorio({ code: 189 }), true);
  });

  test('rechaza errores de negocio', () => {
    assert.equal(_esErrorTransitorio({ name: 'ValidationError' }), false);
    assert.equal(_esErrorTransitorio({ code: 11000 }), false);
    assert.equal(_esErrorTransitorio(null), false);
    assert.equal(_esErrorTransitorio(undefined), false);
  });
});

// ============================================================
// CON TIMEOUT
// ============================================================
describe('backupScheduler · conTimeout', () => {
  test('resuelve si la promesa termina antes', async () => {
    const r = await _conTimeout(Promise.resolve(42), 1000, 'timeout');
    assert.equal(r, 42);
  });

  test('rechaza con BACKUP_TIMEOUT si excede', async () => {
    const lento = new Promise(resolve => setTimeout(resolve, 100));
    await assert.rejects(
      _conTimeout(lento, 10, 'excedió'),
      (err) => err.codigo === 'BACKUP_TIMEOUT' && /excedió/.test(err.message)
    );
  });

  test('propaga el error original si la promesa falla', async () => {
    const erroreosa = Promise.reject(new Error('boom'));
    await assert.rejects(
      _conTimeout(erroreosa, 1000, 'timeout'),
      (err) => err.message === 'boom'
    );
  });
});

// ============================================================
// CUERPO DE ALERTA
// ============================================================
describe('backupScheduler · construirCuerpoAlerta', () => {
  test('incluye la cantidad de fallos y el error', () => {
    const cuerpo = _construirCuerpoAlerta(new Error('mongo caído'), 5, 'ACME S.A.');
    assert.match(cuerpo, /5 fallos/);
    assert.match(cuerpo, /mongo caído/);
    assert.match(cuerpo, /ACME S\.A\./);
  });

  test('incluye acciones recomendadas', () => {
    const cuerpo = _construirCuerpoAlerta(new Error('x'), 2, 'X');
    assert.match(cuerpo, /logs/);
    assert.match(cuerpo, /disco/);
  });
});

// ============================================================
// LOCK MANAGER (con mock)
// ============================================================
describe('backupScheduler · LockManager', () => {
  /** Mock minimalista de `db.collection(...)`. */
  function crearMockDb(initialDoc = null) {
    let doc = initialDoc;
    return {
      collection: () => ({
        findOneAndUpdate: async (filter, update, opts) => {
          const ahora = new Date();
          // Simula el filtro $or.
          const coincide =
            !doc ||
            !doc.expira ||
            doc.expira < ahora ||
            (filter.$or && filter.$or.some(cond =>
              cond.owner && doc.owner === cond.owner
            ));

          if (!coincide) {
            const err = new Error('duplicate');
            err.code = 11000;
            throw err;
          }

          doc = {
            _id: filter._id,
            ...update.$set,
            ...(doc || {})
          };
          return { value: doc };
        },
        updateOne: async (filter, update) => {
          if (doc && doc.owner === filter.owner) {
            if (update.$unset) {
              for (const k of Object.keys(update.$unset)) delete doc[k];
            }
            if (update.$set) Object.assign(doc, update.$set);
          }
          return { modifiedCount: 1 };
        }
      }),
      _getDoc: () => doc
    };
  }

  test('adquirir lock vacío funciona', async () => {
    const db = crearMockDb();
    const ok = await _LockManager.adquirir(db, 'owner1');
    assert.equal(ok, true);
    assert.equal(db._getDoc().owner, 'owner1');
  });

  test('segundo owner no puede adquirir lock vigente', async () => {
    const db = crearMockDb();
    await _LockManager.adquirir(db, 'owner1');
    const ok = await _LockManager.adquirir(db, 'owner2');
    assert.equal(ok, false);
  });

  test('owner puede renovar su propio lock', async () => {
    const db = crearMockDb();
    await _LockManager.adquirir(db, 'owner1');
    const ok = await _LockManager.adquirir(db, 'owner1');
    assert.equal(ok, true);
  });

  test('liberar limpia el owner', async () => {
    const db = crearMockDb();
    await _LockManager.adquirir(db, 'owner1');
    await _LockManager.liberar(db, 'owner1');
    const d = db._getDoc();
    assert.equal(d.owner, undefined);
    assert.equal(d.expira, undefined);
  });

  test('liberar con owner incorrecto no toca el lock', async () => {
    const db = crearMockDb();
    await _LockManager.adquirir(db, 'owner1');
    await _LockManager.liberar(db, 'owner2');
    assert.equal(db._getDoc().owner, 'owner1');
  });
});