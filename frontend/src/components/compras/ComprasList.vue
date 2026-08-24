<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-shopping-cart"></i> Compras</h4>
      <router-link to="/compras/nuevo" class="btn btn-cacao-primary"><i class="fas fa-plus"></i> Nueva Compra</router-link>
    </div>
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr>
            <th>Fecha</th>
            <th>Proveedor</th>
            <th>Nº Factura</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="c in compras" :key="c._id">
              <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
              <td>{{ c.numero_factura }}</td>
              <td>${{ c.subtotal.toFixed(2) }}</td>
              <td>${{ c.iva.toFixed(2) }}</td>
              <td><strong>${{ c.total.toFixed(2) }}</strong></td>
            </tr>
            <tr v-if="compras.length === 0"><td colspan="6" class="text-muted text-center">No hay compras</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find } = useMongoDB()
const compras = ref([])

onMounted(async () => {
  try {
    compras.value = await find('compras')
  } catch (e) {
    console.error(e)
  }
})
</script>