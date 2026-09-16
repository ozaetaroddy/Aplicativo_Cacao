// backend/tests/circuitBreaker.test.js
// ============================================================
// Tests para utils/circuitBreaker.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  CircuitBreaker,
  ESTADOS,
  EVENTOS,
  getBreaker,
  getAllStats,
  resetAll,
  removeBreaker,
  clearRegistry,
  _CONFIG
} = require('../utils/circuitBreaker');

// Helper: espera N ms.
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// CONSTRUCTOR
// ============================================================
describe('circuitBreaker · constructor', () => {
  test('valores por defecto', () => {
    const cb = new CircuitBreaker();
    assert.equal(cb.nombre, 'sin-nombre');
    assert.equal(cb.umbralFallos, _CONFIG.umbralFallosDefault);
    assert.equal(cb.cooldownMs, _CONFIG.cooldownMsDefault);
    assert.equal(cb.estado, ESTADOS.CLOSED);
    assert.equal(cb.fallosConsecutivos, 0);
    assert.equal(cb.abiertoDesde, null);
  });

  test('acepta nombre y umbral custom', () => {
    const cb = new CircuitBreaker({ nombre: 'test', umbralFallos: 3, cooldownMs: 1000 });
    assert.equal(cb.nombre, 'test');
    assert.equal(cb.umbralFallos, 3);
    assert.equal(cb.cooldownMs, 1000);
  });

  test('rechaza umbralFallos < 1', () => {
    assert.throws(() => new CircuitBreaker({ umbralFallos: 0 }));
    assert.throws(() => new CircuitBreaker({ umbralFallos: -1 }));
  });

  test('rechaza nombre vacío', () => {
    assert.throws(() => new CircuitBreaker({ nombre: '   ' }));
  });

  test('rechaza timeoutMs negativo', () => {
    assert.throws(() => new CircuitBreaker({ timeoutMs: -1 }));
  });

  test('acepta timeoutMs = 0 (sin timeout)', () => {
    const cb = new CircuitBreaker({ timeoutMs: 0 });
    assert.equal(cb.timeoutMs, 0);
  });
});

// ============================================================
// ESTADO: CLOSED → OPEN por umbral
// ============================================================
describe('circuitBreaker · CLOSED → OPEN', () => {
  test('no abre antes de llegar al umbral', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 3 });
    for (let i = 1; i <= 2; i++) {
      await assert.rejects(
        cb.ejecutar(() => Promise.reject(new Error('boom'))),
        /boom/
      );
    }
    assert.equal(cb.estado, ESTADOS.CLOSED);
    assert.equal(cb.fallosConsecutivos, 2);
  });

  test('abre exactamente al llegar al umbral', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 3 });
    for (let i = 1; i <= 3; i++) {
      await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('boom'))));
    }
    assert.equal(cb.estado, ESTADOS.OPEN);
    assert.ok(cb.abiertoDesde > 0);
  });

  test('rechaza inmediatamente cuando está abierto', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('boom'))));

    await assert.rejects(
      cb.ejecutar(() => Promise.resolve('ok')),
      (err) => err.codigo === 'CIRCUIT_OPEN' && err.retryAfter > 0
    );
  });

  test('un éxito resetea los fallos consecutivos', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 5 });
    for (let i = 0; i < 4; i++) {
      await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('boom'))));
    }
    assert.equal(cb.fallosConsecutivos, 4);

    const resultado = await cb.ejecutar(() => Promise.resolve('ok'));
    assert.equal(resultado, 'ok');
    assert.equal(cb.fallosConsecutivos, 0);
    assert.equal(cb.estado, ESTADOS.CLOSED);
  });
});

// ============================================================
// OPEN → HALF_OPEN tras cooldown
// ============================================================
describe('circuitBreaker · OPEN → HALF_OPEN', () => {
  test('transiciona tras cooldown', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1, cooldownMs: 50 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('boom'))));
    assert.equal(cb.estado, ESTADOS.OPEN);

    await esperar(60);

    // La siguiente llamada debe intentar (pasa a HALF_OPEN)
    const resultado = await cb.ejecutar(() => Promise.resolve('ok'));
    assert.equal(resultado, 'ok');
    assert.equal(cb.estado, ESTADOS.CLOSED);
  });

  test('probe fallido reabre el circuito', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1, cooldownMs: 30 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('boom'))));
    await esperar(50);

    await assert.rejects(
      cb.ejecutar(() => Promise.reject(new Error('boom2')))
    );
    assert.equal(cb.estado, ESTADOS.OPEN);
  });
});

