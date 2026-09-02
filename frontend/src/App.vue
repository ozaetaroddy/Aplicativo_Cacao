<template>
  <div id="app" :class="{ 'dark-mode': isDark }">
    <Navbar />
    <div class="container main-container">
      <Breadcrumbs />
      <div class="alert alert-info alert-dismissible fade show config-alert" role="alert">
        <i class="fas fa-info-circle me-2"></i>
        <strong>Bienvenido</strong> al Sistema Global de Gestión Empresarial.
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
      <router-view />
    </div>
    <Footer />
    <NotificationStock />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useThemeStore } from './stores/themeStore'
import Navbar from './components/Navbar.vue'
import Footer from './components/Footer.vue'
import NotificationStock from './components/NotificationStock.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)

onMounted(() => {
  themeStore.aplicarTema()
})
</script>