<template>
  <!-- Banner de instalación -->
  <transition name="slide-up">
    <div v-if="mostrarPrompt" class="pwa-install-prompt">
      <div class="pwa-prompt-icon">
        <img src="/pwa-192x192.png" alt="App" />
      </div>
      <div class="pwa-prompt-content">
        <div class="pwa-prompt-title">Instalar Sistema Contable</div>
        <div class="pwa-prompt-text">
          Accede más rápido desde tu pantalla de inicio. Funciona incluso sin conexión.
        </div>
      </div>
      <div class="pwa-prompt-actions">
        <button class="btn-pwa-install" @click="instalar">
          <i class="fas fa-download"></i> Instalar
        </button>
        <button class="btn-pwa-dismiss" @click="descartar" title="Cerrar">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  </transition>

  <!-- Notificación de actualización disponible -->
  <transition name="slide-up">
    <div v-if="mostrarUpdate" class="pwa-update-prompt">
      <i class="fas fa-sync-alt fa-spin"></i>
      <span>Hay una nueva versión disponible</span>
      <button class="btn-pwa-update" @click="actualizar">
        Actualizar
      </button>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const mostrarPrompt = ref(false)
const mostrarUpdate = ref(false)
let deferredPrompt = null

// ===== DETECTAR SI YA SE DESCARTÓ =====
const DISMISS_KEY = 'pwa_install_dismissed'
const DISMISS_DAYS = 7

const fueDescartadoRecientemente = () => {
  const fecha = localStorage.getItem(DISMISS_KEY)
  if (!fecha) return false
  const diff = Date.now() - parseInt(fecha, 10)
  return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

// ===== DETECTAR SI YA ESTÁ INSTALADA =====
const yaInstalada = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://')
}

// ===== CAPTURAR EL EVENTO beforeinstallprompt =====
const handleBeforeInstall = (e) => {
  e.preventDefault()
  deferredPrompt = e

  // Mostrar el banner si no ha sido descartado y no está instalada
  if (!fueDescartadoRecientemente() && !yaInstalada()) {
    setTimeout(() => {
      mostrarPrompt.value = true
    }, 3000) // Mostrar después de 3 segundos
  }
}

const instalar = async () => {
  if (!deferredPrompt) {
    // Si no hay prompt nativo (iOS), mostrar instrucciones
    alert(
      'Para instalar la app en tu dispositivo:\n\n' +
      '📱 iOS (iPhone/iPad): Toca el botón Compartir y elige "Añadir a pantalla de inicio"\n\n' +
      '🤖 Android: Toca el menú (3 puntos) y elige "Instalar app" o "Añadir a pantalla de inicio"'
    )
    mostrarPrompt.value = false
    return
  }

  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice

  if (outcome === 'accepted') {
    console.log('✅ App instalada')
    mostrarPrompt.value = false
  } else {
    console.log('❌ Instalación cancelada')
  }

  deferredPrompt = null
}

const descartar = () => {
  localStorage.setItem(DISMISS_KEY, Date.now().toString())
  mostrarPrompt.value = false
}

// ===== REGISTRO DEL SERVICE WORKER =====
const {
  needRefresh,
  updateServiceWorker
} = useRegisterSW({
  onRegisteredSW(swUrl, r) {
    console.log('✅ Service Worker registrado:', swUrl)
    // Verificar actualizaciones cada hora
    if (r) {
      setInterval(() => {
        r.update()
      }, 60 * 60 * 1000)
    }
  },
  onRegisterError(error) {
    console.error('❌ Error registrando Service Worker:', error)
  }
})

const actualizar = () => {
  updateServiceWorker(true)
}

// ===== DETECTAR ACTUALIZACIÓN =====
onMounted(() => {
  window.addEventListener('beforeinstallprompt', handleBeforeInstall)

  // Escuchar cambios en needRefresh
  const checkUpdate = setInterval(() => {
    if (needRefresh.value && !mostrarUpdate.value) {
      mostrarUpdate.value = true
    }
  }, 1000)

  return () => clearInterval(checkUpdate)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
})
</script>

<style scoped>
/* ===== BANNER DE INSTALACIÓN ===== */
.pwa-install-prompt {
  position: fixed;
  bottom: 20px;
  left: 20px;
  right: 20px;
  max-width: 500px;
  margin: 0 auto;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 10000;
  transition: all 0.3s ease;
}

.pwa-prompt-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.pwa-prompt-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pwa-prompt-content {
  flex: 1;
  min-width: 0;
}
.pwa-prompt-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.pwa-prompt-text {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.pwa-prompt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-pwa-install {
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-pwa-install:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.4);
}

.btn-pwa-dismiss {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.btn-pwa-dismiss:hover {
  background: var(--bg-table-stripe);
  color: var(--text-primary);
}

/* ===== NOTIFICACIÓN DE ACTUALIZACIÓN ===== */
.pwa-update-prompt {
  position: fixed;
  bottom: 20px;
  left: 20px;
  right: 20px;
  max-width: 400px;
  margin: 0 auto;
  background: linear-gradient(135deg, #27ae60, #229954);
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(39, 174, 96, 0.4);
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10000;
  font-size: 0.9rem;
  font-weight: 500;
}

.btn-pwa-update {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 6px 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
}
.btn-pwa-update:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ===== TRANSICIONES ===== */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from {
  transform: translateY(100px);
  opacity: 0;
}
.slide-up-leave-to {
  transform: translateY(100px);
  opacity: 0;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 576px) {
  .pwa-install-prompt {
    flex-direction: column;
    align-items: stretch;
    padding: 14px;
  }
  .pwa-prompt-icon {
    display: none;
  }
  .pwa-prompt-actions {
    justify-content: flex-end;
  }
}
</style>