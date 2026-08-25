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
          <li class="nav-item dropdown" ref="dropdownReportes">
            <a class="nav-link dropdown-toggle" href="#" id="documentosDropdown" role="button" data-bs-toggle="dropdown">
              <i class="fas fa-file-invoice"></i> Documentos
            </a>
            <ul class="dropdown-menu">
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=factura">Nueva Factura</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=guia_remision">Guía de Remisión</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=exportacion">Factura Exportación</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=reembolso">Factura Reembolso</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=retencion">Comprobante Retención</router-link></li>
              <li><router-link class="dropdown-item" to="/ventas/nuevo?tipo=liquidacion">Liquidación Compra</router-link></li>
              <li><hr class="dropdown-divider"></li>
              <li><router-link class="dropdown-item" to="/ventas">Consultar Documentos</router-link></li>
              <li><router-link class="dropdown-item" to="/compras">Bandeja de Compras</router-link></li>
            </ul>
          </li>

          <!-- ===== MAESTROS ===== -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="maestrosDropdown" role="button" data-bs-toggle="dropdown">
              <i class="fas fa-database"></i> Maestros
            </a>
            <ul class="dropdown-menu">
              <li><router-link class="dropdown-item" to="/productos"><i class="fas fa-boxes"></i> Productos</router-link></li>
              <li><router-link class="dropdown-item" to="/categorias"><i class="fas fa-tags"></i> Categorías</router-link></li>
              <li><router-link class="dropdown-item" to="/clientes"><i class="fas fa-users"></i> Clientes</router-link></li>
              <li><router-link class="dropdown-item" to="/proveedores"><i class="fas fa-truck"></i> Proveedores</router-link></li>
            </ul>
          </li>

          <!-- ===== REPORTES ===== -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="reportesDropdown" role="button" data-bs-toggle="dropdown">
              <i class="fas fa-chart-bar"></i> Reportes
            </a>
            <ul class="dropdown-menu">
              <li><router-link class="dropdown-item" to="/reportes/ventas"><i class="fas fa-arrow-up"></i> Ventas</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/compras"><i class="fas fa-arrow-down"></i> Compras</router-link></li>
              <li><router-link class="dropdown-item" to="/kardex"><i class="fas fa-clipboard-list"></i> Kardex</router-link></li>
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
import { onMounted, ref } from 'vue'
import { Dropdown } from 'bootstrap'

const dropdownReportes = ref(null)

onMounted(() => {
  // Inicializar todos los dropdowns
  document.querySelectorAll('.dropdown-toggle').forEach(el => {
    new Dropdown(el)
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