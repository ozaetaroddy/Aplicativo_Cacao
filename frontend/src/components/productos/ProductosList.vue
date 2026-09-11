<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-boxes"></i> Productos</h4>
      <router-link to="/productos/nuevo" class="btn btn-success">
        <i class="fas fa-plus"></i> Nuevo Producto
      </router-link>
    </div>

    <div class="card card-cacao">
      <div class="card-body">
        <DataTablePaged
          ref="tablaRef"
          endpoint="/productos"
          :columns="columnas"
          :actions="acciones"
          :default-limit="20"
          default-sort="nombre"
          default-sort-dir="asc"
        >
          <template #nombre="{ row }">
            <span class="fw-bold">{{ row.nombre }}</span>
          </template>
          <template #categoriaId="{ row }">
            {{ obtenerCategoria(row.categoriaId) }}
          </template>
          <template #precio_compra="{ value }">
            ${{ (value || 0).toFixed(2) }}
          </template>
          <template #precio_venta="{ value }">
            ${{ (value || 0).toFixed(2) }}
          </template>
          <template #stock="{ row }">
            <span :class="row.stock <= row.stock_minimo ? 'text-danger fw-bold' : ''">
              {{ row.stock }}
            </span>
          </template>
        </DataTablePaged>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import DataTablePaged from '../shared/DataTablePaged.vue'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()
const { find, deleteOne } = useMongoDB()
const tablaRef = ref(null)
const categorias = ref([])

const columnas = [
  { key: 'codigo', label: 'Código', sortable: true },
  { key: 'nombre', label: 'Nombre', sortable: true },
  { key: 'categoriaId', label: 'Categoría' },
  { key: 'precio_compra', label: 'P. Compra', width: '110px' },
  { key: 'precio_venta', label: 'P. Venta', width: '110px' },
  { key: 'stock', label: 'Stock', width: '90px' }
]

const acciones = [
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-primary',
    title: 'Editar',
    handler: (row) => router.push(`/productos/editar/${row._id}`)
  },
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    title: 'Eliminar',
    handler: async (row) => {
      if (!confirm('¿Eliminar este producto?')) return
      try {
        await deleteOne('productos', row._id)
        tablaRef.value?.reload()
        toast.success('Producto eliminado correctamente')
      } catch (e) {
        toast.error('Error al eliminar: ' + e.message)
      }
    }
  }
]

const obtenerCategoria = (id) => {
  if (!id) return 'Sin categoría'
  const cat = categorias.value.find(c => c._id === id)
  return cat ? cat.nombre : 'Sin categoría'
}

onMounted(async () => {
  try {
    categorias.value = await find('categorias')
  } catch (e) {
    console.error('Error cargando categorías:', e)
  }
})
</script>