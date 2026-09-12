<template>
  <div class="ventas-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-hand-holding-usd"></i></span>
          Ventas
        </h1>
        <p class="page-subtitle">Gestiona y consulta todos tus comprobantes de venta</p>
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

    <!-- KPIs -->
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

    <!-- FILTROS -->
    <div class="filters-bar">
      <div class="filters-group">
        <span class="filters-label"><i class="fas fa-filter"></i> Filtrar:</span>
        <button class="filter-chip" :class="{ active: filtroEstadoSri === '' }" @click="cambiarFiltroSri('')">
          <i class="fas fa-list"></i><span>Todos</span>
        </button>
        <button class="filter-chip chip-warning" :class="{ active: filtroEstadoSri === 'PENDIENTE' }" @click="cambiarFiltroSri('PENDIENTE')">
          <i class="fas fa-clock"></i><span>Pendientes</span>
        </button>
        <button class="filter-chip chip-info" :class="{ active: filtroEstadoSri === 'FIRMADO' }" @click="cambiarFiltroSri('FIRMADO')">
          <i class="fas fa-signature"></i><span>Firmados</span>
        </button>
        <button class="filter-chip chip-success" :class="{ active: filtroEstadoSri === 'AUTORIZADO' }" @click="cambiarFiltroSri('AUTORIZADO')">
          <i class="fas fa-check-double"></i><span>Autorizados</span>
        </button>
        <button class="filter-chip chip-danger" :class="{ active: filtroEstadoSri === 'RECHAZADA' }" @click="cambiarFiltroSri('RECHAZADA')">
          <i class="fas fa-times-circle"></i><span>Rechazados</span>
        </button>
      </div>
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input
          v-model="search"
          @input="onSearchInput"
          placeholder="Buscar por Nº, cliente, clave..."
          type="text"
        />
        <button v-if="search" @click="search = ''; reload()" class="clear-btn">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- TABLA -->
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
                <th style="width:200px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="loading">
                <tr v-for="n in 5" :key="`sk-${n}`">
                  <td v-for="col in 8" :key="`c-${col}`">
                    <div class="skeleton-line"></div>
                  </td>
                </tr>
              </template>

              <tr v-else-if="ventas.length === 0">
                <td colspan="8" class="empty-state-cell">
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

              <tr v-else v-for="v in ventas" :key="v._id" class="venta-row">
                <td>
                  <div class="cell-date">
                    <div class="date-main">{{ formatFecha(v.fecha_emision) }}</div>
                    <div class="date-sub">{{ formatHora(v.fecha_emision) }}</div>
                  </div>
                </td>
                <td><span class="badge-doc">{{ v.numero_factura }}</span></td>
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar">{{ getInitials(v.cliente?.nombre) }}</div>
                    <div class="cliente-info">
                      <div class="cliente-nombre">{{ v.cliente?.nombre || 'N/A' }}</div>
                      <div class="cliente-ruc">{{ v.cliente?.ruc || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge-tipo">{{ v.tipo_documento || 'N/A' }}</span></td>
                <td class="text-end"><div class="cell-total">${{ (v.total || 0).toFixed(2) }}</div></td>
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
                <td>
                  <div class="actions-cell">
                    <button v-if="puedeFirmar(v)" class="action-icon-btn btn-action-warning" @click="firmar(v)" title="Firmar">
                      <i class="fas fa-signature"></i>
                    </button>
                    <button v-if="puedeEnviarSri(v)" class="action-icon-btn btn-action-success" @click="enviarAlSRI(v)" title="Enviar al SRI">
                      <i class="fas fa-paper-plane"></i>
                    </button>
                    <button v-if="puedeReintentar(v)" class="action-icon-btn btn-action-warning" @click="enviarAlSRI(v)" title="Reintentar">
                      <i class="fas fa-redo"></i>
                    </button>
                    <button v-if="puedeConsultar(v)" class="action-icon-btn btn-action-info" @click="consultarSRI(v)" title="Consultar">
                      <i class="fas fa-search"></i>
                    </button>
                    <button class="action-icon-btn btn-action-secondary" @click="irDocumento(v)" title="Ver RIDE">
                      <i class="fas fa-eye"></i>
                    </button>
                    <div class="dropdown-more">
                      <button class="action-icon-btn btn-action-secondary" @click.stop="toggleMenuAcciones(v._id)" title="Más">
                        <i class="fas fa-ellipsis-v"></i>
                      </button>
                      <transition name="dropdown-menu-fade">
                        <ul v-if="menuAbierto === v._id" class="dropdown-menu-actions" @click.stop>
                          <li v-if="v.clave_acceso">
                            <a href="#" @click.prevent="descargarXML(v, ['FIRMADO','AUTORIZADO'].includes(v.estado_sri))">
                              <i class="fas fa-file-code"></i><span>Descargar XML</span>
                            </a>
                          </li>
                          <li v-if="v.clave_acceso">
                            <a href="#" @click.prevent="abrirModalEmail(v)">
                              <i class="fas fa-envelope"></i><span>Enviar por email</span>
                            </a>
                          </li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'">
                            <a href="#" @click.prevent="editar(v)"><i class="fas fa-edit"></i><span>Editar</span></a>
                          </li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'" class="divider"></li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'">
                            <a href="#" @click.prevent="eliminar(v)" class="danger">
                              <i class="fas fa-trash"></i><span>Eliminar</span>
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

        <!-- PAGINACIÓN SERVER-SIDE -->
        <div class="table-footer">
          <div class="footer-info">
            Mostrando <strong>{{ ventas.length }}</strong> de <strong>{{ total }}</strong> registros
          </div>
          <div class="pagination-controls">
            <select class="limit-select" v-model.number="limit" @change="reload">
              <option :value="10">10 / pág</option>
              <option :value="20">20 / pág</option>
              <option :value="50">50 / pág</option>
              <option :value="100">100 / pág</option>
            </select>
            <button class="btn-page" :disabled="page === 1" @click="goToPage(1)"><i class="fas fa-angle-double-left"></i></button>
            <button class="btn-page" :disabled="page === 1" @click="goToPage(page - 1)"><i class="fas fa-angle-left"></i></button>
            <span class="page-info">{{ page }} / {{ totalPages || 1 }}</span>
            <button class="btn-page" :disabled="page >= totalPages" @click="goToPage(page + 1)"><i class="fas fa-angle-right"></i></button>
            <button class="btn-page" :disabled="page >= totalPages" @click="goToPage(totalPages)"><i class="fas fa-angle-double-right"></i></button>
            <button class="btn-refresh" @click="cargar" :disabled="loading"><i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i></button>
          </div>
        </div>
      </div>
    </div>

    <EnviarEmailModal :venta="ventaParaEmail" :cliente="ventaParaEmail?.cliente" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { Modal } from 'bootstrap'
import EnviarEmailModal from './EnviarEmailModal.vue'

const router = useRouter()
const toast = useToast()

const ventas = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const totalPages = ref(1)
const loading = ref(false)
const search = ref('')
const filtroEstadoSri = ref('')
const menuAbierto = ref(null)
const ventaParaEmail = ref(null)

// Stats independientes (no depende del filtro)
const stats = ref({ total: 0, firmados: 0, autorizados: 0, rechazados: 0 })

let searchTimer = null
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; cargar() }, 400)
}

