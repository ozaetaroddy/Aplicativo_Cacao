// src/router/index.js
// ============================================================
// Router principal con:
//   - Lazy loading de componentes
//   - Guards de autenticación + permisos
//   - Título dinámico de página
//   - Manejo de errores de chunk con retry controlado
//   - Prevención de open-redirect
//
// 🆕 REFACTOR 2025-XX (UNIFICACIÓN DE RETENCIONES):
//   Se eliminaron las rutas /retenciones/* (eran el flujo manual
//   en la colección legacy). Ahora se redirigen a:
//     /retenciones        → /ventas?tipo_documento=retencion
//     /retenciones/nuevo  → /compras/nuevo
//
//   Esto mantiene compatibilidad con bookmarks viejos mientras
//   fuerza el flujo correcto (retención se auto-emite desde compras).
// ============================================================
'use strict'

import { createRouter, createWebHistory } from 'vue-router'
import { usePermisos } from '../composables/usePermisos'

// ============================================================
// LAZY LOADING DE COMPONENTES
// ============================================================

// Auth y páginas básicas
const Login = () => import('../components/Login.vue')
const Dashboard = () => import('../components/Dashboard.vue')
const PerfilUsuario = () => import('../components/PerfilUsuario.vue')

// Ventas y documentos
const VentasList = () => import('../components/ventas/VentasList.vue')
const VentaForm = () => import('../components/ventas/VentaForm.vue')
const ComprasList = () => import('../components/compras/ComprasList.vue')
const CompraForm = () => import('../components/compras/CompraForm.vue')
const ImportarFacturas = () => import('../components/compras/ImportarFacturas.vue')
const ConsultarDocumentos = () => import('../components/ConsultarDocumentos.vue')

// Base de datos maestros
const ProductosList = () => import('../components/productos/ProductosList.vue')
const ProductoForm = () => import('../components/productos/ProductoForm.vue')
const CategoriasList = () => import('../components/categorias/CategoriasList.vue')
const CategoriaForm = () => import('../components/categorias/CategoriaForm.vue')
const ClientesList = () => import('../components/clientes/ClientesList.vue')
const ClienteForm = () => import('../components/clientes/ClienteForm.vue')
const ProveedoresList = () => import('../components/proveedores/ProveedoresList.vue')
const ProveedorForm = () => import('../components/proveedores/ProveedorForm.vue')

// 🆕 REFACTOR: retenciones movidas al módulo de Ventas.
//    Los imports de RetencionesList / RetencionForm se eliminaron.

// Inventarios
const KardexView = () => import('../components/kardex/KardexView.vue')
const StockActual = () => import('../components/inventario/StockActual.vue')
const ConteoFisico = () => import('../components/inventario/ConteoFisico.vue')
const InventarioValorizado = () => import('../components/inventario/InventarioValorizado.vue')
const PlanificacionInventarios = () => import('../components/inventario/PlanificacionInventarios.vue')
const AjustesInventario = () => import('../components/inventario/AjustesInventario.vue')

// Reportes
const ReporteVentas = () => import('../components/reportes/ReporteVentas.vue')
const ReporteCompras = () => import('../components/reportes/ReporteCompras.vue')
const ReporteMensual = () => import('../components/reportes/ReporteMensual.vue')
const EstadoCuentaCliente = () => import('../components/reportes/EstadoCuentaCliente.vue')
const CarteraGeneral = () => import('../components/reportes/CarteraGeneral.vue')
const EstadosFinancieros = () => import('../components/reportes/EstadosFinancieros.vue')
const AnexoATS = () => import('../components/reportes/AnexoATS.vue')

// Administración
const AuditoriaList = () => import('../components/auditoria/AuditoriaList.vue')
const UsuariosList = () => import('../components/usuarios/UsuariosList.vue')
const UsuarioForm = () => import('../components/usuarios/UsuarioForm.vue')
const BackupsAdmin = () => import('../components/admin/BackupsAdmin.vue')
const ConfiguracionEmpresa = () => import('../components/admin/ConfiguracionEmpresa.vue')
const CertificadoFirma = () => import('../components/admin/CertificadoFirma.vue')
const EnvioSri = () => import('../components/admin/EnvioSri.vue')
const DiagnosticoSistema = () => import('../components/admin/DiagnosticoSistema.vue')

// Periodos
const PeriodosCerrados = () => import('../components/periodos/PeriodosCerrados.vue')

// ============================================================
// HELPERS DE STORAGE (protegidos)
// ============================================================
function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch { /* noop */ }
}

