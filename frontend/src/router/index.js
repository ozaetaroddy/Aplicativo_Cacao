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

// Retenciones
const RetencionesList = () => import('../components/retenciones/RetencionesList.vue')
const RetencionForm = () => import('../components/retenciones/RetencionForm.vue')

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

  // ===== RETENCIONES =====
  {
    path: '/retenciones',
    name: 'RetencionesList',
    component: RetencionesList,
    meta: { requiresAuth: true, modulo: 'retenciones', accion: 'ver', title: 'Retenciones' }
  },
  {
    path: '/retenciones/nuevo',
    name: 'RetencionNueva',
    component: RetencionForm,
    meta: { requiresAuth: true, modulo: 'retenciones', accion: 'crear', title: 'Nueva Retención' }
  },
  {
    path: '/retenciones/editar/:id',
    name: 'RetencionEditar',
    component: RetencionForm,
    props: true,
    meta: { requiresAuth: true, modulo: 'retenciones', accion: 'editar', title: 'Editar Retención' }
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
  {
    path: '/reportes',
    redirect: '/reportes/ventas'
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
    // Restaurar posición al volver atrás
    if (savedPosition) return savedPosition
    // Ir al inicio en rutas nuevas
    return { top: 0, behavior: 'smooth' }
  }
})

// ============================================================
// GUARD DE NAVEGACIÓN
// ============================================================
router.beforeEach(async (to, from, next) => {
  // Actualizar el título de la página
  const titulo = to.meta?.title
  if (titulo) {
    document.title = `${titulo} — Sistema Contable`
  } else {
    document.title = 'Sistema Contable'
  }

  const token = localStorage.getItem('token')
  const publicPages = ['/login']
  const esRutaPublica = to.meta?.public || publicPages.includes(to.path)
  const requiereAuth = !esRutaPublica

  // 1. Si está en login y ya tiene token → redirigir al home
  if (to.path === '/login' && token) {
    return next('/')
  }

  // 2. Si la ruta requiere auth y no hay token → redirigir a login
  if (requiereAuth && !token) {
    // Guardar la ruta intentada para redirigir después del login
    return next({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  }

  // 3. Si la ruta requiere un permiso específico, verificar
  if (to.meta?.modulo && to.meta?.accion) {
    try {
      const { cargarPermisos, puede } = usePermisos()
      await cargarPermisos()

      if (!puede(to.meta.modulo, to.meta.accion)) {
        console.warn(`Acceso denegado a ${to.path} (falta permiso ${to.meta.modulo}:${to.meta.accion})`)
        // Redirigir al home silenciosamente
        return next('/')
      }
    } catch (e) {
      console.error('Error verificando permisos:', e)
      // Si falla, mejor redirigir al login
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return next('/login')
    }
  }

  // 4. Permitir navegación
  next()
})

// ============================================================
// GUARD POST-NAVEGACIÓN (para tracking o cleanup)
// ============================================================
router.afterEach((to, from) => {
  // Scroll al inicio de la página
  window.scrollTo({ top: 0, behavior: 'smooth' })

  // Log de navegación (útil para debug)
  if (import.meta.env.DEV) {
    console.log(`🧭 Navegación: ${from.path} → ${to.path}`)
  }
})

// ============================================================
// MANEJO DE ERRORES DE NAVEGACIÓN
// ============================================================
router.onError((error) => {
  console.error('❌ Error de router:', error)
  // Si hay un error de carga de chunk, recargar la página
  if (error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed')) {
    console.warn('🔄 Recargando página por error de chunk...')
    window.location.reload()
  }
})

export default router