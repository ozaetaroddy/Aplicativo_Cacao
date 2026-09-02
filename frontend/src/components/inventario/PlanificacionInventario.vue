<template>
  <div>
    <h4 class="section-title"><i class="fas fa-chart-line"></i> Planificación de Inventarios</h4>

    <div class="card card-cacao mb-3">
      <div class="card-body">
        <p>Esta sección permite visualizar productos con stock bajo y generar sugerencias de compra.</p>
        <button class="btn btn-primary" @click="generarSugerencias">
          <i class="fas fa-sync"></i> Generar Sugerencias de Compra
        </button>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-header">Productos con Stock Bajo</div>
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Stock Actual</th>
              <th>Stock Mínimo</th>
              <th>Cantidad Sugerida</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in productosBajos" :key="p._id">
              <td>{{ p.nombre }}</td>
              <td>{{ p.stock }}</td>
              <td>{{ p.stock_minimo }}</td>
              <td>{{ p.stock_minimo - p.stock }}</td>
            </tr>
            <tr v-if="productosBajos.length === 0">
              <td colspan="4" class="text-muted text-center">Todos los productos tienen stock suficiente</td>
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
const productosBajos = ref([])

const generarSugerencias = async () => {
  try {
    const productos = await find('productos')
    productosBajos.value = productos.filter(p => p.stock <= p.stock_minimo)
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  generarSugerencias()
})
</script>