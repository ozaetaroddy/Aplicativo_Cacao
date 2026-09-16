<template>
  <div class="top-productos-widget">
    <!-- Loading -->
    <div v-if="loading" class="widget-state">
      <div class="spinner-sm"></div>
    </div>

    <!-- Empty -->
    <div v-else-if="topProductos.length === 0" class="widget-state">
      <i class="fas fa-chart-bar"></i>
      <span>Sin datos de ventas del mes</span>
    </div>

    <!-- Lista -->
    <ol v-else class="top-list">
      <li
        v-for="(item, idx) in topProductos"
        :key="item.productoId || `item-${idx}`"
        class="top-item"
      >
        <div class="top-rank" :class="`rank-${claseRank(idx)}`">
          {{ idx + 1 }}
        </div>
        <div class="top-info">
          <div class="top-nombre" :title="item.nombre">
            {{ item.nombre || 'Producto eliminado' }}
          </div>
          <div v-if="item.codigo" class="top-codigo">{{ item.codigo }}</div>
        </div>
        <div class="top-cantidad">
          <span class="cantidad-num">{{ formatCantidad(item.cantidad) }}</span>
          <span class="cantidad-label">uds</span>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useEstadisticas } from '../../../composables/useEstadisticas'

const { topProductos, cargarEstadisticas } = useEstadisticas()
const loading = ref(true)
let unmounted = false

// ===== HELPERS =====
const claseRank = (idx) => {
  if (idx === 0) return 'gold'
  if (idx === 1) return 'silver'
  if (idx === 2) return 'bronze'
  return 'default'
}

const formatCantidad = (n) => {
  const v = Number(n) || 0
  // Si es entero, mostrarlo sin decimales; si no, con 2
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

// ===== LIFECYCLE =====
onMounted(async () => {
  try {
    await cargarEstadisticas()
  } catch (e) {
    if (!unmounted) console.warn('[TopProductosWidget] Error:', e)
  } finally {
    if (!unmounted) loading.value = false
  }
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.top-productos-widget { min-height: 100px; }

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
.widget-state i {
  font-size: 2rem;
  opacity: 0.3;
}

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
.top-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.top-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: 8px;
  transition: background var(--transition-fast);
}
.top-item:hover { background: var(--bg-table-stripe); }

.top-rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.75rem;
  flex-shrink: 0;
}
.rank-gold {
  background: linear-gradient(135deg, #f1c40f, #f39c12);
  color: #fff;
  box-shadow: 0 2px 8px rgba(241,196,15,0.35);
}
.rank-silver {
  background: linear-gradient(135deg, #bdc3c7, #95a5a6);
  color: #fff;
  box-shadow: 0 2px 8px rgba(189,195,199,0.35);
}
.rank-bronze {
  background: linear-gradient(135deg, #cd7f32, #a0522d);
  color: #fff;
  box-shadow: 0 2px 8px rgba(205,127,50,0.35);
}
.rank-default {
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}

.top-info {
  flex: 1;
  min-width: 0;
}
.top-nombre {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.top-codigo {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  margin-top: 1px;
}

.top-cantidad {
  display: flex;
  align-items: baseline;
  gap: 3px;
  flex-shrink: 0;
}
.cantidad-num {
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.cantidad-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
</style>