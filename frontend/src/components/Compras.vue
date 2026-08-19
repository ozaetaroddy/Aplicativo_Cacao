<template>
  <div>
    <h4 class="section-title"><i class="fas fa-shopping-cart"></i>Registrar Compra</h4>
    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardarCompra">
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label">Fecha</label>
              <input type="date" class="form-control" v-model="fecha" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Proveedor</label>
              <input type="text" class="form-control" v-model="proveedor" placeholder="Nombre" required>
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
              <button type="submit" class="btn btn-cacao-success w-100"><i class="fas fa-save me-2"></i>Guardar Compra</button>
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

const { insertOne } = useBackend()
const fecha = ref(new Date().toISOString().split('T')[0])
const proveedor = ref('')
const peso = ref(0)
const precioKg = ref(0)
const mensaje = ref('')

const total = computed(() => (peso.value * precioKg.value).toFixed(2))

async function guardarCompra() {
  if (!fecha.value || !proveedor.value || !peso.value || !precioKg.value) {
    mensaje.value = '<div class="alert alert-warning">Complete todos los campos.</div>'
    return
  }
  const documento = {
    fecha: new Date(fecha.value).toISOString(),
    proveedor: proveedor.value,
    peso_kg: peso.value,
    precio_por_kg: precioKg.value,
    total: parseFloat(total.value),
    tipo: 'compra'
  }
  try {
    await insertOne('compras', documento)
    mensaje.value = '<div class="alert alert-success">Compra registrada exitosamente.</div>'
    proveedor.value = ''
    peso.value = 0
    precioKg.value = 0
  } catch (e) {
    mensaje.value = `<div class="alert alert-danger">Error: ${e.message}</div>`
  }
}
</script>