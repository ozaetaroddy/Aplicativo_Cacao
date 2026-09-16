<template>
  <transition name="slide-up">
    <div
      v-if="visible && total > 0"
      class="stock-alert"
      :class="`stock-${nivel}`"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        class="stock-alert-body"
        @click="verProductos"
        :aria-label="`Ver ${total} producto(s) con stock bajo`"
      >
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span>
          <strong>{{ total }}</strong>
          producto{{ total === 1 ? '' : 's' }} con stock bajo
        </span>
      </button>
      <button
        type="button"
        class="stock-alert-close"
        @click="descartar"
        title="Ocultar por 24 horas"
        aria-label="Ocultar alerta"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'

const router = useRouter()
const socket = inject('socket', null)

// ===== CONSTANTES =====
const REFRESH_MS = 5 * 60 * 1000 // 5 min
const DISMISS_KEY = 'stock_alert_dismissed_until'

// ===== STATE =====
const total = ref(0)
const nivel = ref('warn')
const ocultoHasta = ref(Number(localStorage.getItem(DISMISS_KEY) || 0))

let timer = null
let abortController = null
let unmounted = false

// ===== COMPUTED =====
const visible = computed(() => {
  if (Date.now() < ocultoHasta.value) return false
  return true
})

// ===== CARGA =====
const cargar = async () => {
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
  }
  abortController = new AbortController()

  try {
    const res = await api.request('/productos/stock/bajo', {
      method: 'GET',
      skipLoader: true,
      signal: abortController.signal
    })

    if (unmounted) return

    const arr = Array.isArray(res) ? res : (res?.data || [])
    total.value = arr.length

    // Nivel según urgencia
    if (arr.some((p) => Number(p.stock) <= 0)) {
      nivel.value = 'critical'
    } else if (arr.length > 10) {
      nivel.value = 'danger'
    } else {
      nivel.value = 'warn'
    }
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort) return
    // Silencioso: no es crítico
  }
}

// ===== ACCIONES =====
const verProductos = () => {
  router.push('/inventario/stock')
}

const descartar = () => {
  const hasta = Date.now() + 24 * 60 * 60 * 1000
  localStorage.setItem(DISMISS_KEY, String(hasta))
  ocultoHasta.value = hasta
}

// ===== WEBSOCKET =====
const handleStockChange = () => {
  cargar()
}

// ===== LIFECYCLE =====
onMounted(() => {
  cargar()
  timer = setInterval(cargar, REFRESH_MS)

  if (socket?.on) {
    socket.on('inventario-ajustado', handleStockChange)
    socket.on('producto-creado', handleStockChange)
    socket.on('producto-actualizado', handleStockChange)
  }
})

onBeforeUnmount(() => {
  unmounted = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
    abortController = null
  }
  if (socket?.off) {
    socket.off('inventario-ajustado', handleStockChange)
    socket.off('producto-creado', handleStockChange)
    socket.off('producto-actualizado', handleStockChange)
  }
})
</script>

<style scoped>
.stock-alert {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: stretch;
  border-radius: 50px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 999;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: transform 0.2s ease;
  max-width: calc(100vw - 40px);
}
.stock-alert:hover { transform: translateY(-2px); }

.stock-warn { background: #d68910; color: #fff; }
.stock-danger { background: #c0392b; color: #fff; }
.stock-critical {
  background: #e74c3c;
  color: #fff;
  animation: pulse-critical 2s infinite;
}
@keyframes pulse-critical {
  0%, 100% { box-shadow: 0 8px 24px rgba(231, 76, 60, 0.3); }
  50% { box-shadow: 0 8px 32px rgba(231, 76, 60, 0.6); }
}

.stock-alert-body {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 6px 12px 20px;
  background: transparent;
  border: none;
  color: inherit;
  font-weight: 700;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  flex: 1;
  text-align: left;
}
.stock-alert-body i { font-size: 1.1rem; }
.stock-alert-body strong { font-weight: 800; }

.stock-alert-close {
  padding: 0 16px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.15s ease;
  border-left: 1px solid rgba(255, 255, 255, 0.15);
}
.stock-alert-close:hover {
  color: #fff;
  background: rgba(0, 0, 0, 0.1);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(80px);
}

@media (max-width: 576px) {
  .stock-alert { left: 20px; right: 20px; }
  .stock-alert-body { padding-left: 16px; }
}
</style>