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

    <!-- ===== FILTROS ===== -->
    <div class="card card-cacao mb-3">
      <div class="card-body py-2">
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <span class="text-muted small me-2"><i class="fas fa-filter"></i> Filtrar:</span>
          <button class="btn btn-sm" :class="filtroEstadoSri === '' ? 'btn-primary' : 'btn-outline-secondary'" @click="cambiarFiltroSri('')">Todos</button>
          <button class="btn btn-sm" :class="filtroEstadoSri === 'PENDIENTE' ? 'btn-warning' : 'btn-outline-warning'" @click="cambiarFiltroSri('PENDIENTE')">
            <i class="fas fa-clock"></i> Pendientes
          </button>
          <button class="btn btn-sm" :class="filtroEstadoSri === 'FIRMADO' ? 'btn-info' : 'btn-outline-info'" @click="cambiarFiltroSri('FIRMADO')">
            <i class="fas fa-signature"></i> Firmados
          </button>
          <button class="btn btn-sm" :class="filtroEstadoSri === 'AUTORIZADO' ? 'btn-success' : 'btn-outline-success'" @click="cambiarFiltroSri('AUTORIZADO')">
            <i class="fas fa-check-double"></i> Autorizados
          </button>
          <button class="btn btn-sm" :class="filtroEstadoSri === 'RECHAZADA' ? 'btn-danger' : 'btn-outline-danger'" @click="cambiarFiltroSri('RECHAZADA')">
            <i class="fas fa-times-circle"></i> Rechazados
          </button>
        </div>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
    <div class="card card-cacao">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao tabla-ventas">
            <thead>
              <tr>
                <th style="min-width:90px;">Fecha</th>
                <th style="min-width:120px;">Nº Factura</th>
                <th style="min-width:180px;">Cliente</th>
                <th style="min-width:80px;">Tipo</th>
                <th style="min-width:90px;" class="text-end">Total</th>
                <th style="min-width:90px;">Pago</th>
                <th style="min-width:100px;">Estado SRI</th>
                <th style="min-width:120px;">Nº Autorización</th>
                <th style="min-width:140px;">Clave Acceso</th>
                <th style="width:180px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="10" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="ventas.length === 0">
                <td colspan="10" class="text-center text-muted py-4">
                  No hay ventas registradas
                </td>
              </tr>
              <tr v-else v-for="v in ventas" :key="v._id">
                <td class="small">{{ formatFecha(v.fecha_emision) }}</td>
                <td class="small font-monospace">{{ v.numero_factura }}</td>
                <td>
                  <div class="fw-bold small">{{ v.cliente?.nombre || 'N/A' }}</div>
                  <div class="text-muted" style="font-size:0.7rem;">{{ v.cliente?.ruc || '' }}</div>
                </td>
                <td>
                  <span class="badge-tipo">{{ v.tipo_documento || 'N/A' }}</span>
                </td>
                <td class="text-end fw-bold">${{ (v.total || 0).toFixed(2) }}</td>
                <td>
                  <span class="badge" :class="v.estado_pago === 'pagado' ? 'bg-success' : 'bg-warning text-dark'">
                    {{ v.estado_pago || 'pendiente' }}
                  </span>
                </td>
                <td>
                  <span class="badge" :class="getEstadoSriClass(v.estado_sri)">
                    <i :class="getEstadoSriIcon(v.estado_sri)" class="me-1"></i>
                    {{ v.estado_sri || 'N/A' }}
                  </span>
                </td>
                <td class="small font-monospace">
                  <span v-if="v.numero_autorizacion" :title="v.numero_autorizacion">
                    {{ v.numero_autorizacion.substring(0, 12) }}...
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="small font-monospace">
                  <span v-if="v.clave_acceso" class="clave-corta" :title="v.clave_acceso">
                    {{ v.clave_acceso.substring(0, 12) }}...
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="text-center">
                  <div class="acciones-cell">
                    <!-- Firma -->
                    <button
                      v-if="puedeFirmar(v)"
                      class="btn-accion btn-warning-accion"
                      @click="firmar(v)"
                      title="Firmar electrónicamente"
                    >
                      <i class="fas fa-signature"></i>
                    </button>

                    <!-- Enviar al SRI -->
                    <button
                      v-if="puedeEnviarSri(v)"
                      class="btn-accion btn-success-accion"
                      @click="enviarAlSRI(v)"
                      title="Enviar al SRI"
                    >
                      <i class="fas fa-paper-plane"></i>
                    </button>

                    <!-- Reintentar (rechazado) -->
                    <button
                      v-if="puedeReintentar(v)"
                      class="btn-accion btn-warning-accion"
                      @click="enviarAlSRI(v)"
                      title="Reintentar envío al SRI"
                    >
                      <i class="fas fa-redo"></i>
                    </button>

                    <!-- Consultar autorización -->
                    <button
                      v-if="puedeConsultar(v)"
                      class="btn-accion btn-info-accion"
                      @click="consultarSRI(v)"
                      title="Consultar autorización en el SRI"
                    >
                      <i class="fas fa-search"></i>
                    </button>

                    <!-- Ver documento -->
                    <button
                      class="btn-accion btn-secondary-accion"
                      @click="irDocumento(v)"
                      title="Ver documento (RIDE)"
                    >
                      <i class="fas fa-eye"></i>
                    </button>

                    <!-- Menú desplegable para más acciones -->
                    <div class="dropdown d-inline-block">
                      <button
                        class="btn-accion btn-secondary-accion"
                        type="button"
                        @click.stop="toggleMenuAcciones(v._id)"
                        title="Más acciones"
                      >
                        <i class="fas fa-ellipsis-v"></i>
                      </button>
                      <ul
                        v-if="menuAbierto === v._id"
                        class="dropdown-menu-acciones"
                        @click.stop
                      >
                        <li v-if="v.clave_acceso">
                          <a href="#" @click.prevent="descargarXML(v, v.estado_sri === 'FIRMADO' || v.estado_sri === 'AUTORIZADO')">
                            <i class="fas fa-file-code text-success"></i>
                            Descargar XML
                          </a>
                        </li>
                        <li v-if="v.clave_acceso">
                          <a href="#" @click.prevent="abrirModalEmail(v)">
                            <i class="fas fa-envelope text-info"></i>
                            Enviar por email
                          </a>
                        </li>
                        <li v-if="v.estado_sri !== 'AUTORIZADO'">
                          <a href="#" @click.prevent="editar(v)">
                            <i class="fas fa-edit text-primary"></i>
                            Editar
                          </a>
                        </li>
                        <li v-if="v.estado_sri !== 'AUTORIZADO'" class="divider"></li>
                        <li v-if="v.estado_sri !== 'AUTORIZADO'">
                          <a href="#" @click.prevent="eliminar(v)" class="text-danger">
                            <i class="fas fa-trash"></i>
                            Eliminar
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
          <div class="text-muted small">
            Mostrando {{ ventas.length }} registros
          </div>
          <button class="btn btn-sm btn-outline-primary" @click="cargar" :disabled="loading">
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Actualizar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de email -->
    <EnviarEmailModal :venta="ventaParaEmail" :cliente="ventaParaEmail?.cliente" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { Modal } from 'bootstrap'
