// backend/tests/periodos.test.js
// ============================================================
// Tests para utils/periodos.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');

const {
  MESES,
  getMeses,
  nombrePeriodo,
  obtenerPeriodoCerrado,
  obtenerPeriodosCerradosEnFechas,
  estaPeriodoCerrado,
  assertPeriodoAbierto,
  verificarPeriodoAbierto,
  CONFIG,
  _normalizarFecha,
  _esFechaParseable,
  _detectarColeccion,
  _detectarColeccionConMapa
} = require('../utils/periodos');

// ============================================================
// MOCK DE DB
// ============================================================
/** Crea un mock minimalista de `db` con `periodos_cerrados`. */
function crearMockDb({ periodosCerrados = [], documentos = {} } = {}) {
  const docs = new Map();

  return {
    collection(nombre) {
      if (nombre === 'periodos_cerrados') {
        return {
          findOne: async (filtro) => {
            return periodosCerrados.find(p => p.anio === filtro.anio && p.mes === filtro.mes) || null;
          },
          find: (filtro) => ({
            toArray: async () => {
              if (filtro.$or) {
                return periodosCerrados.filter(p =>
                  filtro.$or.some(q => q.anio === p.anio && q.mes === p.mes)
                );
              }
              return [...periodosCerrados];
            }
          })
        };
      }
      // Colecciones de documentos (ventas_v2, compras_v2, etc.)
      return {
        findOne: async (filtro) => {
          const key = `${nombre}:${filtro._id}`;
          if (documentos[key]) return documentos[key];
          if (docs.has(key)) return docs.get(key);
          return null;
        }
      };
    }
  };
}

/** Crea un mock de `req` y `res` para el middleware. */
function crearReqRes({ method = 'POST', baseUrl = '/api/ventas', params = {}, body = {}, query = {} } = {}) {
  const req = {
    method,
    baseUrl,
    params,
    body,
    query,
    db: null
  };
  const captured = { status: null, body: null, nextCalled: false, nextErr: undefined };
  const res = {
    status(code) { captured.status = code; return this; },
    json(obj) { captured.body = obj; return this; }
  };
  const next = (err) => {
    captured.nextCalled = true;
    captured.nextErr = err;
  };
  return { req, res, next, captured };
}

// ============================================================
// MESES / HELPERS
// ============================================================
describe('periodos · MESES', () => {
  test('tiene los 12 meses', () => {
    assert.equal(MESES.length, 12);
    assert.equal(MESES[0], 'Enero');
    assert.equal(MESES[11], 'Diciembre');
  });

  test('está congelado', () => {
    assert.throws(() => { MESES.push('mío'); }, TypeError);
  });

  test('getMeses devuelve copia modificable', () => {
    const copia = getMeses();
    copia.push('extra');
    assert.equal(MESES.length, 12);
    assert.equal(copia.length, 13);
  });
});

describe('periodos · nombrePeriodo', () => {
  test('compone el nombre correctamente', () => {
    assert.equal(nombrePeriodo(2024, 3), 'Marzo 2024');
    assert.equal(nombrePeriodo(2024, 12), 'Diciembre 2024');
  });

  test('mes inválido → fallback', () => {
    assert.equal(nombrePeriodo(2024, 99), 'Mes 99 2024');
  });
});

