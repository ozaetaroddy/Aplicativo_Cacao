<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-boxes"></i> Productos</h4>
      <router-link to="/productos/nuevo" class="btn btn-cacao-primary"><i class="fas fa-plus"></i> Nuevo Producto</router-link>
    </div>
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Precio Compra</th>
            <th>Precio Venta</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr></thead>
          <tbody>
            <tr v-for="p in productos" :key="p._id" :class="{ 'table-warning': p.stock <= p.stock_minimo }">
              <td>{{ p.codigo }}</td>
              <td>{{ p.nombre }}</td>
              <td>{{ getCategoriaNombre(p.categoriaId) }}</td>
              <td>${{ p.precio_compra }}</td>
              <td>${{ p.precio_venta }}</td>
              <td>{{ p.stock }}</td>
              <td>
                <router-link :to="`/productos/editar/${p._id}`" class="btn btn-sm btn-outline-primary me-1"><i class="fas fa-edit"></i></router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(p._id)"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
            <tr v-if="productos.length === 0"><td colspan="7" class="text-muted text-center">No hay productos</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find, deleteOne } = useMongoDB()
const productos = ref([])
const categorias = ref([])

const getCategoriaNombre = (id) => {
  const cat = categorias.value.find(c => c._id === id)
  return cat ? cat.nombre : 'Sin categoría'
}

const cargarDatos = async () => {
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
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar este producto?')) {
    try {
      await deleteOne('productos', id)
      await cargarDatos()
    } catch (e) {
      alert('Error al eliminar: ' + e.message)
    }
  }
}

onMounted(cargarDatos)
</script>