<template>
  <div class="table-responsive">
    <table class="table table-sm table-cacao">
      <thead>
        <tr><th>#</th><th>Producto</th><th class="text-end">Cantidad</th></tr>
      </thead>
      <tbody>
        <tr v-for="(item, idx) in topProductos" :key="idx">
          <td>
            <span class="badge-ranking" :class="[
              idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'
            ]">{{ idx + 1 }}</span>
          </td>
          <td>{{ obtenerNombreProducto(item[0]) }}</td>
          <td class="text-end fw-bold">{{ item[1] }}</td>
        </tr>
        <tr v-if="topProductos.length === 0">
          <td colspan="3" class="text-muted text-center">Sin datos de ventas</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useEstadisticas } from '../../../composables/useEstadisticas'
import { useMongoDB } from '../../../composables/useMongoDB'

const { topProductos, cargarEstadisticas } = useEstadisticas()
const { find } = useMongoDB()
const productos = ref([])

const obtenerNombreProducto = (id) => {
  if (!id) return 'Producto eliminado'
  const prod = productos.value.find(p => p._id === id)
  return prod ? prod.nombre : 'Producto eliminado'
}

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) { console.error(e) }
  await cargarEstadisticas()
})
</script>