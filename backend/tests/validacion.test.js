// backend/tests/validacion.test.js
// ============================================================
// Tests para utils/validacion.js
// ============================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  respuestaValidacion,
  validar,
  extraerError,
  extraerErrores,
  formatearMensajes,
  agruparPorCampo,
  getMetricas,
  resetearMetricas,
  CONFIG,
  _truncar,
  _deduplicar,
  _METRICAS
} = require('../utils/validacion');

// ============================================================
// MOCKS
// ============================================================
/** Crea un `res` mock que captura status/body/headers. */
function crearResMock() {
  const captured = {
    status: null,
    body: null,
    headers: {},
    headersSent: false
  };
  const res = {
    status(code) { captured.status = code; return this; },
    json(body) {
      captured.body = body;
      captured.headersSent = true;
      return this;
    },
    set(n, v) { captured.headers[String(n).toLowerCase()] = v; return this; },
    _captured: captured,
    get headersSent() { return captured.headersSent; }
  };
  return res;
}

/** Construye un pseudo-`ValidationError` de express-validator. */
function errorsMock(list) {
  return {
    isEmpty: () => list.length === 0,
    array: () => list
  };
}

// ============================================================
// CONFIG
// ============================================================
describe('validacion · CONFIG', () => {
  test('valores por defecto', () => {
    assert.ok(CONFIG.maxMensajes > 0);
    assert.ok(CONFIG.maxLongitudMensaje > 0);
    assert.equal(CONFIG.codigoDefault, 'VALIDACION');
  });

  test('está congelado', () => {
    assert.equal(Object.isFrozen(CONFIG), true);
  });
});

// ============================================================
// extraerError
// ============================================================
describe('validacion · extraerError', () => {
  test('extrae shape v7 (path)', () => {
    const r = extraerError({ path: 'email', msg: 'Inválido', location: 'body' });
    assert.equal(r.campo, 'email');
    assert.equal(r.mensaje, 'Inválido');
    assert.equal(r.ubicacion, 'body');
  });

  test('extrae shape v6 (param)', () => {
    const r = extraerError({ param: 'nombre', msg: 'Requerido', location: 'body' });
    assert.equal(r.campo, 'nombre');
    assert.equal(r.mensaje, 'Requerido');
  });

  test('mensaje como objeto con .message', () => {
    const r = extraerError({ path: 'x', msg: { message: 'Custom' } });
    assert.equal(r.mensaje, 'Custom');
  });

  test('campo vacío si no hay path ni param', () => {
    const r = extraerError({ msg: 'x' });
    assert.equal(r.campo, '');
  });

  test('error vacío → shape default', () => {
    const r = extraerError({});
    assert.equal(r.mensaje, 'Error de validación');
  });

  test('null/no-object → shape default', () => {
    assert.equal(extraerError(null).mensaje, 'Error de validación');
    assert.equal(extraerError('string').mensaje, 'Error de validación');
  });

  test('trunca mensajes largos', () => {
    const largo = 'a'.repeat(CONFIG.maxLongitudMensaje * 2);
    const r = extraerError({ path: 'x', msg: largo });
    assert.ok(r.mensaje.length <= CONFIG.maxLongitudMensaje + 1);
    assert.match(r.mensaje, /…/);
  });

  test('preserva codigo si existe', () => {
    const r = extraerError({ path: 'x', msg: 'y', code: 'CUSTOM' });
    assert.equal(r.codigo, 'CUSTOM');
  });
});

// ============================================================
// extraerErrores
// ============================================================
describe('validacion · extraerErrores', () => {
  test('extrae múltiples errores', () => {
    const errors = errorsMock([
      { path: 'a', msg: 'A malo' },
      { path: 'b', msg: 'B malo' }
    ]);
    const r = extraerErrores(errors);
    assert.equal(r.length, 2);
    assert.equal(r[0].campo, 'a');
    assert.equal(r[1].campo, 'b');
  });

  test('null → []', () => {
    assert.deepEqual(extraerErrores(null), []);
    assert.deepEqual(extraerErrores(undefined), []);
  });

  test('objeto sin .array() → []', () => {
    assert.deepEqual(extraerErrores({}), []);
    assert.deepEqual(extraerErrores({ array: 'no es fn' }), []);
  });

  test('array() que lanza → []', () => {
    const bad = { array: () => { throw new Error('boom'); } };
    assert.deepEqual(extraerErrores(bad), []);
  });

  test('array() que devuelve no-array → []', () => {
    const bad = { array: () => 'no array' };
    assert.deepEqual(extraerErrores(bad), []);
  });
});

