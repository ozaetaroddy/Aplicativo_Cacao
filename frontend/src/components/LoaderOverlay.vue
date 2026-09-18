<template>
  <Teleport to="body">
    <transition name="loader-fade">
      <div
        v-if="loaderStore.isLoading"
        class="loader-overlay"
        :class="{ 'loader-overlay--passive': hayModalAbierto }"
        role="status"
        aria-live="polite"
        aria-busy="true"
        :aria-label="loaderStore.message || 'Cargando'"
      >
        <div class="loader-container">
          <div class="loader-spinner" aria-hidden="true"></div>
          <div class="loader-message">
            {{ loaderStore.message || 'Cargando…' }}
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { watch, ref, onBeforeUnmount, onMounted } from 'vue'
import { useLoaderStore } from '../stores/loaderStore'

const loaderStore = useLoaderStore()

const unmounted = ref(false)

// ============================================================
// ⚡ FIX: bloquear clicks SOLO cuando no hay modal abierto
// ------------------------------------------------------------
// El loader se monta con `position: fixed; inset: 0` para
// bloquear la UI durante peticiones HTTP. El problema es que
// los modales Bootstrap de confirmación también usan `position:
// fixed`, y el loader (z-index 9999) quedaba por encima,
// bloqueando los clicks en los botones Sí/No.
//
// Solución: cuando hay un modal visible en el DOM, forzamos
// `pointer-events: none` en el loader → los clicks llegan al modal.
// ============================================================

const hayModalAbierto = ref(false)
let observer = null

function actualizarModalAbierto() {
  hayModalAbierto.value =
    typeof document !== 'undefined' &&
    document.querySelector('.modal.show') !== null
}

const aplicarBloqueoScroll = (activo) => {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return

  if (activo) {
    if (!body.dataset.loaderScrollLock) {
      body.dataset.loaderScrollLock = body.style.overflow || ''
    }
    body.style.overflow = 'hidden'
  } else {
    if (body.dataset.loaderScrollLock !== undefined) {
      body.style.overflow = body.dataset.loaderScrollLock || ''
      delete body.dataset.loaderScrollLock
    }
  }
}

watch(
  () => loaderStore.isLoading,
  (activo) => {
    if (unmounted.value) return
    aplicarBloqueoScroll(activo)
    // Cuando el loader se monta, chequear si hay modales
    if (activo) actualizarModalAbierto()
  },
  { immediate: true }
)

onMounted(() => {
  // Observar cambios en el DOM (Bootstrap agrega/quita .modal.show)
  if (typeof document === 'undefined' || !document.body) return
  observer = new MutationObserver(actualizarModalAbierto)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  })
})

onBeforeUnmount(() => {
  unmounted.value = true
  aplicarBloqueoScroll(false)
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<style scoped>
.loader-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 20px;
}

.loader-container {
  background: var(--bg-card, #fff);
  padding: 30px 40px;
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 20px 60px var(--shadow-hover, rgba(0, 0, 0, 0.3));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 200px;
  max-width: 90vw;
  border: 1px solid var(--border-color, #e0e0e0);
}

.loader-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border-color, #e0e0e0);
  border-top: 4px solid var(--primary-color, #3498db);
  border-radius: 50%;
  animation: loader-spin 0.8s linear infinite;
}

.loader-message {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary, #2d2d2d);
  text-align: center;
  line-height: 1.4;
  overflow-wrap: break-word;
}

@keyframes loader-spin {
  to { transform: rotate(360deg); }
}

/* ===== TRANSICIÓN ===== */
.loader-fade-enter-active,
.loader-fade-leave-active {
  transition: opacity 0.25s ease;
}
.loader-fade-enter-from,
.loader-fade-leave-to {
  opacity: 0;
}

/* ===== MODO OSCURO ===== */
:global([data-theme="dark"]) .loader-container,
:global(body.dark-mode) .loader-container {
  background: var(--bg-card);
  border-color: var(--border-color);
}
:global([data-theme="dark"]) .loader-message,
:global(body.dark-mode) .loader-message {
  color: var(--text-primary);
}

/* ===== ACCESIBILIDAD ===== */
@media (prefers-reduced-motion: reduce) {
  .loader-spinner {
    animation-duration: 2s;
  }
  .loader-fade-enter-active,
  .loader-fade-leave-active {
    transition: none;
  }
}
/* ⚡ FIX: cuando hay un modal abierto, el overlay NO bloquea clicks */
/* Ni el fondo oscuro se ve más fuerte que el backdrop del modal. */
.loader-overlay--passive {
  pointer-events: none !important;
  background: rgba(15, 23, 42, 0.15) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.loader-overlay--passive .loader-container {
  /* El spinner sigue visible, pero sin bloquear */
  pointer-events: none;
}
</style>