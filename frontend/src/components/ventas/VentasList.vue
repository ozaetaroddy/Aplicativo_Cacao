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
          <template #total="{ value }">
            <strong>${{ (value || 0).toFixed(2) }}</strong>
          </template>
          <template #estado_pago="{ row }">
            <span class="badge" :class="row.estado_pago === 'pagado' ? 'bg-success' : 'bg-warning text-dark'">
              {{ row.estado_pago || 'pendiente' }}
            </span>
          </template>
          <template #estado_sri="{ row }">
            <span class="badge" :class="getEstadoSriClass(row.estado_sri)">
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
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import DataTablePaged from '../shared/DataTablePaged.vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()
const { deleteOne } = useMongoDB()
const tablaRef = ref(null)

const getEstadoSriClass = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'bg-success'
    case 'FIRMADO':
    case 'RECIBIDA':
    case 'PENDIENTE': return 'bg-info'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'bg-danger'
    default: return 'bg-secondary'
  }
}

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
    key: 'firmar',
    icon: 'fas fa-signature',
    class: 'btn-outline-warning',
    title: 'Firmar electrónicamente',
    handler: async (row) => {
      if (!row.clave_acceso) {
        toast.warning('Este documento no tiene clave de acceso')
        return
      }
      if (row.estado_sri === 'FIRMADO') {
        toast.info('Este documento ya está firmado')
        return
      }
      if (row.estado_sri === 'AUTORIZADO') {
        toast.info('Ya está autorizado por el SRI')
        return
      }
      if (!confirm('¿Firmar electrónicamente este documento?')) return
      try {
        await api.request(`/ventas/${row._id}/firmar`, {
          method: 'POST',
          loaderMessage: 'Firmando documento...'
        })
        toast.success('Documento firmado correctamente')
        tablaRef.value?.reload()
      } catch (e) {
        toast.error('Error: ' + e.message)
      }
    }
  },
  {
    key: 'xml',
    icon: 'fas fa-file-code',
    class: 'btn-outline-success',
    title: 'Descargar XML',
    handler: async (row) => {
      if (!row.clave_acceso) {
        toast.warning('Este documento no tiene clave de acceso')
        return
      }
      try {
        const token = localStorage.getItem('token')
        const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
        const url = row.estado_sri === 'FIRMADO'
          ? `${baseUrl}/ventas/${row._id}/xml-firmado`
          : `${baseUrl}/ventas/${row._id}/xml`
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!response.ok) throw new Error('Error al descargar')
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        const sufijo = row.estado_sri === 'FIRMADO' ? '_firmado' : ''
        a.download = `${row.clave_acceso}${sufijo}.xml`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(objectUrl)
        toast.success('XML descargado')
      } catch (e) {
        toast.error('Error: ' + e.message)
      }
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
        toast.warning('Esta factura ya fue autorizada. No se puede editar.')
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