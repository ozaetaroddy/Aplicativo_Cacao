<template>
  <div>
    <!-- ===== HEADER ===== -->
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title mb-0"><i class="fas fa-hand-holding-usd"></i> Ventas</h4>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-outline-info btn-sm" @click="irEnvioSri">
          <i class="fas fa-cloud-upload-alt"></i> Consola SRI
        </button>
        <router-link to="/ventas/nuevo" class="btn btn-cacao-primary">
          <i class="fas fa-plus"></i> Nueva Venta
        </router-link>
      </div>
    </div>

    <!-- ===== KPIs RÁPIDOS ===== -->
    <div class="row g-3 mb-4">
      <div class="col-md-3 col-6">
        <div class="kpi-box" style="border-left-color: #3498db;">
          <div class="kpi-icon" style="background: rgba(52,152,219,0.12); color:#3498db;">
            <i class="fas fa-file-invoice"></i>
          </div>
          <div class="kpi-body">
            <div class="kpi-number">{{ stats.total }}</div>
            <div class="kpi-label">Total documentos</div>
          </div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="kpi-box" style="border-left-color: #f39c12;">
          <div class="kpi-icon" style="background: rgba(243,156,18,0.12); color:#f39c12;">
            <i class="fas fa-signature"></i>
          </div>
          <div class="kpi-body">
            <div class="kpi-number">{{ stats.firmados }}</div>
            <div class="kpi-label">Firmados</div>
          </div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="kpi-box" style="border-left-color: #27ae60;">
          <div class="kpi-icon" style="background: rgba(39,174,96,0.12); color:#27ae60;">
            <i class="fas fa-check-double"></i>
          </div>
          <div class="kpi-body">
            <div class="kpi-number">{{ stats.autorizados }}</div>
            <div class="kpi-label">Autorizados SRI</div>
          </div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="kpi-box" style="border-left-color: #e74c3c;">
          <div class="kpi-icon" style="background: rgba(231,76,60,0.12); color:#e74c3c;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="kpi-body">
            <div class="kpi-number">{{ stats.rechazados }}</div>
            <div class="kpi-label">Rechazados SRI</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== FILTROS RÁPIDOS ===== -->
    <div class="card card-cacao mb-3">
      <div class="card-body py-2">
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <span class="text-muted small me-2"><i class="fas fa-filter"></i> Filtrar por estado SRI:</span>
          <button
            class="btn btn-sm"
            :class="filtroEstadoSri === '' ? 'btn-primary' : 'btn-outline-secondary'"
            @click="cambiarFiltroSri('')"
          >
            Todos
          </button>
          <button
            class="btn btn-sm"
            :class="filtroEstadoSri === 'PENDIENTE' ? 'btn-warning' : 'btn-outline-warning'"
            @click="cambiarFiltroSri('PENDIENTE')"
          >
            <i class="fas fa-clock"></i> Pendientes
          </button>
          <button
            class="btn btn-sm"
            :class="filtroEstadoSri === 'FIRMADO' ? 'btn-info' : 'btn-outline-info'"
            @click="cambiarFiltroSri('FIRMADO')"
          >
            <i class="fas fa-signature"></i> Firmados
          </button>
          <button
            class="btn btn-sm"
            :class="filtroEstadoSri === 'AUTORIZADO' ? 'btn-success' : 'btn-outline-success'"
            @click="cambiarFiltroSri('AUTORIZADO')"
          >
            <i class="fas fa-check-double"></i> Autorizados
          </button>
          <button
            class="btn btn-sm"
            :class="filtroEstadoSri === 'RECHAZADA' ? 'btn-danger' : 'btn-outline-danger'"
            @click="cambiarFiltroSri('RECHAZADA')"
          >
            <i class="fas fa-times-circle"></i> Rechazados
          </button>
        </div>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
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
          :extra-query="extraQuery"
          @loaded="onDataLoaded"
        >
          <template #fecha_emision="{ row }">
            {{ new Date(row.fecha_emision).toLocaleDateString('es-EC') }}
          </template>
          <template #cliente="{ row }">
            <div class="fw-bold small">{{ row.cliente?.nombre || 'N/A' }}</div>
            <div class="text-muted" style="font-size:0.7rem;">{{ row.cliente?.ruc || '' }}</div>
          </template>
          <template #tipo_documento="{ row }">
            <span class="badge bg-secondary small">{{ row.tipo_documento || 'N/A' }}</span>
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
              <i :class="getEstadoSriIcon(row.estado_sri)" class="me-1"></i>
              {{ row.estado_sri || 'N/A' }}
            </span>
          </template>
          <template #clave_acceso="{ row }">
            <span v-if="row.clave_acceso" class="clave-corta" :title="row.clave_acceso">
              {{ row.clave_acceso.substring(0, 12) }}...
            </span>
            <span v-else class="text-muted">—</span>
          </template>
          <template #numero_autorizacion="{ row }">
            <span v-if="row.numero_autorizacion" class="clave-corta" :title="row.numero_autorizacion">
              {{ row.numero_autorizacion.substring(0, 12) }}...
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </DataTablePaged>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import DataTablePaged from '../shared/DataTablePaged.vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()
const tablaRef = ref(null)
const filtroEstadoSri = ref('')

