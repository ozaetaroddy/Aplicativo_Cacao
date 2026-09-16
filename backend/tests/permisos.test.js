// backend/tests/permisos.test.js
// ============================================================
// Tests para utils/permisos.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  PERMISOS,
  ROLES_VALIDOS,
  ETIQUETAS_ROLES,
  tienePermiso,
  puedeAlguno,
  listarModulos,
  requierePermiso,
  requiereRol,
  esRolValido,
  assertRol,
  getPermisosDeRol,
  listarRoles,
  construirMapaPermisos,
  CONFIG,
  _deepFreeze,
  _moduloExiste
} = require('../utils/permisos');

// ============================================================
// HELPERS
// ============================================================
function crearReqRes({ rol, userId = 'u1', email = 'u@x.com' } = {}) {
  const req = {
    user: rol === null ? undefined : { userId, email, rol },
    ip: '127.0.0.1',
    originalUrl: '/api/test',
    method: 'GET'
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
// TABLAS INMUTABLES
// ============================================================
describe('permisos · tablas inmutables', () => {
  test('PERMISOS está congelado', () => {
    assert.equal(Object.isFrozen(PERMISOS), true);
    assert.equal(Object.isFrozen(PERMISOS.admin), true);
    assert.equal(Object.isFrozen(PERMISOS.admin.ventas), true);
  });

  test('no se puede mutar PERMISOS', () => {
    assert.throws(() => { PERMISOS.admin.ventas.push('borrar-todo'); }, TypeError);
    assert.throws(() => { PERMISOS.superadmin = {}; }, TypeError);
  });

  test('ROLES_VALIDOS está congelado', () => {
    assert.equal(Object.isFrozen(ROLES_VALIDOS), true);
    assert.throws(() => { ROLES_VALIDOS.push('superadmin'); }, TypeError);
  });

  test('ETIQUETAS_ROLES está congelado', () => {
    assert.equal(Object.isFrozen(ETIQUETAS_ROLES), true);
    assert.throws(() => { ETIQUETAS_ROLES.hacker = 'Hacker'; }, TypeError);
  });
});

// ============================================================
// ROLES
// ============================================================
describe('permisos · esRolValido', () => {
  test('reconoce roles válidos', () => {
    for (const rol of ROLES_VALIDOS) {
      assert.equal(esRolValido(rol), true);
    }
  });

  test('rechaza roles inexistentes', () => {
    assert.equal(esRolValido('superadmin'), false);
    assert.equal(esRolValido(''), false);
    assert.equal(esRolValido(null), false);
    assert.equal(esRolValido(undefined), false);
    assert.equal(esRolValido(42), false);
    assert.equal(esRolValido({}), false);
  });

  test('rechaza prototype pollution', () => {
    assert.equal(esRolValido('__proto__'), false);
    assert.equal(esRolValido('constructor'), false);
    assert.equal(esRolValido('toString'), false);
  });
});

describe('permisos · assertRol', () => {
  test('no lanza con rol válido', () => {
    assert.doesNotThrow(() => assertRol('admin'));
  });

  test('lanza con rol inválido', () => {
    assert.throws(
      () => assertRol('superadmin'),
      (err) => err.codigo === 'ROL_INVALIDO' && err.status === 400
    );
  });
});

// ============================================================
// tienePermiso
// ============================================================
describe('permisos · tienePermiso', () => {
  test('admin tiene todos los permisos', () => {
    assert.equal(tienePermiso('admin', 'ventas', 'ver'), true);
    assert.equal(tienePermiso('admin', 'ventas', 'eliminar'), true);
    assert.equal(tienePermiso('admin', 'usuarios', 'crear'), true);
    assert.equal(tienePermiso('admin', 'backups', 'restaurar'), true);
  });

  test('vendedor no puede eliminar ventas', () => {
    assert.equal(tienePermiso('vendedor', 'ventas', 'ver'), true);
    assert.equal(tienePermiso('vendedor', 'ventas', 'crear'), true);
    assert.equal(tienePermiso('vendedor', 'ventas', 'eliminar'), false);
    assert.equal(tienePermiso('vendedor', 'ventas', 'anular'), false);
  });

  test('auditor solo tiene lectura', () => {
    assert.equal(tienePermiso('auditor', 'ventas', 'ver'), true);
    assert.equal(tienePermiso('auditor', 'ventas', 'crear'), false);
    assert.equal(tienePermiso('auditor', 'ventas', 'eliminar'), false);
  });

  test('rol inexistente → false', () => {
    assert.equal(tienePermiso('superadmin', 'ventas', 'ver'), false);
  });

  test('módulo inexistente → false', () => {
    assert.equal(tienePermiso('admin', 'modulo-falso', 'ver'), false);
  });

  test('acción inexistente → false', () => {
    assert.equal(tienePermiso('admin', 'ventas', 'teletransportar'), false);
  });

  // ⚠️  SECURITY: prototype pollution
  test('inmune a prototype pollution (__proto__)', () => {
    assert.equal(tienePermiso('__proto__', 'ventas', 'ver'), false);
    assert.equal(tienePermiso('__proto__', 'toString', 'call'), false);
  });

  test('inmune a prototype pollution (constructor)', () => {
    assert.equal(tienePermiso('constructor', 'ventas', 'ver'), false);
    assert.equal(tienePermiso('constructor', 'toString', 'call'), false);
  });

  test('inmune a prototype pollution (toString)', () => {
    assert.equal(tienePermiso('toString', 'ventas', 'ver'), false);
  });

  test('módulo con __proto__ → false', () => {
    assert.equal(tienePermiso('admin', '__proto__', 'ver'), false);
    assert.equal(tienePermiso('admin', 'constructor', 'toString'), false);
  });

  test('rechaza tipos no-string', () => {
    assert.equal(tienePermiso(null, 'ventas', 'ver'), false);
    assert.equal(tienePermiso('admin', null, 'ver'), false);
    assert.equal(tienePermiso('admin', 'ventas', null), false);
    assert.equal(tienePermiso({}, 'ventas', 'ver'), false);
    assert.equal(tienePermiso('admin', {}, 'ver'), false);
    assert.equal(tienePermiso('admin', 'ventas', []), false);
  });

  test('rechaza strings vacíos', () => {
    assert.equal(tienePermiso('', 'ventas', 'ver'), false);
    assert.equal(tienePermiso('admin', '', 'ver'), false);
    assert.equal(tienePermiso('admin', 'ventas', ''), false);
    assert.equal(tienePermiso('admin', '   ', 'ver'), false);
  });
});

// ============================================================
// puedeAlguno
// ============================================================
describe('permisos · puedeAlguno', () => {
  test('true si tiene alguno', () => {
    const checks = [
      { modulo: 'usuarios', accion: 'crear' },
      { modulo: 'ventas', accion: 'ver' }
    ];
    assert.equal(puedeAlguno('vendedor', checks), true); // ventas:ver
  });

  test('false si no tiene ninguno', () => {
    const checks = [
      { modulo: 'usuarios', accion: 'crear' },
      { modulo: 'backups', accion: 'restaurar' }
    ];
    assert.equal(puedeAlguno('vendedor', checks), false);
  });

  test('array vacío → false', () => {
    assert.equal(puedeAlguno('admin', []), false);
  });

  test('no-array → false', () => {
    assert.equal(puedeAlguno('admin', null), false);
    assert.equal(puedeAlguno('admin', 'abc'), false);
  });

  test('ignora checks malformados', () => {
    const checks = [null, {}, { modulo: 'ventas' }, { accion: 'ver' }];
    assert.equal(puedeAlguno('admin', checks), false);
  });
});

// ============================================================
// listarModulos
// ============================================================
describe('permisos · listarModulos', () => {
  test('devuelve módulos con acciones', () => {
    const modulos = listarModulos('admin');
    assert.ok(modulos.length > 0);
    const ventas = modulos.find(m => m.modulo === 'ventas');
    assert.ok(ventas);
    assert.ok(ventas.acciones.includes('ver'));
  });

  test('excluye módulos sin acciones', () => {
    const modulos = listarModulos('vendedor');
    // vendedor tiene ventas: ['ver', 'crear'] → aparece
    assert.ok(modulos.some(m => m.modulo === 'ventas'));
    // vendedor tiene usuarios: [] → NO aparece
    assert.ok(!modulos.some(m => m.modulo === 'usuarios'));
  });

  test('rol inválido → []', () => {
    assert.deepEqual(listarModulos('hacker'), []);
  });

  test('devuelve copias, no referencias internas', () => {
    const modulos = listarModulos('admin');
    const ventas = modulos.find(m => m.modulo === 'ventas');
    const original = [...ventas.acciones];
    ventas.acciones.push('mutar');
    // La tabla interna no debe cambiar.
    const modulos2 = listarModulos('admin');
    const ventas2 = modulos2.find(m => m.modulo === 'ventas');
    assert.deepEqual(ventas2.acciones, original);
  });
});

// ============================================================
// getPermisosDeRol
// ============================================================
describe('permisos · getPermisosDeRol', () => {
  test('devuelve copia frozen', () => {
    const p = getPermisosDeRol('admin');
    assert.ok(p);
    assert.equal(Object.isFrozen(p), true);
    assert.ok(p.ventas.includes('ver'));
  });

  test('rol inválido → null', () => {
    assert.equal(getPermisosDeRol('hacker'), null);
  });

  test('mutar el retorno no afecta al original', () => {
    const p = getPermisosDeRol('admin');
    assert.throws(() => { p.ventas.push('mutar'); }, TypeError);
  });
});

// ============================================================
// listarRoles
// ============================================================
describe('permisos · listarRoles', () => {
  test('devuelve todos los roles con etiqueta', () => {
    const roles = listarRoles();
    assert.equal(roles.length, ROLES_VALIDOS.length);
    assert.ok(roles.some(r => r.rol === 'admin' && r.etiqueta === 'Administrador'));
    assert.ok(roles.some(r => r.rol === 'vendedor' && r.etiqueta === 'Vendedor'));
  });
});

// ============================================================
// construirMapaPermisos
// ============================================================
describe('permisos · construirMapaPermisos', () => {
  test('devuelve Set con claves modulo:accion', () => {
    const mapa = construirMapaPermisos('admin');
    assert.ok(mapa instanceof Set);
    assert.ok(mapa.has('ventas:ver'));
    assert.ok(mapa.has('ventas:eliminar'));
  });

  test('rol inválido → set vacío', () => {
    const mapa = construirMapaPermisos('hacker');
    assert.equal(mapa.size, 0);
  });

  test('vendedor no tiene usuarios', () => {
    const mapa = construirMapaPermisos('vendedor');
    assert.ok(!mapa.has('usuarios:crear'));
  });
});

// ============================================================
// MIDDLEWARE requierePermiso
// ============================================================
describe('permisos · requierePermiso', () => {
  test('sin usuario → 401 NO_AUTENTICADO', () => {
    const mw = requierePermiso('ventas', 'ver');
    const { req, res, next, captured } = crearReqRes({ rol: null });
    mw(req, res, next);
    assert.equal(captured.status, 401);
    assert.equal(captured.body.codigo, 'NO_AUTENTICADO');
  });

  test('rol inválido → 403 ROL_INVALIDO', () => {
    const mw = requierePermiso('ventas', 'ver');
    const { req, res, next, captured } = crearReqRes({ rol: 'superadmin' });
    mw(req, res, next);
    assert.equal(captured.status, 403);
    assert.equal(captured.body.codigo, 'ROL_INVALIDO');
  });

  test('sin permiso → 403 SIN_PERMISO', () => {
    const mw = requierePermiso('usuarios', 'eliminar');
    const { req, res, next, captured } = crearReqRes({ rol: 'vendedor' });
    mw(req, res, next);
    assert.equal(captured.status, 403);
    assert.equal(captured.body.codigo, 'SIN_PERMISO');
    assert.equal(captured.body.modulo, 'usuarios');
    assert.equal(captured.body.accion, 'eliminar');
  });

  test('con permiso → next()', () => {
    const mw = requierePermiso('ventas', 'ver');
    const { req, res, next, captured } = crearReqRes({ rol: 'vendedor' });
    mw(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('lanza al construir con modulo/accion vacíos', () => {
    assert.throws(() => requierePermiso('', 'ver'));
    assert.throws(() => requierePermiso('ventas', ''));
    assert.throws(() => requierePermiso(null, 'ver'));
  });

  test('_moduloExiste detecta módulos válidos', () => {
    assert.equal(_moduloExiste('ventas'), true);
    assert.equal(_moduloExiste('modulo-falso'), false);
  });
});

// ============================================================
// MIDDLEWARE requiereRol
// ============================================================
describe('permisos · requiereRol', () => {
  test('acepta variadic', () => {
    const mw = requiereRol('admin', 'contador');
    const { req, res, next, captured } = crearReqRes({ rol: 'contador' });
    mw(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('acepta array', () => {
    const mw = requiereRol(['admin', 'contador']);
    const { req, res, next, captured } = crearReqRes({ rol: 'admin' });
    mw(req, res, next);
    assert.equal(captured.nextCalled, true);
  });

  test('sin usuario → 401', () => {
    const mw = requiereRol('admin');
    const { req, res, next, captured } = crearReqRes({ rol: null });
    mw(req, res, next);
    assert.equal(captured.status, 401);
    assert.equal(captured.body.codigo, 'NO_AUTENTICADO');
  });

  test('rol válido pero no permitido → 403 SIN_PERMISO', () => {
    const mw = requiereRol('admin');
    const { req, res, next, captured } = crearReqRes({ rol: 'vendedor' });
    mw(req, res, next);
    assert.equal(captured.status, 403);
    assert.equal(captured.body.codigo, 'SIN_PERMISO');
  });

  test('rol inválido → 403 ROL_INVALIDO', () => {
    const mw = requiereRol('admin');
    const { req, res, next, captured } = crearReqRes({ rol: 'superadmin' });
    mw(req, res, next);
    assert.equal(captured.status, 403);
    assert.equal(captured.body.codigo, 'ROL_INVALIDO');
  });

  test('lanza sin argumentos', () => {
    assert.throws(() => requiereRol());
  });
});

// ============================================================
// CONFIG
// ============================================================
describe('permisos · CONFIG', () => {
  test('expone valores esperados', () => {
    assert.equal(typeof CONFIG.throwEnConstruccion, 'boolean');
    assert.equal(typeof CONFIG.auditDenegados, 'boolean');
  });
});

// ============================================================
// deepFreeze
// ============================================================
describe('permisos · deepFreeze', () => {
  test('congela recursivamente', () => {
    const obj = { a: { b: { c: [1, 2, 3] } } };
    _deepFreeze(obj);
    assert.equal(Object.isFrozen(obj), true);
    assert.equal(Object.isFrozen(obj.a), true);
    assert.equal(Object.isFrozen(obj.a.b), true);
    assert.equal(Object.isFrozen(obj.a.b.c), true);
  });

  test('no explota con ciclos', () => {
    const obj = { a: 1 };
    obj.self = obj;
    assert.doesNotThrow(() => _deepFreeze(obj));
  });

  test('primitivos no se tocan', () => {
    assert.equal(_deepFreeze(null), null);
    assert.equal(_deepFreeze(42), 42);
    assert.equal(_deepFreeze('x'), 'x');
  });
});