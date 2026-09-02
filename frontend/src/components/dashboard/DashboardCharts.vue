<template>
  <div class="row g-4">
    <!-- Gráfico de Ventas -->
    <div class="col-md-6">
      <div class="card card-cacao">
        <div class="card-header">
          <i class="fas fa-chart-line me-2" style="color: #3498db;"></i> Ventas (últimos 7 días)
        </div>
        <div class="card-body">
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
        <div class="card-body">
          <canvas id="comprasChart" ref="comprasChartRef"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const props = defineProps({
  ventasDiarias: { type: Array, default: () => [] },
  comprasDiarias: { type: Array, default: () => [] },
  dias: { type: Array, default: () => [] }
})

const ventasChartRef = ref(null)
const comprasChartRef = ref(null)
let ventasChartInstance = null
let comprasChartInstance = null

const crearGrafico = (canvas, tipo, datos, etiqueta, color) => {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  return new Chart(ctx, {
    type: tipo,
    data: {
      labels: props.dias,
      datasets: [{
        label: etiqueta,
        data: datos,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: color
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
          ticks: { callback: (value) => '$' + value.toFixed(2) }
        }
      }
    }
  })
}

onMounted(() => {
  if (ventasChartRef.value) {
    ventasChartInstance = crearGrafico(
      ventasChartRef.value,
      'line',
      props.ventasDiarias,
      'Ventas',
      'rgba(52, 152, 219, 0.6)'
    )
  }
  if (comprasChartRef.value) {
    comprasChartInstance = crearGrafico(
      comprasChartRef.value,
      'line',
      props.comprasDiarias,
      'Compras',
      'rgba(46, 204, 113, 0.6)'
    )
  }
})

watch(() => [props.ventasDiarias, props.comprasDiarias], () => {
  if (ventasChartInstance) {
    ventasChartInstance.data.datasets[0].data = props.ventasDiarias
    ventasChartInstance.update()
  }
  if (comprasChartInstance) {
    comprasChartInstance.data.datasets[0].data = props.comprasDiarias
    comprasChartInstance.update()
  }
}, { deep: true })
</script>

<style scoped>
canvas {
  max-height: 200px;
  width: 100% !important;
}
</style>