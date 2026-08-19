<template>
  <div>
    <h4 class="section-title"><i class="fas fa-tachometer-alt"></i>Panel de Control</h4>
    <div class="row g-4">
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-arrow-down me-1" style="color:#2d6a4f;"></i> Total Compras</h5>
          <div class="number">{{ totalCompras }}</div>
          <div class="sub"><i class="fas fa-weight-scale me-1"></i> {{ pesoCompras }} kg</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-arrow-up me-1" style="color:#b33939;"></i> Total Ventas</h5>
          <div class="number">{{ totalVentas }}</div>
          <div class="sub"><i class="fas fa-weight-scale me-1"></i> {{ pesoVentas }} kg</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-boxes me-1"></i> Stock Disponible</h5>
          <div class="number">{{ stock }}</div>
          <div class="sub">en bodega</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-chart-line me-1"></i> Margen Bruto</h5>
          <div class="number">{{ margen }}</div>
          <div class="sub">ventas - compras</div>
        </div>
      </div>
    </div>
    <div class="row mt-4">
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-shopping-cart"></i> Últimas Compras</div>
          <div class="card-body table-responsive" v-html="ultComprasHtml"></div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-hand-holding-usd"></i> Últimas Ventas</div>
          <div class="card-body table-responsive" v-html="ultVentasHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useBackend } from '../composables/useBackend'

const { find } = useBackend()
const totalCompras = ref('$0.00')
const pesoCompras = ref(0)
const totalVentas = ref('$0.00')
const pesoVentas = ref(0)
const stock = ref('0 kg')
const margen = ref('$0.00')
const ultComprasHtml = ref('<p class="text-muted">Cargando...</p>')
const ultVentasHtml = ref('<p class="text-muted">Cargando...</p>')

const formatearMoneda = (v) => '$' + parseFloat(v).toFixed(2)
const formatearFecha = (f) => new Date(f).toLocaleDateString('es-EC')

async function cargarDashboard() {
  try {
    const compras = await find('compras')
    const ventas = await find('ventas')
    const totalC = compras.reduce((a, c) => a + c.total, 0)
    const totalV = ventas.reduce((a, v) => a + v.total, 0)
    const pesoC = compras.reduce((a, c) => a + c.peso_kg, 0)
    const pesoV = ventas.reduce((a, v) => a + v.peso_kg, 0)
    totalCompras.value = formatearMoneda(totalC)
    pesoCompras.value = pesoC.toFixed(2)
    totalVentas.value = formatearMoneda(totalV)
    pesoVentas.value = pesoV.toFixed(2)
    stock.value = (pesoC - pesoV).toFixed(2) + ' kg'
    margen.value = formatearMoneda(totalV - totalC)

    const ultC = compras.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0,5)
    let htmlC = '<table class="table table-sm table-cacao"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Peso</th><th>Total</th></tr></thead><tbody>'
    if (ultC.length === 0) htmlC += '<tr><td colspan="4" class="text-muted text-center">Sin compras</td></tr>'
    ultC.forEach(c => {
      htmlC += `<tr><td>${formatearFecha(c.fecha)}</td><td>${c.proveedor}</td><td>${c.peso_kg.toFixed(2)} kg</td><td>${formatearMoneda(c.total)}</td></tr>`
    })
    htmlC += '</tbody></table>'
    ultComprasHtml.value = htmlC

    const ultV = ventas.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0,5)
    let htmlV = '<table class="table table-sm table-cacao"><thead><tr><th>Fecha</th><th>Cliente</th><th>Peso</th><th>Total</th></tr></thead><tbody>'
    if (ultV.length === 0) htmlV += '<tr><td colspan="4" class="text-muted text-center">Sin ventas</td></tr>'
    ultV.forEach(v => {
      htmlV += `<tr><td>${formatearFecha(v.fecha)}</td><td>${v.cliente}</td><td>${v.peso_kg.toFixed(2)} kg</td><td>${formatearMoneda(v.total)}</td></tr>`
    })
    htmlV += '</tbody></table>'
    ultVentasHtml.value = htmlV
  } catch (e) {
    console.error(e)
    ultComprasHtml.value = `<div class="alert alert-danger">Error al cargar datos: ${e.message}</div>`
    ultVentasHtml.value = `<div class="alert alert-danger">Error al cargar datos: ${e.message}</div>`
  }
}

onMounted(cargarDashboard)
</script>