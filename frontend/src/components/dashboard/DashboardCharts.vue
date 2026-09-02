<template>
  <div class="row g-4">
    <!-- Gráfico de Ventas -->
    <div class="col-md-6">
      <div class="card card-cacao">
        <div class="card-header">
          <i class="fas fa-chart-line me-2" style="color: #3498db;"></i> Ventas (últimos 7 días)
        </div>
        <div class="card-body" style="position: relative; height: 200px;">
          <canvas id="ventasChart" ref="ventasChartRef"></canvas>
        </div>
      </div>
    </div>
    <!-- Gráfico de Compras -->
    <div class="col-md-6">
      <div class="card card-cacao">
        <div class="card-header">
          <i class="fas fa-chart-bar me-2" style="color: #2ecc71;"></i> Compras (últimos 7 días)
        </div>
        <div class="card-body" style="position: relative; height: 200px;">
          <canvas id="comprasChart" ref="comprasChartRef"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const props = defineProps({
  ventasDiarias: { type: Array, default: () => Array(7).fill(0) },
  comprasDiarias: { type: Array, default: () => Array(7).fill(0) },
  dias: { type: Array, default: () => ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] }
})

const ventasChartRef = ref(null)
const comprasChartRef = ref(null)
let ventasChartInstance = null
let comprasChartInstance = null

const crearGrafico = (canvas, datos, etiqueta, color, borderColor) => {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: props.dias,
      datasets: [{
        label: etiqueta,
        data: datos.length === 7 ? datos : Array(7).fill(0),
        backgroundColor: color,
        borderColor: borderColor,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: borderColor,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => '$' + value.toFixed(2)
          }
        }
      },
      layout: {
        padding: { top: 10, bottom: 10 }
      }
    }
  })
}

const actualizarGrafico = (chart, datos) => {
  if (!chart) return
  chart.data.datasets[0].data = datos.length === 7 ? datos : Array(7).fill(0)
  chart.update()
}

onMounted(() => {
  nextTick(() => {
    if (ventasChartRef.value) {
      ventasChartInstance = crearGrafico(
        ventasChartRef.value,
        props.ventasDiarias,
        'Ventas',
        'rgba(52, 152, 219, 0.2)',
        '#3498db'
      )
    }
    if (comprasChartRef.value) {
      comprasChartInstance = crearGrafico(
        comprasChartRef.value,
        props.comprasDiarias,
        'Compras',
        'rgba(46, 204, 113, 0.2)',
        '#2ecc71'
      )
    }
  })
})

// Observar cambios en los datos
watch(
  () => [props.ventasDiarias, props.comprasDiarias],
  ([nuevasVentas, nuevasCompras]) => {
    actualizarGrafico(ventasChartInstance, nuevasVentas)
    actualizarGrafico(comprasChartInstance, nuevasCompras)
  },
  { deep: true }
)
</script>

<style scoped>
canvas {
  width: 100% !important;
  height: 100% !important;
}
</style>