const stats = ref({
  total: 0,
  firmados: 0,
  autorizados: 0,
  rechazados: 0
})

const extraQuery = computed(() => {
  if (!filtroEstadoSri.value) return {}
  return { estado_sri: filtroEstadoSri.value }
})

// ===== HELPERS DE ESTADO SRI =====
const getEstadoSriClass = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'bg-success'
    case 'FIRMADO': return 'bg-info'
    case 'PENDIENTE':
    case 'RECIBIDA': return 'bg-warning text-dark'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'bg-danger'
    case 'NO_APLICA': return 'bg-secondary'
    default: return 'bg-secondary'
  }
}

const getEstadoSriIcon = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'fas fa-check-double'
    case 'FIRMADO': return 'fas fa-signature'
    case 'PENDIENTE': return 'fas fa-clock'
    case 'RECIBIDA': return 'fas fa-inbox'
    case 'RECHAZADA': return 'fas fa-times-circle'
    case 'DEVUELTA': return 'fas fa-undo'
    default: return 'fas fa-circle'
  }
}

// ===== FILTROS =====
const cambiarFiltroSri = (estado) => {
  filtroEstadoSri.value = estado
  tablaRef.value?.reload()
}

// ===== DESCARGA DE XML =====
const descargarXML = async (row, firmado = false) => {
  if (!row.clave_acceso) {
    toast.warning('Este documento no tiene clave de acceso')
    return
  }
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    let url = `${baseUrl}/ventas/${row._id}/xml`
    let sufijo = ''

    if (firmado) {
      url = `${baseUrl}/ventas/${row._id}/xml-firmado`
      sufijo = '_firmado'
    } else if (row.estado_sri === 'AUTORIZADO') {
      url = `${baseUrl}/ventas/${row._id}/xml-firmado`
      sufijo = '_autorizado'
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Error al descargar')

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
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

// ===== FIRMAR =====
const firmar = async (row) => {
  if (!row.clave_acceso) {
    toast.warning('Este documento no tiene clave de acceso')
    return
  }
  if (row.estado_sri === 'AUTORIZADO') {
    toast.info('Este documento ya está autorizado por el SRI')
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

// ===== ENVIAR AL SRI =====
const enviarAlSRI = async (row) => {
  if (!row.clave_acceso) {
    toast.warning('El documento no tiene clave de acceso')
    return
  }
  if (!row.xml_firmado && row.estado_sri !== 'FIRMADO' && row.estado_sri !== 'RECHAZADA' && row.estado_sri !== 'DEVUELTA') {
    toast.warning('Primero firma el documento')
    return
  }
  if (row.estado_sri === 'AUTORIZADO') {
    toast.info('Este documento ya está autorizado por el SRI')
    return
  }
  if (!confirm('¿Enviar este documento al SRI?\n\nEl proceso puede tardar unos segundos.')) return

  try {
    const res = await api.request(`/sri/enviar/${row._id}`, {
      method: 'POST',
      loaderMessage: 'Enviando al SRI...'
    })

    if (res.success) {
      toast.success(`✅ Autorizado: ${res.numero_autorizacion}`)
    } else if (res.estado === 'DEVUELTA' || res.estado === 'RECHAZADA') {
      const primerosMensajes = (res.mensajes || []).slice(0, 2).map(m => `${m.identificador}: ${m.mensaje}`).join(' | ')
      toast.error(`❌ Rechazado: ${primerosMensajes || 'Sin detalle'}`)
    } else {
      toast.warning(`Estado: ${res.estado}. Puede reintentar la consulta.`)
    }
    tablaRef.value?.reload()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== CONSULTAR AUTORIZACIÓN =====
const consultarSRI = async (row) => {
  if (!row.clave_acceso) {
    toast.warning('El documento no tiene clave de acceso')
    return
  }
  try {
    const res = await api.request(`/sri/consultar/${row._id}`, {
      method: 'POST',
      loaderMessage: 'Consultando autorización...'
    })

    if (res.success) {
      toast.success(`✅ Autorizado: ${res.numero_autorizacion}`)
    } else {
      toast.info(`Estado actual: ${res.estado}`)
    }
    tablaRef.value?.reload()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== ELIMINAR =====
const eliminar = async (row) => {
  if (row.estado_sri === 'AUTORIZADO') {
    toast.warning('No se puede eliminar una factura autorizada por el SRI. Genere una nota de crédito.')
    return
  }
  if (!confirm(`¿Eliminar la factura ${row.numero_factura}?\n\nEsta acción no se puede deshacer.`)) return
  try {
    await api.request(`/ventas/${row._id}`, { method: 'DELETE' })
    toast.success('Venta eliminada')
    tablaRef.value?.reload()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== NAVEGACIÓN =====
const irEnvioSri = () => router.push('/envio-sri')
const irDocumento = (row) => router.push(`/consultar-documentos?tipo=venta&id=${row._id}`)
const editar = (row) => {
  if (row.estado_sri === 'AUTORIZADO') {
    toast.warning('No se puede editar una factura autorizada. Genere una nota de crédito.')
    return
  }
  router.push(`/ventas/editar/${row._id}`)
}

// ===== COLUMNAS =====
const columnas = [
  { key: 'fecha_emision', label: 'Fecha', sortable: true, width: '95px' },
  { key: 'numero_factura', label: 'Nº Factura', sortable: true, width: '130px' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'tipo_documento', label: 'Tipo', width: '90px' },
  { key: 'total', label: 'Total', sortable: true, width: '100px' },
  { key: 'estado_pago', label: 'Pago', width: '90px' },
  { key: 'estado_sri', label: 'Estado SRI', width: '130px' },
  { key: 'numero_autorizacion', label: 'Nº Autorización', width: '150px' },
  { key: 'clave_acceso', label: 'Clave Acceso', width: '150px' }
]

// ===== ACCIONES (dinámicas según estado) =====
const acciones = [
  // Botón: Firmar (solo si no está firmado ni autorizado)
  {
    key: 'firmar',
    icon: 'fas fa-signature',
    class: 'btn-outline-warning',
    title: 'Firmar electrónicamente',
    condition: (row) => row.clave_acceso && row.estado_sri !== 'FIRMADO' && row.estado_sri !== 'AUTORIZADO' && row.estado_sri !== 'RECHAZADA' && row.estado_sri !== 'DEVUELTA',
    handler: firmar
  },
  // Botón: Enviar al SRI (solo si está firmado)
  {
    key: 'enviar-sri',
    icon: 'fas fa-paper-plane',
    class: 'btn-outline-success',
    title: 'Enviar al SRI',
    condition: (row) => row.clave_acceso && row.estado_sri === 'FIRMADO',
    handler: enviarAlSRI
  },
  // Botón: Reintentar (si fue rechazado)
  {
    key: 'reintentar-sri',
    icon: 'fas fa-redo',
    class: 'btn-outline-warning',
    title: 'Reintentar envío al SRI',
    condition: (row) => row.clave_acceso && (row.estado_sri === 'RECHAZADA' || row.estado_sri === 'DEVUELTA'),
    handler: enviarAlSRI
  },
  // Botón: Consultar autorización (para documentos enviados)
  {
    key: 'consultar-sri',
    icon: 'fas fa-search',
    class: 'btn-outline-info',
    title: 'Consultar autorización en el SRI',
    condition: (row) => row.clave_acceso && (row.estado_sri === 'PENDIENTE' || row.estado_sri === 'RECIBIDA' || row.estado_sri === 'FIRMADO'),
    handler: consultarSRI
  },
  // Botón: Descargar XML (siempre visible si hay clave)
  {
    key: 'xml',
    icon: 'fas fa-file-code',
    class: 'btn-outline-primary',
    title: 'Descargar XML',
    condition: (row) => !!row.clave_acceso,
    handler: (row) => descargarXML(row, row.estado_sri === 'FIRMADO' || row.estado_sri === 'AUTORIZADO')
  },
  // Botón: Ver documento
  {
    key: 'ver',
    icon: 'fas fa-eye',
    class: 'btn-outline-secondary',
    title: 'Ver documento (RIDE)',
    handler: irDocumento
  },
  // Botón: Editar
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-primary',
    title: 'Editar',
    condition: (row) => row.estado_sri !== 'AUTORIZADO',
    handler: editar
  },
  // Botón: Eliminar
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    title: 'Eliminar',
    condition: (row) => row.estado_sri !== 'AUTORIZADO',
    handler: eliminar
  }
]

// ===== CARGAR STATS AL CARGAR DATOS =====
const onDataLoaded = (data) => {
  if (!Array.isArray(data)) return
  stats.value.total = data.length
  stats.value.firmados = data.filter(v => v.estado_sri === 'FIRMADO').length
  stats.value.autorizados = data.filter(v => v.estado_sri === 'AUTORIZADO').length
  stats.value.rechazados = data.filter(v => v.estado_sri === 'RECHAZADA' || v.estado_sri === 'DEVUELTA').length
}
</script>

<style scoped>
/* ===== KPIs ===== */
.kpi-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid #3498db;
  border-radius: 12px;
  transition: var(--transition);
  height: 80px;
}
.kpi-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}
.kpi-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
}
.kpi-body { flex: 1; min-width: 0; }
.kpi-number {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}
.kpi-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
}

/* ===== CLAVE CORTA ===== */
.clave-corta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: var(--primary-color);
  cursor: help;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  .kpi-box {
    height: 70px;
    padding: 10px 12px;
  }
  .kpi-icon {
    width: 36px;
    height: 36px;
    font-size: 1rem;
  }
  .kpi-number { font-size: 1.2rem; }
}
</style>