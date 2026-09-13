<template>
  <div id="app">
    <!-- LOGIN: sin navbar -->
    <div v-if="isLoginPage">
      <router-view />
    </div>

    <!-- APP PRINCIPAL -->
    <div v-else class="app-layout">
      <Navbar />

      <main class="main-container">
        <div class="container">
          <transition name="fade" mode="out-in">
            <router-view :key="$route.fullPath" />
          </transition>
        </div>
      </main>

      <Footer />

      <!-- Floating stock alert -->
      <NotificationStock />

      <!-- Tour de bienvenida -->
      <OnboardingTour />
    </div>

    <!-- Overlays globales -->
    <LoaderOverlay />
    <PwaInstallPrompt />
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
import PwaInstallPrompt from './components/PwaInstallPrompt.vue'
import OnboardingTour from './components/OnboardingTour.vue'
import { useInactivityTimeout } from './composables/useInactivityTimeout'
import { usePermisos } from './composables/usePermisos'
import { useOnboarding } from './composables/useOnboarding'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { cargarPermisos } = usePermisos()
const onboarding = useOnboarding()

const isLoginPage = computed(() => route.path === '/login')
const isAuthenticated = computed(() => !!localStorage.getItem('token'))
const socket = inject('socket', null)
const onboardingProgramado = ref(false)

useInactivityTimeout(30)

/**
 * Pasos del tour de bienvenida.
 * Se disparan después de que el dashboard esté montado.
 */
const PASOS_TOUR = [
  {
    target: '[data-tour="brand"]',
    title: '¡Bienvenido a tu Sistema Contable!',
    description: 'Un recorrido rápido por las funciones clave. Puedes cancelarlo cuando quieras con la tecla ESC.',
    position: 'bottom',
    icon: 'fas fa-hand-sparkles',
    bullets: [
      'Funciona en cualquier dispositivo (celular, tablet, PC)',
      'Instálalo como app desde el navegador',
      'Todo se guarda automáticamente'
    ]
  },
  {
    target: '[data-tour="quick-actions"]',
    title: 'Accesos rápidos',
    description: 'Aquí tienes las acciones más usadas. Haz clic en cualquier tarjeta para ir directo a la función.',
    position: 'bottom',
    icon: 'fas fa-bolt',
    bullets: [
      'Nueva factura, guía, nota de crédito',
      'Cliente y producto rápido',
      'Consola del SRI en un clic'
    ]
  },
  {
    target: '[data-tour="kpis"]',
    title: 'Resumen del día',
    description: 'Consulta en tiempo real tus ventas, compras y documentos pendientes. Todo se actualiza automáticamente.',
    position: 'bottom',
    icon: 'fas fa-chart-pie',
    bullets: [
      'Comparativa vs ayer y vs mes anterior',
      'Verde = subida · Rojo = bajada',
      'Totales del mes en un vistazo'
    ]
  },
  {
    target: '[data-tour="documentos"]',
    title: 'Menú de Documentos',
    description: 'Desde aquí accedes a las bandejas de ventas y compras, y creas nuevos documentos.',
    position: 'bottom',
    icon: 'fas fa-file-invoice'
  },
  {
    target: '[data-tour="search"]',
    title: 'Buscador global',
    description: 'Busca cualquier cosa: clientes, productos, facturas. Atajo rápido: Ctrl + K',
    position: 'bottom',
    icon: 'fas fa-search'
  },
  {
    target: '[data-tour="user-menu"]',
    title: 'Tu cuenta',
    description: 'Desde aquí gestionas tu perfil, cierras sesión y accedes a la configuración avanzada.',
    position: 'bottom',
    icon: 'fas fa-user-circle'
  },
  {
    target: null, // Paso final sin target → centrado
    title: '¡Todo listo!',
    description: 'Empieza facturando de forma electrónica. Si necesitas repasar el tour, lo encuentras en Mi Perfil → Ayuda.',
    position: 'center',
    icon: 'fas fa-rocket',
    bullets: [
      'Configura tu RUC primero (Administración → Configuración)',
      'Carga tu certificado .p12',
      'Emite tu primera factura'
    ]
  }
]

onMounted(async () => {

  const loading = document.getElementById('app-loading')
  if (loading) {
    loading.classList.add('hide')
    setTimeout(() => loading.remove(), 500)
  }
  
  if (isAuthenticated.value) {
    try {
      await cargarPermisos()
    } catch (e) {
      console.warn('No se pudieron cargar permisos:', e)
    }
  }

  // WebSocket eventos
  if (socket) {
    socket.on('nueva-compra', (data) => {
      toast.info(`📥 Nueva compra: ${data.data?.numero_factura || 'Factura'}`)
    })
    socket.on('nueva-venta', (data) => {
      toast.info(`📤 Nueva venta: ${data.data?.numero_factura || 'Factura'}`)
    })
  }
})

// Disparar tour automáticamente si es primer login y está en dashboard
watch(
  () => [route.path, isAuthenticated.value],
  ([path, auth]) => {
    if (!auth || path !== '/') return
    if (onboardingProgramado.value) return
    if (!onboarding.verificarPrimeraVez()) return

    onboardingProgramado.value = true
    setTimeout(() => {
      onboarding.iniciar(PASOS_TOUR)
    }, 900)
  },
  { immediate: true }
)

// Exponer método para reiniciar tour desde otras vistas (ej. PerfilUsuario)
window.__reiniciarTour__ = () => {
  onboarding.reiniciar()
  onboarding.iniciar(PASOS_TOUR, { force: true })
}
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-container {
  flex: 1;
  padding: 32px 0 48px;
  min-height: calc(100vh - var(--navbar-height) - 320px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 768px) {
  .main-container {
    padding: 20px 0 32px;
  }
}
</style>