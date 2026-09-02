<template>
  <div style="max-height: 180px; overflow-y: auto;">
    <table class="table table-sm table-cacao mb-0">
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>Producto</th>
          <th style="width:80px; text-align:right;">Cant.</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, idx) in topProductos" :key="idx">
          <td>
            <span class="badge-ranking" :class="idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'">
              {{ idx + 1 }}
            </span>
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

<style scoped>
.badge-ranking {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.7rem;
}
.badge-ranking.gold { background: #f1c40f; color: #1a2a3a; }
.badge-ranking.silver { background: #bdc3c7; color: #1a2a3a; }
.badge-ranking.bronze { background: #cd7f32; color: #fff; }
.badge-ranking.default { background: #3498db; color: #fff; }
body.dark-mode .badge-ranking.gold,
body.dark-mode .badge-ranking.silver {
  color: #1a2a3a;
}
</style>