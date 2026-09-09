<template>
  <nav class="navbar navbar-expand-lg navbar-cacao" ref="navbar">
    <div class="container-fluid">
      <router-link class="navbar-brand" to="/">
        <i class="fas fa-calculator"></i> Sistema Contable
      </router-link>
      <button
        class="navbar-toggler"
        type="button"
        @click="toggleNavbar"
        aria-controls="navbarNav"
        :aria-expanded="navbarAbierto"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon" style="filter: invert(1);"></span>
      </button>
      <div class="collapse navbar-collapse" :class="{ show: navbarAbierto }" id="navbarNav">
        <ul class="navbar-nav me-auto mb-0">
          <!-- ===== INICIO ===== -->
          <li class="nav-item">
            <router-link class="nav-link" to="/" exact-active-class="active" @click="cerrarTodo">
              <i class="fas fa-home"></i> Inicio
            </router-link>
          </li>

          <!-- ===== DOCUMENTOS ===== -->
          <li class="nav-item dropdown" :class="{ show: dropdowns.documentos }">
            <a
              class="nav-link dropdown-toggle"
              href="#"
              role="button"
              @click.prevent="toggleDropdown('documentos')"
            >
              <i class="fas fa-file-invoice"></i> Documentos
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.documentos }">
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=factura" @click="cerrarTodo">Nueva Factura</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=guia_remision" @click="cerrarTodo">Guía de Remisión</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=exportacion" @click="cerrarTodo">Factura Exportación</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=reembolso" @click="cerrarTodo">Factura Reembolso</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=retencion" @click="cerrarTodo">Comprobante Retención</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=liquidacion" @click="cerrarTodo">Liquidación Compra</router-link></li>
              <li><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/consultar-documentos" @click="cerrarTodo"><i class="fas fa-search"></i> Consultar Documentos</router-link></li>
              <li><router-link class="dropdown-item" to="/compras" @click="cerrarTodo"><i class="fas fa-inbox"></i> Bandeja de Compras</router-link></li>
            </ul>
          </li>

          <!-- ===== BASE DE DATOS ===== -->
          <li class="nav-item dropdown" :class="{ show: dropdowns.maestros }">
            <a
              class="nav-link dropdown-toggle"
              href="#"
              role="button"
              @click.prevent="toggleDropdown('maestros')"
            >
              <i class="fas fa-database"></i> Base de datos
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.maestros }">
              <li><router-link class="dropdown-item" to="/productos" @click="cerrarTodo"><i class="fas fa-boxes"></i> Productos</router-link></li>
              <li><router-link class="dropdown-item" to="/categorias" @click="cerrarTodo"><i class="fas fa-tags"></i> Categorías</router-link></li>
              <li><router-link class="dropdown-item" to="/clientes" @click="cerrarTodo"><i class="fas fa-users"></i> Clientes</router-link></li>
              <li><router-link class="dropdown-item" to="/proveedores" @click="cerrarTodo"><i class="fas fa-truck"></i> Proveedores</router-link></li>
            </ul>
          </li>

          <!-- ===== INVENTARIOS ===== -->
          <li class="nav-item dropdown" :class="{ show: dropdowns.inventarios }">
            <a
              class="nav-link dropdown-toggle"
              href="#"
              role="button"
              @click.prevent="toggleDropdown('inventarios')"
            >
              <i class="fas fa-warehouse"></i> Inventarios
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.inventarios }">
              <li><router-link class="dropdown-item" to="/kardex" @click="cerrarTodo"><i class="fas fa-clipboard-list"></i> Kardex</router-link></li>
              <li><router-link class="dropdown-item" to="/inventario/planificacion" @click="cerrarTodo"><i class="fas fa-calendar-alt"></i> Planificación de Inventarios</router-link></li>
              <li><router-link class="dropdown-item" to="/inventario/stock" @click="cerrarTodo"><i class="fas fa-boxes"></i> Stock Actual</router-link></li>
              <li><router-link class="dropdown-item" to="/inventario/conteo" @click="cerrarTodo"><i class="fas fa-clipboard-check"></i> Conteo Físico</router-link></li>
              <li><router-link class="dropdown-item" to="/inventario/ajustes" @click="cerrarTodo"><i class="fas fa-edit"></i> Ajustes de Inventario</router-link></li>
              <li><router-link class="dropdown-item" to="/inventario/valorizado" @click="cerrarTodo"><i class="fas fa-dollar-sign"></i> Inventario Valorizado</router-link></li>
            </ul>
          </li>

          <!-- ===== REPORTES ===== -->
          <li class="nav-item dropdown" :class="{ show: dropdowns.reportes }">
            <a
              class="nav-link dropdown-toggle"
              href="#"
              role="button"
              @click.prevent="toggleDropdown('reportes')"
            >
              <i class="fas fa-chart-bar"></i> Reportes
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.reportes }">
              <li><router-link class="dropdown-item" to="/reportes/ventas" @click="cerrarTodo"><i class="fas fa-arrow-up"></i> Ventas</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/compras" @click="cerrarTodo"><i class="fas fa-arrow-down"></i> Compras</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/mensual" @click="cerrarTodo"><i class="fas fa-file-invoice"></i> Reporte Mensual</router-link></li>
            </ul>
          </li>

          <!-- ===== RETENCIONES ===== -->
          <li class="nav-item dropdown" :class="{ show: dropdowns.retenciones }">
            <a
              class="nav-link dropdown-toggle"
              href="#"
              role="button"
              @click.prevent="toggleDropdown('retenciones')"
            >
              <i class="fas fa-percent"></i> Retenciones
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.retenciones }">
              <li><router-link class="dropdown-item" to="/retenciones" @click="cerrarTodo">Lista de Retenciones</router-link></li>
              <li><router-link class="dropdown-item" to="/retenciones/nuevo" @click="cerrarTodo">Nueva Retención</router-link></li>
            </ul>
          </li>
        </ul>

        <!-- ===== BARRA DE BÚSQUEDA Y CONTROLES DE USUARIO ===== -->
        <div class="d-flex align-items-center gap-3 flex-wrap controls-wrapper">
          <SearchBar class="search-bar-nav" ref="searchBar" />
          <ThemeToggle />
          <div class="dropdown" ref="userDropdown" :class="{ show: userMenuOpen }">
            <button class="btn btn-outline-light btn-sm dropdown-toggle" @click="toggleUserMenu">
              <i class="fas fa-user-circle me-1"></i>
              <span>{{ user?.nombre || 'Usuario' }}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end" :class="{ show: userMenuOpen }">
              <li><a class="dropdown-item" href="#" @click.prevent="irPerfil"><i class="fas fa-id-card"></i> Mi Perfil</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" @click.prevent="cerrarSesion"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from './SearchBar.vue'
