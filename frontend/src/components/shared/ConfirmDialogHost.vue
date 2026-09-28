<template>
  <Teleport to="body">
    <div
      v-if="store.visible"
      class="confirm-host-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-host-title"
      @click.self="store.cancel"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content confirm-host-content">
          <div class="modal-header" :class="`bg-${store.variante}`">
            <h5 id="confirm-host-title" class="modal-title text-white">
              <i :class="store.icono" class="me-2" aria-hidden="true"></i>
              {{ store.titulo }}
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="store.cancel"
              aria-label="Cerrar"
            ></button>
          </div>

          <div class="modal-body">
            <p class="mb-3" v-html="store.mensaje"></p>
            <div v-if="store.detalle" class="alert alert-warning small mb-0">
              <i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
              <span>{{ store.detalle }}</span>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="store.cancel">
              {{ store.textoCancelar }}
            </button>
            <button
              type="button"
              class="btn"
              :class="`btn-${store.variante}`"
              @click="store.accept"
            >
              {{ store.textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { watch, onBeforeUnmount, onMounted } from 'vue'
import { useConfirmDialogStore } from '../../stores/confirmDialogStore'

const store = useConfirmDialogStore()

// ---- Bloqueo de scroll del body ----
watch(
  () => store.visible,
  (v) => {
    if (typeof document === 'undefined') return
    if (v) {
      document.body.classList.add('confirm-host-open')
    } else {
      document.body.classList.remove('confirm-host-open')
    }
  }
)

// ---- Escape para cerrar ----
const onKeydown = (e) => {
  if (e.key === 'Escape' && store.visible) {
    e.preventDefault()
    store.cancel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('confirm-host-open')
  // Resolver cualquier confirmación pendiente
  store.rejectPending()
})
</script>

<style scoped>
.confirm-host-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  /* Z-index por encima de modales Bootstrap estándar (10000)
     y por debajo de toasts (10400). */
  z-index: 10350;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: confirmFadeIn 0.15s ease-out;
}

@keyframes confirmFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.confirm-host-content {
  border-radius: 14px;
  overflow: hidden;
  border: none;
  box-shadow: 0 32px 64px rgba(15, 23, 42, 0.35);
  animation: confirmPop 0.18s ease-out;
}

@keyframes confirmPop {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

:global(body.confirm-host-open) {
  overflow: hidden;
}

/* Accesibilidad */
@media (prefers-reduced-motion: reduce) {
  .confirm-host-modal,
  .confirm-host-content {
    animation: none;
  }
}
</style>