// ============================================================
// DETECCIÓN DE COLECCIÓN
// ============================================================
describe('periodos · detectarColeccion', () => {
  test('detecta ventas', () => {
    assert.equal(_detectarColeccion('/api/ventas'), 'ventas_v2');
    assert.equal(_detectarColeccion('/api/ventas/123'), 'ventas_v2');
  });

  test('detecta compras', () => {
    assert.equal(_detectarColeccion('/api/compras'), 'compras_v2');
  });

  test('detecta retenciones', () => {
    assert.equal(_detectarColeccion('/api/retenciones'), 'retenciones');
  });

  test('case-insensitive', () => {
    assert.equal(_detectarColeccion('/API/VENTAS'), 'ventas_v2');
  });

  test('no matchea falsos positivos', () => {
    // `/api/ventas-algo` NO es lo mismo que `/api/ventas`.
    // Aun así, como `startsWith('/api/ventas')`, sí matchea — comportamiento documentado.
    assert.equal(_detectarColeccion('/api/ventas-algo'), 'ventas_v2');
    // Pero algo que no empiece con un prefijo conocido → null.
    assert.equal(_detectarColeccion('/api/algo-nuevo'), null);
    assert.equal(_detectarColeccion('/otra-ruta'), null);
  });

  test('null/vacío → null', () => {
    assert.equal(_detectarColeccion(null), null);
    assert.equal(_detectarColeccion(''), null);
    assert.equal(_detectarColeccion(undefined), null);
  });

  test('_detectarColeccionConMapa permite override', () => {
    const mapa = [{ prefijo: '/api/mi-ruta', coleccion: 'mi_coleccion' }];
    assert.equal(_detectarColeccionConMapa('/api/mi-ruta/x', mapa), 'mi_coleccion');
    assert.equal(_detectarColeccionConMapa('/api/ventas', mapa), null);
  });
});

// ============================================================
// NORMALIZACIÓN DE FECHAS
// ============================================================
describe('periodos · esFechaParseable / normalizarFecha', () => {
  test('fecha válida', () => {
    assert.equal(_esFechaParseable('2024-03-31'), true);
    assert.equal(_esFechaParseable(new Date()), true);
    assert.equal(_esFechaParseable(Date.now()), true);
  });

  test('fecha inválida', () => {
    assert.equal(_esFechaParseable('basura'), false);
    assert.equal(_esFechaParseable(''), false);
    assert.equal(_esFechaParseable(null), false);
    assert.equal(_esFechaParseable(undefined), false);
  });

  test('normalizarFecha devuelve Date o null', () => {
    assert.ok(_normalizarFecha('2024-03-31') instanceof Date);
    assert.equal(_normalizarFecha('basura'), null);
    assert.equal(_normalizarFecha(null), null);
  });
});

// ============================================================
// TZ ECUADOR: TESTS DE NEGOCIO
// ============================================================
describe('periodos · TZ Ecuador', () => {
  test('cierre 21:00 EC del 31 marzo pertenece a Marzo', async () => {
    // 2024-03-31 21:00 EC = 2024-04-01 02:00 UTC
    const fechaEmision = new Date('2024-04-01T02:00:00.000Z');
    const db = crearMockDb({
      periodosCerrados: [{ _id: 'x', anio: 2024, mes: 3, fecha_cierre: new Date() }]
    });

    const p = await obtenerPeriodoCerrado(db, fechaEmision);
    assert.ok(p);
    assert.equal(p.mes, 3);
  });

  test('emisión 22:00 EC del 30 abril → Abril', async () => {
    // 2024-04-30 22:00 EC = 2024-05-01 03:00 UTC
    const fechaEmision = new Date('2024-05-01T03:00:00.000Z');
    const db = crearMockDb({
      periodosCerrados: [{ _id: 'x', anio: 2024, mes: 4 }]
    });

    const p = await obtenerPeriodoCerrado(db, fechaEmision);
    assert.ok(p);
    assert.equal(p.mes, 4);
  });
});

// ============================================================
// obtenerPeriodoCerrado
// ============================================================
describe('periodos · obtenerPeriodoCerrado', () => {
  test('devuelve null si no está cerrado', async () => {
    const db = crearMockDb();
    const p = await obtenerPeriodoCerrado(db, '2024-03-15');
    assert.equal(p, null);
  });

  test('devuelve null con fecha inválida', async () => {
    const db = crearMockDb();
    assert.equal(await obtenerPeriodoCerrado(db, 'basura'), null);
    assert.equal(await obtenerPeriodoCerrado(db, null), null);
  });

  test('cachea por request', async () => {
    let llamadas = 0;
    const db = {
      collection: () => ({
        findOne: async () => { llamadas++; return null; }
      })
    };
    const req = {};
    await obtenerPeriodoCerrado(db, '2024-03-15', { req });
    await obtenerPeriodoCerrado(db, '2024-03-20', { req });
    // Ambos son del mismo mes (marzo 2024) → una sola llamada.
    assert.equal(llamadas, 1);
  });
});

