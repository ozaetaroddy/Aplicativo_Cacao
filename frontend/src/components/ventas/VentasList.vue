<template>
  <div class="ventas-page">
    <!-- ===== HEADER ===== -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-hand-holding-usd"></i></span>
          Ventas
        </h1>
        <p class="page-subtitle">
          Gestiona y consulta todos tus comprobantes de venta
        </p>
      </div>
      <div class="page-header-actions">
        <button class="btn-secondary-action" @click="irEnvioSri">
          <i class="fas fa-cloud-upload-alt"></i>
          <span>Consola SRI</span>
        </button>
        <router-link to="/ventas/nuevo" class="btn-primary-action">
          <i class="fas fa-plus"></i>
          <span>Nueva Venta</span>
        </router-link>
      </div>
    </div>

    <!-- ===== KPIs ===== -->
    <div class="kpi-row">
      <div class="kpi-stat" style="--stat-color: #3498db;">
        <div class="stat-icon"><i class="fas fa-file-invoice"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.total }}</div>
          <div class="stat-label">Total documentos</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #f39c12;">
        <div class="stat-icon"><i class="fas fa-signature"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.firmados }}</div>
          <div class="stat-label">Firmados</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #27ae60;">
        <div class="stat-icon"><i class="fas fa-check-double"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.autorizados }}</div>
          <div class="stat-label">Autorizados SRI</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #e74c3c;">
        <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.rechazados }}</div>
          <div class="stat-label">Rechazados SRI</div>
        </div>
      </div>
    </div>

    <!-- ===== FILTROS ===== -->
    <div class="filters-bar">
      <div class="filters-group">
        <span class="filters-label">
          <i class="fas fa-filter"></i>
          Filtrar:
        </span>
        <button
          class="filter-chip"
          :class="{ active: filtroEstadoSri === '' }"
          @click="cambiarFiltroSri('')"
        >
          <i class="fas fa-list"></i>
          <span>Todos</span>
          <span class="chip-count">{{ stats.total }}</span>
        </button>
        <button
          class="filter-chip chip-warning"
          :class="{ active: filtroEstadoSri === 'PENDIENTE' }"
          @click="cambiarFiltroSri('PENDIENTE')"
        >
          <i class="fas fa-clock"></i>
          <span>Pendientes</span>
        </button>
        <button
          class="filter-chip chip-info"
          :class="{ active: filtroEstadoSri === 'FIRMADO' }"
          @click="cambiarFiltroSri('FIRMADO')"
        >
          <i class="fas fa-signature"></i>
          <span>Firmados</span>
          <span v-if="stats.firmados > 0" class="chip-count">{{ stats.firmados }}</span>
        </button>
        <button
          class="filter-chip chip-success"
          :class="{ active: filtroEstadoSri === 'AUTORIZADO' }"
          @click="cambiarFiltroSri('AUTORIZADO')"
        >
          <i class="fas fa-check-double"></i>
          <span>Autorizados</span>
        </button>
        <button
          class="filter-chip chip-danger"
          :class="{ active: filtroEstadoSri === 'RECHAZADA' }"
          @click="cambiarFiltroSri('RECHAZADA')"
        >
          <i class="fas fa-times-circle"></i>
          <span>Rechazados</span>
        </button>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
    <div class="card-cacao">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="min-width:100px;">Fecha</th>
                <th style="min-width:130px;">Nº Factura</th>
                <th style="min-width:200px;">Cliente</th>
                <th style="min-width:100px;">Tipo</th>
                <th style="min-width:110px;" class="text-end">Total</th>
                <th style="min-width:100px;">Pago</th>
                <th style="min-width:130px;">Estado SRI</th>
                <th style="min-width:140px;">Nº Autorización</th>
                <th style="min-width:150px;">Clave Acceso</th>
                <th style="width:200px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <!-- Loading -->
              <template v-if="loading">
                <tr v-for="n in 5" :key="`sk-${n}`">
                  <td v-for="col in 10" :key="`c-${col}`">
                    <div class="skeleton-line"></div>
                  </td>
                </tr>
              </template>

              <!-- Empty -->
              <tr v-else-if="ventas.length === 0">
                <td colspan="10" class="empty-state-cell">
                  <div class="empty-state">
                    <div class="empty-icon"><i class="fas fa-file-invoice"></i></div>
                    <div class="empty-title">No hay ventas registradas</div>
                    <div class="empty-text">
                      {{ filtroEstadoSri ? `No hay ventas con estado "${filtroEstadoSri}"` : 'Crea tu primera venta para comenzar' }}
                    </div>
                    <router-link to="/ventas/nuevo" class="btn-empty-action">
                      <i class="fas fa-plus"></i> Crear Nueva Venta
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Rows -->
              <tr v-else v-for="v in ventas" :key="v._id" class="venta-row">
                <td>
                  <div class="cell-date">
                    <div class="date-main">{{ formatFecha(v.fecha_emision) }}</div>
                    <div class="date-sub">{{ formatHora(v.fecha_emision) }}</div>
                  </div>
                </td>
                <td>
                  <span class="badge-doc">{{ v.numero_factura }}</span>
                </td>
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar">
                      {{ getInitials(v.cliente?.nombre) }}
                    </div>
                    <div class="cliente-info">
                      <div class="cliente-nombre">{{ v.cliente?.nombre || 'N/A' }}</div>
                      <div class="cliente-ruc">{{ v.cliente?.ruc || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="badge-tipo">{{ v.tipo_documento || 'N/A' }}</span>
                </td>
                <td class="text-end">
                  <div class="cell-total">${{ (v.total || 0).toFixed(2) }}</div>
                  <div class="cell-total-sub">IVA: ${{ (v.iva || 0).toFixed(2) }}</div>
                </td>
                <td>
                  <span class="badge-pago" :class="v.estado_pago === 'pagado' ? 'badge-pago-ok' : 'badge-pago-pending'">
                    <i :class="v.estado_pago === 'pagado' ? 'fas fa-check' : 'fas fa-clock'"></i>
                    {{ v.estado_pago || 'pendiente' }}
                  </span>
                </td>
                <td>
                  <span class="badge-sri" :class="getEstadoSriClass(v.estado_sri)">
                    <i :class="getEstadoSriIcon(v.estado_sri)"></i>
                    <span>{{ v.estado_sri || 'N/A' }}</span>
                  </span>
                </td>
                <td class="small font-monospace">
                  <span v-if="v.numero_autorizacion" :title="v.numero_autorizacion" class="code-value">
                    {{ v.numero_autorizacion.substring(0, 12) }}...
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="small font-monospace">
                  <span v-if="v.clave_acceso" :title="v.clave_acceso" class="code-value">
                    {{ v.clave_acceso.substring(0, 12) }}...
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <div class="actions-cell">
                    <!-- Firmar -->
                    <button
                      v-if="puedeFirmar(v)"
                      class="action-icon-btn btn-action-warning"
                      @click="firmar(v)"
                      title="Firmar electrónicamente"
                    >
                      <i class="fas fa-signature"></i>
                    </button>

                    <!-- Enviar al SRI -->
                    <button
                      v-if="puedeEnviarSri(v)"
                      class="action-icon-btn btn-action-success"
                      @click="enviarAlSRI(v)"
                      title="Enviar al SRI"
                    >
                      <i class="fas fa-paper-plane"></i>
                    </button>

                    <!-- Reintentar -->
                    <button
                      v-if="puedeReintentar(v)"
                      class="action-icon-btn btn-action-warning"
                      @click="enviarAlSRI(v)"
                      title="Reintentar envío al SRI"
                    >
                      <i class="fas fa-redo"></i>
                    </button>

                    <!-- Consultar autorización -->
                    <button
                      v-if="puedeConsultar(v)"
                      class="action-icon-btn btn-action-info"
                      @click="consultarSRI(v)"
                      title="Consultar autorización"
                    >
                      <i class="fas fa-search"></i>
                    </button>

                    <!-- Ver documento -->
                    <button
                      class="action-icon-btn btn-action-secondary"
                      @click="irDocumento(v)"
                      title="Ver documento (RIDE)"
                    >
                      <i class="fas fa-eye"></i>
                    </button>

                    <!-- Menú más acciones -->
                    <div class="dropdown-more">
                      <button
                        class="action-icon-btn btn-action-secondary"
                        @click.stop="toggleMenuAcciones(v._id)"
                        title="Más acciones"
                      >
                        <i class="fas fa-ellipsis-v"></i>
                      </button>
                      <transition name="dropdown-menu-fade">
                        <ul
                          v-if="menuAbierto === v._id"
                          class="dropdown-menu-actions"
                          @click.stop
                        >
                          <li v-if="v.clave_acceso">
                            <a href="#" @click.prevent="descargarXML(v, v.estado_sri === 'FIRMADO' || v.estado_sri === 'AUTORIZADO')">
                              <i class="fas fa-file-code"></i>
                              <span>Descargar XML</span>
                            </a>
                          </li>
                          <li v-if="v.clave_acceso">
                            <a href="#" @click.prevent="abrirModalEmail(v)">
                              <i class="fas fa-envelope"></i>
                              <span>Enviar por email</span>
                            </a>
                          </li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'">
                            <a href="#" @click.prevent="editar(v)">
                              <i class="fas fa-edit"></i>
                              <span>Editar</span>
                            </a>
                          </li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'" class="divider"></li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'">
                            <a href="#" @click.prevent="eliminar(v)" class="danger">
                              <i class="fas fa-trash"></i>
                              <span>Eliminar</span>
                            </a>
                          </li>
                        </ul>
                      </transition>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="table-footer">
          <div class="footer-info">
            Mostrando <strong>{{ ventas.length }}</strong> de <strong>{{ stats.total }}</strong> registros
          </div>
          <button class="btn-refresh" @click="cargar" :disabled="loading">
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
            <span>Actualizar</span>
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
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatHora = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
}

const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const getEstadoSriClass = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'badge-sri-success'
    case 'FIRMADO': return 'badge-sri-info'
    case 'PENDIENTE':
    case 'RECIBIDA': return 'badge-sri-warning'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'badge-sri-danger'
    default: return 'badge-sri-secondary'
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

    stats.value.total = datos.length
    stats.value.firmados = datos.filter(v => v.estado_sri === 'FIRMADO').length
    stats.value.autorizados = datos.filter(v => v.estado_sri === 'AUTORIZADO').length
    stats.value.rechazados = datos.filter(v => v.estado_sri === 'RECHAZADA' || v.estado_sri === 'DEVUELTA').length

    if (filtroEstadoSri.value) {
      datos = datos.filter(v => v.estado_sri === filtroEstadoSri.value)
    }

    ventas.value = datos
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

// ===== MENÚ =====
const toggleMenuAcciones = (id) => {
  menuAbierto.value = menuAbierto.value === id ? null : id
}
const cerrarMenu = () => { menuAbierto.value = null }

// ===== ACCIONES =====
const firmar = async (row) => {
  if (!confirm('¿Firmar electrónicamente este documento?')) return
  try {
    await api.request(`/ventas/${row._id}/firmar`, { method: 'POST', loaderMessage: 'Firmando documento...' })
    toast.success('Documento firmado correctamente')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const enviarAlSRI = async (row) => {
  if (!confirm('¿Enviar este documento al SRI?\n\nEl proceso puede tardar unos segundos.')) return
  try {
    const res = await api.request(`/sri/enviar/${row._id}`, { method: 'POST', loaderMessage: 'Enviando al SRI...' })
    if (res.success) {
      toast.success(`✅ Autorizado: ${res.numero_autorizacion}`)
    } else if (res.estado === 'DEVUELTA' || res.estado === 'RECHAZADA') {
      const mensajes = (res.mensajes || []).slice(0, 2).map(m => `${m.identificador}: ${m.mensaje}`).join(' | ')
      toast.error(`❌ Rechazado: ${mensajes || 'Sin detalle'}`, { timeout: 8000 })
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
    const res = await api.request(`/sri/consultar/${row._id}`, { method: 'POST', loaderMessage: 'Consultando...' })
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
  cerrarMenu()
  if (!row.clave_acceso) {
    toast.warning('Este documento no tiene clave de acceso')
    return
  }
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const url = firmado ? `${baseUrl}/ventas/${row._id}/xml-firmado` : `${baseUrl}/ventas/${row._id}/xml`
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!response.ok) throw new Error('Error al descargar')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${row.clave_acceso}${firmado ? '_firmado' : ''}.xml`
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
  cerrarMenu()
  ventaParaEmail.value = row
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

// ===== CLICK FUERA =====
const handleClickOutside = () => cerrarMenu()

onMounted(() => {
  cargar()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.ventas-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== HEADER ===== */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}

.page-title {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}

.title-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.3);
}

.page-subtitle {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
  padding-left: 62px;
}

.page-header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-primary-action,
.btn-secondary-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  transition: all var(--transition);
  cursor: pointer;
  text-decoration: none;
  border: none;
  font-family: inherit;
}

.btn-primary-action {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.btn-primary-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
  color: #fff;
}

.btn-secondary-action {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary-action:hover {
  border-color: var(--info);
  color: var(--info);
  background: var(--info-bg);
  transform: translateY(-2px);
}

/* ===== KPIs ===== */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.kpi-stat {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all var(--transition);
  position: relative;
  overflow: hidden;
}

.kpi-stat::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--stat-color);
}

.kpi-stat:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--stat-color) 15%, transparent);
  color: var(--stat-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  flex-shrink: 0;
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-number {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  margin-top: 2px;
}

/* ===== FILTROS ===== */
.filters-bar {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
}

.filters-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filters-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  background: var(--bg-table-stripe);
  border: 1.5px solid var(--border-color);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.filter-chip:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.filter-chip.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}

.chip-warning.active { background: #f39c12; border-color: #f39c12; box-shadow: 0 4px 12px rgba(243, 156, 18, 0.3); }
.chip-info.active { background: #3498db; border-color: #3498db; box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3); }
.chip-success.active { background: #27ae60; border-color: #27ae60; box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3); }
.chip-danger.active { background: #e74c3c; border-color: #e74c3c; box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3); }

.chip-count {
  background: rgba(255, 255, 255, 0.25);
  color: inherit;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}
.filter-chip:not(.active) .chip-count {
  background: var(--border-color);
  color: var(--text-muted);
}

/* ===== TABLA ===== */
.table-modern {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.table-modern thead {
  background: var(--bg-table-stripe);
}

.table-modern th {
  padding: 14px 12px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}

.table-modern td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.venta-row {
  transition: background var(--transition-fast);
}
.venta-row:hover {
  background: var(--bg-table-stripe);
}

/* Celda fecha */
.cell-date .date-main {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
}
.cell-date .date-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Badge documento */
.badge-doc {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 10px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
}

/* Celda cliente */
.cliente-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cliente-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.72rem;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}
.cliente-info { min-width: 0; }
.cliente-nombre {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.cliente-ruc {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Badge tipo */
.badge-tipo {
  display: inline-block;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: rgba(108, 117, 125, 0.12);
  color: #6c757d;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: capitalize;
  letter-spacing: 0.2px;
}

/* Celda total */
.cell-total {
  font-weight: 800;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}
.cell-total-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Badge pago */
.badge-pago {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: capitalize;
  letter-spacing: 0.2px;
}
.badge-pago-ok {
  background: var(--success-bg);
  color: var(--success);
}
.badge-pago-pending {
  background: var(--warning-bg);
  color: #d68910;
}

/* Badge SRI */
.badge-sri {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.badge-sri-success { background: var(--success-bg); color: var(--success); }
.badge-sri-info { background: var(--info-bg); color: var(--info); }
.badge-sri-warning { background: var(--warning-bg); color: #d68910; }
.badge-sri-danger { background: var(--danger-bg); color: var(--danger); }
.badge-sri-secondary { background: var(--bg-table-stripe); color: var(--text-muted); }

.code-value {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--primary-color);
  cursor: help;
}

/* ===== ACCIONES ===== */
.actions-cell {
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  flex-wrap: nowrap;
}

.action-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  transition: all var(--transition-fast);
  padding: 0;
  flex-shrink: 0;
  font-family: inherit;
}
.action-icon-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.btn-action-warning { border-color: #f39c12; color: #f39c12; }
.btn-action-warning:hover { background: #f39c12; color: #fff; border-color: #f39c12; }

.btn-action-success { border-color: #27ae60; color: #27ae60; }
.btn-action-success:hover { background: #27ae60; color: #fff; border-color: #27ae60; }

.btn-action-info { border-color: #3498db; color: #3498db; }
.btn-action-info:hover { background: #3498db; color: #fff; border-color: #3498db; }

.btn-action-secondary { color: var(--text-muted); }
.btn-action-secondary:hover { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }

/* ===== DROPDOWN MÁS ACCIONES ===== */
.dropdown-more {
  position: relative;
}

.dropdown-menu-actions {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 1050;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 6px;
  min-width: 200px;
  list-style: none;
  margin: 0;
}

.dropdown-menu-actions li a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  color: var(--text-primary);
  text-decoration: none;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  transition: background var(--transition-fast);
}
.dropdown-menu-actions li a:hover {
  background: var(--bg-table-stripe);
}
.dropdown-menu-actions li a i {
  width: 16px;
  font-size: 0.85rem;
  color: var(--primary-color);
}
.dropdown-menu-actions li a.danger {
  color: var(--danger);
}
.dropdown-menu-actions li a.danger i {
  color: var(--danger);
}
.dropdown-menu-actions li a.danger:hover {
  background: var(--danger-bg);
}
.dropdown-menu-actions li.divider {
  height: 1px;
  background: var(--border-light);
  margin: 4px 8px;
}

.dropdown-menu-fade-enter-active,
.dropdown-menu-fade-leave-active {
  transition: all 0.15s var(--ease-out);
}
.dropdown-menu-fade-enter-from,
.dropdown-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ===== EMPTY ===== */
.empty-state-cell {
  padding: 0 !important;
}
.empty-state {
  text-align: center;
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--bg-table-stripe);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 2rem;
  margin-bottom: 6px;
}
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1.05rem;
}
.empty-text {
  font-size: 0.85rem;
  color: var(--text-muted);
  max-width: 380px;
  margin-bottom: 8px;
}
.btn-empty-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: var(--primary-color);
  color: #fff;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  text-decoration: none;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.btn-empty-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
  color: #fff;
}

/* ===== SKELETON ===== */
.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, var(--border-light) 25%, var(--bg-table-stripe) 50%, var(--border-light) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-xs);
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ===== FOOTER DE TABLA ===== */
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-table-stripe);
  flex-wrap: wrap;
  gap: 12px;
}

.footer-info {
  font-size: 0.82rem;
  color: var(--text-muted);
}
.footer-info strong {
  color: var(--text-primary);
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.btn-refresh:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .table-modern { font-size: 0.78rem; }
  .table-modern th,
  .table-modern td { padding: 10px 8px; }
  .action-icon-btn { width: 28px; height: 28px; font-size: 0.72rem; }
  .actions-cell { gap: 3px; }
}
</style>