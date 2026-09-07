import { createRouter, createWebHistory } from 'vue-router'
import Login from '../components/Login.vue' // <--- CORREGIDO

// ===== LAZY LOADING =====
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

// ===== RUTAS =====
const routes = [
  // Login (pública)
  { path: '/login', component: Login },

  // Dashboard (requiere autenticación)
  { path: '/', component: Dashboard, meta: { requiresAuth: true } },

  // Productos
  { path: '/productos', component: ProductosList, meta: { requiresAuth: true } },
  { path: '/productos/nuevo', component: ProductoForm, meta: { requiresAuth: true } },
  { path: '/productos/editar/:id', component: ProductoForm, props: true, meta: { requiresAuth: true } },

  // Categorías
  { path: '/categorias', component: CategoriasList, meta: { requiresAuth: true } },
  { path: '/categorias/nuevo', component: CategoriaForm, meta: { requiresAuth: true } },
  { path: '/categorias/editar/:id', component: CategoriaForm, props: true, meta: { requiresAuth: true } },

  // Clientes
  { path: '/clientes', component: ClientesList, meta: { requiresAuth: true } },
  { path: '/clientes/nuevo', component: ClienteForm, meta: { requiresAuth: true } },
  { path: '/clientes/editar/:id', component: ClienteForm, props: true, meta: { requiresAuth: true } },

  // Proveedores
  { path: '/proveedores', component: ProveedoresList, meta: { requiresAuth: true } },
  { path: '/proveedores/nuevo', component: ProveedorForm, meta: { requiresAuth: true } },
  { path: '/proveedores/editar/:id', component: ProveedorForm, props: true, meta: { requiresAuth: true } },

  // Compras
  { path: '/compras', component: ComprasList, meta: { requiresAuth: true } },
  { path: '/compras/nuevo', component: CompraForm, meta: { requiresAuth: true } },
  { path: '/compras/editar/:id', component: CompraForm, props: true, meta: { requiresAuth: true } },

  // Ventas
  { path: '/ventas', component: VentasList, meta: { requiresAuth: true } },
  { path: '/ventas/nuevo', component: VentaForm, meta: { requiresAuth: true } },
  { path: '/ventas/editar/:id', component: VentaForm, props: true, meta: { requiresAuth: true } },

  // Kardex
  { path: '/kardex', component: KardexView, meta: { requiresAuth: true } },

  // Inventario
  { path: '/inventario/stock', component: StockActual, meta: { requiresAuth: true } },
  { path: '/inventario/conteo', component: ConteoFisico, meta: { requiresAuth: true } },
  { path: '/inventario/valorizado', component: InventarioValorizado, meta: { requiresAuth: true } },
  { path: '/inventario/planificacion', component: PlanificacionInventarios, meta: { requiresAuth: true } },
  { path: '/inventario/ajustes', component: AjustesInventario, meta: { requiresAuth: true } },

  // Reportes
  { path: '/reportes/ventas', component: ReporteVentas, meta: { requiresAuth: true } },
  { path: '/reportes/compras', component: ReporteCompras, meta: { requiresAuth: true } },
  { path: '/reportes/mensual', component: ReporteMensual, meta: { requiresAuth: true } },
  { path: '/reportes', redirect: '/reportes/ventas' },

  // Documentos
  { path: '/consultar-documentos', component: ConsultarDocumentos, meta: { requiresAuth: true } },

  // Retenciones
  { path: '/retenciones', component: RetencionesList, meta: { requiresAuth: true } },
  { path: '/retenciones/nuevo', component: RetencionForm, meta: { requiresAuth: true } },
  { path: '/retenciones/editar/:id', component: RetencionForm, props: true, meta: { requiresAuth: true } },

  // Importar Facturas
  { path: '/importar-facturas', component: ImportarFacturas, meta: { requiresAuth: true } },

  // Redirección por error
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

// ===== CREAR ROUTER =====
const router = createRouter({
  history: createWebHistory(),
  routes,
})

// ===== GUARD GLOBAL DE AUTENTICACIÓN =====
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/')
  } else {
    next()
  }
})

export default router