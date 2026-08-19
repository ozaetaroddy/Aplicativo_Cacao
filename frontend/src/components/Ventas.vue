<template>
  <div>
    <h4 class="section-title"><i class="fas fa-hand-holding-usd"></i>Emitir Factura de Venta</h4>
    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardarVenta">
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label">Fecha</label>
              <input type="date" class="form-control" v-model="fecha" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Cliente</label>
              <input type="text" class="form-control" v-model="cliente" placeholder="Nombre" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Peso (kg)</label>
              <input type="number" step="0.01" class="form-control" v-model.number="peso" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Precio por kg ($)</label>
              <input type="number" step="0.01" class="form-control" v-model.number="precioKg" required>
            </div>
          </div>
          <div class="row g-3 mt-2">
            <div class="col-md-6">
              <label class="form-label">Total ($) (automático)</label>
              <input type="text" class="form-control" :value="total" readonly style="background:#f1ebe1; font-weight:700;">
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <button type="submit" class="btn btn-cacao-primary w-100"><i class="fas fa-file-invoice me-2"></i>Emitir Venta</button>
            </div>
          </div>
        </form>
      </div>
    </div>
    <div class="mt-3" v-html="mensaje"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBackend } from '../composables/useBackend'

const { find, insertOne } = useBackend()
const fecha = ref(new Date().toISOString().split('T')[0])
const cliente = ref('')
const peso = ref(0)
const precioKg = ref(0)
const mensaje = ref('')
const total = computed(() => (peso.value * precioKg.value).toFixed(2))

async function guardarVenta() {
  if (!fecha.value || !cliente.value || !peso.value || !precioKg.value) {
    mensaje.value = '<div class="alert alert-warning">Complete todos los campos.</div>'
    return
  }
  // Verificar stock
  try {
    const compras = await find('compras')
    const ventas = await find('ventas')
    const totalComprado = compras.reduce((a, c) => a + c.peso_kg, 0)
    const totalVendido = ventas.reduce((a, v) => a + v.peso_kg, 0)
    const stock = totalComprado - totalVendido
    if (stock < peso.value) {
      mensaje.value = `<div class="alert alert-warning">Stock insuficiente. Disponible: ${stock.toFixed(2)} kg.</div>`
      return
    }
  } catch (e) {
    mensaje.value = `<div class="alert alert-danger">Error al verificar stock: ${e.message}</div>`
    return
  }

  const documento = {
    fecha: new Date(fecha.value).toISOString(),
    cliente: cliente.value,
    peso_kg: peso.value,
    precio_por_kg: precioKg.value,
    total: parseFloat(total.value),
    tipo: 'venta'
  }
  try {
    await insertOne('ventas', documento)
    mensaje.value = '<div class="alert alert-success">Venta emitida exitosamente.</div>'
    cliente.value = ''
    peso.value = 0
    precioKg.value = 0
  } catch (e) {
    mensaje.value = `<div class="alert alert-danger">Error: ${e.message}</div>`
  }
}
</script>