import EnviarEmailModal from './EnviarEmailModal.vue'

const router = useRouter()
const toast = useToast()
const { find } = useMongoDB()

const ventas = ref([])
const loading = ref(false)
const filtroEstadoSri = ref('')
const menuAbierto = ref(null)
const ventaParaEmail = ref(null)

const stats = ref({
  total: 0,
  firmados: 0,
  autorizados: 0,
  rechazados: 0
})

// ===== HELPERS =====
const formatFecha = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-EC')
}

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

// ===== CONDICIONES DE ACCIONES =====
const puedeFirmar = (v) => v.clave_acceso && !['FIRMADO', 'AUTORIZADO', 'RECHAZADA', 'DEVUELTA'].includes(v.estado_sri)
const puedeEnviarSri = (v) => v.clave_acceso && v.estado_sri === 'FIRMADO'
const puedeReintentar = (v) => v.clave_acceso && ['RECHAZADA', 'DEVUELTA'].includes(v.estado_sri)
const puedeConsultar = (v) => v.clave_acceso && ['PENDIENTE', 'RECIBIDA', 'FIRMADO'].includes(v.estado_sri)

// ===== CARGAR =====
const cargar = async () => {
  loading.value = true
  try {
    let datos = await find('ventas')
    if (!Array.isArray(datos)) datos = []

    if (filtroEstadoSri.value) {
      datos = datos.filter(v => v.estado_sri === filtroEstadoSri.value)
    }

    ventas.value = datos
    stats.value.total = datos.length
    stats.value.firmados = datos.filter(v => v.estado_sri === 'FIRMADO').length
    stats.value.autorizados = datos.filter(v => v.estado_sri === 'AUTORIZADO').length
    stats.value.rechazados = datos.filter(v => v.estado_sri === 'RECHAZADA' || v.estado_sri === 'DEVUELTA').length
  } catch (e) {
    toast.error('Error al cargar: ' + e.message)
  } finally {
    loading.value = false
  }
}

const cambiarFiltroSri = (estado) => {
  filtroEstadoSri.value = estado
  cargar()
}

// ===== MENÚ DE ACCIONES =====
const toggleMenuAcciones = (id) => {
  menuAbierto.value = menuAbierto.value === id ? null : id
}

const cerrarMenu = () => {
  menuAbierto.value = null
}

