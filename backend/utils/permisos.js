// backend/utils/permisos.js
// ============================================================
// Roles y permisos granulares (RBAC)
// ------------------------------------------------------------
// Tablas:
//   PERMISOS[rol][modulo] = string[]   (acciones permitidas)
//
// API pública:
//   PERMISOS                    → tabla deep-frozen
//   ROLES_VALIDOS               → array frozen con los roles
//   ETIQUETAS_ROLES             → mapa rol → nombre legible
//   tienePermiso(rol, mod, acc) → boolean
//   puedeAlguno(rol, checks)    → boolean
//   listarModulos(rol)          → [{ modulo, acciones }]
//   requierePermiso(mod, acc)   → middleware Express
//   requiereRol(...roles)       → middleware Express
//
// Extensiones:
//   esRolValido(rol)            → boolean
//   getPermisosDeRol(rol)       → tabla frozen del rol
//   listarRoles()               → [{ rol, etiqueta, modulos }]
//   assertRol(rol)              → lanza error tipado
//   construirMapaPermisos(rol)  → Set('modulo:accion')
//
// Defensas:
//   - Tablas inmutables (deep freeze) → imposible escalar permisos
//     por mutación desde otro módulo.
//   - Accesos con `Object.hasOwn` → inmune a prototype pollution
//     (`__proto__`, `constructor`, `toString`, etc.).
//   - Códigos de error estables: NO_AUTENTICADO, SIN_PERMISO, ROL_INVALIDO.
//   - Auditoría de denegaciones vía `logger`.
//   - Warning al arrancar si un módulo/rol declarado en un
//     middleware no existe (catches typos en código).
// ============================================================
'use strict';

const log = require('./logger');

// ============================================================
// CONFIGURACIÓN
// ============================================================
function envBool(nombre, fallback = false) {
  const raw = process.env[nombre];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const CONFIG = Object.freeze({
  /**
   * Si `true`, lanza al construir un middleware con módulo/acción
   * desconocidos. Si `false`, solo emite warning.
   *
   * Recomendado en `true` para detectar typos en CI.
   */
  throwEnConstruccion: envBool('PERMISOS_THROW_CONSTRUCCION', false),

  /** Auditar (logear) denegaciones de permiso. */
  auditDenegados: envBool('PERMISOS_AUDIT_DENEGADOS', true)
});

// ============================================================
// HELPERS INTERNOS
// ============================================================
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Congela un objeto/array profundamente.
 * Detecta ciclos con WeakSet.
 */
function deepFreeze(obj, vistos = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (vistos.has(obj)) return obj;
  vistos.add(obj);
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key], vistos);
  }
  return obj;
}

/** Error tipado estándar del proyecto. */
function errorTipado(mensaje, codigo, status) {
  const err = new Error(mensaje);
  err.codigo = codigo;
  if (status) err.status = status;
  return err;
}