/**
 * Solo permitimos redirigir a rutas internas de la app.
 * Bloquea open-redirects tipo `?redirect=https://evil.com`.
 */
function esRedirectSeguro(value) {
  if (typeof value !== 'string' || !value) return false
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false
  if (value.startsWith('/\\')) return false
  return true
}

// ============================================================
// RUTAS
// ============================================================
const routes = [
  // ===== PÚBLICAS =====
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { public: true, title: 'Iniciar sesión' }
  },

  // ===== PRINCIPALES =====
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard,
    meta: { requiresAuth: true, title: 'Panel de Control' }
  },
  {
    path: '/mi-perfil',
    name: 'PerfilUsuario',
    component: PerfilUsuario,
    meta: { requiresAuth: true, title: 'Mi Perfil' }
  },

  // ===== VENTAS =====
  {
    path: '/ventas',
    name: 'VentasList',
    component: VentasList,
    meta: { requiresAuth: true, modulo: 'ventas', accion: 'ver', title: 'Ventas' }
  },
  {
    path: '/ventas/nuevo',
    name: 'VentaNueva',
    component: VentaForm,
    meta: { requiresAuth: true, modulo: 'ventas', accion: 'crear', title: 'Nueva Venta' }
  },
  {
    path: '/ventas/editar/:id',
    name: 'VentaEditar',
    component: VentaForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'ventas', accion: 'editar', title: 'Editar Venta' }
  },

  // ===== COMPRAS =====
  {
    path: '/compras',
    name: 'ComprasList',
    component: ComprasList,
    meta: { requiresAuth: true, modulo: 'compras', accion: 'ver', title: 'Compras' }
  },
  {
    path: '/compras/nuevo',
    name: 'CompraNueva',
    component: CompraForm,
    meta: { requiresAuth: true, modulo: 'compras', accion: 'crear', title: 'Nueva Compra' }
  },
  {
    path: '/compras/editar/:id',
    name: 'CompraEditar',
    component: CompraForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'compras', accion: 'editar', title: 'Editar Compra' }
  },
  {
    path: '/importar-facturas',
    name: 'ImportarFacturas',
    component: ImportarFacturas,
    meta: { requiresAuth: true, modulo: 'compras', accion: 'crear', title: 'Importar Facturas' }
  },

  // ===== CLIENTES =====
  {
    path: '/clientes',
    name: 'ClientesList',
    component: ClientesList,
    meta: { requiresAuth: true, modulo: 'clientes', accion: 'ver', title: 'Clientes' }
  },
  {
    path: '/clientes/nuevo',
    name: 'ClienteNuevo',
    component: ClienteForm,
    meta: { requiresAuth: true, modulo: 'clientes', accion: 'crear', title: 'Nuevo Cliente' }
  },
  {
    path: '/clientes/editar/:id',
    name: 'ClienteEditar',
    component: ClienteForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'clientes', accion: 'editar', title: 'Editar Cliente' }
  },

  // ===== PROVEEDORES =====
  {
    path: '/proveedores',
    name: 'ProveedoresList',
    component: ProveedoresList,
    meta: { requiresAuth: true, modulo: 'proveedores', accion: 'ver', title: 'Proveedores' }
  },
  {
    path: '/proveedores/nuevo',
    name: 'ProveedorNuevo',
    component: ProveedorForm,
    meta: { requiresAuth: true, modulo: 'proveedores', accion: 'crear', title: 'Nuevo Proveedor' }
  },
  {
    path: '/proveedores/editar/:id',
    name: 'ProveedorEditar',
    component: ProveedorForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'proveedores', accion: 'editar', title: 'Editar Proveedor' }
  },

  // ===== PRODUCTOS =====
  {
    path: '/productos',
    name: 'ProductosList',
    component: ProductosList,
    meta: { requiresAuth: true, modulo: 'productos', accion: 'ver', title: 'Productos' }
  },
  {
    path: '/productos/nuevo',
    name: 'ProductoNuevo',
    component: ProductoForm,
    meta: { requiresAuth: true, modulo: 'productos', accion: 'crear', title: 'Nuevo Producto' }
  },
  {
    path: '/productos/editar/:id',
    name: 'ProductoEditar',
    component: ProductoForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'productos', accion: 'editar', title: 'Editar Producto' }
  },

  // ===== CATEGORÍAS =====
  {
    path: '/categorias',
    name: 'CategoriasList',
    component: CategoriasList,
    meta: { requiresAuth: true, modulo: 'categorias', accion: 'ver', title: 'Categorías' }
  },
  {
    path: '/categorias/nuevo',
    name: 'CategoriaNueva',
    component: CategoriaForm,
    meta: { requiresAuth: true, modulo: 'categorias', accion: 'crear', title: 'Nueva Categoría' }
  },
  {
    path: '/categorias/editar/:id',
    name: 'CategoriaEditar',
    component: CategoriaForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'categorias', accion: 'editar', title: 'Editar Categoría' }
  },

  // ============================================================
  // 🆕 RETENCIONES (compat + redirección)
  // ------------------------------------------------------------
  // Las retenciones emitidas viven AHORA en `ventas_v2` con
  // `tipo_documento='retencion'` y se consultan en `/ventas`.
  //
  // Se mantienen las URLs antiguas para no romper bookmarks,
  // pero todas redirigen al lugar correcto del nuevo flujo.
  // ============================================================
  {
    path: '/retenciones',
    redirect: (to) => ({
      path: '/ventas',
      query: { ...to.query, tipo_documento: 'retencion' }
    })
  },
  {
    path: '/retenciones/nuevo',
    // La creación manual fue deprecada. Redirigimos a crear una compra,
    // que es el único flujo donde se emiten retenciones.
    redirect: { path: '/compras/nuevo' }
  },
  {
    path: '/retenciones/editar/:id',
    // No se editan retenciones directamente (se regeneran al editar
    // la compra origen). Mostramos la retención en modo lectura.
    redirect: (to) => ({
      path: '/ventas',
      query: { tipo_documento: 'retencion', highlight: to.params.id }
    })
  },

  // ===== INVENTARIOS =====
  {
    path: '/kardex',
    name: 'Kardex',
    component: KardexView,
    meta: { requiresAuth: true, modulo: 'kardex', accion: 'ver', title: 'Kardex' }
  },
  {
    path: '/inventario/stock',
    name: 'StockActual',
    component: StockActual,
    meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver', title: 'Stock Actual' }
  },
  {
    path: '/inventario/conteo',
    name: 'ConteoFisico',
    component: ConteoFisico,
    meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver', title: 'Conteo Físico' }
  },
  {
    path: '/inventario/valorizado',
    name: 'InventarioValorizado',
    component: InventarioValorizado,
    meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver', title: 'Inventario Valorizado' }
  },
  {
    path: '/inventario/planificacion',
    name: 'PlanificacionInventarios',
    component: PlanificacionInventarios,
    meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver', title: 'Planificación de Inventarios' }
  },
  {
    path: '/inventario/ajustes',
    name: 'AjustesInventario',
    component: AjustesInventario,
    meta: { requiresAuth: true, modulo: 'inventario', accion: 'editar', title: 'Ajustes de Inventario' }
  },

  // ===== REPORTES =====
  {
    path: '/reportes',
    redirect: '/reportes/ventas'
  },
  {
    path: '/reportes/ventas',
    name: 'ReporteVentas',
    component: ReporteVentas,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Reporte de Ventas' }
  },
  {
    path: '/reportes/compras',
    name: 'ReporteCompras',
    component: ReporteCompras,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Reporte de Compras' }
  },
  {
    path: '/reportes/mensual',
    name: 'ReporteMensual',
    component: ReporteMensual,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Reporte Mensual' }
  },
  {
    path: '/reportes/estado-cuenta',
    name: 'EstadoCuentaCliente',
    component: EstadoCuentaCliente,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Estado de Cuenta' }
  },
  {
    path: '/reportes/cartera',
    name: 'CarteraGeneral',
    component: CarteraGeneral,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Cartera General' }
  },
  {
    path: '/reportes/estados-financieros',
    name: 'EstadosFinancieros',
    component: EstadosFinancieros,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Estados Financieros' }
  },
  {
    path: '/reportes/ats',
    name: 'AnexoATS',
    component: AnexoATS,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Anexo ATS' }
  },

  // ===== CONSULTAR DOCUMENTOS =====
  {
    path: '/consultar-documentos',
    name: 'ConsultarDocumentos',
    component: ConsultarDocumentos,
    meta: { requiresAuth: true, title: 'Consultar Documentos' }
  },

  // ===== PERIODOS =====
  {
    path: '/periodos-cerrados',
    name: 'PeriodosCerrados',
    component: PeriodosCerrados,
    meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver', title: 'Períodos Cerrados' }
  },

  // ===== AUDITORÍA =====
  {
    path: '/auditoria',
    name: 'AuditoriaList',
    component: AuditoriaList,
    meta: { requiresAuth: true, modulo: 'auditoria', accion: 'ver', title: 'Auditoría' }
  },

  // ===== USUARIOS =====
  {
    path: '/usuarios',
    name: 'UsuariosList',
    component: UsuariosList,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver', title: 'Usuarios' }
  },
  {
    path: '/usuarios/nuevo',
    name: 'UsuarioNuevo',
    component: UsuarioForm,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'crear', title: 'Nuevo Usuario' }
  },
  {
    path: '/usuarios/editar/:id',
    name: 'UsuarioEditar',
    component: UsuarioForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'editar', title: 'Editar Usuario' }
  },

  // ===== ADMINISTRACIÓN Y SRI =====
  {
    path: '/backups',
    name: 'BackupsAdmin',
    component: BackupsAdmin,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver', title: 'Backups' }
  },
  {
    path: '/configuracion-empresa',
    name: 'ConfiguracionEmpresa',
    component: ConfiguracionEmpresa,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver', title: 'Configuración Empresa' }
  },
  {
    path: '/certificado-firma',
    name: 'CertificadoFirma',
    component: CertificadoFirma,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver', title: 'Certificado Firma' }
  },
  {
    path: '/envio-sri',
    name: 'EnvioSri',
    component: EnvioSri,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver', title: 'Envío al SRI' }
  },
  {
    path: '/diagnostico',
    name: 'DiagnosticoSistema',
    component: DiagnosticoSistema,
    meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver', title: 'Diagnóstico' }
  },

  // ===== 404 / CATCH-ALL =====
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/'
  }
]