// ============================================================
// estaPeriodoCerrado / assertPeriodoAbierto
// ============================================================
describe('periodos · estaPeriodoCerrado', () => {
  test('true si cerrado', async () => {
    const db = crearMockDb({ periodosCerrados: [{ anio: 2024, mes: 3 }] });
    assert.equal(await estaPeriodoCerrado(db, '2024-03-15'), true);
  });

  test('false si abierto', async () => {
    const db = crearMockDb({ periodosCerrados: [] });
    assert.equal(await estaPeriodoCerrado(db, '2024-03-15'), false);
  });
});

describe('periodos · assertPeriodoAbierto', () => {
  test('no lanza si abierto', async () => {
    const db = crearMockDb();
    await assert.doesNotReject(() => assertPeriodoAbierto(db, '2024-03-15'));
  });

  test('lanza si cerrado con codigo tipado', async () => {
    const db = crearMockDb({ periodosCerrados: [{ anio: 2024, mes: 3 }] });
    await assert.rejects(
      () => assertPeriodoAbierto(db, '2024-03-15'),
      (err) => err.codigo === 'PERIODO_CERRADO' && err.status === 423
    );
  });
});

// ============================================================
// obtenerPeriodosCerradosEnFechas
// ============================================================
describe('periodos · obtenerPeriodosCerradosEnFechas', () => {
  test('devuelve [] con array vacío', async () => {
    const db = crearMockDb();
    assert.deepEqual(await obtenerPeriodosCerradosEnFechas(db, []), []);
  });

  test('deduplica por mes', async () => {
    const db = crearMockDb({ periodosCerrados: [{ anio: 2024, mes: 3 }] });
    const r = await obtenerPeriodosCerradosEnFechas(db, [
      '2024-03-01', '2024-03-15', '2024-03-30'
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].nombre, 'Marzo 2024');
  });

  test('incluye meses distintos', async () => {
    const db = crearMockDb({
      periodosCerrados: [
        { anio: 2024, mes: 3 },
        { anio: 2024, mes: 4 }
      ]
    });
    const r = await obtenerPeriodosCerradosEnFechas(db, [
      '2024-03-15', '2024-04-10'
    ]);
    assert.equal(r.length, 2);
  });
});

