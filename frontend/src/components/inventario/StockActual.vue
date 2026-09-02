<template>
  <div>
    <h4 class="section-title"><i class="fas fa-list"></i> Stock Actual</h4>

    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Unidad</th>
              <th>Stock Actual</th>
              <th>Stock Mínimo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in productos" :key="p._id" :class="{ 'table-warning': p.stock <= p.stock_minimo }">
              <td>{{ p.codigo }}</td>
              <td>{{ p.nombre }}</td>
              <td>{{ p.unidad_medida }}</td>
              <td>{{ p.stock }}</td>
              <td>{{ p.stock_minimo }}</td>
              <td>
                <span v-if="p.stock <= p.stock_minimo" class="badge bg-danger">Stock Bajo</span>
                <span v-else-if="p.stock === 0" class="badge bg-secondary">Sin Stock</span>
                <span v-else class="badge bg-success">Normal</span>
              </td>
            </tr>
            <tr v-if="productos.length === 0">
              <td colspan="6" class="text-muted text-center">No hay productos registrados</td>
            </tr>
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
const productos = ref([])

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error(e)
  }
})
</script>