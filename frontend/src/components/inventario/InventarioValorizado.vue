<template>
  <div>
    <h4 class="section-title"><i class="fas fa-dollar-sign"></i> Inventario Valorizado</h4>

    <div class="row g-4 mb-4">
      <div class="col-md-4">
        <div class="total-box">
          <h5>Total Productos</h5>
          <div class="number">{{ productos.length }}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="total-box">
          <h5>Valor Total Compra</h5>
          <div class="number">${{ totalValorCompra.toFixed(2) }}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="total-box">
          <h5>Valor Total Venta</h5>
          <div class="number">${{ totalValorVenta.toFixed(2) }}</div>
        </div>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              <th>Stock</th>
              <th>Precio Compra</th>
              <th>Precio Venta</th>
              <th>Valor Compra</th>
              <th>Valor Venta</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(prod, idx) in productos" :key="prod._id">
              <td>{{ idx + 1 }}</td>
              <td>{{ prod.nombre }}</td>
              <td>{{ prod.stock }}</td>
              <td>${{ prod.precio_compra?.toFixed(2) || '0.00' }}</td>
              <td>${{ prod.precio_venta?.toFixed(2) || '0.00' }}</td>
              <td>${{ (prod.stock * prod.precio_compra).toFixed(2) }}</td>
              <td>${{ (prod.stock * prod.precio_venta).toFixed(2) }}</td>
            </tr>
            <tr v-if="productos.length === 0">
              <td colspan="7" class="text-center text-muted">No hay productos registrados</td>
            </tr>
          </tbody>
          <tfoot v-if="productos.length > 0">
            <tr class="table-light fw-bold">
              <td colspan="5" class="text-end">Totales</td>
              <td>${{ totalValorCompra.toFixed(2) }}</td>
              <td>${{ totalValorVenta.toFixed(2) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find } = useMongoDB()
const productos = ref([])

const totalValorCompra = computed(() => {
  return productos.value.reduce((acc, p) => acc + (p.stock * (p.precio_compra || 0)), 0)
})

const totalValorVenta = computed(() => {
  return productos.value.reduce((acc, p) => acc + (p.stock * (p.precio_venta || 0)), 0)
})

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error(e)
  }
})
</script>