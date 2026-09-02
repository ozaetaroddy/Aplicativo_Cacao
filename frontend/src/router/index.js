import { createRouter, createWebHistory } from 'vue-router'

// ===== LAZY LOADING (carga bajo demanda) =====
// Solo los componentes que se usan en el menú principal se cargan al inicio
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

const routes = [
  { path: '/', component: Dashboard },
  { path: '/productos', component: ProductosList },
  { path: '/productos/nuevo', component: ProductoForm },
  { path: '/productos/editar/:id', component: ProductoForm, props: true },
  { path: '/categorias', component: CategoriasList },
  { path: '/categorias/nuevo', component: CategoriaForm },
  { path: '/categorias/editar/:id', component: CategoriaForm, props: true },
  { path: '/clientes', component: ClientesList },
  { path: '/clientes/nuevo', component: ClienteForm },
  { path: '/clientes/editar/:id', component: ClienteForm, props: true },
  { path: '/proveedores', component: ProveedoresList },
  { path: '/proveedores/nuevo', component: ProveedorForm },
  { path: '/proveedores/editar/:id', component: ProveedorForm, props: true },
  { path: '/compras', component: ComprasList },
  { path: '/compras/nuevo', component: CompraForm },
  { path: '/ventas', component: VentasList },
  { path: '/ventas/nuevo', component: VentaForm },
  { path: '/ventas/editar/:id', component: VentaForm, props: true },
  { path: '/kardex', component: KardexView },
  // Inventario
  { path: '/inventario/stock', component: StockActual },
  { path: '/inventario/conteo', component: ConteoFisico },
  { path: '/inventario/valorizado', component: InventarioValorizado },
  { path: '/inventario/planificacion', component: PlanificacionInventarios },
  { path: '/inventario/ajustes', component: AjustesInventario },
  // Reportes
  { path: '/reportes/ventas', component: ReporteVentas },
  { path: '/reportes/compras', component: ReporteCompras },
  { path: '/reportes', redirect: '/reportes/ventas' },
  // Consulta
  { path: '/consultar-documentos', component: ConsultarDocumentos },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router