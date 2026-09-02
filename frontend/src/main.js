import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'

// Importar componentes existentes
import Dashboard from './components/Dashboard.vue'
import ProductosList from './components/productos/ProductosList.vue'
import ProductoForm from './components/productos/ProductoForm.vue'
import CategoriasList from './components/categorias/CategoriasList.vue'
import CategoriaForm from './components/categorias/CategoriaForm.vue'
import ClientesList from './components/clientes/ClientesList.vue'
import ClienteForm from './components/clientes/ClienteForm.vue'
import ProveedoresList from './components/proveedores/ProveedoresList.vue'
import ProveedorForm from './components/proveedores/ProveedorForm.vue'
import ComprasList from './components/compras/ComprasList.vue'
import CompraForm from './components/compras/CompraForm.vue'
import VentasList from './components/ventas/VentasList.vue'
import VentaForm from './components/ventas/VentaForm.vue'
import KardexView from './components/kardex/KardexView.vue'
import ReporteVentas from './components/reportes/ReporteVentas.vue'
import ReporteCompras from './components/reportes/ReporteCompras.vue'
import ConsultarDocumentos from './components/ConsultarDocumentos.vue'

// Importar nuevos componentes de inventario
import StockActual from './components/inventario/StockActual.vue'
import PlanificacionInventario from './components/inventario/PlanificacionInventario.vue'
import AjustesInventario from './components/inventario/AjustesInventario.vue'
import ReporteInventario from './components/inventario/ReporteInventario.vue'

const routes = [
  { path: '/', component: Dashboard },
  // Productos
  { path: '/productos', component: ProductosList },
  { path: '/productos/nuevo', component: ProductoForm },
  { path: '/productos/editar/:id', component: ProductoForm, props: true },
  // Categorías
  { path: '/categorias', component: CategoriasList },
  { path: '/categorias/nuevo', component: CategoriaForm },
  { path: '/categorias/editar/:id', component: CategoriaForm, props: true },
  // Clientes
  { path: '/clientes', component: ClientesList },
  { path: '/clientes/nuevo', component: ClienteForm },
  { path: '/clientes/editar/:id', component: ClienteForm, props: true },
  // Proveedores
  { path: '/proveedores', component: ProveedoresList },
  { path: '/proveedores/nuevo', component: ProveedorForm },
  { path: '/proveedores/editar/:id', component: ProveedorForm, props: true },
  // Compras
  { path: '/compras', component: ComprasList },
  { path: '/compras/nuevo', component: CompraForm },
  // Ventas
  { path: '/ventas', component: VentasList },
  { path: '/ventas/nuevo', component: VentaForm },
  // Documentos
  { path: '/consultar-documentos', component: ConsultarDocumentos },
  // Kardex (mantenemos ruta antigua y redirigimos a la nueva)
  { path: '/kardex', redirect: '/inventario/movimientos' },
  // Reportes
  { path: '/reportes/ventas', component: ReporteVentas },
  { path: '/reportes/compras', component: ReporteCompras },
  { path: '/reportes', redirect: '/reportes/ventas' },
  // Inventario
  { path: '/inventario/stock-actual', component: StockActual },
  { path: '/inventario/movimientos', component: KardexView },
  { path: '/inventario/planificacion', component: PlanificacionInventario },
  { path: '/inventario/ajustes', component: AjustesInventario },
  { path: '/inventario/reporte', component: ReporteInventario },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')
document.title = 'Sistema Contable'