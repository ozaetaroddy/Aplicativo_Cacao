<template>
  <nav class="navbar navbar-expand-lg navbar-cacao">
    <div class="container-fluid">
      <router-link class="navbar-brand" to="/">
        <i class="fas fa-microchip"></i> System Ozaet's Electronics
      </router-link>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon" style="filter: invert(1);"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><router-link class="nav-link" to="/" exact-active-class="active"><i class="fas fa-home"></i> Página Principal</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/productos" active-class="active"><i class="fas fa-boxes"></i> Productos</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/categorias" active-class="active"><i class="fas fa-tags"></i> Categorías</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/clientes" active-class="active"><i class="fas fa-users"></i> Clientes</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/proveedores" active-class="active"><i class="fas fa-truck"></i> Proveedores</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/compras" active-class="active"><i class="fas fa-shopping-cart"></i> Compras</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/ventas" active-class="active"><i class="fas fa-hand-holding-usd"></i> Ventas</router-link></li>
          <li class="nav-item"><router-link class="nav-link" to="/kardex" active-class="active"><i class="fas fa-clipboard-list"></i> Kardex</router-link></li>
          <li class="nav-item dropdown" @click="toggleDropdown">
            <a class="nav-link dropdown-toggle" href="#" role="button" :aria-expanded="dropdownOpen">
              <i class="fas fa-chart-bar"></i> Reportes
            </a>
            <ul class="dropdown-menu" :class="{ show: dropdownOpen }">
              <li><router-link class="dropdown-item" to="/reportes/ventas" @click="dropdownOpen = false"><i class="fas fa-arrow-up"></i> Ventas</router-link></li>
              <li><router-link class="dropdown-item" to="/reportes/compras" @click="dropdownOpen = false"><i class="fas fa-arrow-down"></i> Compras</router-link></li>
            </ul>
          </li>
          <li class="nav-item"><router-link class="nav-link" to="/facturacion" active-class="active"><i class="fas fa-file-invoice"></i> Facturación</router-link></li>
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

const dropdownOpen = ref(false)

const toggleDropdown = (event) => {
  event.preventDefault()
  dropdownOpen.value = !dropdownOpen.value
}
</script>

<style scoped>
@media (max-width: 992px) {
  .dropdown-menu {
    background: transparent !important;
    box-shadow: none !important;
    padding-left: 20px;
  }
  .dropdown-item {
    color: rgba(255,255,255,0.85) !important;
  }
  .dropdown-item:hover {
    background: rgba(255,255,255,0.1) !important;
  }
}
.dropdown-menu {
  display: block;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s ease;
}
.dropdown-menu.show {
  opacity: 1;
  visibility: visible;
}
</style>