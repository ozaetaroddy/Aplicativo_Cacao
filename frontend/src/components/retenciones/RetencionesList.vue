<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-percent"></i> Retenciones</h4>
      <router-link to="/retenciones/nuevo" class="btn btn-success">
        <i class="fas fa-plus"></i> Nueva Retención
      </router-link>
    </div>

    <div class="card card-cacao">
      <div class="card-body">
        <DataTablePaged
          ref="tablaRef"
          endpoint="/retenciones"
          :columns="columnas"
          :actions="acciones"
          :default-limit="20"
          default-sort="fecha_emision"
          default-sort-dir="desc"
        >
          <template #fecha_emision="{ row }">
            {{ new Date(row.fecha_emision).toLocaleDateString('es-EC') }}
          </template>
          <template #proveedor="{ row }">
            {{ row.proveedor?.nombre || 'N/A' }}
          </template>
          <template #valor_retenido="{ value }">
            ${{ (value || 0).toFixed(2) }}
          </template>
          <template #porcentaje="{ value }">
            {{ value || 0 }}%
          </template>
        </DataTablePaged>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import DataTablePaged from '../shared/DataTablePaged.vue'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { deleteOne } = useMongoDB()
const tablaRef = ref(null)

const columnas = [
  { key: 'fecha_emision', label: 'Fecha', sortable: true, width: '110px' },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'numero_factura', label: 'Nº Factura' },
  { key: 'valor_retenido', label: 'Valor Retenido', sortable: true, width: '130px' },
  { key: 'porcentaje', label: '%', width: '80px' }
]

const acciones = [
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    title: 'Eliminar',
    handler: async (row) => {
      if (!confirm('¿Eliminar esta retención?')) return
      try {
        await deleteOne('retenciones', row._id)
        tablaRef.value?.reload()
        toast.success('Retención eliminada')
      } catch (e) {
        toast.error('Error al eliminar: ' + e.message)
      }
    }
  }
]
</script>