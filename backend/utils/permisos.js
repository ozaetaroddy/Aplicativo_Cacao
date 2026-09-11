// backend/utils/permisos.js
// Definición de roles y permisos granulares

const PERMISOS = {
  admin: {
    ventas: ['ver', 'crear', 'editar', 'eliminar'],
    compras: ['ver', 'crear', 'editar', 'eliminar'],
    clientes: ['ver', 'crear', 'editar', 'eliminar'],
    proveedores: ['ver', 'crear', 'editar', 'eliminar'],
    productos: ['ver', 'crear', 'editar', 'eliminar'],
    categorias: ['ver', 'crear', 'editar', 'eliminar'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    inventario: ['ver', 'editar'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: ['ver'],
    usuarios: ['ver', 'crear', 'editar', 'eliminar']
  },
  contador: {
    ventas: ['ver', 'crear', 'editar'],
    compras: ['ver', 'crear', 'editar'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver', 'crear', 'editar'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver', 'crear', 'editar', 'eliminar'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: ['ver'],
    usuarios: []
  },
  vendedor: {
    ventas: ['ver', 'crear'],
    compras: ['ver'],
    clientes: ['ver', 'crear', 'editar'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: [],
    inventario: ['ver'],
    kardex: [],
    reportes: [],
    auditoria: [],
    usuarios: []
  },
  bodeguero: {
    ventas: [],
    compras: ['ver', 'crear'],
    clientes: [],
    proveedores: ['ver'],
    productos: ['ver', 'crear', 'editar'],
    categorias: ['ver'],
    retenciones: [],
    inventario: ['ver', 'editar'],
    kardex: ['ver'],
    reportes: [],
    auditoria: [],
    usuarios: []
  },
  auditor: {
    ventas: ['ver'],
    compras: ['ver'],
    clientes: ['ver'],
    proveedores: ['ver'],
    productos: ['ver'],
    categorias: ['ver'],
    retenciones: ['ver'],
    inventario: ['ver'],
    kardex: ['ver'],
    reportes: ['ver'],
    auditoria: ['ver'],
    usuarios: []
  }
};

const ROLES_VALIDOS = ['admin', 'contador', 'vendedor', 'bodeguero', 'auditor'];

/**
 * Verifica si un rol tiene un permiso sobre un módulo
 */
function tienePermiso(rol, modulo, accion) {
  if (!rol || !PERMISOS[rol]) return false;
  const permisosModulo = PERMISOS[rol][modulo];
  if (!permisosModulo) return false;
  return permisosModulo.includes(accion);
}

/**
 * Middleware que exige un permiso específico.
 * Uso: router.post('/', requierePermiso('ventas', 'crear'), handler)
 */
function requierePermiso(modulo, accion) {
  return (req, res, next) => {
    const rol = req.user?.rol;
    if (!rol) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    if (!tienePermiso(rol, modulo, accion)) {
      return res.status(403).json({
        error: `No tiene permiso para ${accion} en ${modulo}`,
        modulo,
        accion,
        rol
      });
    }
    next();
  };
}

/**
 * Middleware que exige uno de varios roles
 */
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    const rol = req.user?.rol;
    if (!rol) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({
        error: 'No tiene permisos para esta acción',
        rolesPermitidos,
        rol
      });
    }
    next();
  };
}

module.exports = {
  PERMISOS,
  ROLES_VALIDOS,
  tienePermiso,
  requierePermiso,
  requiereRol
};