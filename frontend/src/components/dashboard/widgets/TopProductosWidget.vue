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
        <tr v-for="(item, idx) in topProductos" :key="item.productoId || idx">
          <td>
            <span class="badge-ranking" :class="getRankClass(idx)">
              {{ idx + 1 }}
            </span>
          </td>
          <td>{{ item.nombre || 'Producto eliminado' }}</td>
          <td class="text-end fw-bold">{{ item.cantidad }}</td>
        </tr>
        <tr v-if="topProductos.length === 0">
          <td colspan="3" class="text-muted text-center">Sin datos de ventas</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useEstadisticas } from '../../../composables/useEstadisticas'

const { topProductos, cargarEstadisticas } = useEstadisticas()

const getRankClass = (idx) => {
  if (idx === 0) return 'gold'
  if (idx === 1) return 'silver'
  if (idx === 2) return 'bronze'
  return 'default'
}

onMounted(cargarEstadisticas)
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