// ============================================================
// HALF_OPEN: solo 1 probe concurrente
// ============================================================
describe('circuitBreaker · HALF_OPEN con 1 solo probe', () => {
  test('llamadas concurrentes en HALF_OPEN: solo 1 pasa', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1, cooldownMs: 30 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('boom'))));
    await esperar(50);

    // Lanzar 3 llamadas concurrentes.
    let probeEnEjecucion = 0;
    let rechazadas = 0;
    const tareas = Array.from({ length: 3 }, () =>
      cb.ejecutar(async () => {
        probeEnEjecucion++;
        await esperar(30);
        probeEnEjecucion--;
        return 'ok';
      }).catch(err => {
        if (err.codigo === 'CIRCUIT_OPEN') rechazadas++;
        throw err;
      })
    );

    const resultados = await Promise.allSettled(tareas);
    const exitosas = resultados.filter(r => r.status === 'fulfilled').length;

    assert.equal(exitosas, 1, 'solo un probe debe pasar');
    assert.equal(rechazadas, 2, 'los otros deben ser rechazados');
  });
});

// ============================================================
// TIMEOUT
// ============================================================
describe('circuitBreaker · timeout', () => {
  test('corta si fn excede timeoutMs', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 5, timeoutMs: 50 });
    await assert.rejects(
      cb.ejecutar(() => new Promise(r => setTimeout(() => r('ok'), 200))),
      (err) => err.codigo === 'CIRCUIT_TIMEOUT' && err.timeoutMs === 50
    );
  });

  test('timeout cuenta como fallo', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 2, timeoutMs: 30 });
    await assert.rejects(cb.ejecutar(() => new Promise(r => setTimeout(r, 200))));
    await assert.rejects(cb.ejecutar(() => new Promise(r => setTimeout(r, 200))));
    assert.equal(cb.estado, ESTADOS.OPEN);
  });

  test('timeoutMs = 0 no aplica timeout', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', timeoutMs: 0 });
    const r = await cb.ejecutar(() => new Promise(res => setTimeout(() => res('ok'), 50)));
    assert.equal(r, 'ok');
  });
});

// ============================================================
// ERRORES SÍNCRONOS
// ============================================================
describe('circuitBreaker · errores síncronos', () => {
  test('fn que lanza sync cuenta como fallo', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1 });
    await assert.rejects(
      cb.ejecutar(() => { throw new Error('sync boom'); }),
      /sync boom/
    );
    assert.equal(cb.estado, ESTADOS.OPEN);
  });

  test('ejecutar sin función lanza TypeError', async () => {
    const cb = new CircuitBreaker();
    await assert.rejects(cb.ejecutar(null), TypeError);
  });
});

// ============================================================
// EVENTOS
// ============================================================
describe('circuitBreaker · eventos', () => {
  test('on(success) se emite', async () => {
    const cb = new CircuitBreaker({ nombre: 'x' });
    const eventos = [];
    cb.on(e => eventos.push(e.evento));

    await cb.ejecutar(() => Promise.resolve('ok'));
    assert.ok(eventos.includes(EVENTOS.SUCCESS));
  });

  test('on(failure) se emite', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 5 });
    const eventos = [];
    cb.on(e => eventos.push(e.evento));

    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    assert.ok(eventos.includes(EVENTOS.FAILURE));
  });

  test('on(open) se emite al abrir', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1 });
    const eventos = [];
    cb.on(e => eventos.push(e.evento));

    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    assert.ok(eventos.includes(EVENTOS.OPEN));
  });

  test('on(reject) se emite al rechazar', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));

    const eventos = [];
    cb.on(e => eventos.push(e.evento));
    await assert.rejects(cb.ejecutar(() => Promise.resolve('ok')));
    assert.ok(eventos.includes(EVENTOS.REJECT));
  });

  test('listener que lanza no rompe la ejecución', async () => {
    const cb = new CircuitBreaker({ nombre: 'x' });
    cb.on(() => { throw new Error('listener roto'); });

    const resultado = await cb.ejecutar(() => Promise.resolve('ok'));
    assert.equal(resultado, 'ok');
  });

  test('on() devuelve función para desuscribirse', async () => {
    const cb = new CircuitBreaker({ nombre: 'x' });
    let cuenta = 0;
    const off = cb.on(() => { cuenta++; });

    await cb.ejecutar(() => Promise.resolve());
    assert.equal(cuenta, 1);

    off();
    await cb.ejecutar(() => Promise.resolve());
    assert.equal(cuenta, 1, 'no debe haberse incrementado tras off()');
  });
});