// ===== ACCIONES =====
const firmar = async (row) => {
  if (!confirm('¿Firmar electrónicamente este documento?')) return
  try {
    await api.request(`/ventas/${row._id}/firmar`, {
      method: 'POST',
      loaderMessage: 'Firmando documento...'
    })
    toast.success('Documento firmado correctamente')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const enviarAlSRI = async (row) => {
  if (!confirm('¿Enviar este documento al SRI?\n\nEl proceso puede tardar unos segundos.')) return
  try {
    const res = await api.request(`/sri/enviar/${row._id}`, {
      method: 'POST',
      loaderMessage: 'Enviando al SRI...'
    })

    if (res.success) {
      toast.success(`✅ Autorizado: ${res.numero_autorizacion}`)
    } else if (res.estado === 'DEVUELTA' || res.estado === 'RECHAZADA') {
      const mensajes = (res.mensajes || []).slice(0, 2).map(m => `${m.identificador}: ${m.mensaje}`).join(' | ')
      toast.error(`❌ Rechazado: ${mensajes || 'Sin detalle'}`)
    } else {
      toast.warning(`Estado: ${res.estado}`)
    }
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const consultarSRI = async (row) => {
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
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

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

const abrirModalEmail = (row) => {
  ventaParaEmail.value = row
  cerrarMenu()
  setTimeout(() => {
    const modalEl = document.getElementById('modalEnviarEmail')
    const modal = Modal.getOrCreateInstance(modalEl)
    modal.show()
  }, 100)
}

const irDocumento = (row) => router.push(`/consultar-documentos?tipo=venta&id=${row._id}`)
const irEnvioSri = () => router.push('/envio-sri')

const editar = (row) => {
  cerrarMenu()
  if (row.estado_sri === 'AUTORIZADO') {
    toast.warning('No se puede editar una factura autorizada')
    return
  }
  router.push(`/ventas/editar/${row._id}`)
}

const eliminar = async (row) => {
  cerrarMenu()
  if (row.estado_sri === 'AUTORIZADO') {
    toast.warning('No se puede eliminar una factura autorizada por el SRI')
    return
  }
  if (!confirm(`¿Eliminar la factura ${row.numero_factura}?`)) return
  try {
    await api.request(`/ventas/${row._id}`, { method: 'DELETE' })
    toast.success('Venta eliminada')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== CLICK FUERA PARA CERRAR MENÚ =====
const handleClickOutside = () => {
  cerrarMenu()
}

onMounted(() => {
  cargar()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
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

/* ===== TABLA ===== */
.tabla-ventas {
  margin-bottom: 0;
  font-size: 0.85rem;
}
.tabla-ventas th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--text-muted);
  font-weight: 700;
  padding: 10px 8px;
  white-space: nowrap;
}
.tabla-ventas td {
  padding: 10px 8px;
  vertical-align: middle;
}

.badge-tipo {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(108,117,125,0.15);
  color: #6c757d;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: capitalize;
}

.clave-corta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: var(--primary-color);
  cursor: help;
}

/* ===== CELDA DE ACCIONES COMPACTA ===== */
.acciones-cell {
  display: flex;
  gap: 3px;
  justify-content: center;
  align-items: center;
  flex-wrap: nowrap;
}

.btn-accion {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.75rem;
  color: var(--text-primary);
  padding: 0;
  flex-shrink: 0;
}
.btn-accion:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.12);
}

.btn-warning-accion {
  border-color: #f39c12;
  color: #f39c12;
}
.btn-warning-accion:hover {
  background: #f39c12;
  color: #fff;
  border-color: #f39c12;
}

.btn-success-accion {
  border-color: #27ae60;
  color: #27ae60;
}
.btn-success-accion:hover {
  background: #27ae60;
  color: #fff;
  border-color: #27ae60;
}

.btn-info-accion {
  border-color: #3498db;
  color: #3498db;
}
.btn-info-accion:hover {
  background: #3498db;
  color: #fff;
  border-color: #3498db;
}

.btn-secondary-accion {
  border-color: var(--border-color);
  color: var(--text-muted);
}
.btn-secondary-accion:hover {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);
}

/* ===== MENÚ DESPLEGABLE DE ACCIONES ===== */
.dropdown-menu-acciones {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1050;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 6px;
  min-width: 200px;
  list-style: none;
  margin: 6px 0 0 0;
  animation: fadeInMenu 0.15s ease;
}
@keyframes fadeInMenu {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
.dropdown-menu-acciones li a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  color: var(--text-primary);
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.85rem;
  transition: background 0.15s;
}
.dropdown-menu-acciones li a:hover {
  background: var(--bg-table-stripe);
}
.dropdown-menu-acciones li a i {
  width: 16px;
  font-size: 0.9rem;
}
.dropdown-menu-acciones li.divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
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
  .tabla-ventas { font-size: 0.78rem; }
  .btn-accion { width: 28px; height: 28px; font-size: 0.7rem; }
}
</style>