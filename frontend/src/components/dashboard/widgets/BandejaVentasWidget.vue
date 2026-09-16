<template>
  <div class="bandeja-widget">
    <!-- HEADER -->
    <div class="bandeja-header">
      <div class="header-info">
        <span class="badge-count">{{ totalPendientes }}</span>
        <span class="header-label">
          {{ totalPendientes === 1 ? 'pendiente' : 'pendientes' }}
        </span>
      </div>
      <router-link to="/ventas" class="btn-ver-todas">
        Ver todas <i class="fas fa-arrow-right"></i>
      </router-link>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="widget-state">
      <div class="spinner-sm"></div>
    </div>

    <!-- EMPTY -->
    <div v-else-if="ventas.length === 0" class="widget-state">
      <i class="fas fa-inbox"></i>
      <span>No hay ventas recientes</span>
    </div>

    <!-- LISTA -->
    <div v-else class="bandeja-lista">
      <div
        v-for="venta in ventas"
        :key="venta._id"
        class="bandeja-item"
        @click="verDocumento(venta)"
        role="button"
        tabindex="0"
        @keydown.enter="verDocumento(venta)"
      >
        <div class="bandeja-icon" :class="claseIconoPago(venta.estado_pago)">
          <i class="fas fa-file-invoice"></i>
        </div>
        <div class="bandeja-info">
          <div class="bandeja-titulo" :title="venta.numero_factura">
            {{ venta.numero_factura || 'Sin número' }}
          </div>
          <div class="bandeja-subtitulo" :title="venta.cliente?.nombre">
            {{ venta.cliente?.nombre || 'Cliente no asignado' }}
          </div>
        </div>
        <div class="bandeja-monto">
          <div class="monto">${{ (Number(venta.total) || 0).toFixed(2) }}</div>
          <span class="badge-estado" :class="claseBadgePago(venta.estado_pago)">
            {{ etiquetaPago(venta.estado_pago) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../../services/api'

const router = useRouter()

// ===== STATE =====
const ventas = ref([])
const totalPendientes = ref(0)
const loading = ref(true)
let unmounted = false

// ===== HELPERS =====
const claseIconoPago = (estado) => {
  if (estado === 'pagado') return 'icon-success'
  if (estado === 'parcial') return 'icon-warning'
  return 'icon-pending'
}

const claseBadgePago = (estado) => {
  if (estado === 'pagado') return 'badge-pagado'
  if (estado === 'parcial') return 'badge-parcial'
  return 'badge-pendiente'
}

const etiquetaPago = (estado) => {
  if (estado === 'pagado') return 'Pagado'
  if (estado === 'parcial') return 'Parcial'
  if (estado === 'anulado') return 'Anulado'
  return 'Pendiente'
}

// ===== CARGA =====
const cargarVentas = async () => {
  loading.value = true
  try {
    const response = await api.request(
      '/ventas?page=1&limit=8&sortBy=fecha_emision&sortDir=desc',
      { method: 'GET', skipLoader: true }
    )
    if (unmounted) return

    const datos = Array.isArray(response) ? response : (response?.data || [])
    ventas.value = datos

    // Contar pendientes de los 8 devueltos (no es el total real)
    totalPendientes.value = datos.filter(v => v.estado_pago !== 'pagado').length
  } catch (e) {
    if (!unmounted) console.warn('[BandejaVentasWidget] Error:', e)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== NAVEGACIÓN =====
const verDocumento = (venta) => {
  if (!venta?._id) return
  router.push(`/consultar-documentos?tipo=venta&id=${venta._id}`)
}

// ===== LIFECYCLE =====
onMounted(cargarVentas)

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.bandeja-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* HEADER */
.bandeja-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  font-weight: 800;
  font-size: 0.75rem;
}
.btn-ver-todas {
  font-size: 0.78rem;
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 700;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.btn-ver-todas:hover { gap: 8px; }

/* ESTADOS */
.widget-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 0.82rem;
  text-align: center;
}
.widget-state i { font-size: 2rem; opacity: 0.3; }

.spinner-sm {
  width: 22px;
  height: 22px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* LISTA */
.bandeja-lista {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 380px;
  overflow-y: auto;
}

.bandeja-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  outline: none;
}
.bandeja-item:hover { background: var(--bg-table-stripe); transform: translateX(3px); }
.bandeja-item:focus-visible { box-shadow: 0 0 0 3px var(--shadow-focus); }

.bandeja-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  font-size: 0.95rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.12);
}
.icon-success { background: linear-gradient(135deg, #27ae60, #1e8449); }
.icon-warning { background: linear-gradient(135deg, #f39c12, #d68910); }
.icon-pending { background: linear-gradient(135deg, #e74c3c, #c0392b); }

.bandeja-info { flex: 1; min-width: 0; }
.bandeja-titulo {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bandeja-subtitulo {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.bandeja-monto { text-align: right; flex-shrink: 0; }
.monto {
  font-weight: 800;
  font-size: 0.88rem;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.badge-estado {
  display: inline-block;
  font-size: 0.62rem;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 3px;
}
.badge-pagado { background: rgba(39,174,96,0.15); color: #27ae60; }
.badge-parcial { background: rgba(52,152,219,0.15); color: #3498db; }
.badge-pendiente { background: rgba(243,156,18,0.15); color: #d68910; }

/* Dark mode */
:global(body.dark-mode) .badge-pagado { background: rgba(39,174,96,0.25); color: #58d68d; }
:global(body.dark-mode) .badge-parcial { background: rgba(52,152,219,0.25); color: #5dade2; }
:global(body.dark-mode) .badge-pendiente { background: rgba(243,156,18,0.25); color: #f7b731; }
</style>