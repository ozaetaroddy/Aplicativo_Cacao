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
  </div>
</template>

<script setup>
import { computed, onMounted, ref, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import Navbar from './components/Navbar.vue'
import Footer from './components/Footer.vue'
import NotificationStock from './components/NotificationStock.vue'
import LoaderOverlay from './components/LoaderOverlay.vue'
import { useInactivityTimeout } from './composables/useInactivityTimeout'
import { usePermisos } from './composables/usePermisos'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { cargarPermisos, limpiarCache } = usePermisos()
const { user: authUser, isAuthenticated: authIsAuthenticated } = useAuth()

const isLoginPage = computed(() => route.path === '/login')
const isAuthenticated = computed(() => !!localStorage.getItem('token'))
const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

const socket = inject('socket')

useInactivityTimeout(30)

// ===== DETECTAR CAMBIO DE USUARIO =====
// Escucha cambios en la ruta: cada vez que entramos o salimos del login,
// refrescamos el usuario y los permisos
watch(
  () => route.path,
  async (newPath, oldPath) => {
    if (newPath === '/login') {
      // Entrando al login: limpiar todo
      limpiarCache()
      user.value = null
      return
    }

    // Al cambiar de ruta y estando autenticado, verificar que los permisos
    // correspondan al usuario actual. Si cambió, recargar.
    if (localStorage.getItem('token')) {
      user.value = JSON.parse(localStorage.getItem('user') || 'null')
      try {
        await cargarPermisos()
      } catch (e) {
        console.warn('No se pudieron cargar permisos:', e)
      }
    }
  }
)

onMounted(async () => {
  // Si hay sesión, cargar permisos al iniciar
  if (isAuthenticated.value) {
    try {
      await cargarPermisos()
    } catch (e) {
      console.warn('No se pudieron cargar permisos:', e)
    }
  } else {
    limpiarCache()
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
/* Los estilos ya están en styles.css */
</style>