<template>
  <div class="table-responsive">
    <table class="table table-sm table-cacao">
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
            <span class="badge-ranking" :class="getRankClass(idx)">
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

const getRankClass = (idx) => {
  if (idx === 0) return 'gold'
  if (idx === 1) return 'silver'
  if (idx === 2) return 'bronze'
  return 'default'
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
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.8rem;
}
.badge-ranking.gold { background: #f1c40f; color: #1a2a3a; }
.badge-ranking.silver { background: #bdc3c7; color: #1a2a3a; }
.badge-ranking.bronze { background: #cd7f32; color: #fff; }
.badge-ranking.default { background: #3498db; color: #fff; }
</style>