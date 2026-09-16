<template>
  <Teleport to="body">
    <transition name="loader-fade">
      <div
        v-if="loaderStore.isLoading"
        class="loader-overlay"
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
import { watch, onBeforeUnmount } from 'vue'
import { useLoaderStore } from '../stores/loaderStore'

const loaderStore = useLoaderStore()

let unmounted = false

// ===== BLOQUEO DE SCROLL =====
// Cuando el loader está activo, bloqueamos el scroll del body para
// que el usuario no interactúe con el fondo.
const aplicarBloqueoScroll = (activo) => {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return

  if (activo) {
    // Guardar el valor previo por si otro componente también lo modifica
    if (!body.dataset.loaderScrollLock) {
      body.dataset.loaderScrollLock = body.style.overflow || ''
    }
    body.style.overflow = 'hidden'
  } else {
    // Restaurar
    if (body.dataset.loaderScrollLock !== undefined) {
      body.style.overflow = body.dataset.loaderScrollLock || ''
      delete body.dataset.loaderScrollLock
    }
  }
}

watch(
  () => loaderStore.isLoading,
  (activo) => {
    if (unmounted) return
    aplicarBloqueoScroll(activo)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unmounted = true
  // Restaurar por si quedó bloqueado
  aplicarBloqueoScroll(false)
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
</style>