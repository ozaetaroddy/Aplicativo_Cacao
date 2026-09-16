<template>
  <div class="dashboard-charts">
    <!-- VENTAS -->
    <div class="chart-card">
      <div class="chart-header">
        <div class="chart-header-icon chart-icon-ventas">
          <i class="fas fa-chart-line"></i>
        </div>
        <div class="chart-header-body">
          <div class="chart-title">Ventas</div>
          <div class="chart-subtitle">Últimos 7 días</div>
        </div>
      </div>
      <div class="chart-body">
        <div v-if="sinVentas" class="chart-empty">
          <i class="fas fa-chart-line"></i>
          <span>Sin ventas en los últimos 7 días</span>
        </div>
        <canvas
          v-show="!sinVentas"
          ref="ventasChartRef"
          aria-label="Gráfico de ventas de los últimos 7 días"
        ></canvas>
      </div>
    </div>

    <!-- COMPRAS -->
    <div class="chart-card">
      <div class="chart-header">
        <div class="chart-header-icon chart-icon-compras">
          <i class="fas fa-chart-bar"></i>
        </div>
        <div class="chart-header-body">
          <div class="chart-title">Compras</div>
          <div class="chart-subtitle">Últimos 7 días</div>
        </div>
      </div>
      <div class="chart-body">
        <div v-if="sinCompras" class="chart-empty">
          <i class="fas fa-chart-bar"></i>
          <span>Sin compras en los últimos 7 días</span>
        </div>
        <canvas
          v-show="!sinCompras"
          ref="comprasChartRef"
          aria-label="Gráfico de compras de los últimos 7 días"
        ></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

// ===== PROPS =====
const props = defineProps({
  ventasDiarias: { type: Array, default: () => [] },
  comprasDiarias: { type: Array, default: () => [] },
  dias: { type: Array, default: () => [] }
})

// ===== STATE =====
const ventasChartRef = ref(null)
const comprasChartRef = ref(null)

let ventasChartInstance = null
let comprasChartInstance = null
let unmounted = false
let initialRenderDone = false

// ===== COMPUTED =====
const sinVentas = computed(() => {
  const arr = props.ventasDiarias
  if (!Array.isArray(arr) || arr.length === 0) return true
  return arr.every(v => !v || Number(v) === 0)
})

const sinCompras = computed(() => {
  const arr = props.comprasDiarias
  if (!Array.isArray(arr) || arr.length === 0) return true
  return arr.every(v => !v || Number(v) === 0)
})

// ===== HELPERS =====
const labelsSeguros = () => {
  const d = props.dias
  return Array.isArray(d) && d.length > 0
    ? d
    : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
}

const datosSeguros = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return [0, 0, 0, 0, 0, 0, 0]
  return arr.map(v => Number(v) || 0)
}

const destruirGrafico = (instancia) => {
  if (instancia) {
    try { instancia.destroy() } catch { /* noop */ }
  }
  return null
}

// ===== CREAR GRÁFICO =====
const crearGrafico = (canvas, { color, bgColor, label }) => {
  if (!canvas) return null

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  try {
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labelsSeguros(),
        datasets: [{
          label,
          data: datosSeguros(label === 'Ventas' ? props.ventasDiarias : props.comprasDiarias),
          backgroundColor: bgColor,
          borderColor: color,
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: color,
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
              callback: (value) => '$' + Number(value).toFixed(2)
            }
          }
        },
        animation: { duration: 300 }
      }
    })
  } catch (err) {
    console.error(`[DashboardCharts] Error creando gráfico ${label}:`, err)
    return null
  }
}

// ===== RENDER =====
const renderizarGraficos = async () => {
  await nextTick()
  if (unmounted) return

  // Ventas
  if (ventasChartRef.value) {
    ventasChartInstance = destruirGrafico(ventasChartInstance)
    ventasChartInstance = crearGrafico(ventasChartRef.value, {
      label: 'Ventas',
      color: '#3498db',
      bgColor: 'rgba(52,152,219,0.15)'
    })
  }

  // Compras
  if (comprasChartRef.value) {
    comprasChartInstance = destruirGrafico(comprasChartInstance)
    comprasChartInstance = crearGrafico(comprasChartRef.value, {
      label: 'Compras',
      color: '#2ecc71',
      bgColor: 'rgba(46,204,113,0.15)'
    })
  }
}

// ===== WATCH =====
watch(
  () => [props.ventasDiarias, props.comprasDiarias, props.dias],
  () => {
    if (!initialRenderDone) return
    if (!unmounted) renderizarGraficos()
  },
  { deep: true }
)

// ===== LIFECYCLE =====
onMounted(async () => {
  await renderizarGraficos()
  initialRenderDone = true
})

onBeforeUnmount(() => {
  unmounted = true
  ventasChartInstance = destruirGrafico(ventasChartInstance)
  comprasChartInstance = destruirGrafico(comprasChartInstance)
})
</script>

<style scoped>
.dashboard-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition);
}
.chart-card:hover { box-shadow: var(--shadow-md); }

/* HEADER */
.chart-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
  border-bottom: 1px solid var(--border-light);
}
.chart-header-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  flex-shrink: 0;
}
.chart-icon-ventas {
  background: rgba(52,152,219,0.15);
  color: #3498db;
}
.chart-icon-compras {
  background: rgba(46,204,113,0.15);
  color: #2ecc71;
}
.chart-header-body { flex: 1; min-width: 0; }
.chart-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.chart-subtitle {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* BODY */
.chart-body {
  position: relative;
  height: 220px;
  padding: 12px 14px 14px;
}
.chart-body canvas {
  width: 100% !important;
  height: 100% !important;
}

/* EMPTY STATE */
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 0.82rem;
  text-align: center;
  padding: 20px;
}
.chart-empty i {
  font-size: 2rem;
  opacity: 0.25;
}

/* RESPONSIVE */
@media (max-width: 768px) {
  .dashboard-charts {
    grid-template-columns: 1fr;
  }
  .chart-body { height: 200px; }
}
</style>