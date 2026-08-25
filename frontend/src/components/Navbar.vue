<template>
  <nav class="navbar navbar-expand-lg navbar-cacao">
    <div class="container-fluid">
      <router-link class="navbar-brand" to="/">
        <i class="fas fa-calculator"></i> Sistema Contable
      </router-link>
      <button
        class="navbar-toggler"
        type="button"
        @click="toggleNavbar"
      >
        <span class="navbar-toggler-icon" style="filter: invert(1);"></span>
      </button>
      <div class="collapse navbar-collapse" :class="{ show: navbarAbierto }" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <!-- ===== INICIO ===== -->
          <li class="nav-item">
            <router-link class="nav-link" to="/" exact-active-class="active" @click="cerrarTodo">
              <i class="fas fa-home"></i> Inicio
            </router-link>
          </li>

          <!-- ===== DOCUMENTOS (dropdown controlado por Vue) ===== -->
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
              <li><router-link class="dropdown-item" to="/ventas" @click="cerrarTodo">Consultar Documentos</router-link></li>
              <li><router-link class="dropdown-item" to="/compras" @click="cerrarTodo">Bandeja de Compras</router-link></li>
            </ul>
          </li>

          <!-- ===== MAESTROS ===== -->
          <li class="nav-item dropdown" :class="{ show: dropdowns.maestros }">
            <a
              class="nav-link dropdown-toggle"
              href="#"
              role="button"
              @click.prevent="toggleDropdown('maestros')"
            >
              <i class="fas fa-database"></i> Maestros
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdowns.maestros }">
              <li><router-link class="dropdown-item" to="/productos" @click="cerrarTodo"><i class="fas fa-boxes"></i> Productos</router-link></li>
              <li><router-link class="dropdown-item" to="/categorias" @click="cerrarTodo"><i class="fas fa-tags"></i> Categorías</router-link></li>
              <li><router-link class="dropdown-item" to="/clientes" @click="cerrarTodo"><i class="fas fa-users"></i> Clientes</router-link></li>
              <li><router-link class="dropdown-item" to="/proveedores" @click="cerrarTodo"><i class="fas fa-truck"></i> Proveedores</router-link></li>
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
              <li><router-link class="dropdown-item" to="/kardex" @click="cerrarTodo"><i class="fas fa-clipboard-list"></i> Kardex</router-link></li>
            </ul>
          </li>
        </ul>
        <span class="navbar-text">
          <i class="fas fa-database me-1"></i> MongoDB
        </span>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue'

// Estado del navbar móvil
const navbarAbierto = ref(false)

// Estado de cada dropdown (cerrados por defecto)
const dropdowns = ref({
  documentos: false,
  maestros: false,
  reportes: false
})

// Alternar el navbar en móvil
const toggleNavbar = () => {
  navbarAbierto.value = !navbarAbierto.value
}

// Alternar un dropdown específico y cerrar los otros
const toggleDropdown = (nombre) => {
  // Cerrar todos
  Object.keys(dropdowns.value).forEach(key => {
    dropdowns.value[key] = false
  })
  // Abrir el que se hizo clic
  dropdowns.value[nombre] = true
}

// Cerrar todo (navbar y dropdowns)
const cerrarTodo = () => {
  navbarAbierto.value = false
  Object.keys(dropdowns.value).forEach(key => {
    dropdowns.value[key] = false
  })
}
</script>

<style scoped>
/* ===== ESTILOS PARA DROPDOWNS CONTROLADOS POR VUE ===== */
/* Aseguramos que los dropdowns se comporten como en Bootstrap */
.navbar-cacao .dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  min-width: 10rem;
  padding: 0.5rem 0;
  margin: 0.125rem 0 0;
  font-size: 1rem;
  color: #212529;
  text-align: left;
  list-style: none;
  background-color: #fff;
  background-clip: padding-box;
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 0.375rem;
}

.navbar-cacao .dropdown-menu.show {
  display: block;
}

/* En móvil, los dropdowns se muestran como lista */
@media (max-width: 992px) {
  .navbar-cacao .dropdown-menu {
    position: static;
    float: none;
    width: auto;
    margin-top: 0;
    background-color: transparent;
    border: 0;
    box-shadow: none;
    padding-left: 1rem;
  }
  .navbar-cacao .dropdown-menu .dropdown-item {
    color: rgba(255,255,255,0.85) !important;
  }
  .navbar-cacao .dropdown-menu .dropdown-item:hover {
    background: rgba(255,255,255,0.1);
  }
  .navbar-cacao .dropdown-menu.show {
    display: block;
  }
}

/* Estilo de los items del dropdown en desktop */
.navbar-cacao .dropdown-item {
  color: #212529 !important;
}
.navbar-cacao .dropdown-item:hover {
  background: #f8f9fa;
}
</style>