// ============================================================
// CREAR ROUTER
// ============================================================
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path === from.path) return undefined
    return { top: 0, left: 0 }
  }
})

// ============================================================
// GUARD GLOBAL — BEFORE EACH
// ============================================================
router.beforeEach(async (to) => {
  // ---- 1. Título de la página ----
  const titulo = to.meta?.title
  document.title = titulo ? `${titulo} — Sistema Contable` : 'Sistema Contable'

  // ---- 2. Detectar sesión probable ----
  const tieneHint = Boolean(storageGet('auth_hint'))
  const esPublica = to.meta?.public === true || to.path === '/login'

  // ---- 3. Redirigir desde /login si ya hay sesión ----
  if (to.path === '/login' && tieneHint) {
    const queryRedirect = to.query?.redirect
    const destino = esRedirectSeguro(queryRedirect) ? queryRedirect : '/'
    return destino
  }

  // ---- 4. Bloquear rutas protegidas sin sesión ----
  if (!esPublica && !tieneHint) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }

  // ---- 5. Cargar permisos siempre que sea ruta protegida ----
  if (!esPublica) {
    try {
      const { cargarPermisos, puede } = usePermisos()
      await cargarPermisos()

      if (to.meta?.modulo && to.meta?.accion) {
        if (!puede(to.meta.modulo, to.meta.accion)) {
          if (import.meta.env.DEV) {
            console.warn(
              `🚫 Acceso denegado a ${to.path} — falta "${to.meta.modulo}:${to.meta.accion}"`
            )
          }
          return '/'
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Error verificando permisos:', e?.message || e)
      }
      storageRemove('auth_hint')
      storageRemove('user')
      return {
        path: '/login',
        query: { redirect: to.fullPath }
      }
    }
  }

  return true
})

// ============================================================
// GUARD GLOBAL — AFTER EACH
// ============================================================
router.afterEach((to, from) => {
  if (import.meta.env.DEV) {
    const cambioRuta = to.path !== from.path
    if (cambioRuta) {
      console.log(`🧭 ${from.path} → ${to.path}`)
    }
  }
})

// ============================================================
// MANEJO DE ERRORES DE NAVEGACIÓN
// ============================================================
let ultimoReloadChunk = 0
const RELOAD_COOLDOWN_MS = 10_000

router.onError((error) => {
  const msg = String(error?.message || '')

  const esChunkError =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')

  if (esChunkError) {
    const ahora = Date.now()
    const puedeRecargar = ahora - ultimoReloadChunk > RELOAD_COOLDOWN_MS

    if (puedeRecargar) {
      ultimoReloadChunk = ahora
      console.warn('🔄 Chunk obsoleto detectado. Recargando…')
      window.location.reload()
    } else {
      console.error(
        '❌ Chunk error repetido. Cooldown activo para evitar bucle de recargas.'
      )
    }
    return
  }

  console.error('❌ Error de router:', error)
})

export default router