const reload = () => { page.value = 1; cargar() }
const goToPage = (p) => {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p; cargar()
}

const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const formatHora = (f) => f ? new Date(f).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : ''
const getInitials = (n) => n ? String(n).split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() : '?'

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

// ===== CARGA PAGINADA (server-side) =====
const cargar = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', page.value)
    params.set('limit', limit.value)
    params.set('sortBy', 'fecha_emision')
    params.set('sortDir', 'desc')
    if (search.value) params.set('search', search.value)
    if (filtroEstadoSri.value) params.set('estado_sri', filtroEstadoSri.value)

    const res = await api.request(`/ventas?${params.toString()}`, { method: 'GET' })
    if (Array.isArray(res)) {
      ventas.value = res
      total.value = res.length
      totalPages.value = 1
    } else {
      ventas.value = res.data || []
      total.value = res.total || 0
      totalPages.value = res.totalPages || 1
    }
  } catch (e) {
    toast.error('Error al cargar: ' + e.message)
  } finally {
    loading.value = false
  }
}

// Stats generales (independientes del filtro)
const cargarStats = async () => {
  try {
    const res = await api.request('/estadisticas/dashboard', { method: 'GET', skipLoader: true })
    stats.value = {
      total: res.facturasMes || 0,
      firmados: res.sri?.firmados || 0,
      autorizados: res.sri?.autorizados || 0,
      rechazados: res.sri?.rechazados || 0
    }
  } catch (e) { /* silencioso */ }
}

const cambiarFiltroSri = (estado) => {
  filtroEstadoSri.value = estado
  reload()
}

const toggleMenuAcciones = (id) => {
  menuAbierto.value = menuAbierto.value === id ? null : id
}
const cerrarMenu = () => { menuAbierto.value = null }

const firmar = async (row) => {
  if (!confirm('¿Firmar electrónicamente este documento?')) return
  try {
    await api.request(`/ventas/${row._id}/firmar`, { method: 'POST', loaderMessage: 'Firmando...' })
    toast.success('Documento firmado')
    cargar(); cargarStats()
  } catch (e) { toast.error('Error: ' + e.message) }
}

