<template>
  <div class="stats-widget">
    <div class="stat-tile stat-ventas">
      <div class="stat-tile-icon"><i class="fas fa-file-invoice-dollar"></i></div>
      <div class="stat-tile-body">
        <div class="stat-tile-value">${{ ventasHoy.toFixed(2) }}</div>
        <div class="stat-tile-label">Ventas Hoy</div>
      </div>
    </div>

    <div class="stat-tile stat-compras">
      <div class="stat-tile-icon"><i class="fas fa-shopping-cart"></i></div>
      <div class="stat-tile-body">
        <div class="stat-tile-value">${{ comprasHoy.toFixed(2) }}</div>
        <div class="stat-tile-label">Compras Hoy</div>
      </div>
    </div>

    <div class="stat-tile stat-ventas-mes">
      <div class="stat-tile-icon"><i class="fas fa-calendar-alt"></i></div>
      <div class="stat-tile-body">
        <div class="stat-tile-value">${{ ventasMes.toFixed(2) }}</div>
        <div class="stat-tile-label">Ventas Mes</div>
      </div>
    </div>

    <div class="stat-tile stat-compras-mes">
      <div class="stat-tile-icon"><i class="fas fa-calendar-check"></i></div>
      <div class="stat-tile-body">
        <div class="stat-tile-value">${{ comprasMes.toFixed(2) }}</div>
        <div class="stat-tile-label">Compras Mes</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useEstadisticas } from '../../../composables/useEstadisticas'

const {
  ventasHoy,
  comprasHoy,
  ventasMes,
  comprasMes,
  cargarEstadisticas
} = useEstadisticas()

let unmounted = false

onMounted(async () => {
  try {
    await cargarEstadisticas()
  } catch (e) {
    if (!unmounted) {
      console.warn('[StatsWidget] Error cargando estadísticas:', e)
    }
  }
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.stats-widget {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.stat-tile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-table-stripe);
  border-left: 3px solid transparent;
  transition: all var(--transition);
}
.stat-tile:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.stat-ventas { border-left-color: #3498db; }
.stat-compras { border-left-color: #27ae60; }
.stat-ventas-mes { border-left-color: #2980b9; }
.stat-compras-mes { border-left-color: #16a085; }

.stat-tile-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.stat-ventas .stat-tile-icon { background: rgba(52,152,219,0.15); color: #3498db; }
.stat-compras .stat-tile-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.stat-ventas-mes .stat-tile-icon { background: rgba(41,128,185,0.15); color: #2980b9; }
.stat-compras-mes .stat-tile-icon { background: rgba(22,160,133,0.15); color: #16a085; }

.stat-tile-body { min-width: 0; flex: 1; }
.stat-tile-value {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-tile-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
  margin-top: 3px;
}

@media (max-width: 576px) {
  .stat-tile-value { font-size: 0.92rem; }
  .stat-tile-icon { display: none; }
}
</style>