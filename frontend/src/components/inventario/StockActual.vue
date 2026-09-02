<template>
  <div>
    <h4 class="section-title"><i class="fas fa-boxes"></i> Stock Actual</h4>

    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>#</th>
              <th>Código</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Stock Mínimo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(prod, idx) in productos" :key="prod._id" :class="{ 'table-danger': prod.stock <= prod.stock_minimo }">
              <td>{{ idx + 1 }}</td>
              <td>{{ prod.codigo }}</td>
              <td>{{ prod.nombre }}</td>
              <td>{{ obtenerCategoria(prod.categoriaId) }}</td>
              <td>{{ prod.stock }}</td>
              <td>{{ prod.stock_minimo }}</td>
              <td>
                <span v-if="prod.stock <= prod.stock_minimo" class="badge bg-danger">Stock Bajo</span>
                <span v-else class="badge bg-success">OK</span>
              </td>
            </tr>
            <tr v-if="productos.length === 0">
              <td colspan="7" class="text-center text-muted">No hay productos registrados</td>
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
const categorias = ref([])

const obtenerCategoria = (id) => {
  if (!id) return 'Sin categoría'
  const cat = categorias.value.find(c => c._id === id)
  return cat ? cat.nombre : 'Sin categoría'
}

onMounted(async () => {
  try {
    const [prods, cats] = await Promise.all([
      find('productos'),
      find('categorias')
    ])
    productos.value = prods
    categorias.value = cats
  } catch (e) {
    console.error(e)
  }
})
</script>