const enviarAlSRI = async (row) => {
  if (!confirm('¿Enviar este documento al SRI?')) return
  try {
    const res = await api.request(`/sri/enviar/${row._id}`, { method: 'POST', loaderMessage: 'Enviando al SRI...' })
    if (res.success) toast.success(`✅ Autorizado: ${res.numero_autorizacion}`)
    else if (['DEVUELTA','RECHAZADA'].includes(res.estado)) {
      const msgs = (res.mensajes || []).slice(0, 2).map(m => `${m.identificador}: ${m.mensaje}`).join(' | ')
      toast.error(`❌ Rechazado: ${msgs || 'Sin detalle'}`, { timeout: 8000 })
    } else toast.warning(`Estado: ${res.estado}`)
    cargar(); cargarStats()
  } catch (e) { toast.error('Error: ' + e.message) }
}

const consultarSRI = async (row) => {
  try {
    const res = await api.request(`/sri/consultar/${row._id}`, { method: 'POST', loaderMessage: 'Consultando...' })
    if (res.success) toast.success(`✅ Autorizado: ${res.numero_autorizacion}`)
    else toast.info(`Estado: ${res.estado}`)
    cargar()
  } catch (e) { toast.error('Error: ' + e.message) }
}

const descargarXML = async (row, firmado) => {
  cerrarMenu()
  try {
    const token = localStorage.getItem('token')
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const url = firmado ? `${base}/ventas/${row._id}/xml-firmado` : `${base}/ventas/${row._id}/xml`
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!resp.ok) throw new Error('Error al descargar')
    const blob = await resp.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = `${row.clave_acceso}${firmado ? '_firmado' : ''}.xml`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(objUrl)
    toast.success('XML descargado')
  } catch (e) { toast.error('Error: ' + e.message) }
}

const abrirModalEmail = (row) => {
  cerrarMenu()
  ventaParaEmail.value = row
  setTimeout(() => {
    const el = document.getElementById('modalEnviarEmail')
    if (el) Modal.getOrCreateInstance(el).show()
  }, 100)
}

const irDocumento = (row) => router.push(`/consultar-documentos?tipo=venta&id=${row._id}`)
const irEnvioSri = () => router.push('/envio-sri')

const editar = (row) => {
  cerrarMenu()
  if (row.estado_sri === 'AUTORIZADO') { toast.warning('No se puede editar una factura autorizada'); return }
  router.push(`/ventas/editar/${row._id}`)
}

const eliminar = async (row) => {
  cerrarMenu()
  if (row.estado_sri === 'AUTORIZADO') { toast.warning('No se puede eliminar una factura autorizada'); return }
  if (!confirm(`¿Eliminar la factura ${row.numero_factura}?`)) return
  try {
    await api.request(`/ventas/${row._id}`, { method: 'DELETE' })
    toast.success('Venta eliminada')
    cargar(); cargarStats()
  } catch (e) { toast.error('Error: ' + e.message) }
}

const handleClickOutside = () => cerrarMenu()

