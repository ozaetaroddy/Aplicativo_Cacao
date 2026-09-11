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
          <template #estado_sri="{ row }">
            <span
              class="badge"
              :class="{
                'bg-success': row.estado_sri === 'AUTORIZADO',
                'bg-info': row.estado_sri === 'PENDIENTE' || row.estado_sri === 'RECIBIDA',
                'bg-danger': row.estado_sri === 'RECHAZADA' || row.estado_sri === 'DEVUELTA',
                'bg-secondary': !row.estado_sri || row.estado_sri === 'NO_APLICA'
              }"
            >
              {{ row.estado_sri || 'N/A' }}
            </span>
          </template>
          <template #clave_acceso="{ row }">
            <span v-if="row.clave_acceso" class="clave-corta" :title="row.clave_acceso">
              {{ row.clave_acceso.substring(0, 12) }}...
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </DataTablePaged>
      </div>
    </div>

    <!-- Modal XML -->
    <XmlPreviewModal ref="xmlModalRef" :venta="ventaParaXml" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Modal } from 'bootstrap'
import DataTablePaged from '../shared/DataTablePaged.vue'
import XmlPreviewModal from './XmlPreviewModal.vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()
const tablaRef = ref(null)
const xmlModalRef = ref(null)
const ventaParaXml = ref(null)

const columnas = [
  { key: 'fecha_emision', label: 'Fecha', sortable: true, width: '100px' },
  { key: 'numero_factura', label: 'Nº Factura', sortable: true, width: '120px' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'tipo_documento', label: 'Tipo', width: '90px' },
  { key: 'total', label: 'Total', sortable: true, width: '100px' },
  { key: 'estado_pago', label: 'Pago', width: '90px' },
  { key: 'estado_sri', label: 'SRI', width: '110px' },
  { key: 'clave_acceso', label: 'Clave Acceso', width: '150px' }
]

const acciones = [
  {
    key: 'xml',
    icon: 'fas fa-file-code',
    class: 'btn-outline-success',
    title: 'Ver/Descargar XML',
    handler: async (row) => {
      ventaParaXml.value = row
      const modalEl = document.getElementById('modalXmlPreview')
      let modal = Modal.getInstance(modalEl)
      if (!modal) modal = new Modal(modalEl)
      modal.show()
      await xmlModalRef.value?.cargar(row)
    }
  },
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
    handler: (row) => {
      if (row.estado_sri === 'AUTORIZADO') {
        toast.warning('Esta factura ya fue autorizada por el SRI. No se puede editar.')
        return
      }
      router.push(`/ventas/editar/${row._id}`)
    }
  }
]
</script>

<style scoped>
.clave-corta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: var(--primary-color);
  cursor: help;
}
</style>