import ThemeToggle from './ThemeToggle.vue'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, logout } = useAuth()

const navbarAbierto = ref(false)
const userMenuOpen = ref(false)
const navbar = ref(null)
const userDropdown = ref(null)
const searchBar = ref(null)

const dropdowns = ref({
  documentos: false,
  maestros: false,
  inventarios: false,
  reportes: false,
  retenciones: false
})

const toggleNavbar = () => {
  navbarAbierto.value = !navbarAbierto.value
  if (navbarAbierto.value) {
    Object.keys(dropdowns.value).forEach(key => dropdowns.value[key] = false)
  }
}

const toggleDropdown = (nombre) => {
  if (navbarAbierto.value) {
    dropdowns.value[nombre] = !dropdowns.value[nombre]
    return
  }
  Object.keys(dropdowns.value).forEach(key => {
    dropdowns.value[key] = (key === nombre) ? !dropdowns.value[nombre] : false
  })
}

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
}

const cerrarTodo = () => {
  navbarAbierto.value = false
  Object.keys(dropdowns.value).forEach(key => dropdowns.value[key] = false)
  userMenuOpen.value = false
}

const handleClickOutside = (event) => {
  if (navbar.value && navbar.value.contains(event.target)) return
  if (searchBar.value && searchBar.value.$el && searchBar.value.$el.contains(event.target)) return
  cerrarTodo()
}

