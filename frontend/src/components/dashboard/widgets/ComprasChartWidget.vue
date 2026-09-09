<template>
  <div style="position: relative; height: 180px; width: 100%;">
    <canvas ref="chartCanvas"></canvas>
    <div v-if="comprasDiarias.every(c => c === 0)" class="text-muted text-center small" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%;">
      No hay datos de compras en los últimos 7 días
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useEstadisticas } from '../../../composables/useEstadisticas'

Chart.register(...registerables)

const chartCanvas = ref(null)
let chartInstance = null
const { comprasDiarias, dias, cargarEstadisticas } = useEstadisticas()
const initialDataLoaded = ref(false)

const renderChart = () => {
  if (!chartCanvas.value) return
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  const ctx = chartCanvas.value.getContext('2d')
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dias.value.length ? dias.value : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [{
        label: 'Compras',
        data: comprasDiarias.value.length ? comprasDiarias.value : [0,0,0,0,0,0,0],
        borderColor: '#2ecc71',
        backgroundColor: 'rgba(46,204,113,0.15)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#2ecc71',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => '$' + v }
        }
      },
      animation: {
        duration: 300
      }
    }
  })
}

onMounted(async () => {
  if (!initialDataLoaded.value) {
    await cargarEstadisticas()
    initialDataLoaded.value = true
  }
  await nextTick()
  renderChart()
})

watch(
  [comprasDiarias, dias],
  () => {
    if (initialDataLoaded.value) {
      renderChart()
    }
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>