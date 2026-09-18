<template>
  <div id="app">
    <!-- ============================================================ -->
    <!-- SKIP LINK (accesibilidad — visible solo al enfocar con Tab) -->
    <!-- ============================================================ -->
    <a
      v-if="!isLoginPage"
      href="#main-content"
      class="skip-link"
    >
      Saltar al contenido principal
    </a>

    <!-- ============================================================ -->
    <!-- LOGIN: layout sin navbar/footer -->
    <!-- ============================================================ -->
    <div v-if="isLoginPage" class="login-layout">
      <router-view />
    </div>

    <!-- ============================================================ -->
    <!-- APP PRINCIPAL -->
    <!-- ============================================================ -->
    <div v-else class="app-layout">
      <Navbar />

      <main
        id="main-content"
        class="main-container"
        tabindex="-1"
      >
        <div class="container">
          <transition name="fade" mode="out-in">
            <router-view :key="$route.fullPath" />
          </transition>
        </div>
      </main>

      <Footer />

      <!-- Overlays flotantes -->
      <NotificationStock />
      <OnboardingTour />
    </div>

    <!-- ============================================================ -->
    <!-- Overlays globales (siempre presentes) -->
    <!-- ============================================================ -->
    <LoaderOverlay />
    <PwaInstallPrompt />
  </div>
</template>

<script setup>
// ============================================================
// App.vue — Componente raíz
// ------------------------------------------------------------
// Responsabilidades:
//   - Decidir layout según ruta (login vs app).
//   - Cargar permisos al autenticar.
//   - Suscribirse a eventos WebSocket globales (con cleanup).
//   - Disparar el tour de bienvenida la primera vez.
//   - Exponer `reiniciarTour` vía provide/inject.
// ============================================================

import {
  computed,
  onMounted,
  onBeforeUnmount,
  ref,
  inject,
  watch,
  provide
} from 'vue'
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
import { useAuth } from './composables/useAuth'

// ============================================================
// DEPENDENCIAS
// ============================================================
const route = useRoute()
const router = useRouter()
const toast = useToast()
const socket = inject('socket', null)

const { cargarPermisos } = usePermisos()
const onboarding = useOnboarding()

// ============================================================
// ESTADO
// ============================================================
const isLoginPage = computed(() => route.path === '/login')

/**
 * ¿Hay sesión? Usamos el `auth_hint` (flag no sensible) en vez
 * de `token` en localStorage. El backend usa cookies httpOnly,
 * así que el frontend NUNCA debe almacenar el JWT.
 */
// ✅ DESPUÉS

const { user, isAuthenticated } = useAuth()

const onboardingProgramado = ref(false)

// Auto-logout por inactividad (30 min).
useInactivityTimeout(30)

// ============================================================
// TOUR DE BIENVENIDA — pasos
// ============================================================
const PASOS_TOUR = [
  {
    target: '[data-tour="brand"]',
    title: '¡Bienvenido a tu Sistema Contable!',
    description:
      'Un recorrido rápido por las funciones clave. Puedes cancelarlo cuando quieras con la tecla ESC.',
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
    description:
      'Aquí tienes las acciones más usadas. Haz clic en cualquier tarjeta para ir directo a la función.',
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
    description:
      'Consulta en tiempo real tus ventas, compras y documentos pendientes. Todo se actualiza automáticamente.',
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
    description:
      'Desde aquí accedes a las bandejas de ventas y compras, y creas nuevos documentos.',
    position: 'bottom',
    icon: 'fas fa-file-invoice'
  },
  {
    target: '[data-tour="search"]',
    title: 'Buscador global',
    description:
      'Busca cualquier cosa: clientes, productos, facturas. Atajo rápido: Ctrl + K',
    position: 'bottom',
    icon: 'fas fa-search'
  },
  {
    target: '[data-tour="user-menu"]',
    title: 'Tu cuenta',
    description:
      'Desde aquí gestionas tu perfil, cierras sesión y accedes a la configuración avanzada.',
    position: 'bottom',
    icon: 'fas fa-user-circle'
  },
  {
    target: null,
    title: '¡Todo listo!',
    description:
      'Empieza facturando de forma electrónica. Si necesitas repasar el tour, lo encuentras en Mi Perfil → Ayuda.',
    position: 'center',
    icon: 'fas fa-rocket',
    bullets: [
      'Configura tu RUC primero (Administración → Configuración)',
      'Carga tu certificado .p12',
      'Emite tu primera factura'
    ]
  }
]

