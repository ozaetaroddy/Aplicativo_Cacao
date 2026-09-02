<template>
  <div class="row g-4">
    <!-- Gráfico de Ventas -->
    <div class="col-md-6">
      <div class="card card-cacao">
        <div class="card-header">
          <i class="fas fa-chart-line me-2" style="color: #3498db;"></i> Ventas (últimos 7 días)
        </div>
        <div class="card-body" style="height: 220px; position: relative;">
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
        <div class="card-body" style="height: 220px; position: relative;">
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

const crearGrafico = (canvas, tipo, datos, etiqueta, color, bgColor) => {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  return new Chart(ctx, {
    type: tipo,
    data: {
      labels: props.dias.length ? props.dias : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [{
        label: etiqueta,
        data: datos.length ? datos : [0,0,0,0,0,0,0],
        backgroundColor: bgColor || 'rgba(52,152,219,0.2)',
        borderColor: color || '#3498db',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: color || '#3498db',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
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
          ticks: { callback: (value) => '$' + value.toFixed(2) }
        }
      }
    }
  })
}

const renderizarGraficos = () => {
  nextTick(() => {
    if (ventasChartRef.value) {
      if (ventasChartInstance) ventasChartInstance.destroy()
      ventasChartInstance = crearGrafico(
        ventasChartRef.value,
        'line',
        props.ventasDiarias || [],
        'Ventas',
        '#3498db',
        'rgba(52,152,219,0.15)'
      )
    }
    if (comprasChartRef.value) {
      if (comprasChartInstance) comprasChartInstance.destroy()
      comprasChartInstance = crearGrafico(
        comprasChartRef.value,
        'line',
        props.comprasDiarias || [],
        'Compras',
        '#2ecc71',
        'rgba(46,204,113,0.15)'
      )
    }
  })
}

onMounted(() => {
  renderizarGraficos()
})

watch(() => [props.ventasDiarias, props.comprasDiarias, props.dias], () => {
  renderizarGraficos()
}, { deep: true })
</script>

<style scoped>
canvas {
  width: 100% !important;
  height: 100% !important;
}
</style>