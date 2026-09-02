<template>
  <div>
    <canvas ref="chartCanvas" style="height:180px;"></canvas>
    <div v-if="comprasDiarias.every(c => c === 0)" class="text-muted text-center small">
      No hay datos de compras en los últimos 7 días
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useEstadisticas } from '../../../composables/useEstadisticas'
Chart.register(...registerables)

const chartCanvas = ref(null)
let chartInstance = null
const { comprasDiarias, dias, cargarEstadisticas } = useEstadisticas()

const renderChart = () => {
  nextTick(() => {
    if (!chartCanvas.value) return
    if (chartInstance) chartInstance.destroy()
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
        scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } } }
      }
    })
  })
}

onMounted(async () => {
  await cargarEstadisticas()
  renderChart()
})

watch([comprasDiarias, dias], renderChart, { deep: true })
</script>