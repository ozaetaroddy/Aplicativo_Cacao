<template>
  <div class="actividad-widget">
    <!-- Loading -->
    <div v-if="loading" class="widget-state">
      <div class="spinner-sm"></div>
    </div>

    <!-- Empty -->
    <div v-else-if="actividades.length === 0" class="widget-state">
      <i class="fas fa-history"></i>
      <span>No hay actividad reciente</span>
    </div>

    <!-- Lista -->
    <div v-else class="actividad-lista">
      <div
        v-for="(act, idx) in actividades"
        :key="`${act.tipo}-${act.id}-${idx}`"
        class="actividad-item"
      >
        <div class="actividad-icon" :class="`icon-${act.tipo}`">
          <i :class="act.icono"></i>
        </div>
        <div class="actividad-info">
          <div class="actividad-descripcion" :title="act.descripcion">
            {{ act.descripcion }}
          </div>
          <div class="actividad-fecha">{{ act.fecha }}</div>
        </div>
        <div v-if="act.monto > 0" class="actividad-monto">
          ${{ act.monto.toFixed(2) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../../services/api'

// ===== STATE =====
const actividades = ref([])
const loading = ref(true)
let unmounted = false

// ===== HELPERS =====
const formatFecha = (fecha) => {
  if (!fecha) return ''
  try {
    return new Date(fecha).toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

// ===== CARGA =====
const cargarActividad = async () => {
  try {
    // Pedir los últimos movimientos de cada colección en paralelo
    const [ventasRes, comprasRes] = await Promise.allSettled([
      api.request('/ventas?page=1&limit=10&sortBy=fecha_emision&sortDir=desc', {
        method: 'GET',
        skipLoader: true
      }),
      api.request('/compras?page=1&limit=10&sortBy=fecha_emision&sortDir=desc', {
        method: 'GET',
        skipLoader: true
      })
    ])

    const extraer = (r) => {
      if (r.status !== 'fulfilled') return []
      const v = r.value
      return Array.isArray(v) ? v : (v?.data || [])
    }

    const ventas = extraer(ventasRes)
    const compras = extraer(comprasRes)

    const items = [
      ...ventas.map(v => ({
        id: v._id,
        tipo: 'venta',
        fechaObj: new Date(v.fecha_emision),
        descripcion: `Factura ${v.numero_factura || 'N/A'} · ${v.cliente?.nombre || 'Sin cliente'}`,
        icono: 'fas fa-file-invoice',
        monto: Number(v.total) || 0,
        fecha: formatFecha(v.fecha_emision)
      })),
      ...compras.map(c => ({
        id: c._id,
        tipo: 'compra',
        fechaObj: new Date(c.fecha_emision),
        descripcion: `Compra ${c.numero_factura || 'N/A'} · ${c.proveedor?.nombre || 'Sin proveedor'}`,
        icono: 'fas fa-shopping-cart',
        monto: Number(c.total) || 0,
        fecha: formatFecha(c.fecha_emision)
      }))
    ]

    // Ordenar por fecha descendente y limitar a 10
    items.sort((a, b) => b.fechaObj - a.fechaObj)
    if (!unmounted) actividades.value = items.slice(0, 10)
  } catch (e) {
    if (!unmounted) console.warn('[ActividadRecienteWidget] Error:', e)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(cargarActividad)

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.actividad-widget {
  max-height: 260px;
  overflow-y: auto;
  padding-right: 4px;
}

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
.actividad-lista {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.actividad-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: 8px;
  transition: background var(--transition-fast);
}
.actividad-item:hover { background: var(--bg-table-stripe); }

.actividad-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.85rem;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.icon-venta { background: linear-gradient(135deg, #3498db, #2980b9); }
.icon-compra { background: linear-gradient(135deg, #27ae60, #1e8449); }

.actividad-info {
  flex: 1;
  min-width: 0;
}
.actividad-descripcion {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actividad-fecha {
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.actividad-monto {
  font-weight: 800;
  font-size: 0.82rem;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>