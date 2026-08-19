<template>
  <div>
    <h4 class="section-title"><i class="fas fa-chart-bar"></i>Reportes Diarios</h4>
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <label class="form-label">Seleccionar fecha</label>
        <input type="date" class="form-control" v-model="fecha">
      </div>
      <div class="col-md-8 d-flex align-items-end gap-2 flex-wrap">
        <button class="btn btn-cacao-outline" @click="setHoy">Hoy</button>
        <button class="btn btn-cacao-outline" @click="setAyer">Ayer</button>
        <button class="btn btn-cacao-primary" @click="cargarReportes"><i class="fas fa-sync me-1"></i>Generar</button>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-arrow-down me-1" style="color:#2d6a4f;"></i> Compras del día</div>
          <div class="card-body table-responsive" v-html="comprasHtml"></div>
          <div class="card-footer text-end">{{ totalCompras }}</div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-arrow-up me-1" style="color:#b33939;"></i> Ventas del día</div>
          <div class="card-body table-responsive" v-html="ventasHtml"></div>
          <div class="card-footer text-end">{{ totalVentas }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useBackend } from '../composables/useBackend'

const { find } = useBackend()
const fecha = ref(new Date().toISOString().split('T')[0])
const comprasHtml = ref('<p class="text-muted">Seleccione una fecha y presione Generar.</p>')
const ventasHtml = ref('<p class="text-muted">Seleccione una fecha y presione Generar.</p>')
const totalCompras = ref('Total: $0.00')
const totalVentas = ref('Total: $0.00')

const formatearMoneda = (v) => '$' + parseFloat(v).toFixed(2)

const setHoy = () => { fecha.value = new Date().toISOString().split('T')[0]; cargarReportes() }
const setAyer = () => { 
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  fecha.value = ayer.toISOString().split('T')[0]
  cargarReportes()
}

async function cargarReportes() {
  if (!fecha.value) {
    comprasHtml.value = '<div class="alert alert-warning">Seleccione una fecha.</div>'
    return
  }
  try {
    // Usamos el endpoint de reportes a través de find con filtro
    const compras = await find('compras', { fecha: { $gte: new Date(fecha.value).toISOString(), $lte: new Date(fecha.value+'T23:59:59.999Z').toISOString() } })
    const ventas = await find('ventas', { fecha: { $gte: new Date(fecha.value).toISOString(), $lte: new Date(fecha.value+'T23:59:59.999Z').toISOString() } })
    // Alternativa: usar el endpoint /reportes/:fecha si lo prefieres, pero find ya maneja el filtro.

    let htmlC = '<table class="table table-sm table-cacao"><thead><tr><th>Hora</th><th>Proveedor</th><th>Peso</th><th>Total</th></tr></thead><tbody>'
    if (compras.length === 0) htmlC += '<tr><td colspan="4" class="text-muted text-center">No hay compras este día.</td></tr>'
    compras.sort((a,b) => new Date(a.fecha) - new Date(b.fecha)).forEach(c => {
      const hora = new Date(c.fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
      htmlC += `<tr><td>${hora}</td><td>${c.proveedor}</td><td>${c.peso_kg.toFixed(2)} kg</td><td>${formatearMoneda(c.total)}</td></tr>`
    })
    htmlC += '</tbody></table>'
    comprasHtml.value = htmlC
    const totalC = compras.reduce((a, c) => a + c.total, 0)
    totalCompras.value = `Total: ${formatearMoneda(totalC)}`

    let htmlV = '<table class="table table-sm table-cacao"><thead><tr><th>Hora</th><th>Cliente</th><th>Peso</th><th>Total</th></tr></thead><tbody>'
    if (ventas.length === 0) htmlV += '<tr><td colspan="4" class="text-muted text-center">No hay ventas este día.</td></tr>'
    ventas.sort((a,b) => new Date(a.fecha) - new Date(b.fecha)).forEach(v => {
      const hora = new Date(v.fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
      htmlV += `<tr><td>${hora}</td><td>${v.cliente}</td><td>${v.peso_kg.toFixed(2)} kg</td><td>${formatearMoneda(v.total)}</td></tr>`
    })
    htmlV += '</tbody></table>'
    ventasHtml.value = htmlV
    const totalV = ventas.reduce((a, v) => a + v.total, 0)
    totalVentas.value = `Total: ${formatearMoneda(totalV)}`
  } catch (e) {
    comprasHtml.value = `<div class="alert alert-danger">Error: ${e.message}</div>`
    ventasHtml.value = `<div class="alert alert-danger">Error: ${e.message}</div>`
  }
}
</script>