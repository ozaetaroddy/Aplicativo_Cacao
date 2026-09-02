<template>
  <div>
    <canvas ref="chartCanvas" style="height:180px;"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useEstadisticas } from '../../../composables/useEstadisticas'
Chart.register(...registerables)

const chartCanvas = ref(null)
let chartInstance = null
const { comprasDiarias, dias, cargarEstadisticas } = useEstadisticas()

const renderChart = () => {
  if (!chartCanvas.value) return
  if (chartInstance) chartInstance.destroy()
  const ctx = chartCanvas.value.getContext('2d')
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dias.value,
      datasets: [{
        label: 'Compras',
        data: comprasDiarias.value,
        borderColor: '#2ecc71',
        backgroundColor: 'rgba(46,204,113,0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } } }
    }
  })
}

onMounted(async () => {
  await cargarEstadisticas()
  renderChart()
})

watch([comprasDiarias, dias], renderChart, { deep: true })
</script>