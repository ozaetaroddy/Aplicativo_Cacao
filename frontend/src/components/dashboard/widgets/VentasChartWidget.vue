<template>
  <div class="chart-widget">
    <div v-if="loading" class="chart-state">
      <div class="spinner-sm"></div>
      <span>Cargando...</span>
    </div>
    <div v-else-if="sinDatos" class="chart-state chart-empty">
      <i class="fas fa-chart-line"></i>
      <span>No hay datos de ventas en los últimos 7 días</span>
    </div>
    <div v-show="!loading && !sinDatos" class="chart-canvas-wrap">
      <canvas ref="chartCanvas" aria-label="Gráfico de ventas últimos 7 días"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useEstadisticas } from '../../../composables/useEstadisticas'

Chart.register(...registerables)

// ===== STATE =====
const chartCanvas = ref(null)
const initialDataLoaded = ref(false)
const loading = ref(true)

let chartInstance = null
let unmounted = false

const { ventasDiarias, dias, cargarEstadisticas } = useEstadisticas()

// ===== COMPUTED =====
const sinDatos = computed(() => {
  const arr = ventasDiarias.value
  if (!Array.isArray(arr) || arr.length === 0) return true
  return arr.every(v => !v || v === 0)
})

// ===== RENDER =====
const renderChart = () => {
  if (!chartCanvas.value || unmounted) return

  // Destruir instancia previa para evitar memory leaks
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  const labels = Array.isArray(dias.value) && dias.value.length
    ? dias.value
    : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const data = Array.isArray(ventasDiarias.value) && ventasDiarias.value.length
    ? ventasDiarias.value.map(v => Number(v) || 0)
    : [0, 0, 0, 0, 0, 0, 0]

  try {
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ventas',
          data,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.15)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#3498db',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,42,58,0.95)',
            padding: 10,
            titleFont: { size: 12, weight: '600' },
            bodyFont: { size: 12 },
            callbacks: {
              label: (ctx) => ` $${Number(ctx.parsed.y || 0).toFixed(2)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#7f8c8d', font: { size: 10 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(127,140,141,0.1)' },
            ticks: {
              color: '#7f8c8d',
              font: { size: 10 },
              callback: (v) => '$' + v
            }
          }
        },
        animation: { duration: 300 }
      }
    })
  } catch (err) {
    console.error('[VentasChartWidget] Error al renderizar:', err)
  }
}

// ===== LIFECYCLE =====
onMounted(async () => {
  try {
    if (!initialDataLoaded.value) {
      await cargarEstadisticas()
      initialDataLoaded.value = true
    }
  } catch (e) {
    console.warn('[VentasChartWidget] Error cargando estadísticas:', e)
  } finally {
    if (!unmounted) loading.value = false
  }

  await nextTick()
  if (!unmounted) renderChart()
})

watch(
  [ventasDiarias, dias],
  () => {
    if (initialDataLoaded.value && !unmounted) {
      nextTick(() => renderChart())
    }
  },
  { deep: true }
)

onBeforeUnmount(() => {
  unmounted = true
  if (chartInstance) {
    try { chartInstance.destroy() } catch { /* noop */ }
    chartInstance = null
  }
})
</script>

<style scoped>
.chart-widget {
  position: relative;
  height: 180px;
  width: 100%;
}
.chart-canvas-wrap {
  position: absolute;
  inset: 0;
}
.chart-canvas-wrap canvas { width: 100% !important; height: 100% !important; }

.chart-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 0.82rem;
  text-align: center;
  padding: 20px;
}
.chart-empty i {
  font-size: 2rem;
  opacity: 0.3;
  margin-bottom: 4px;
}
.spinner-sm {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>