/** Valida que un valor sea un string no vacío. */
function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// ============================================================
// TABLA DE PERMISOS
// ------------------------------------------------------------
// Formato: PERMISOS[rol][modulo] = string[] (acciones).
// `[]` significa "rol sin acceso a ese módulo" (explícito).
// ============================================================
const PERMISOS = deepFreeze({
  admin: {
    ventas: ['ver', 'crear', 'editar', 'eliminar', 'anular'],
    compras: ['ver', 'crear', 'editar', 'eliminar', 'anular'],
    clientes: ['ver', 'crear', 'editar', 'eliminar'],
    proveedores: ['ver', 'crear', 'editar', 'eliminar'],
    productos: ['ver', 'crear', 'editar', 'eliminar'],
    categorias: ['ver', 'crear', 'editar', 'eliminar'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    pagos: ['ver', 'crear', 'eliminar'],
    inventario: ['ver', 'editar', 'ajustar'],
    kardex: ['ver'],
    reportes: ['ver', 'exportar'],
    auditoria: ['ver'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar'],
    backups: ['ver', 'crear', 'restaurar', 'eliminar'],
    configuracion: ['ver', 'editar'],
    contadores: ['ver', 'editar'],
    certificados: ['ver', 'crear', 'eliminar'],
    sri: ['ver', 'enviar', 'consultar'],
    periodos: ['ver', 'cerrar', 'reabrir'],
    anexos: ['ver', 'generar'],
    email: ['enviar', 'ver']
  },

  contador: {
    ventas: ['ver', 'crear', 'editar', 'anular'],
    compras: ['ver', 'crear', 'editar', 'anular'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver', 'crear', 'editar'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    pagos: ['ver', 'crear', 'eliminar'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver', 'exportar'],
    auditoria: ['ver'],
    usuarios: [],
    backups: ['ver'],
    configuracion: ['ver'],
    contadores: ['ver'],
    certificados: ['ver'],
    sri: ['ver', 'enviar', 'consultar'],
    periodos: ['ver', 'cerrar'],
    anexos: ['ver', 'generar'],
    email: ['enviar', 'ver']
  },

  vendedor: {
    ventas: ['ver', 'crear'],
    compras: ['ver'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: [],
    pagos: ['ver', 'crear'],
    inventario: ['ver'],
    kardex: [],
    reportes: [],
    auditoria: [],
    usuarios: [],
    backups: [],
    configuracion: [],
    contadores: ['ver'],
    certificados: [],
    sri: ['ver'],
    periodos: [],
    anexos: [],
    email: ['enviar']
  },

  bodeguero: {
    ventas: ['ver'],
    compras: ['ver', 'crear', 'editar'],
    clientes: [],
    proveedores: ['ver', 'crear', 'editar'],
    productos: ['ver', 'crear', 'editar'],
    categorias: ['ver', 'crear', 'editar'],
    retenciones: [],
    pagos: [],
    inventario: ['ver', 'editar', 'ajustar'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: [],
    usuarios: [],
    backups: [],
    configuracion: [],
    contadores: ['ver'],
    certificados: [],
    sri: [],
    periodos: [],
    anexos: [],
    email: []
  },

  auditor: {
    ventas: ['ver'],
    compras: ['ver'],
    clientes: ['ver'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver'],
    pagos: ['ver'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver', 'exportar'],
    auditoria: ['ver'],
    usuarios: [],
    backups: ['ver'],
    configuracion: ['ver'],
    contadores: ['ver'],
    certificados: ['ver'],
    sri: ['ver'],
    periodos: ['ver'],
    anexos: ['ver'],
    email: []
  }
});

const ROLES_VALIDOS = Object.freeze(Object.keys(PERMISOS));
const _ROLES_SET = new Set(ROLES_VALIDOS);

const ETIQUETAS_ROLES = deepFreeze({
  admin: 'Administrador',
  contador: 'Contador',
  vendedor: 'Vendedor',
  bodeguero: 'Bodeguero',
  auditor: 'Auditor'
});

// ============================================================
// CONSULTAS
// ============================================================
/** `true` si el rol existe en la tabla. */
function esRolValido(rol) {
  return typeof rol === 'string' && _ROLES_SET.has(rol);
}

/** Lanza un error tipado si el rol no es válido. */
function assertRol(rol) {
  if (!esRolValido(rol)) {
    throw errorTipado(
      `Rol inválido: "${rol}" (válidos: ${ROLES_VALIDOS.join(', ')})`,
      'ROL_INVALIDO',
      400
    );
  }
  return rol;
}

/**
 * `true` si `rol` puede ejecutar `accion` sobre `modulo`.
 *
 * Inmune a:
 *   - tipos inválidos (objeto/array/null → false)
 *   - prototype pollution (`__proto__`, `constructor`, etc.)
 *   - roles desconocidos
 *
 * @param {string} rol
 * @param {string} modulo
 * @param {string} accion
 * @returns {boolean}
 */
function tienePermiso(rol, modulo, accion) {
  // 1. Tipos.
  if (!esStringNoVacio(rol)) return false;
  if (!esStringNoVacio(modulo)) return false;
  if (!esStringNoVacio(accion)) return false;

  // 2. Rol existe (hasOwn evita `__proto__`, `constructor`).
  if (!hasOwn(PERMISOS, rol)) return false;

  const tablaRol = PERMISOS[rol];
  if (!tablaRol || typeof tablaRol !== 'object') return false;

  // 3. Módulo existe en el rol.
  if (!hasOwn(tablaRol, modulo)) return false;

  const permisosModulo = tablaRol[modulo];
  if (!Array.isArray(permisosModulo)) return false;

  return permisosModulo.includes(accion);
}

/**
 * `true` si el rol puede ejecutar AL MENOS UNO de los checks.
 * @param {string} rol
 * @param {Array<{modulo: string, accion: string}>} checks
 * @returns {boolean}
 */
function puedeAlguno(rol, checks = []) {
  if (!Array.isArray(checks) || checks.length === 0) return false;
  return checks.some(c =>
    c && typeof c === 'object' &&
    tienePermiso(rol, c.modulo, c.accion)
  );
}

/**
 * Lista los módulos (con sus acciones) a los que el rol tiene acceso.
 * Devuelve COPIAS — el caller no puede mutar la tabla interna.
 *
 * @param {string} rol
 * @returns {Array<{modulo: string, acciones: string[]}>}
 */
function listarModulos(rol) {
  if (!esRolValido(rol)) return [];
  const tabla = PERMISOS[rol];
  const out = [];
  for (const modulo of Object.keys(tabla)) {
    const acciones = tabla[modulo];
    if (Array.isArray(acciones) && acciones.length > 0) {
      out.push({ modulo, acciones: [...acciones] });
    }
  }
  return out;
}

/**
 * Devuelve una copia completa de los permisos del rol (frozen).
 * Útil para enviar al frontend y renderizar menús.
 */
function getPermisosDeRol(rol) {
  if (!esRolValido(rol)) return null;
  const tabla = PERMISOS[rol];
  const copia = {};
  for (const modulo of Object.keys(tabla)) {
    copia[modulo] = Object.freeze([...tabla[modulo]]); ;
  }
  return Object.freeze(copia);
}

/**
 * Devuelve un `Set` de claves `'modulo:accion'` para chequeos O(1).
 * Ideal para iterar muchos recursos sin llamar `tienePermiso` N veces.
 */
function construirMapaPermisos(rol) {
  const mapa = new Set();
  if (!esRolValido(rol)) return mapa;
  const tabla = PERMISOS[rol];
  for (const modulo of Object.keys(tabla)) {
    for (const accion of tabla[modulo]) {
      mapa.add(`${modulo}:${accion}`);
    }
  }
  return mapa;
}

/**
 * Lista todos los roles con su etiqueta y módulos.
 * Útil para dropdowns de administración.
 * @returns {Array<{rol: string, etiqueta: string, modulos: Array}>}
 */
function listarRoles() {
  return ROLES_VALIDOS.map(rol => ({
    rol,
    etiqueta: ETIQUETAS_ROLES[rol] || rol,
    modulos: listarModulos(rol)
  }));
}

// ============================================================
// MIDDLEWARES
// ============================================================

/** `true` si el módulo existe en al menos un rol. */
function moduloExiste(modulo) {
  for (const rol of ROLES_VALIDOS) {
    if (hasOwn(PERMISOS[rol], modulo)) return true;
  }
  return false;
}

/**
 * Registra un warning (o lanza) si el módulo/acción no existen en
 * NINGÚN rol. Sirve para detectar typos en el código al arrancar.
 */
function validarModuloAccionEnConstruccion(modulo, accion) {
  const problemas = [];
  if (!moduloExiste(modulo)) {
    problemas.push(`Módulo "${modulo}" no existe en ningún rol`);
  } else {
    // ¿Algún rol tiene esa acción en ese módulo?
    let existeAccion = false;
    for (const rol of ROLES_VALIDOS) {
      const tabla = PERMISOS[rol];
      if (hasOwn(tabla, modulo) && tabla[modulo].includes(accion)) {
        existeAccion = true;
        break;
      }
    }
    if (!existeAccion) {
      problemas.push(`Acción "${accion}" no existe para el módulo "${modulo}"`);
    }
  }
  if (problemas.length > 0) {
    const msg = problemas.join('. ');
    if (CONFIG.throwEnConstruccion) {
      throw errorTipado(msg, 'PERMISO_INVALIDO_EN_CODIGO');
    }
    log.warn({ modulo, accion }, `⚠️  requierePermiso: ${msg}`);
  }
}

/**
 * Middleware que exige permiso `[modulo, accion]`.
 * @param {string} modulo
 * @param {string} accion
 * @returns {import('express').RequestHandler}
 */
function requierePermiso(modulo, accion) {
  if (!esStringNoVacio(modulo) || !esStringNoVacio(accion)) {
    throw errorTipado(
      'requierePermiso requiere (modulo, accion) no vacíos',
      'ARGUMENTOS_INVALIDOS'
    );
  }
  validarModuloAccionEnConstruccion(modulo, accion);

  return function middlewareRequierePermiso(req, res, next) {
    const user = req.user;
    const rol = user?.rol;

    // ---- 1. Sin autenticación ----
    if (!user || !rol) {
      return res.status(401).json({
        error: 'Usuario no autenticado',
        codigo: 'NO_AUTENTICADO'
      });
    }

    // ---- 2. Rol inválido (token manipulado o BD corrupta) ----
    if (!esRolValido(rol)) {
      if (CONFIG.auditDenegados) {
        log.warn(
          {
            userId: user.userId,
            email: user.email,
            rol,
            modulo,
            accion,
            ip: req.ip,
            ruta: req.originalUrl
          },
          '🚨 Rol inválido en request autenticada'
        );
      }
      return res.status(403).json({
        error: 'Rol de usuario inválido',
        codigo: 'ROL_INVALIDO',
        rol
      });
    }

    // ---- 3. Sin permiso ----
    if (!tienePermiso(rol, modulo, accion)) {
      if (CONFIG.auditDenegados) {
        log.warn(
          {
            userId: user.userId,
            email: user.email,
            rol,
            modulo,
            accion,
            ip: req.ip,
            ruta: req.originalUrl,
            metodo: req.method
          },
          'Permiso denegado'
        );
      }
      return res.status(403).json({
        error: `No tiene permiso para "${accion}" en "${modulo}"`,
        codigo: 'SIN_PERMISO',
        modulo,
        accion,
        rol
      });
    }

    return next();
  };
}

/**
 * Middleware que exige que el usuario tenga uno de los roles indicados.
 *
 * Acepta dos formas:
 *   requiereRol('admin', 'contador')
 *   requiereRol(['admin', 'contador'])
 *
 * @param {...string|string[]} rolesPermitidos
 * @returns {import('express').RequestHandler}
 */
function requiereRol(...rolesPermitidos) {
  // Normaliza: si el primer arg es array, úsalo.
  const lista = Array.isArray(rolesPermitidos[0])
    ? rolesPermitidos[0]
    : rolesPermitidos;

  if (lista.length === 0) {
    throw errorTipado(
      'requiereRol requiere al menos un rol',
      'ARGUMENTOS_INVALIDOS'
    );
  }

  // Validar contra ROLES_VALIDOS (avisa de typos).
  const invalidos = lista.filter(r => !esRolValido(r));
  if (invalidos.length > 0) {
    const msg = `Roles inválidos en requiereRol: ${invalidos.join(', ')}. ` +
                `Válidos: ${ROLES_VALIDOS.join(', ')}`;
    if (CONFIG.throwEnConstruccion) {
      throw errorTipado(msg, 'ROL_INVALIDO_EN_CODIGO');
    }
    log.warn({ rolesInvalidos: invalidos }, `⚠️  ${msg}`);
  }

  const listaCongelada = Object.freeze([...lista]);

  return function middlewareRequiereRol(req, res, next) {
    const user = req.user;
    const rol = user?.rol;

    if (!user || !rol) {
      return res.status(401).json({
        error: 'Usuario no autenticado',
        codigo: 'NO_AUTENTICADO'
      });
    }

    if (!esRolValido(rol)) {
      if (CONFIG.auditDenegados) {
        log.warn(
          {
            userId: user.userId,
            email: user.email,
            rol,
            rolesPermitidos: listaCongelada,
            ip: req.ip,
            ruta: req.originalUrl
          },
          '🚨 Rol inválido en request autenticada'
        );
      }
      return res.status(403).json({
        error: 'Rol de usuario inválido',
        codigo: 'ROL_INVALIDO',
        rol
      });
    }

    if (!listaCongelada.includes(rol)) {
      if (CONFIG.auditDenegados) {
        log.warn(
          {
            userId: user.userId,
            email: user.email,
            rol,
            rolesPermitidos: listaCongelada,
            ip: req.ip,
            ruta: req.originalUrl
          },
          'Permiso por rol denegado'
        );
      }
      return res.status(403).json({
        error: 'No tiene permisos para esta acción',
        codigo: 'SIN_PERMISO',
        rolesPermitidos: [...listaCongelada],
        rol
      });
    }

    return next();
  };
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // ---- API original ----
  PERMISOS,
  ROLES_VALIDOS,
  ETIQUETAS_ROLES,
  tienePermiso,
  puedeAlguno,
  listarModulos,
  requierePermiso,
  requiereRol,

  // ---- Extensiones ----
  esRolValido,
  assertRol,
  getPermisosDeRol,
  listarRoles,
  construirMapaPermisos,

  // ---- Constantes ----
  CONFIG
};

// ---- Solo para tests ----
module.exports._deepFreeze = deepFreeze;
module.exports._hasOwn = hasOwn;
module.exports._errorTipado = errorTipado;
module.exports._esStringNoVacio = esStringNoVacio;
module.exports._moduloExiste = moduloExiste;
module.exports._ROLES_SET = _ROLES_SET;