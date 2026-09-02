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
          <!-- ... menús ... -->
        </ul>
        <div class="d-flex align-items-center gap-2">
          <ThemeToggle />
          <span class="navbar-text">
            <i class="fas fa-database me-1"></i> MongoDB
          </span>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
import ThemeToggle from './ThemeToggle.vue'

const navbarAbierto = ref(false)
const dropdowns = ref({
  documentos: false,
  maestros: false,
  inventarios: false,
  reportes: false
})

const toggleNavbar = () => {
  navbarAbierto.value = !navbarAbierto.value
}

const toggleDropdown = (nombre) => {
  if (dropdowns.value[nombre]) {
    dropdowns.value[nombre] = false
  } else {
    Object.keys(dropdowns.value).forEach(key => {
      dropdowns.value[key] = false
    })
    dropdowns.value[nombre] = true
  }
}

const cerrarTodo = () => {
  navbarAbierto.value = false
  Object.keys(dropdowns.value).forEach(key => {
    dropdowns.value[key] = false
  })
}
</script>

<style scoped>
/* ... estilos existentes ... */
</style>