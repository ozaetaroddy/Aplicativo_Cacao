<template>
  <!-- Banner de instalación -->
  <transition name="slide-up">
    <div
      v-if="mostrarPrompt && !modalAbierto"
      class="pwa-install-prompt"
      role="dialog"
      aria-label="Instalar aplicación"
    >
      <div class="pwa-prompt-icon" aria-hidden="true">
        <img src="/pwa-192x192.png" alt="" />
      </div>
      <div class="pwa-prompt-content">
        <div class="pwa-prompt-title">Instalar Sistema Contable</div>
        <div class="pwa-prompt-text">
          Accede más rápido desde tu pantalla de inicio. Funciona incluso sin conexión.
        </div>
      </div>
      <div class="pwa-prompt-actions">
        <button
          type="button"
          class="btn-pwa-install"
          @click="instalar"
          :disabled="instalando"
        >
          <i
            class="fas"
            :class="instalando ? 'fa-spinner fa-spin' : 'fa-download'"
            aria-hidden="true"
          ></i>
          {{ instalando ? 'Instalando…' : 'Instalar' }}
        </button>
        <button
          type="button"
          class="btn-pwa-dismiss"
          @click="descartar"
          title="Cerrar"
          aria-label="Cerrar"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </transition>

  <!-- Notificación de actualización disponible -->
  <transition name="slide-up">
    <div
      v-if="mostrarUpdate && !modalAbierto"
      class="pwa-update-prompt"
      role="status"
      aria-live="polite"
    >
      <i class="fas fa-sync-alt fa-spin" aria-hidden="true"></i>
      <span>Hay una nueva versión disponible</span>
      <button
        type="button"
        class="btn-pwa-update"
        @click="actualizar"
      >
        Actualizar
      </button>
    </div>
  </transition>

  <!-- Modal instrucciones (iOS / Safari / Firefox) -->
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="modalAbierto"
        class="pwa-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-modal-title"
        @click.self="cerrarModal"
      >
        <div class="pwa-modal">
          <div class="pwa-modal-header">
            <h3 id="pwa-modal-title" class="pwa-modal-title">
              <i class="fas fa-mobile-alt" aria-hidden="true"></i>
              Instalar la aplicación
            </h3>
            <button
              type="button"
              class="pwa-modal-close"
              @click="cerrarModal"
              aria-label="Cerrar"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>

          <div class="pwa-modal-body">
            <template v-if="esIOS">
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">1</div>
                <div>
                  <strong>Toca el botón Compartir</strong>
                  <div class="pwa-modal-step-desc">
                    Es el ícono
                    <i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i>
                    en la barra inferior de Safari.
                  </div>
                </div>
              </div>
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">2</div>
                <div>
                  <strong>Elige "Añadir a pantalla de inicio"</strong>
                  <div class="pwa-modal-step-desc">
                    Desplázate hacia abajo si no lo ves.
                  </div>
                </div>
              </div>
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">3</div>
                <div>
                  <strong>Toca "Añadir"</strong>
                  <div class="pwa-modal-step-desc">
                    Listo, ya tendrás acceso rápido.
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="esFirefoxDesktop">
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">1</div>
                <div>
                  <strong>Firefox no soporta instalación de PWA</strong>
                  <div class="pwa-modal-step-desc">
                    Para instalar la aplicación, abre este sitio en Chrome, Edge o Safari.
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">1</div>
                <div>
                  <strong>Abre el menú de tu navegador</strong>
                  <div class="pwa-modal-step-desc">
                    Los tres puntos ⋮ en la esquina superior derecha.
                  </div>
                </div>
              </div>
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">2</div>
                <div>
                  <strong>Busca la opción "Instalar app"</strong>
                  <div class="pwa-modal-step-desc">
                    También puede aparecer como "Añadir a pantalla de inicio".
                  </div>
                </div>
              </div>
              <div class="pwa-modal-step">
                <div class="pwa-modal-step-num">3</div>
                <div>
                  <strong>Confirma</strong>
                  <div class="pwa-modal-step-desc">
                    La app se instalará en tu dispositivo.
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="pwa-modal-footer">
            <button type="button" class="pwa-modal-btn" @click="cerrarModal">
              Entendido
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