// ============================================================
// MIDDLEWARE verificarPeriodoAbierto
// ============================================================
describe('periodos · middleware verificarPeriodoAbierto', () => {
  test('POST con fecha en período cerrado → 423', async () => {
    const db = crearMockDb({ periodosCerrados: [{ anio: 2024, mes: 3 }] });
    const { req, res, next, captured } = crearReqRes({
      method: 'POST',
      body: { fecha_emision: '2024-03-15' }
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.status, 423);
    assert.equal(captured.body.codigo, 'PERIODO_CERRADO');
    assert.equal(captured.nextCalled, false);
  });

  test('POST con fecha válida → next()', async () => {
    const db = crearMockDb();
    const { req, res, next, captured } = crearReqRes({
      method: 'POST',
      body: { fecha_emision: '2024-03-15' }
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('POST sin fecha → next() sin consultar', async () => {
    const db = crearMockDb();
    const { req, res, next, captured } = crearReqRes({ method: 'POST' });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('POST con fecha inválida → 400', async () => {
    const db = crearMockDb();
    const { req, res, next, captured } = crearReqRes({
      method: 'POST',
      body: { fecha_emision: 'basura' }
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.codigo, 'FECHA_INVALIDA');
  });

  test('PUT valida la fecha ORIGINAL del documento', async () => {
    const id = new ObjectId().toString();
    const db = crearMockDb({
      periodosCerrados: [{ anio: 2024, mes: 3 }],
      documentos: {
        [`ventas_v2:${id}`]: {
          _id: new ObjectId(id),
          fecha_emision: new Date('2024-03-15'),
          total: 100
        }
      }
    });
    const { req, res, next, captured } = crearReqRes({
      method: 'PUT',
      baseUrl: '/api/ventas',
      params: { id },
      body: { fecha_emision: '2024-05-01' } // nueva fecha OK
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    // La fecha original (marzo) está cerrada → 423.
    assert.equal(captured.status, 423);
    assert.equal(captured.body.tipo_fecha, 'original');
  });

  test('PUT valida la fecha NUEVA', async () => {
    const id = new ObjectId().toString();
    const db = crearMockDb({
      periodosCerrados: [{ anio: 2024, mes: 5 }],
      documentos: {
        [`ventas_v2:${id}`]: {
          _id: new ObjectId(id),
          fecha_emision: new Date('2024-03-15') // marzo OK
        }
      }
    });
    const { req, res, next, captured } = crearReqRes({
      method: 'PUT',
      baseUrl: '/api/ventas',
      params: { id },
      body: { fecha_emision: '2024-05-10' } // nueva en período cerrado
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.status, 423);
    assert.equal(captured.body.tipo_fecha, 'nueva');
  });

  test('PUT con ambas fechas abiertas → next()', async () => {
    const id = new ObjectId().toString();
    const db = crearMockDb({
      periodosCerrados: [],
      documentos: {
        [`ventas_v2:${id}`]: {
          _id: new ObjectId(id),
          fecha_emision: new Date('2024-03-15')
        }
      }
    });
    const { req, res, next, captured } = crearReqRes({
      method: 'PUT',
      baseUrl: '/api/ventas',
      params: { id },
      body: { fecha_emision: '2024-05-10' }
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.nextCalled, true);
    assert.ok(req._documentoOriginal, 'debe exponer el doc original');
  });

  test('PUT con ID inválido → no bloquea, deja pasar', async () => {
    const db = crearMockDb();
    const { req, res, next, captured } = crearReqRes({
      method: 'PUT',
      baseUrl: '/api/ventas',
      params: { id: 'no-es-objectid' },
      body: {}
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('PUT en ruta desconocida → next() con warning', async () => {
    const id = new ObjectId().toString();
    const db = crearMockDb();
    const { req, res, next, captured } = crearReqRes({
      method: 'PUT',
      baseUrl: '/api/ruta-nueva',
      params: { id },
      body: {}
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('propaga errores con next(err)', async () => {
    const db = {
      collection: () => ({ findOne: async () => { throw new Error('DB caída'); } })
    };
    const { req, res, next, captured } = crearReqRes({
      method: 'POST',
      body: { fecha_emision: '2024-03-15' }
    });
    req.db = db;
    await verificarPeriodoAbierto()(req, res, next);
    assert.equal(captured.nextCalled, true);
    assert.ok(captured.nextErr);
    assert.match(captured.nextErr.message, /DB caída/);
  });

  test('opts.colecciones permite override', async () => {
    const id = new ObjectId().toString();
    const db = crearMockDb({
      documentos: {
        [`mi_coleccion:${id}`]: {
          _id: new ObjectId(id),
          fecha_emision: new Date('2024-03-15')
        }
      }
    });
    const { req, res, next, captured } = crearReqRes({
      method: 'PUT',
      baseUrl: '/api/mi-ruta',
      params: { id },
      body: {}
    });
    req.db = db;
    const mw = verificarPeriodoAbierto({
      colecciones: [{ prefijo: '/api/mi-ruta', coleccion: 'mi_coleccion' }]
    });
    await mw(req, res, next);
    assert.equal(captured.nextCalled, true);
    assert.ok(req._documentoOriginal);
  });
});

// ============================================================
// CONFIG
// ============================================================
describe('periodos · CONFIG', () => {
  test('expone valores esperados', () => {
    assert.equal(CONFIG.coleccionPeriodos, 'periodos_cerrados');
    assert.ok(Array.isArray(CONFIG.mapaBaseUrl));
    assert.ok(CONFIG.mapaBaseUrl.length > 0);
  });
});