/**
 * Reinicia el tour de bienvenida. Se expone vía provide/inject
 * para que cualquier descendiente lo invoque sin usar globals.
 */
function reiniciarTour() {
  onboarding.reiniciar()
  onboarding.iniciar(PASOS_TOUR, { force: true })
}

provide('reiniciarTour', reiniciarTour)

// ============================================================
// WEBSOCKET — handlers nombrados (para poder hacer off)
// ============================================================
function handleNuevaCompra(data) {
  const numero = data?.data?.numero_factura || data?.numero_factura || 'Factura'
  toast.info(`📥 Nueva compra: ${numero}`)
}

function handleNuevaVenta(data) {
  const numero = data?.data?.numero_factura || data?.numero_factura || 'Factura'
  toast.info(`📤 Nueva venta: ${numero}`)
}

function handleSesionInvalidada() {
  toast.warning('Tu sesión fue cerrada. Inicia sesión nuevamente.')
  try { localStorage.removeItem('auth_hint') } catch { /* noop */ }
  router.push('/login')
}

// ============================================================
// LIFECYCLE
// ============================================================
onMounted(async () => {
  // ---- Ocultar el splash de carga inicial ----
  const loading = document.getElementById('app-loading')
  if (loading) {
    loading.classList.add('hide')
    setTimeout(() => loading.remove(), 500)
  }

  // ---- Cargar permisos si hay sesión ----
  if (isAuthenticated.value) {
    try {
      await cargarPermisos()
    } catch (err) {
      console.warn('[app] No se pudieron cargar permisos:', err)
    }
  }

  // ---- Suscribirse a WebSocket ----
  if (socket) {
    socket.on('nueva-compra', handleNuevaCompra)
    socket.on('nueva-venta', handleNuevaVenta)
    socket.on('sesion-invalidada', handleSesionInvalidada)
  }
})

onBeforeUnmount(() => {
  // ---- Cleanup de listeners (evita memory leaks) ----
  if (socket) {
    socket.off('nueva-compra', handleNuevaCompra)
    socket.off('nueva-venta', handleNuevaVenta)
    socket.off('sesion-invalidada', handleSesionInvalidada)
  }
})

// ============================================================
// WATCHERS
// ============================================================

// Disparar tour automáticamente la primera vez que se entra al dashboard.
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
</script>

<style scoped>
/* ============================================================
   LAYOUT
   ============================================================ */
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

/* Quitar el outline del main al saltar con skip-link */
.main-container:focus {
  outline: none;
}

/* ============================================================
   SKIP LINK (accesibilidad)
   ============================================================ */
.skip-link {
  position: absolute;
  top: -100px;
  left: 16px;
  z-index: var(--z-toast, 10000);
  padding: 10px 18px;
  background: var(--primary-color);
  color: #fff;
  border-radius: var(--radius-md);
  font-weight: var(--fw-semibold);
  font-size: 0.875rem;
  text-decoration: none;
  box-shadow: var(--shadow-lg);
  transition: top var(--transition-fast);
}

.skip-link:focus {
  top: 16px;
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* ============================================================
   TRANSICIÓN DE RUTAS
   ============================================================ */
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

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 768px) {
  .main-container {
    padding: 20px 0 32px;
  }
}

/* Respetar reduce-motion */
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>