// ============================================================
// ESTADÍSTICAS
// ============================================================
describe('circuitBreaker · stats', () => {
  test('shape correcto', () => {
    const cb = new CircuitBreaker({ nombre: 'test', umbralFallos: 3 });
    const s = cb.stats();
    assert.equal(s.nombre, 'test');
    assert.equal(s.estado, ESTADOS.CLOSED);
    assert.equal(s.fallosConsecutivos, 0);
    assert.equal(s.umbralFallos, 3);
    assert.equal(s.abiertoDesde, null);
    assert.equal(s.ultimoError, null);
    assert.ok(s.metricas);
    assert.equal(s.metricas.llamadas, 0);
  });

  test('refleja éxito y fallo', async () => {
    const cb = new CircuitBreaker({ nombre: 'test', umbralFallos: 5 });
    await cb.ejecutar(() => Promise.resolve('ok'));
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));

    const s = cb.stats();
    assert.equal(s.metricas.llamadas, 2);
    assert.equal(s.metricas.exitos, 1);
    assert.equal(s.metricas.fallos, 1);
    assert.equal(s.ultimoError, 'x');
  });

  test('cuenta rechazos y aperturas', async () => {
    const cb = new CircuitBreaker({ nombre: 'test', umbralFallos: 1 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    await assert.rejects(cb.ejecutar(() => Promise.resolve('ok'))); // rechazado
    await assert.rejects(cb.ejecutar(() => Promise.resolve('ok'))); // rechazado

    const s = cb.stats();
    assert.equal(s.metricas.aperturas, 1);
    assert.equal(s.metricas.rechazos, 2);
  });

  test('segundosHastaRetry > 0 cuando abierto', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1, cooldownMs: 60_000 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    const s = cb.stats();
    assert.ok(s.segundosHastaRetry > 0 && s.segundosHastaRetry <= 60);
  });
});

// ============================================================
// RESET
// ============================================================
describe('circuitBreaker · reset', () => {
  test('reset limpia estado y contadores', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    assert.equal(cb.estado, ESTADOS.OPEN);

    cb.reset();
    assert.equal(cb.estado, ESTADOS.CLOSED);
    assert.equal(cb.fallosConsecutivos, 0);
    assert.equal(cb.abiertoDesde, null);
    assert.equal(cb.ultimoError, null);
  });

  test('reset permite volver a ejecutar', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    cb.reset();
    const r = await cb.ejecutar(() => Promise.resolve('ok'));
    assert.equal(r, 'ok');
  });
});

// ============================================================
// REGISTRO GLOBAL
// ============================================================
describe('circuitBreaker · registro global', () => {
  test('getBreaker devuelve la misma instancia', () => {
    clearRegistry();
    const a = getBreaker('mi-api', { umbralFallos: 3 });
    const b = getBreaker('mi-api', { umbralFallos: 99 });
    assert.equal(a, b);
    assert.equal(a.umbralFallos, 3, 'la segunda llamada ignora opts');
  });

  test('getAllStats lista todos', () => {
    clearRegistry();
    getBreaker('a');
    getBreaker('b');
    const stats = getAllStats();
    assert.equal(stats.length, 2);
  });

  test('resetAll resetea todo', async () => {
    clearRegistry();
    const cb = getBreaker('a', { umbralFallos: 1 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    resetAll();
    assert.equal(cb.estado, ESTADOS.CLOSED);
  });

  test('removeBreaker lo elimina', () => {
    clearRegistry();
    getBreaker('a');
    assert.equal(removeBreaker('a'), true);
    assert.equal(removeBreaker('a'), false);
  });
});

// ============================================================
// JITTER
// ============================================================
describe('circuitBreaker · jitter del cooldown', () => {
  test('el cooldown efectivo está dentro del ±20%', () => {
    const cb = new CircuitBreaker({ nombre: 'x', cooldownMs: 10_000 });
    for (let i = 0; i < 100; i++) {
      const efectivo = cb._cooldownEfectivo();
      assert.ok(efectivo >= 8000 && efectivo <= 12000, `fuera de rango: ${efectivo}`);
    }
  });
});

// ============================================================
// ESTADO ACTUAL (getter)
// ============================================================
describe('circuitBreaker · estadoActual getter', () => {
  test('OPEN expirado reporta HALF_OPEN sin mutar', async () => {
    const cb = new CircuitBreaker({ nombre: 'x', umbralFallos: 1, cooldownMs: 30 });
    await assert.rejects(cb.ejecutar(() => Promise.reject(new Error('x'))));
    assert.equal(cb.estado, ESTADOS.OPEN);

    await esperar(50);
    assert.equal(cb.estadoActual, ESTADOS.HALF_OPEN);
    // El estado real NO cambió hasta que alguien llame a puedeIntentar/e jecutar.
    assert.equal(cb.estado, ESTADOS.OPEN);
  });
});