const irPerfil = () => {
  cerrarTodo()
  router.push('/mi-perfil')
}

const cerrarSesion = () => {
  cerrarTodo()
  logout()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* ===== DESKTOP ===== */
.search-bar-nav {
  max-width: 280px;
}

.navbar-cacao .dropdown-menu {
  display: block;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: opacity 0.25s ease, transform 0.25s ease, visibility 0.25s;
  background: #2c3e50;
  border: none;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}
.navbar-cacao .dropdown-menu.show {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.navbar-cacao .dropdown-item {
  color: #fff !important;
  padding: 8px 20px;
  transition: var(--transition);
}
.navbar-cacao .dropdown-item:hover {
  background: #3498db;
  color: #fff !important;
  border-radius: 8px;
}

/* ===== MODO OSCURO ===== */
body.dark-mode .navbar-cacao .dropdown-menu {
  background: #1e2a4a;
  border-color: #2d3748;
}
body.dark-mode .navbar-cacao .dropdown-item {
  color: #e0e0e0 !important;
}
body.dark-mode .navbar-cacao .dropdown-item:hover {
  background: #2d3748;
}

/* ===== RESPONSIVE: TABLET Y MÓVIL ===== */
@media (max-width: 992px) {
  .search-bar-nav {
    max-width: 100%;
    margin: 8px 0;
  }

  .controls-wrapper {
    flex-direction: column;
    align-items: stretch !important;
    gap: 8px;
    width: 100%;
  }

  .navbar-cacao .navbar-collapse {
    background: var(--bg-navbar);
    padding: 12px 16px;
    border-radius: 16px;
    margin-top: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    max-height: 80vh;
    overflow-y: auto;
  }

  .navbar-cacao .navbar-nav {
    gap: 2px;
    margin-bottom: 8px !important;
  }

  .navbar-cacao .navbar-nav .nav-item {
    margin: 0;
  }

  .navbar-cacao .navbar-nav .nav-link {
    padding: 8px 12px;
    font-size: 0.9rem;
    border-radius: 8px;
  }

  .navbar-cacao .dropdown-menu {
    position: static;
    float: none;
    width: auto;
    margin-top: 0;
    background: transparent !important;
    border: 0;
    box-shadow: none;
    padding-left: 12px;
    opacity: 1;
    visibility: visible;
    transform: none;
  }

  .navbar-cacao .dropdown-menu .dropdown-item {
    color: rgba(255,255,255,0.8) !important;
    padding: 6px 12px;
    font-size: 0.85rem;
    border-radius: 6px;
  }

  .navbar-cacao .dropdown-menu .dropdown-item:hover {
    background: rgba(255,255,255,0.08) !important;
  }

  .navbar-cacao .dropdown-divider {
    border-color: rgba(255,255,255,0.1);
  }

  .navbar-cacao .dropdown-toggle::after {
    margin-left: auto;
  }

  /* Ajuste para el botón de usuario */
  .navbar-cacao .btn-outline-light {
    width: 100%;
    justify-content: center;
  }

  .navbar-cacao .dropdown-menu-end {
    left: 0 !important;
    right: auto !important;
  }

  body.dark-mode .navbar-cacao .navbar-collapse {
    background: #1a1a2e;
    border-color: rgba(255,255,255,0.05);
  }

  body.dark-mode .navbar-cacao .dropdown-menu .dropdown-item {
    color: rgba(255,255,255,0.7) !important;
  }
}

@media (max-width: 576px) {
  .navbar-cacao .navbar-brand {
    font-size: 1rem;
  }

  .navbar-cacao .navbar-nav .nav-link {
    font-size: 0.8rem;
    padding: 6px 10px;
  }

  .navbar-cacao .navbar-collapse {
    padding: 8px 12px;
  }

  .search-bar-nav input {
    font-size: 0.85rem;
    padding: 8px 32px 8px 32px;
  }
}
</style>