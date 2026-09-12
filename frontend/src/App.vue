<template>
  <div id="app">
    <div v-if="isLoginPage">
      <router-view />
    </div>
    <div v-else>
      <Navbar />

      <div class="container main-container">
        <!-- Banner de bienvenida -->
        <transition name="banner">
          <div v-if="isAuthenticated && mostrarBienvenida" class="welcome-banner">
            <div class="welcome-icon">
              <i class="fas fa-hand-wave"></i>
            </div>
            <div class="welcome-content">
              <div class="welcome-title">
                ¡Hola, <strong>{{ user?.nombre || 'Usuario' }}</strong>!
              </div>
              <div class="welcome-text">
                Bienvenido al Sistema de Gestión Empresarial
              </div>
            </div>
            <button class="welcome-close" @click="mostrarBienvenida = false" title="Cerrar">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </transition>

        <transition name="fade" mode="out-in">
          <router-view />
        </transition>
      </div>

      <Footer />
      <NotificationStock />
    </div>

    <LoaderOverlay />
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
const mostrarBienvenida = ref(true)

const socket = inject('socket')

useInactivityTimeout(30)

onMounted(async () => {
  // Ocultar banner automáticamente después de 6 segundos
  setTimeout(() => {
    mostrarBienvenida.value = false
  }, 6000)

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

<style scoped>
.main-container {
  padding: 30px 0 40px;
  min-height: calc(100vh - 400px);
}

/* ===== BANNER DE BIENVENIDA ===== */
.welcome-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.08), rgba(241, 196, 15, 0.06));
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-left: 4px solid var(--primary-color);
  border-radius: 14px;
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
}

.welcome-banner::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(52, 152, 219, 0.05));
  pointer-events: none;
}

.welcome-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.2rem;
  flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
}

.welcome-content {
  flex: 1;
  min-width: 0;
}

.welcome-title {
  font-size: 1rem;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.welcome-title strong {
  font-weight: 700;
  color: var(--primary-color);
}

.welcome-text {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.welcome-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.welcome-close:hover {
  background: var(--bg-table-stripe);
  color: var(--text-primary);
}

/* ===== TRANSICIONES ===== */
.banner-enter-active,
.banner-leave-active {
  transition: all 0.4s var(--ease-out);
}
.banner-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.banner-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  .main-container {
    padding: 20px 0 30px;
  }
  .welcome-banner {
    padding: 14px 16px;
    gap: 12px;
  }
  .welcome-icon {
    width: 38px;
    height: 38px;
    font-size: 1rem;
  }
  .welcome-title {
    font-size: 0.92rem;
  }
  .welcome-text {
    font-size: 0.75rem;
  }
}
</style>