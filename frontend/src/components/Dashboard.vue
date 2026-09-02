<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Panel de Control</h4>

    <!-- Tarjetas de estadísticas -->
    <div class="row g-4 mb-4">
      <div class="col-xl-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-file-invoice text-primary"></i> Ventas Hoy</h5>
          <div class="number">{{ ventasHoy }}</div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-shopping-cart text-success"></i> Compras Hoy</h5>
          <div class="number">{{ comprasHoy }}</div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-users text-info"></i> Clientes</h5>
          <div class="number">{{ totalClientes }}</div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-exclamation-triangle text-warning"></i> Stock Bajo</h5>
          <div class="number">{{ stockBajo }}</div>
        </div>
      </div>
    </div>

    <!-- Gráfico de ventas semanales -->
    <div class="row g-4 mb-4">
      <div class="col-md-8">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-chart-line"></i> Ventas de los últimos 7 días</div>
          <div class="card-body">
            <canvas id="ventasChart" width="400" height="200"></canvas>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-clock"></i> Accesos Rápidos</div>
          <div class="card-body">
            <div class="d-grid gap-2">
              <router-link to="/ventas/nuevo?tipo=factura" class="btn btn-primary">Nueva Factura</router-link>
              <router-link to="/compras/nuevo" class="btn btn-success">Nueva Compra</router-link>
              <router-link to="/clientes/nuevo" class="btn btn-info">Nuevo Cliente</router-link>
              <router-link to="/productos/nuevo" class="btn btn-warning">Nuevo Producto</router-link>
              <router-link to="/consultar-documentos" class="btn btn-secondary">Consultar Documentos</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Últimos movimientos -->
    <div class="row g-4">
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-file-invoice"></i> Últimas Facturas</div>
          <div class="card-body table-responsive">
            <table class="table table-sm table-cacao">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th></tr></thead>
              <tbody>
                <tr v-for="v in ultimasVentas" :key="v._id">
                  <td>{{ new Date(v.fecha_emision).toLocaleDateString() }}</td>
                  <td>{{ v.cliente?.nombre || 'N/A' }}</td>
                  <td>{{ formatCurrency(v.total) }}</td>
                </tr>
                <tr v-if="ultimasVentas.length === 0"><td colspan="3" class="text-muted text-center">Sin ventas recientes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-shopping-cart"></i> Últimas Compras</div>
          <div class="card-body table-responsive">
            <table class="table table-sm table-cacao">
              <thead><tr><th>Fecha</th><th>Proveedor</th><th>Total</th></tr></thead>
              <tbody>
                <tr v-for="c in ultimasCompras" :key="c._id">
                  <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
                  <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
                  <td>{{ formatCurrency(c.total) }}</td>
                </tr>
                <tr v-if="ultimasCompras.length === 0"><td colspan="3" class="text-muted text-center">Sin compras recientes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Notificación de stock bajo -->
    <NotificationStock />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { formatCurrency } from '../utils/formatters'
import NotificationStock from './NotificationStock.vue'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const { find, getProductosStockBajo } = useMongoDB()
const ventasHoy = ref(0)
const comprasHoy = ref(0)
const totalClientes = ref(0)
const stockBajo = ref(0)
const ultimasVentas = ref([])
const ultimasCompras = ref([])

let chartInstance = null

onMounted(async () => {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    const [clientes, ventas, compras, productosBajo] = await Promise.all([
      find('clientes'),
      find('ventas'),
      find('compras'),
      getProductosStockBajo()
    ])

    totalClientes.value = clientes.length
    stockBajo.value = productosBajo.length

    // Ventas de hoy (tipo factura)
    const ventasHoyArr = ventas.filter(v => v.fecha_emision?.startsWith(hoy) && v.tipo_documento === 'factura')
    ventasHoy.value = ventasHoyArr.length
    // Compras de hoy
    const comprasHoyArr = compras.filter(c => c.fecha_emision?.startsWith(hoy))
    comprasHoy.value = comprasHoyArr.length

    // Últimas 5 ventas y compras
    ultimasVentas.value = ventas.sort((a,b) => new Date(b.fecha_emision) - new Date(a.fecha_emision)).slice(0,5)
    ultimasCompras.value = compras.sort((a,b) => new Date(b.fecha_emision) - new Date(a.fecha_emision)).slice(0,5)

    // Gráfico de ventas semanales
    const fechas = []
    const totales = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const fechaStr = d.toISOString().split('T')[0]
      fechas.push(d.toLocaleDateString('es-EC', { weekday: 'short' }))
      const sum = ventas.filter(v => v.fecha_emision?.startsWith(fechaStr) && v.tipo_documento === 'factura')
        .reduce((acc, v) => acc + (v.total || 0), 0)
      totales.push(sum)
    }

    const ctx = document.getElementById('ventasChart')?.getContext('2d')
    if (ctx) {
      if (chartInstance) chartInstance.destroy()
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: fechas,
          datasets: [{
            label: 'Ventas ($)',
            data: totales,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52,152,219,0.1)',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      })
    }
  } catch (e) {
    console.error('Error cargando dashboard:', e)
  }
})
</script>

<style scoped>
.card-cacao {
  transition: transform 0.2s, box-shadow 0.2s;
}
.card-cacao:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.12);
}
</style>