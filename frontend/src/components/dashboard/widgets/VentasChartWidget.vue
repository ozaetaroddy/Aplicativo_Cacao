<template>
  <div style="position: relative; height: 180px; width: 100%;">
    <canvas ref="chartCanvas"></canvas>
    <div v-if="ventasDiarias.every(v => v === 0)" class="text-muted text-center small" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%;">
      No hay datos de ventas en los últimos 7 días
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
const { ventasDiarias, dias, cargarEstadisticas } = useEstadisticas()

// Variable para controlar si ya se cargaron los datos iniciales
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
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => '$' + v }
        }
      },
      // Evita que el chart se redibuje innecesariamente
      animation: {
        duration: 300
      }
    }
  })
}

// Cargar datos al montar (solo una vez)
onMounted(async () => {
  if (!initialDataLoaded.value) {
    await cargarEstadisticas()
    initialDataLoaded.value = true
  }
  // Esperar al siguiente tick para asegurar que el canvas está listo
  await nextTick()
  renderChart()
})

// Actualizar gráfico solo cuando los datos cambien realmente
watch(
  [ventasDiarias, dias],
  () => {
    if (initialDataLoaded.value) {
      renderChart()
    }
  },
  { deep: true }
)

// Limpiar al desmontar
onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>