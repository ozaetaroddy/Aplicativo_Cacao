import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'

// Componentes existentes
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

// Componentes de inventario
import StockActual from './components/inventario/StockActual.vue'
import ConteoFisico from './components/inventario/ConteoFisico.vue'
import InventarioValorizado from './components/inventario/InventarioValorizado.vue'
import PlanificacionInventarios from './components/inventario/PlanificacionInventarios.vue'
import AjustesInventario from './components/inventario/AjustesInventario.vue'

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
  { path: '/inventario/stock', component: StockActual },
  { path: '/inventario/conteo', component: ConteoFisico },
  { path: '/inventario/valorizado', component: InventarioValorizado },
  { path: '/inventario/planificacion', component: PlanificacionInventarios },
  { path: '/inventario/ajustes', component: AjustesInventario },
  { path: '/reportes/ventas', component: ReporteVentas },
  { path: '/reportes/compras', component: ReporteCompras },
  { path: '/reportes', redirect: '/reportes/ventas' },
  { path: '/consultar-documentos', component: ConsultarDocumentos },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')

document.title = 'Sistema Contable'