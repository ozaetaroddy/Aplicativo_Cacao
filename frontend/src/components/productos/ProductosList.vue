<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-boxes"></i> Productos</h4>
      <router-link to="/productos/nuevo" class="btn btn-success">
        <i class="fas fa-plus"></i> Nuevo Producto
      </router-link>
    </div>

    <TableEnhanced
      :data="productos"
      :columns="columnas"
      :actions="acciones"
      filterKey="categoriaId"
      :filterOptions="categoriaOptions"
    >
      <template #nombre="{ row }">
        <span class="fw-bold">{{ row.nombre }}</span>
      </template>
      <template #precio_venta="{ value }">
        ${{ value?.toFixed(2) }}
      </template>
      <template #stock="{ row }">
        <span :class="row.stock <= row.stock_minimo ? 'text-danger fw-bold' : ''">
          {{ row.stock }}
        </span>
      </template>
    </TableEnhanced>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import TableEnhanced from '../shared/TableEnhanced.vue'
import { useToast } from 'vue-toastification'

const { find, deleteOne } = useMongoDB()
const toast = useToast()
const productos = ref([])
const categorias = ref([])

const columnas = [
  { key: 'codigo', label: 'Código' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'categoriaId', label: 'Categoría' },
  { key: 'precio_compra', label: 'P. Compra' },
  { key: 'precio_venta', label: 'P. Venta' },
  { key: 'stock', label: 'Stock' }
]

const categoriaOptions = computed(() => {
  return categorias.value.map(c => ({ value: c._id, label: c.nombre }))
})

const acciones = [
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-primary',
    handler: (row) => router.push(`/productos/editar/${row._id}`)
  },
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    handler: async (row) => {
      if (confirm('¿Eliminar este producto?')) {
        try {
          await deleteOne('productos', row._id)
          toast.success('Producto eliminado')
          await cargarDatos()
        } catch (e) {
          toast.error('Error: ' + e.message)
        }
      }
    }
  }
]

const cargarDatos = async () => {
  try {
    const [prods, cats] = await Promise.all([find('productos'), find('categorias')])
    productos.value = prods
    categorias.value = cats
  } catch (e) { console.error(e) }
}

onMounted(cargarDatos)
</script>