onMounted(() => {
  cargar()
  cargarStats()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* ==== TODOS LOS ESTILOS (mantén los que ya tenías) ==== */
.ventas-page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em; display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
.title-icon { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; box-shadow: 0 8px 20px rgba(52, 152, 219, 0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0; padding-left: 62px; }
.page-header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-primary-action, .btn-secondary-action { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem; transition: all var(--transition); cursor: pointer; text-decoration: none; border: none; font-family: inherit; }
.btn-primary-action { background: linear-gradient(135deg, var(--primary-color), var(--primary-hover)); color: #fff; box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3); }
.btn-primary-action:hover { transform: translateY(-2px); color: #fff; }
.btn-secondary-action { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary-action:hover { border-color: var(--info); color: var(--info); background: var(--info-bg); }

.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.kpi-stat { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); transition: all var(--transition); position: relative; overflow: hidden; }
.kpi-stat::after { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--stat-color); }
.kpi-stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon { width: 44px; height: 44px; border-radius: 12px; background: color-mix(in srgb, var(--stat-color) 15%, transparent); color: var(--stat-color); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; }
.stat-number { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.stat-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 2px; }

.filters-bar { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.filters-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filters-label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; display: flex; align-items: center; gap: 6px; margin-right: 8px; }
.filter-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: var(--radius-full); background: var(--bg-table-stripe); border: 1.5px solid var(--border-color); font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.filter-chip:hover { border-color: var(--primary-color); color: var(--primary-color); }
.filter-chip.active { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
.chip-warning.active { background: #f39c12; border-color: #f39c12; }
.chip-info.active { background: #3498db; border-color: #3498db; }
.chip-success.active { background: #27ae60; border-color: #27ae60; }
.chip-danger.active { background: #e74c3c; border-color: #e74c3c; }

.search-box { position: relative; display: flex; align-items: center; min-width: 260px; }
.search-box i.fa-search { position: absolute; left: 12px; color: var(--text-muted); font-size: 0.85rem; pointer-events: none; }
.search-box input { width: 100%; padding: 8px 36px 8px 36px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: var(--bg-input); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.search-box input:focus { border-color: var(--primary-color); box-shadow: 0 0 0 3px var(--shadow-focus); background: var(--bg-card); }
.search-box .clear-btn { position: absolute; right: 8px; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; }

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 14px 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.venta-row:hover { background: var(--bg-table-stripe); }
.cell-date .date-main { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
.cell-date .date-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
.badge-doc { font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; padding: 4px 10px; background: var(--bg-table-stripe); border: 1px solid var(--border-color); border-radius: 4px; }
.cliente-cell { display: flex; align-items: center; gap: 10px; }
.cliente-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.72rem; flex-shrink: 0; }
.cliente-nombre { font-weight: 600; font-size: 0.85rem; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cliente-ruc { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); }
.badge-tipo { padding: 4px 10px; border-radius: var(--radius-full); background: rgba(108, 117, 125, 0.12); color: #6c757d; font-size: 0.7rem; font-weight: 700; text-transform: capitalize; }
.cell-total { font-weight: 800; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
.badge-pago { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 700; text-transform: capitalize; }
.badge-pago-ok { background: var(--success-bg); color: var(--success); }
.badge-pago-pending { background: var(--warning-bg); color: #d68910; }
.badge-sri { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
.badge-sri-success { background: var(--success-bg); color: var(--success); }
.badge-sri-info { background: var(--info-bg); color: var(--info); }
.badge-sri-warning { background: var(--warning-bg); color: #d68910; }
.badge-sri-danger { background: var(--danger-bg); color: var(--danger); }
.badge-sri-secondary { background: var(--bg-table-stripe); color: var(--text-muted); }

.actions-cell { display: flex; gap: 4px; justify-content: center; align-items: center; }
.action-icon-btn { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; transition: all var(--transition-fast); padding: 0; }
.action-icon-btn:hover { transform: translateY(-1px); }
.btn-action-warning { border-color: #f39c12; color: #f39c12; } .btn-action-warning:hover { background: #f39c12; color: #fff; }
.btn-action-success { border-color: #27ae60; color: #27ae60; } .btn-action-success:hover { background: #27ae60; color: #fff; }
.btn-action-info { border-color: #3498db; color: #3498db; } .btn-action-info:hover { background: #3498db; color: #fff; }
.btn-action-secondary:hover { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }

.dropdown-more { position: relative; }
.dropdown-menu-actions { position: absolute; top: calc(100% + 4px); right: 0; z-index: 1050; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 6px; min-width: 200px; list-style: none; margin: 0; }
.dropdown-menu-actions li a { display: flex; align-items: center; gap: 10px; padding: 9px 12px; color: var(--text-primary); text-decoration: none; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500; }
.dropdown-menu-actions li a:hover { background: var(--bg-table-stripe); }
.dropdown-menu-actions li a i { width: 16px; color: var(--primary-color); }
.dropdown-menu-actions li a.danger { color: var(--danger); }
.dropdown-menu-actions li a.danger:hover { background: var(--danger-bg); }
.dropdown-menu-actions li.divider { height: 1px; background: var(--border-light); margin: 4px 8px; }

.table-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--bg-table-stripe); flex-wrap: wrap; gap: 12px; }
.footer-info { font-size: 0.82rem; color: var(--text-muted); }
.footer-info strong { color: var(--text-primary); }
.pagination-controls { display: flex; align-items: center; gap: 6px; }
.limit-select { padding: 6px 10px; background: var(--bg-card); border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.btn-page { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; }
.btn-page:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-page:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.page-info { padding: 0 8px; font-size: 0.82rem; font-weight: 600; }
.btn-refresh { padding: 8px 14px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: var(--bg-card); cursor: pointer; font-weight: 600; font-size: 0.82rem; }
.btn-refresh:hover { border-color: var(--primary-color); color: var(--primary-color); }

.empty-state-cell { padding: 0 !important; }
.empty-state { text-align: center; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-table-stripe); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 2rem; }
.empty-title { font-weight: 700; font-size: 1.05rem; }
.empty-text { font-size: 0.85rem; color: var(--text-muted); max-width: 380px; }
.btn-empty-action { display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; background: var(--primary-color); color: #fff; border-radius: var(--radius-md); font-weight: 600; text-decoration: none; }
.skeleton-line { height: 14px; background: linear-gradient(90deg, var(--border-light) 25%, var(--bg-table-stripe) 50%, var(--border-light) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .filters-bar { flex-direction: column; align-items: stretch; }
  .search-box { min-width: 0; width: 100%; }
}
</style>