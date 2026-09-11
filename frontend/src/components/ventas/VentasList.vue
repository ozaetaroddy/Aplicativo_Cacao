<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-hand-holding-usd"></i> Ventas</h4>
      <router-link to="/ventas/nuevo" class="btn btn-cacao-primary">
        <i class="fas fa-plus"></i> Nueva Venta
      </router-link>
    </div>

    <div class="card card-cacao">
      <div class="card-body">
        <DataTablePaged
          ref="tablaRef"
          endpoint="/ventas"
          :columns="columnas"
          :actions="acciones"
          :default-limit="20"
          default-sort="fecha_emision"
          default-sort-dir="desc"
        >
          <template #fecha_emision="{ row }">
            {{ new Date(row.fecha_emision).toLocaleDateString('es-EC') }}
          </template>
          <template #cliente="{ row }">
            {{ row.cliente?.nombre || 'N/A' }}
          </template>
          <template #tipo_documento="{ row }">
            <span class="badge bg-secondary">{{ row.tipo_documento || 'N/A' }}</span>
          </template>
          <template #subtotal="{ value }">
            ${{ (value || 0).toFixed(2) }}
          </template>
          <template #iva="{ value }">
            ${{ (value || 0).toFixed(2) }}
          </template>
          <template #total="{ value }">
            <strong>${{ (value || 0).toFixed(2) }}</strong>
          </template>
          <template #estado_pago="{ row }">
            <span class="badge" :class="row.estado_pago === 'pagado' ? 'bg-success' : 'bg-warning text-dark'">
              {{ row.estado_pago || 'pendiente' }}
            </span>
          </template>
        </DataTablePaged>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import DataTablePaged from '../shared/DataTablePaged.vue'

const router = useRouter()
const tablaRef = ref(null)

const columnas = [
  { key: 'fecha_emision', label: 'Fecha', sortable: true, width: '110px' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'numero_factura', label: 'Nº Factura', sortable: true },
  { key: 'tipo_documento', label: 'Tipo', width: '100px' },
  { key: 'subtotal', label: 'Subtotal', width: '110px' },
  { key: 'iva', label: 'IVA', width: '90px' },
  { key: 'total', label: 'Total', sortable: true, width: '120px' },
  { key: 'estado_pago', label: 'Estado', width: '100px' }
]

const acciones = [
  {
    key: 'ver',
    icon: 'fas fa-eye',
    class: 'btn-outline-primary',
    title: 'Ver documento',
    handler: (row) => router.push(`/consultar-documentos?tipo=venta&id=${row._id}`)
  },
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-secondary',
    title: 'Editar',
    handler: (row) => router.push(`/ventas/editar/${row._id}`)
  }
]
</script>