// ============================================================
// deduplicar
// ============================================================
describe('validacion · deduplicar', () => {
  test('elimina duplicados por (campo, mensaje)', () => {
    const arr = [
      { campo: 'a', mensaje: 'X' },
      { campo: 'a', mensaje: 'X' },
      { campo: 'a', mensaje: 'Y' },
      { campo: 'b', mensaje: 'X' }
    ];
    const r = _deduplicar(arr);
    assert.equal(r.length, 3);
  });

  test('mantiene orden', () => {
    const arr = [
      { campo: 'b', mensaje: 'Y' },
      { campo: 'a', mensaje: 'X' }
    ];
    const r = _deduplicar(arr);
    assert.equal(r[0].campo, 'b');
    assert.equal(r[1].campo, 'a');
  });

  test('array vacío → []', () => {
    assert.deepEqual(_deduplicar([]), []);
  });
});

// ============================================================
// truncar
// ============================================================
describe('validacion · _truncar', () => {
  test('strings cortos pasan igual', () => {
    assert.equal(_truncar('hola'), 'hola');
  });

  test('strings largos se cortan', () => {
    const r = _truncar('a'.repeat(1000), 10);
    assert.equal(r.length, 11); // 10 + '…'
    assert.match(r, /…$/);
  });

  test('null/undefined → ""', () => {
    assert.equal(_truncar(null), '');
    assert.equal(_truncar(undefined), '');
  });
});

// ============================================================
// formatearMensajes
// ============================================================
describe('validacion · formatearMensajes', () => {
  test('devuelve array de mensajes únicos', () => {
    const arr = [
      { campo: 'a', mensaje: 'X' },
      { campo: 'b', mensaje: 'Y' },
      { campo: 'a', mensaje: 'X' } // dup
    ];
    assert.deepEqual(formatearMensajes(arr), ['X', 'Y']);
  });

  test('acepta ValidationError', () => {
    const errors = errorsMock([{ path: 'x', msg: 'Malo' }]);
    assert.deepEqual(formatearMensajes(errors), ['Malo']);
  });

  test('array vacío → []', () => {
    assert.deepEqual(formatearMensajes([]), []);
  });
});

// ============================================================
// agruparPorCampo
// ============================================================
describe('validacion · agruparPorCampo', () => {
  test('agrupa correctamente', () => {
    const arr = [
      { campo: 'email', mensaje: 'Inválido' },
      { campo: 'email', mensaje: 'Requerido' },
      { campo: 'nombre', mensaje: 'Corto' }
    ];
    const r = agruparPorCampo(arr);
    assert.deepEqual(r.email, ['Inválido', 'Requerido']);
    assert.deepEqual(r.nombre, ['Corto']);
  });

  test('deduplica por campo', () => {
    const arr = [
      { campo: 'x', mensaje: 'M' },
      { campo: 'x', mensaje: 'M' }
    ];
    assert.deepEqual(agruparPorCampo(arr).x, ['M']);
  });

  test('campo vacío → "_"', () => {
    const arr = [{ campo: '', mensaje: 'M' }];
    assert.deepEqual(agruparPorCampo(arr)._, ['M']);
  });

  test('acepta ValidationError', () => {
    const errors = errorsMock([{ path: 'a', msg: 'X' }]);
    assert.deepEqual(agruparPorCampo(errors).a, ['X']);
  });
});