// ===== CONSTANTES =====
const DISMISS_KEY = 'pwa_install_dismissed'
const DISMISS_DAYS = 7
const PROMPT_DELAY_MS = 3000
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hora
const UPDATE_POLL_INTERVAL_MS = 5000 // 5s para reaccionar al needRefresh

// ===== STATE =====
const mostrarPrompt = ref(false)
const mostrarUpdate = ref(false)
const instalando = ref(false)
const modalAbierto = ref(false)

// Detección de plataforma
const esIOS = ref(false)
const esFirefoxDesktop = ref(false)

// ===== GUARDS =====
let deferredPrompt = null
let promptTimer = null
let updatePollTimer = null
let swUpdateInterval = null
let unmounted = false

// ===== DETECCIÓN =====
const detectarPlataforma = () => {
  if (typeof navigator === 'undefined') return
  const ua = navigator.userAgent || ''

  // iOS: iPhone, iPad, iPod. iPadOS 13+ se identifica como MacIntel
  const iosUA = /iPad|iPhone|iPod/.test(ua)
  const ipadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  esIOS.value = iosUA || ipadOS

  // Firefox desktop (no soporta PWA install de forma estable)
  esFirefoxDesktop.value =
    /Firefox\//.test(ua) && !/Android/.test(ua) && !/Mobile/.test(ua)
}

const fueDescartadoRecientemente = () => {
  try {
    const fecha = localStorage.getItem(DISMISS_KEY)
    if (!fecha) return false
    const diff = Date.now() - parseInt(fecha, 10)
    return Number.isFinite(diff) && diff < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

const yaInstalada = () => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    (document.referrer && document.referrer.includes('android-app://'))
  )
}

// ===== INSTALACIÓN =====
const handleBeforeInstall = (e) => {
  e.preventDefault()
  deferredPrompt = e

  if (fueDescartadoRecientemente() || yaInstalada() || unmounted) return

  // Mostrar después de N segundos para no ser invasivos
  if (promptTimer) clearTimeout(promptTimer)
  promptTimer = setTimeout(() => {
    if (!unmounted) mostrarPrompt.value = true
    promptTimer = null
  }, PROMPT_DELAY_MS)
}

const instalar = async () => {
  if (instalando.value) return

  // Si no hay prompt nativo → mostrar modal con instrucciones
  if (!deferredPrompt) {
    modalAbierto.value = true
    return
  }

  instalando.value = true
  try {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (unmounted) return

    if (outcome === 'accepted') {
      mostrarPrompt.value = false
    } else {
      // Si el usuario canceló, respetamos: no volver a mostrar por 7 días
      descartar()
    }
  } catch (e) {
    console.warn('Error en prompt de instalación:', e?.message)
    // Fallback a modal
    modalAbierto.value = true
  } finally {
    deferredPrompt = null
    if (!unmounted) instalando.value = false
  }
}

const descartar = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch { /* noop */ }
  mostrarPrompt.value = false
}

const cerrarModal = () => {
  modalAbierto.value = false
  // Al cerrar el modal, también descartamos por 7 días
  descartar()
}

// ===== SERVICE WORKER =====
const {
  needRefresh,
  updateServiceWorker
} = useRegisterSW({
  onRegisteredSW(swUrl, registration) {
    // Verificar actualizaciones periódicamente
    if (registration) {
      swUpdateInterval = setInterval(() => {
        if (unmounted) return
        registration.update().catch(() => { /* noop */ })
      }, UPDATE_CHECK_INTERVAL_MS)
    }
  },
  onRegisterError(error) {
    console.error('❌ Error registrando Service Worker:', error)
  }
})

const actualizar = () => {
  try {
    updateServiceWorker(true)
  } catch (e) {
    console.error('Error al actualizar SW:', e?.message)
  }
}

