<template>
  <div id="app">
    <div v-if="isLoginPage">
      <router-view />
    </div>
    <div v-else>
      <Navbar />
      <div class="container main-container">
        <div v-if="isAuthenticated" class="alert alert-info alert-dismissible fade show config-alert" role="alert">
          <i class="fas fa-info-circle me-2"></i>
          <strong>Bienvenido</strong> {{ user?.nombre || 'Usuario' }} al Sistema Global de Gestión Empresarial.
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
        <transition name="fade" mode="out-in">
          <router-view />
        </transition>
      </div>
      <Footer />
      <NotificationStock />
    </div>
    <LoaderOverlay />

    <!-- Prompt de instalación PWA -->
    <PwaInstallPrompt />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, inject } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'vue-toastification'
import Navbar from './components/Navbar.vue'
import Footer from './components/Footer.vue'
import NotificationStock from './components/NotificationStock.vue'
import LoaderOverlay from './components/LoaderOverlay.vue'
import PwaInstallPrompt from './components/PwaInstallPrompt.vue'
import { useInactivityTimeout } from './composables/useInactivityTimeout'
import { usePermisos } from './composables/usePermisos'

const route = useRoute()
const toast = useToast()
const { cargarPermisos } = usePermisos()

const isLoginPage = computed(() => route.path === '/login')
const isAuthenticated = computed(() => !!localStorage.getItem('token'))
const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

const socket = inject('socket')

useInactivityTimeout(30)

onMounted(async () => {
  if (isAuthenticated.value) {
    try {
      await cargarPermisos()
    } catch (e) {
      console.warn('No se pudieron cargar permisos:', e)
    }
  }

  if (socket) {
    socket.on('nueva-compra', (data) => {
      toast.info(`📥 Nueva compra: ${data.data?.numero_factura || 'Factura'}`)
    })
    socket.on('nueva-venta', (data) => {
      toast.info(`📤 Nueva venta: ${data.data?.numero_factura || 'Factura'}`)
    })
  }
})
</script>

<style>
/* Los estilos están en styles.css */
</style>