<template>
  <div>
    <h4 class="section-title"><i class="fas fa-warehouse"></i>Inventario de Productos</h4>
    <div class="row g-4 mb-4">
      <div class="col-md-4">
        <div class="total-box">
          <h5><i class="fas fa-arrow-down me-1" style="color:#2d6a4f;"></i> Total Comprado</h5>
          <div class="number">{{ totalComprado }}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="total-box">
          <h5><i class="fas fa-arrow-up me-1" style="color:#b33939;"></i> Total Vendido</h5>
          <div class="number">{{ totalVendido }}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="total-box">
          <h5><i class="fas fa-boxes me-1"></i> Stock Actual</h5>
          <div class="number">{{ stock }}</div>
        </div>
      </div>
    </div>
    <div class="card card-cacao">
      <div class="card-header"><i class="fas fa-history me-1"></i> Historial de movimientos</div>
      <div class="card-body table-responsive" v-html="historialHtml"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useBackend } from '../composables/useBackend'

const { find } = useBackend()
const totalComprado = ref('0 kg')
const totalVendido = ref('0 kg')
const stock = ref('0 kg')
const historialHtml = ref('<p class="text-muted">Cargando historial...</p>')

const formatearMoneda = (v) => '$' + parseFloat(v).toFixed(2)
const formatearFecha = (f) => new Date(f).toLocaleDateString('es-EC')

async function cargarInventario() {
  try {
    const compras = await find('compras')
    const ventas = await find('ventas')
    const totalC = compras.reduce((a, c) => a + c.peso_kg, 0)
    const totalV = ventas.reduce((a, v) => a + v.peso_kg, 0)
    totalComprado.value = totalC.toFixed(2) + ' kg'
    totalVendido.value = totalV.toFixed(2) + ' kg'
    stock.value = (totalC - totalV).toFixed(2) + ' kg'

    const historial = [
      ...compras.map(c => ({ ...c, tipo: 'Compra' })),
      ...ventas.map(v => ({ ...v, tipo: 'Venta' }))
    ]
    historial.sort((a,b) => new Date(b.fecha) - new Date(a.fecha))

    let html = '<table class="table table-sm table-cacao"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Peso</th><th>Total</th></tr></thead><tbody>'
    if (historial.length === 0) html += '<tr><td colspan="5" class="text-muted text-center">Sin movimientos.</td></tr>'
    historial.slice(0, 50).forEach(item => {
      const concepto = item.tipo === 'Compra' ? item.proveedor : item.cliente
      html += `<tr>
        <td>${formatearFecha(item.fecha)}</td>
        <td><span class="badge ${item.tipo === 'Compra' ? 'bg-success' : 'bg-primary'}">${item.tipo}</span></td>
        <td>${concepto}</td>
        <td>${item.peso_kg.toFixed(2)} kg</td>
        <td>${formatearMoneda(item.total)}</td>
      </tr>`
    })
    html += '</tbody></table>'
    historialHtml.value = html
  } catch (e) {
    historialHtml.value = `<div class="alert alert-danger">Error al cargar inventario: ${e.message}</div>`
  }
}

onMounted(cargarInventario)
</script>