// ===== LIFECYCLE =====
onMounted(() => {
  detectarPlataforma()

  // Registrar evento beforeinstallprompt
  window.addEventListener('beforeinstallprompt', handleBeforeInstall)

  // Si ya está instalada, no hacer nada más
  if (yaInstalada()) return

  // Si es iOS y no está descartado → mostrar prompt después del delay
  if (esIOS.value && !fueDescartadoRecientemente()) {
    if (promptTimer) clearTimeout(promptTimer)
    promptTimer = setTimeout(() => {
      if (!unmounted) mostrarPrompt.value = true
      promptTimer = null
    }, PROMPT_DELAY_MS)
  }

  // Poll del needRefresh (la lib lo actualiza, pero necesitamos reflejarlo)
  updatePollTimer = setInterval(() => {
    if (unmounted) return
    if (needRefresh.value && !mostrarUpdate.value) {
      mostrarUpdate.value = true
    }
  }, UPDATE_POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  unmounted = true

  window.removeEventListener('beforeinstallprompt', handleBeforeInstall)

  if (promptTimer) {
    clearTimeout(promptTimer)
    promptTimer = null
  }
  if (updatePollTimer) {
    clearInterval(updatePollTimer)
    updatePollTimer = null
  }
  if (swUpdateInterval) {
    clearInterval(swUpdateInterval)
    swUpdateInterval = null
  }

  deferredPrompt = null
})
</script>

<style scoped>
/* ============================================================
   BANNER DE INSTALACIÓN
   ============================================================ */
.pwa-install-prompt {
  position: fixed;
  bottom: 20px;
  left: 20px;
  right: 20px;
  max-width: 500px;
  margin: 0 auto;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
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
  color: var(--text-primary, #2d2d2d);
  margin-bottom: 4px;
}
.pwa-prompt-text {
  font-size: 0.78rem;
  color: var(--text-muted, #666);
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
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-pwa-install:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.4);
}
.btn-pwa-install:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-pwa-dismiss {
  background: transparent;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.btn-pwa-dismiss:hover {
  background: var(--bg-table-stripe, #f4f6f9);
  color: var(--text-primary, #2d2d2d);
}

/* ============================================================
   NOTIFICACIÓN DE ACTUALIZACIÓN
   ============================================================ */
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
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
}
.btn-pwa-update:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ============================================================
   MODAL INSTRUCCIONES
   ============================================================ */
.pwa-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
}

.pwa-modal {
  background: var(--bg-card, #fff);
  border-radius: 20px;
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
  animation: pwa-modal-in 0.25s ease-out;
}

@keyframes pwa-modal-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.pwa-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
.pwa-modal-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary, #2d2d2d);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.pwa-modal-title i {
  color: var(--primary-color, #3498db);
}
.pwa-modal-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}
.pwa-modal-close:hover {
  background: var(--bg-table-stripe, #f4f6f9);
  color: var(--text-primary, #2d2d2d);
}

.pwa-modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pwa-modal-step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.pwa-modal-step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.pwa-modal-step strong {
  display: block;
  font-size: 0.9rem;
  color: var(--text-primary, #2d2d2d);
  margin-bottom: 2px;
}
.pwa-modal-step-desc {
  font-size: 0.82rem;
  color: var(--text-muted, #666);
  line-height: 1.45;
}
.pwa-modal-step-desc i {
  color: var(--primary-color, #3498db);
}

.pwa-modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  justify-content: flex-end;
}
.pwa-modal-btn {
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.88rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}
.pwa-modal-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.4);
}

/* ============================================================
   TRANSICIONES
   ============================================================ */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
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
  .pwa-modal {
    border-radius: 16px;
  }
  .pwa-modal-header,
  .pwa-modal-body,
  .pwa-modal-footer {
    padding-left: 18px;
    padding-right: 18px;
  }
}

/* ============================================================
   ACCESIBILIDAD
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .pwa-modal,
  .slide-up-enter-active,
  .slide-up-leave-active,
  .fade-enter-active,
  .fade-leave-active {
    animation: none;
    transition: none;
  }
}
</style>