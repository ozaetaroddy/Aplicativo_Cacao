<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-hand-holding-usd"></i> Ventas</h4>
      <router-link to="/ventas/nuevo" class="btn btn-cacao-primary"><i class="fas fa-plus"></i> Nueva Venta</router-link>
    </div>
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Nº Factura</th>
            <th>Tipo</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="v in ventas" :key="v._id">
              <td>{{ new Date(v.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ v.cliente?.nombre || 'N/A' }}</td>
              <td>{{ v.numero_factura }}</td>
              <td>{{ v.tipo_documento }}</td>
              <td>${{ v.subtotal.toFixed(2) }}</td>
              <td>${{ v.iva.toFixed(2) }}</td>
              <td><strong>${{ v.total.toFixed(2) }}</strong></td>
            </tr>
            <tr v-if="ventas.length === 0"><td colspan="7" class="text-muted text-center">No hay ventas</td></tr>
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
const ventas = ref([])

onMounted(async () => {
  try {
    ventas.value = await find('ventas')
  } catch (e) {
    console.error(e)
  }
})
</script>