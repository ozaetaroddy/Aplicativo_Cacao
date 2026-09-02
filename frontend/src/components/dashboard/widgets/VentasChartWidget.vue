<template>
  <div>
    <canvas ref="chartCanvas" style="height:180px;"></canvas>
    <div v-if="ventasDiarias.every(v => v === 0)" class="text-muted text-center small">
      No hay datos de ventas en los últimos 7 días
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
const { ventasDiarias, dias, cargarEstadisticas } = useEstadisticas()

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
          label: 'Ventas',
          data: ventasDiarias.value.length ? ventasDiarias.value : [0,0,0,0,0,0,0],
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#3498db',
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

watch([ventasDiarias, dias], renderChart, { deep: true })
</script>