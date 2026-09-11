import { createRouter, createWebHistory } from 'vue-router'
import { usePermisos } from '../composables/usePermisos'

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
const StockActual = () => import('../components/inventario/StockActual.vue')
const ConteoFisico = () => import('../components/inventario/ConteoFisico.vue')
const InventarioValorizado = () => import('../components/inventario/InventarioValorizado.vue')
const PlanificacionInventarios = () => import('../components/inventario/PlanificacionInventarios.vue')
const AjustesInventario = () => import('../components/inventario/AjustesInventario.vue')
const RetencionesList = () => import('../components/retenciones/RetencionesList.vue')
const RetencionForm = () => import('../components/retenciones/RetencionForm.vue')
const ReporteMensual = () => import('../components/reportes/ReporteMensual.vue')
const ImportarFacturas = () => import('../components/compras/ImportarFacturas.vue')
const PerfilUsuario = () => import('../components/PerfilUsuario.vue')
const AuditoriaList = () => import('../components/auditoria/AuditoriaList.vue')
const UsuariosList = () => import('../components/usuarios/UsuariosList.vue')
const UsuarioForm = () => import('../components/usuarios/UsuarioForm.vue')
const PeriodosCerrados = () => import('../components/periodos/PeriodosCerrados.vue')

const routes = [
  { path: '/login', component: Login },
  { path: '/', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/mi-perfil', component: PerfilUsuario, meta: { requiresAuth: true } },

  { path: '/ventas', component: VentasList, meta: { requiresAuth: true, modulo: 'ventas', accion: 'ver' } },
  { path: '/ventas/nuevo', component: VentaForm, meta: { requiresAuth: true, modulo: 'ventas', accion: 'crear' } },
  { path: '/ventas/editar/:id', component: VentaForm, props: true, meta: { requiresAuth: true, modulo: 'ventas', accion: 'editar' } },

  { path: '/compras', component: ComprasList, meta: { requiresAuth: true, modulo: 'compras', accion: 'ver' } },
  { path: '/compras/nuevo', component: CompraForm, meta: { requiresAuth: true, modulo: 'compras', accion: 'crear' } },
  { path: '/compras/editar/:id', component: CompraForm, props: true, meta: { requiresAuth: true, modulo: 'compras', accion: 'editar' } },
  { path: '/importar-facturas', component: ImportarFacturas, meta: { requiresAuth: true, modulo: 'compras', accion: 'crear' } },

  { path: '/clientes', component: ClientesList, meta: { requiresAuth: true, modulo: 'clientes', accion: 'ver' } },
  { path: '/clientes/nuevo', component: ClienteForm, meta: { requiresAuth: true, modulo: 'clientes', accion: 'crear' } },
  { path: '/clientes/editar/:id', component: ClienteForm, props: true, meta: { requiresAuth: true, modulo: 'clientes', accion: 'editar' } },

  { path: '/proveedores', component: ProveedoresList, meta: { requiresAuth: true, modulo: 'proveedores', accion: 'ver' } },
  { path: '/proveedores/nuevo', component: ProveedorForm, meta: { requiresAuth: true, modulo: 'proveedores', accion: 'crear' } },
  { path: '/proveedores/editar/:id', component: ProveedorForm, props: true, meta: { requiresAuth: true, modulo: 'proveedores', accion: 'editar' } },

  { path: '/productos', component: ProductosList, meta: { requiresAuth: true, modulo: 'productos', accion: 'ver' } },
  { path: '/productos/nuevo', component: ProductoForm, meta: { requiresAuth: true, modulo: 'productos', accion: 'crear' } },
  { path: '/productos/editar/:id', component: ProductoForm, props: true, meta: { requiresAuth: true, modulo: 'productos', accion: 'editar' } },

  { path: '/categorias', component: CategoriasList, meta: { requiresAuth: true, modulo: 'categorias', accion: 'ver' } },
  { path: '/categorias/nuevo', component: CategoriaForm, meta: { requiresAuth: true, modulo: 'categorias', accion: 'crear' } },
  { path: '/categorias/editar/:id', component: CategoriaForm, props: true, meta: { requiresAuth: true, modulo: 'categorias', accion: 'editar' } },

  { path: '/retenciones', component: RetencionesList, meta: { requiresAuth: true, modulo: 'retenciones', accion: 'ver' } },
  { path: '/retenciones/nuevo', component: RetencionForm, meta: { requiresAuth: true, modulo: 'retenciones', accion: 'crear' } },
  { path: '/retenciones/editar/:id', component: RetencionForm, props: true, meta: { requiresAuth: true, modulo: 'retenciones', accion: 'editar' } },

  { path: '/kardex', component: KardexView, meta: { requiresAuth: true, modulo: 'kardex', accion: 'ver' } },

  { path: '/inventario/stock', component: StockActual, meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver' } },
  { path: '/inventario/conteo', component: ConteoFisico, meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver' } },
  { path: '/inventario/valorizado', component: InventarioValorizado, meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver' } },
  { path: '/inventario/planificacion', component: PlanificacionInventarios, meta: { requiresAuth: true, modulo: 'inventario', accion: 'ver' } },
  { path: '/inventario/ajustes', component: AjustesInventario, meta: { requiresAuth: true, modulo: 'inventario', accion: 'editar' } },

  { path: '/reportes/ventas', component: ReporteVentas, meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver' } },
  { path: '/reportes/compras', component: ReporteCompras, meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver' } },
  { path: '/reportes/mensual', component: ReporteMensual, meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver' } },
  { path: '/reportes', redirect: '/reportes/ventas' },

  { path: '/consultar-documentos', component: ConsultarDocumentos, meta: { requiresAuth: true } },

  { path: '/auditoria', component: AuditoriaList, meta: { requiresAuth: true, modulo: 'auditoria', accion: 'ver' } },

  { path: '/usuarios', component: UsuariosList, meta: { requiresAuth: true, modulo: 'usuarios', accion: 'ver' } },
  { path: '/usuarios/nuevo', component: UsuarioForm, meta: { requiresAuth: true, modulo: 'usuarios', accion: 'crear' } },
  { path: '/usuarios/editar/:id', component: UsuarioForm, props: true, meta: { requiresAuth: true, modulo: 'usuarios', accion: 'editar' } },

  { path: '/periodos-cerrados', component: PeriodosCerrados, meta: { requiresAuth: true, modulo: 'reportes', accion: 'ver' } },

  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem('token')
  const publicPages = ['/login']
  const authRequired = !publicPages.includes(to.path)

  if (to.path === '/login' && token) {
    return next('/')
  }

  if (authRequired && !token) {
    return next('/login')
  }

  if (to.meta.modulo && to.meta.accion) {
    try {
      const { cargarPermisos, puede } = usePermisos()
      await cargarPermisos()
      if (!puede(to.meta.modulo, to.meta.accion)) {
        return next('/')
      }
    } catch (e) {
      return next('/login')
    }
  }

  next()
})

export default router