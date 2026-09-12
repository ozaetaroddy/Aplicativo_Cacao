// backend/utils/permisos.js
// Definición de roles y permisos granulares

const PERMISOS = {
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
    certificados: ['ver'],
    sri: ['ver'],
    periodos: ['ver'],
    anexos: ['ver'],
    email: []
  }
};

const ROLES_VALIDOS = Object.keys(PERMISOS);

const ETIQUETAS_ROLES = {
  admin: 'Administrador',
  contador: 'Contador',
  vendedor: 'Vendedor',
  bodeguero: 'Bodeguero',
  auditor: 'Auditor'
};

function tienePermiso(rol, modulo, accion) {
  if (!rol || !PERMISOS[rol]) return false;
  const permisosModulo = PERMISOS[rol][modulo];
  if (!permisosModulo || !Array.isArray(permisosModulo)) return false;
  return permisosModulo.includes(accion);
}

function puedeAlguno(rol, checks = []) {
  return checks.some(c => tienePermiso(rol, c.modulo, c.accion));
}

function listarModulos(rol) {
  if (!rol || !PERMISOS[rol]) return [];
  return Object.entries(PERMISOS[rol])
    .filter(([, acciones]) => Array.isArray(acciones) && acciones.length > 0)
    .map(([modulo, acciones]) => ({ modulo, acciones }));
}

function requierePermiso(modulo, accion) {
  return (req, res, next) => {
    const rol = req.user?.rol;
    if (!rol) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    if (!tienePermiso(rol, modulo, accion)) {
      return res.status(403).json({
        error: `No tiene permiso para "${accion}" en "${modulo}"`,
        modulo,
        accion,
        rol
      });
    }
    next();
  };
}

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
  ETIQUETAS_ROLES,
  tienePermiso,
  puedeAlguno,
  listarModulos,
  requierePermiso,
  requiereRol
};