import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'

import Dashboard from './components/Dashboard.vue'
import Compras from './components/Compras.vue'
import Ventas from './components/Ventas.vue'
import Reportes from './components/Reportes.vue'
import Inventario from './components/Inventario.vue'

const routes = [
  { path: '/', component: Dashboard },
  { path: '/compras', component: Compras },
  { path: '/ventas', component: Ventas },
  { path: '/reportes', component: Reportes },
  { path: '/inventario', component: Inventario },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

createApp(App).use(router).mount('#app')