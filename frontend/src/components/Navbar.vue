<template>
  <nav class="navbar navbar-expand-lg navbar-cacao">
    <div class="container-fluid">
      <router-link class="navbar-brand" to="/">
        <i class="fas fa-calculator"></i> Sistema Contable
      </router-link>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon" style="filter: invert(1);"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <!-- ===== INICIO ===== -->
          <li class="nav-item">
            <router-link class="nav-link" to="/" exact-active-class="active">
              <i class="fas fa-home"></i> Inicio
            </router-link>
          </li>

          <!-- ===== DOCUMENTOS ===== -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="documentosDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="fas fa-file-invoice"></i> Documentos
            </a>
            <ul class="dropdown-menu" aria-labelledby="documentosDropdown">
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=factura" @click="cerrarDropdown">Nueva Factura</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=guia_remision" @click="cerrarDropdown">Guía de Remisión</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=exportacion" @click="cerrarDropdown">Factura Exportación</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=reembolso" @click="cerrarDropdown">Factura Reembolso</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=retencion" @click="cerrarDropdown">Comprobante Retención</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=liquidacion" @click="cerrarDropdown">Liquidación Compra</router-link></li>
              <li><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/ventas" @click="cerrarDropdown">Consultar Documentos</router-link></li>
              <li><router-link class="dropdown-item" to="/compras" @click="cerrarDropdown">Bandeja de Compras</router-link></li>
            </ul>
          </li>

          <!-- ===== MAESTROS ===== -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="maestrosDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="fas fa-database"></i> Maestros
            </a>
            <ul class="dropdown-menu" aria-labelledby="maestrosDropdown">
              <li><router-link class="dropdown-item" to="/productos" @click="cerrarDropdown"><i class="fas fa-boxes"></i> Productos</router-link></li>
              <li><router-link class="dropdown-item" to="/categorias" @click="cerrarDropdown"><i class="fas fa-tags"></i> Categorías</router-link></li>
              <li><router-link class="dropdown-item" to="/clientes" @click="cerrarDropdown"><i class="fas fa-users"></i> Clientes</router-link></li>
              <li><router-link class="dropdown-item" to="/proveedores" @click="cerrarDropdown"><i class="fas fa-truck"></i> Proveedores</router-link></li>
            </ul>
          </li>

          <!-- ===== REPORTES ===== -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="reportesDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="fas fa-chart-bar"></i> Reportes
            </a>
            <ul class="dropdown-menu" aria-labelledby="reportesDropdown">
              <li><router-link class="dropdown-item" to="/reportes/ventas" @click="cerrarDropdown"><i class="fas fa-arrow-up"></i> Ventas</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/compras" @click="cerrarDropdown"><i class="fas fa-arrow-down"></i> Compras</router-link></li>
              <li><router-link class="dropdown-item" to="/kardex" @click="cerrarDropdown"><i class="fas fa-clipboard-list"></i> Kardex</router-link></li>
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
import { onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Dropdown } from 'bootstrap'

// Función para inicializar todos los dropdowns
const inicializarDropdowns = () => {
  document.querySelectorAll('.dropdown-toggle').forEach(el => {
    // Evitar duplicados
    if (!el._dropdown) {
      el._dropdown = new Dropdown(el)
    }
  })
}

// Cerrar dropdowns al hacer clic en un enlace
const cerrarDropdown = (event) => {
  const dropdownElement = event.target.closest('.dropdown')
  if (dropdownElement) {
    const toggle = dropdownElement.querySelector('.dropdown-toggle')
    if (toggle && toggle._dropdown) {
      toggle._dropdown.hide()
    }
  }
}

// Inicializar al montar y después de cada navegación
const router = useRouter()

onMounted(() => {
  nextTick(() => {
    inicializarDropdowns()
  })

  // Escuchar cambios de ruta para reinicializar
  router.afterEach(() => {
    nextTick(() => {
      inicializarDropdowns()
    })
  })
})
</script>

<style scoped>
@media (max-width: 992px) {
  .navbar-cacao .dropdown-menu {
    background: transparent;
    box-shadow: none;
    padding-left: 20px;
  }
  .navbar-cacao .dropdown-item {
    color: rgba(255,255,255,0.85) !important;
  }
  .navbar-cacao .dropdown-item:hover {
    background: rgba(255,255,255,0.1);
  }
}
</style>