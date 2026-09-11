import { createRouter, createWebHistory } from 'vue-router'

// ===== LAZY LOADING =====
const Login = () => import('../components/Login.vue')
const Dashboard = () => import('../components/Dashboard.vue')
const ProductosList = () => import('../components/productos/ProductosList.vue')
const ProductoForm = () => import('../components/productos/ProductoForm.vue')
const CategoriasList = () => import('../components/categorias/CategoriasList.vue')
const CategoriaForm = () => import('../components/categorias/CategoriaForm.vue')
const ClientesList = () => import('../components/clientes/ClientesList.vue')
const ClienteForm = () => import('../components/clientes/ClienteForm.vue')
const ProveedoresList = () => import('../components/proveedores/ProveedoresList.vue')
const ProveedorForm = () => import('../components/proveedores/ProveedorForm.vue')
const ComprasList = () => import('../components/compras/ComprasList.vue')
const CompraForm = () => import('../components/compras/CompraForm.vue')
const VentasList = () => import('../components/ventas/VentasList.vue')
const VentaForm = () => import('../components/ventas/VentaForm.vue')
const KardexView = () => import('../components/kardex/KardexView.vue')
const ReporteVentas = () => import('../components/reportes/ReporteVentas.vue')
const ReporteCompras = () => import('../components/reportes/ReporteCompras.vue')
const ConsultarDocumentos = () => import('../components/ConsultarDocumentos.vue')

// Inventario
const StockActual = () => import('../components/inventario/StockActual.vue')
const ConteoFisico = () => import('../components/inventario/ConteoFisico.vue')
const InventarioValorizado = () => import('../components/inventario/InventarioValorizado.vue')
const PlanificacionInventarios = () => import('../components/inventario/PlanificacionInventarios.vue')
const AjustesInventario = () => import('../components/inventario/AjustesInventario.vue')

// Retenciones
const RetencionesList = () => import('../components/retenciones/RetencionesList.vue')
const RetencionForm = () => import('../components/retenciones/RetencionForm.vue')

// Reporte Mensual
const ReporteMensual = () => import('../components/reportes/ReporteMensual.vue')

// Importar Facturas
const ImportarFacturas = () => import('../components/compras/ImportarFacturas.vue')

// Perfil de usuario
const PerfilUsuario = () => import('../components/PerfilUsuario.vue')

// Auditoría
const AuditoriaList = () => import('../components/auditoria/AuditoriaList.vue')

// ===== RUTAS =====
const routes = [
  { path: '/login', component: Login },
  { path: '/', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/productos', component: ProductosList, meta: { requiresAuth: true } },
  { path: '/productos/nuevo', component: ProductoForm, meta: { requiresAuth: true } },
  { path: '/productos/editar/:id', component: ProductoForm, props: true, meta: { requiresAuth: true } },
  { path: '/categorias', component: CategoriasList, meta: { requiresAuth: true } },
  { path: '/categorias/nuevo', component: CategoriaForm, meta: { requiresAuth: true } },
  { path: '/categorias/editar/:id', component: CategoriaForm, props: true, meta: { requiresAuth: true } },
  { path: '/clientes', component: ClientesList, meta: { requiresAuth: true } },
  { path: '/clientes/nuevo', component: ClienteForm, meta: { requiresAuth: true } },
  { path: '/clientes/editar/:id', component: ClienteForm, props: true, meta: { requiresAuth: true } },
  { path: '/proveedores', component: ProveedoresList, meta: { requiresAuth: true } },
  { path: '/proveedores/nuevo', component: ProveedorForm, meta: { requiresAuth: true } },
  { path: '/proveedores/editar/:id', component: ProveedorForm, props: true, meta: { requiresAuth: true } },
  { path: '/compras', component: ComprasList, meta: { requiresAuth: true } },
  { path: '/compras/nuevo', component: CompraForm, meta: { requiresAuth: true } },
  { path: '/compras/editar/:id', component: CompraForm, props: true, meta: { requiresAuth: true } },
  { path: '/ventas', component: VentasList, meta: { requiresAuth: true } },
  { path: '/ventas/nuevo', component: VentaForm, meta: { requiresAuth: true } },
  { path: '/ventas/editar/:id', component: VentaForm, props: true, meta: { requiresAuth: true } },
  { path: '/kardex', component: KardexView, meta: { requiresAuth: true } },
  { path: '/inventario/stock', component: StockActual, meta: { requiresAuth: true } },
  { path: '/inventario/conteo', component: ConteoFisico, meta: { requiresAuth: true } },
  { path: '/inventario/valorizado', component: InventarioValorizado, meta: { requiresAuth: true } },
  { path: '/inventario/planificacion', component: PlanificacionInventarios, meta: { requiresAuth: true } },
  { path: '/inventario/ajustes', component: AjustesInventario, meta: { requiresAuth: true } },
  { path: '/reportes/ventas', component: ReporteVentas, meta: { requiresAuth: true } },
  { path: '/reportes/compras', component: ReporteCompras, meta: { requiresAuth: true } },
  { path: '/reportes/mensual', component: ReporteMensual, meta: { requiresAuth: true } },
  { path: '/reportes', redirect: '/reportes/ventas' },
  { path: '/consultar-documentos', component: ConsultarDocumentos, meta: { requiresAuth: true } },
  { path: '/retenciones', component: RetencionesList, meta: { requiresAuth: true } },
  { path: '/retenciones/nuevo', component: RetencionForm, meta: { requiresAuth: true } },
  { path: '/retenciones/editar/:id', component: RetencionForm, props: true, meta: { requiresAuth: true } },
  { path: '/importar-facturas', component: ImportarFacturas, meta: { requiresAuth: true } },
  { path: '/mi-perfil', component: PerfilUsuario, meta: { requiresAuth: true } },
  { path: '/auditoria', component: AuditoriaList, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// ===== GUARD DE RUTAS =====
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const publicPages = ['/login']
  const authRequired = !publicPages.includes(to.path)

  // Si está en login y tiene token, redirige al home
  if (to.path === '/login' && token) {
    return next('/')
  }

  // Si la ruta requiere autenticación y no hay token, redirige a login
  if (authRequired && !token) {
    return next('/login')
  }

  // Si la ruta requiere admin y el usuario no lo es
  if (to.meta.requiresAdmin && user?.rol !== 'admin') {
    return next('/')
  }

  next()
})

export default router