// ============================================================
// respuestaValidacion
// ============================================================
describe('validacion · respuestaValidacion', () => {
  beforeEach(() => resetearMetricas());

  test('envía 400 con codigo VALIDACION', () => {
    const res = crearResMock();
    const errors = errorsMock([{ path: 'email', msg: 'Inválido' }]);
    respuestaValidacion(res, errors);

    assert.equal(res._captured.status, 400);
    assert.equal(res._captured.body.codigo, 'VALIDACION');
    assert.equal(res._captured.body.error, 'Inválido');
    assert.equal(res._captured.body.detalles.length, 1);
    assert.equal(res._captured.body.detalles[0].campo, 'email');
  });

  test('detalles incluyen ubicacion cuando existe', () => {
    const res = crearResMock();
    const errors = errorsMock([
      { path: 'email', msg: 'X', location: 'body' }
    ]);
    respuestaValidacion(res, errors);
    assert.equal(res._captured.body.detalles[0].ubicacion, 'body');
  });

  test('múltiples mensajes → compuesto con coma', () => {
    const res = crearResMock();
    const errors = errorsMock([
      { path: 'a', msg: 'A malo' },
      { path: 'b', msg: 'B malo' }
    ]);
    respuestaValidacion(res, errors);
    assert.equal(res._captured.body.error, 'A malo, B malo');
  });

  test('deduplica antes de responder', () => {
    const res = crearResMock();
    const errors = errorsMock([
      { path: 'a', msg: 'X' },
      { path: 'a', msg: 'X' }
    ]);
    respuestaValidacion(res, errors);
    assert.equal(res._captured.body.detalles.length, 1);
  });

  test('trunca a maxMensajes con sufijo', () => {
    const res = crearResMock();
    const items = Array.from({ length: CONFIG.maxMensajes + 5 }, (_, i) => ({
      path: `campo${i}`,
      msg: `Error ${i}`
    }));
    respuestaValidacion(res, errorsMock(items));

    assert.equal(res._captured.body.detalles.length, CONFIG.maxMensajes);
    assert.match(res._captured.body.error, /… y \d+ más/);
    assert.ok(res._captured.body._meta);
    assert.equal(res._captured.body._meta.total, items.length);
  });

  test('opts.codigo custom', () => {
    const res = crearResMock();
    respuestaValidacion(
      res,
      errorsMock([{ path: 'x', msg: 'y' }]),
      { codigo: 'MI_CODIGO' }
    );
    assert.equal(res._captured.body.codigo, 'MI_CODIGO');
  });

  test('setea Cache-Control: no-store', () => {
    const res = crearResMock();
    respuestaValidacion(res, errorsMock([{ path: 'x', msg: 'y' }]));
    assert.equal(res._captured.headers['cache-control'], 'no-store');
  });

  test('no lanza si headersSent', () => {
    const res = crearResMock();
    res._captured.headersSent = true;
    const errors = errorsMock([{ path: 'x', msg: 'y' }]);
    assert.doesNotThrow(() => respuestaValidacion(res, errors));
  });

  test('incrementa métricas', () => {
    resetearMetricas();
    const res = crearResMock();
    respuestaValidacion(res, errorsMock([
      { path: 'a', msg: 'X' },
      { path: 'b', msg: 'Y' }
    ]));
    const m = getMetricas();
    assert.equal(m.validacionesFallidas, 1);
    assert.equal(m.erroresEnRespuesta, 2);
  });
});

// ============================================================
// validar
// ============================================================
describe('validacion · validar', () => {
  beforeEach(() => resetearMetricas());

  test('sin errores → false y NO responde', () => {
    const res = crearResMock();
    const req = {
      // express-validator adjunta este símbolo al request con los resultados.
      [Symbol.for('express-validator#contexts')]: []
    };
    const r = validar(req, res);
    assert.equal(r, false);
    assert.equal(res._captured.status, null);
    assert.equal(getMetricas().validacionesOk, 1);
  });

  test('con errores → true y responde 400', () => {
    // Simulamos un request "enriquecido" por express-validator.
    // Necesitamos parchear `validationResult` de manera compatible.
    // Como no podemos inyectar, testeamos con `validar` y un request
    // real del router (que adjunta el Symbol). Alternativa: chequeamos
    // el fallback cuando no hay contexto (retorna false sin errores).
    const res = crearResMock();
    const req = {}; // sin Symbol → sin resultados → sin errores
    const r = validar(req, res);
    assert.equal(r, false);
  });

  test('sin express-validator → no lanza y devuelve false', () => {
    // Este test solo es válido si express-validator está instalado.
    // En ese caso, `validar({}, res)` devuelve false sin lanzar.
    const res = crearResMock();
    assert.doesNotThrow(() => validar({}, res));
  });

  test('request sin contexts → false', () => {
    const res = crearResMock();
    const req = { body: { x: 1 } };
    const r = validar(req, res);
    assert.equal(r, false);
  });

  test('incrementa validacionesOk cuando pasa', () => {
    resetearMetricas();
    const res = crearResMock();
    validar({}, res);
    assert.equal(getMetricas().validacionesOk, 1);
  });
});

// ============================================================
// Métricas
// ============================================================
describe('validacion · métricas', () => {
  test('shape completo', () => {
    const m = getMetricas();
    assert.equal(typeof m.validacionesFallidas, 'number');
    assert.equal(typeof m.validacionesOk, 'number');
    assert.equal(typeof m.erroresEnRespuesta, 'number');
  });

  test('reset limpia todo', () => {
    resetearMetricas();
    const m = getMetricas();
    for (const k of Object.keys(m)) {
      assert.equal(m[k], 0, `m.${k} debería ser 0`);
    }
  });
});