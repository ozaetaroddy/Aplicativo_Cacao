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
import { ref, onMounted, watch, nextTick } from 'vue'
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

const crearGrafico = (canvas, datos, etiqueta, color, borderColor) => {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: props.dias.length ? props.dias : ['Sin datos'],
      datasets: [{
        label: etiqueta,
        data: datos.length ? datos : [0],
        backgroundColor: color,
        borderColor: borderColor || color,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: borderColor || color,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              return '$' + context.parsed.y.toFixed(2)
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => '$' + value.toFixed(2)
          }
        }
      }
    }
  })
}

const actualizarGrafico = (chartInstance, nuevosDatos) => {
  if (chartInstance) {
    chartInstance.data.datasets[0].data = nuevosDatos.length ? nuevosDatos : [0]
    chartInstance.update()
  }
}

onMounted(() => {
  nextTick(() => {
    if (ventasChartRef.value) {
      ventasChartInstance = crearGrafico(
        ventasChartRef.value,
        props.ventasDiarias,
        'Ventas',
        'rgba(52, 152, 219, 0.2)',
        'rgb(52, 152, 219)'
      )
    }
    if (comprasChartRef.value) {
      comprasChartInstance = crearGrafico(
        comprasChartRef.value,
        props.comprasDiarias,
        'Compras',
        'rgba(46, 204, 113, 0.2)',
        'rgb(46, 204, 113)'
      )
    }
  })
})

watch(() => [props.ventasDiarias, props.comprasDiarias], () => {
  if (ventasChartInstance) {
    actualizarGrafico(ventasChartInstance, props.ventasDiarias)
  }
  if (comprasChartInstance) {
    actualizarGrafico(comprasChartInstance, props.comprasDiarias)
  }
}, { deep: true })
</script>

<style scoped>
canvas {
  max-height: 200px;
  width: 100% !important;
}
</style>