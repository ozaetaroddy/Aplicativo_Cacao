import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
// Bootstrap CSS
import 'bootstrap/dist/css/bootstrap.min.css'

// Bootstrap JS (IMPORTANTE: esto activa los dropdowns)
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

// Font Awesome
import '@fortawesome/fontawesome-free/css/all.min.css'

// Estilos propios
import './styles.css'

// Importar componentes
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
  { path: '/kardex', component: KardexView },
  { path: '/reportes/ventas', component: ReporteVentas },
  { path: '/reportes/compras', component: ReporteCompras },
  { path: '/reportes', redirect: '/reportes/ventas' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')

document.title = 'Sistema Contable'