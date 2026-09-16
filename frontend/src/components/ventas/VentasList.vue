<template>
  <div class="ventas-page">
    <!-- ===== HEADER ===== -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-hand-holding-usd" aria-hidden="true"></i></span>
          Ventas
        </h1>
        <p class="page-subtitle">Gestiona y consulta todos tus comprobantes de venta</p>
      </div>
      <div class="page-header-actions">
        <button type="button" class="btn-secondary-action" @click="irEnvioSri">
          <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
          <span>Consola SRI</span>
        </button>
        <router-link to="/ventas/nuevo" class="btn-primary-action">
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>Nueva Venta</span>
        </router-link>
      </div>
    </div>

    <!-- ===== KPIs ===== -->
    <div class="kpi-row">
      <div class="kpi-stat" style="--stat-color: #3498db;">
        <div class="stat-icon"><i class="fas fa-file-invoice" aria-hidden="true"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.total }}</div>
          <div class="stat-label">Total documentos</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #f39c12;">
        <div class="stat-icon"><i class="fas fa-signature" aria-hidden="true"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.firmados }}</div>
          <div class="stat-label">Firmados</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #27ae60;">
        <div class="stat-icon"><i class="fas fa-check-double" aria-hidden="true"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.autorizados }}</div>
          <div class="stat-label">Autorizados SRI</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #e74c3c;">
        <div class="stat-icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></div>
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
          <i class="fas fa-filter" aria-hidden="true"></i> Filtrar:
        </span>
        <button
          type="button"
          class="filter-chip"
          :class="{ active: filtroEstadoSri === '' }"
          @click="cambiarFiltroSri('')"
        >
          <i class="fas fa-list" aria-hidden="true"></i><span>Todos</span>
        </button>
        <button
          type="button"
          class="filter-chip chip-warning"
          :class="{ active: filtroEstadoSri === 'PENDIENTE' }"
          @click="cambiarFiltroSri('PENDIENTE')"
        >
          <i class="fas fa-clock" aria-hidden="true"></i><span>Pendientes</span>
        </button>
        <button
          type="button"
          class="filter-chip chip-info"
          :class="{ active: filtroEstadoSri === 'FIRMADO' }"
          @click="cambiarFiltroSri('FIRMADO')"
        >
          <i class="fas fa-signature" aria-hidden="true"></i><span>Firmados</span>
        </button>
        <button
          type="button"
          class="filter-chip chip-success"
          :class="{ active: filtroEstadoSri === 'AUTORIZADO' }"
          @click="cambiarFiltroSri('AUTORIZADO')"
        >
          <i class="fas fa-check-double" aria-hidden="true"></i><span>Autorizados</span>
        </button>
        <button
          type="button"
          class="filter-chip chip-danger"
          :class="{ active: filtroEstadoSri === 'RECHAZADA' }"
          @click="cambiarFiltroSri('RECHAZADA')"
        >
          <i class="fas fa-times-circle" aria-hidden="true"></i><span>Rechazados</span>
        </button>
      </div>
      <div class="search-box">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          v-model="searchInput"
          @input="onSearchInput"
          placeholder="Buscar por Nº, cliente, clave…"
          type="text"
          aria-label="Buscar ventas"
          autocomplete="off"
        />
        <button
          v-if="searchInput"
          type="button"
          @click="limpiarBusqueda"
          class="clear-btn"
          aria-label="Limpiar búsqueda"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
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
                <th style="width:200px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody aria-busy="{{ loading ? 'true' : 'false' }}">
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="n in 5" :key="`sk-${n}`">
                  <td v-for="col in 8" :key="`c-${col}`">
                    <div class="skeleton-line"></div>
                  </td>
                </tr>
              </template>

              <!-- Vacío -->
              <tr v-else-if="ventas.length === 0">
                <td colspan="8" class="empty-state-cell">
                  <div class="empty-state">
                    <div class="empty-icon"><i class="fas fa-file-invoice" aria-hidden="true"></i></div>
                    <div class="empty-title">No hay ventas registradas</div>
                    <div class="empty-text">
                      {{ filtroEstadoSri
                        ? `No hay ventas con estado "${filtroEstadoSri}"`
                        : 'Crea tu primera venta para comenzar' }}
                    </div>
                    <router-link to="/ventas/nuevo" class="btn-empty-action">
                      <i class="fas fa-plus" aria-hidden="true"></i> Crear Nueva Venta
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Filas -->
              <tr
                v-else
                v-for="v in ventas"
                :key="String(v._id)"
                class="venta-row"
              >
                <td>
                  <div class="cell-date">
                    <div class="date-main">{{ formatFecha(v.fecha_emision) }}</div>
                    <div class="date-sub">{{ formatHora(v.fecha_emision) }}</div>
                  </div>
                </td>
                <td><span class="badge-doc">{{ v.numero_factura || '—' }}</span></td>
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar" aria-hidden="true">
                      {{ getInitials(v.cliente?.nombre) }}
                    </div>
                    <div class="cliente-info">
                      <div class="cliente-nombre">{{ v.cliente?.nombre || 'N/A' }}</div>
                      <div class="cliente-ruc">{{ v.cliente?.ruc || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge-tipo">{{ v.tipo_documento || 'N/A' }}</span></td>
                <td class="text-end">
                  <div class="cell-total">${{ formatMonto(v.total) }}</div>
                </td>
                <td>
                  <span
                    class="badge-pago"
                    :class="v.estado_pago === 'pagado' ? 'badge-pago-ok' : 'badge-pago-pending'"
                  >
                    <i
                      :class="v.estado_pago === 'pagado' ? 'fas fa-check' : 'fas fa-clock'"
                      aria-hidden="true"
                    ></i>
                    {{ v.estado_pago || 'pendiente' }}
                  </span>
                </td>
                <td>
                  <span class="badge-sri" :class="getEstadoSriClass(v.estado_sri)">
                    <i :class="getEstadoSriIcon(v.estado_sri)" aria-hidden="true"></i>
                    <span>{{ v.estado_sri || 'N/A' }}</span>
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <button
                      v-if="puedeFirmar(v)"
                      type="button"
                      class="action-icon-btn btn-action-warning"
                      :disabled="estaProcesando(v._id)"
                      @click="firmar(v)"
                      title="Firmar electrónicamente"
                      aria-label="Firmar electrónicamente"
                    >
                      <i
                        class="fas fa-signature"
                        :class="{ 'fa-spin': estaProcesando(v._id) }"
                        aria-hidden="true"
                      ></i>
                    </button>
                    <button
                      v-if="puedeEnviarSri(v)"
                      type="button"
                      class="action-icon-btn btn-action-success"
                      :disabled="estaProcesando(v._id)"
                      @click="enviarAlSRI(v)"
                      title="Enviar al SRI"
                      aria-label="Enviar al SRI"
                    >
                      <i
                        class="fas fa-paper-plane"
                        :class="{ 'fa-spin': estaProcesando(v._id) }"
                        aria-hidden="true"
                      ></i>
                    </button>
                    <button
                      v-if="puedeReintentar(v)"
                      type="button"
                      class="action-icon-btn btn-action-warning"
                      :disabled="estaProcesando(v._id)"
                      @click="enviarAlSRI(v)"
                      title="Reintentar envío al SRI"
                      aria-label="Reintentar envío al SRI"
                    >
                      <i
                        class="fas fa-redo"
                        :class="{ 'fa-spin': estaProcesando(v._id) }"
                        aria-hidden="true"
                      ></i>
                    </button>
                    <button
                      v-if="puedeConsultar(v)"
                      type="button"
                      class="action-icon-btn btn-action-info"
                      :disabled="estaProcesando(v._id)"
                      @click="consultarSRI(v)"
                      title="Consultar autorización"
                      aria-label="Consultar autorización"
                    >
                      <i
                        class="fas fa-search"
                        :class="{ 'fa-spin': estaProcesando(v._id) }"
                        aria-hidden="true"
                      ></i>
                    </button>
                    <button
                      type="button"
                      class="action-icon-btn btn-action-secondary"
                      @click="irDocumento(v)"
                      title="Ver RIDE"
                      aria-label="Ver RIDE"
                    >
                      <i class="fas fa-eye" aria-hidden="true"></i>
                    </button>
                    <div class="dropdown-more">
                      <button
                        type="button"
                        class="action-icon-btn btn-action-secondary"
                        @click.stop="toggleMenuAcciones(v._id)"
                        title="Más opciones"
                        aria-label="Más opciones"
                        :aria-expanded="menuAbierto === v._id ? 'true' : 'false'"
                      >
                        <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
                      </button>
                      <transition name="dropdown-menu-fade">
                        <ul
                          v-if="menuAbierto === v._id"
                          class="dropdown-menu-actions"
                          @mousedown.stop
                          @click.stop
                        >
                          <li v-if="v.clave_acceso">
                            <a
                              href="#"
                              @click.prevent="descargarXML(v, ['FIRMADO','AUTORIZADO'].includes(v.estado_sri))"
                            >
                              <i class="fas fa-file-code" aria-hidden="true"></i>
                              <span>Descargar XML</span>
                            </a>
                          </li>
                          <li v-if="v.clave_acceso">
                            <a href="#" @click.prevent="abrirModalEmail(v)">
                              <i class="fas fa-envelope" aria-hidden="true"></i>
                              <span>Enviar por email</span>
                            </a>
                          </li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'">
                            <a href="#" @click.prevent="editar(v)">
                              <i class="fas fa-edit" aria-hidden="true"></i>
                              <span>Editar</span>
                            </a>
                          </li>
                          <li
                            v-if="v.estado_sri !== 'AUTORIZADO'"
                            class="divider"
                            aria-hidden="true"
                          ></li>
                          <li v-if="v.estado_sri !== 'AUTORIZADO'">
                            <a href="#" @click.prevent="confirmarEliminar(v)" class="danger">
                              <i class="fas fa-trash" aria-hidden="true"></i>
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

        <!-- ===== PAGINACIÓN ===== -->
        <div class="table-footer">
          <div class="footer-info">
            Mostrando <strong>{{ ventas.length }}</strong> de <strong>{{ total }}</strong> registros
          </div>
          <div class="pagination-controls">
            <select
              class="limit-select"
              v-model.number="limit"
              @change="reload"
              aria-label="Ventas por página"
            >
              <option :value="10">10 / pág</option>
              <option :value="20">20 / pág</option>
              <option :value="50">50 / pág</option>
              <option :value="100">100 / pág</option>
            </select>
            <button
              type="button"
              class="btn-page"
              :disabled="page === 1"
              @click="goToPage(1)"
              title="Primera página"
              aria-label="Primera página"
            >
              <i class="fas fa-angle-double-left" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="btn-page"
              :disabled="page === 1"
              @click="goToPage(page - 1)"
              title="Anterior"
              aria-label="Página anterior"
            >
              <i class="fas fa-angle-left" aria-hidden="true"></i>
            </button>
            <span class="page-info">{{ page }} / {{ totalPages || 1 }}</span>
            <button
              type="button"
              class="btn-page"
              :disabled="page >= totalPages"
              @click="goToPage(page + 1)"
              title="Siguiente"
              aria-label="Página siguiente"
            >
              <i class="fas fa-angle-right" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="btn-page"
              :disabled="page >= totalPages"
              @click="goToPage(totalPages)"
              title="Última página"
              aria-label="Última página"
            >
              <i class="fas fa-angle-double-right" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="btn-refresh"
              @click="cargarTodo"
              :disabled="loading"
              title="Actualizar"
              aria-label="Actualizar listado"
            >
              <i class="fas fa-sync" :class="{ 'fa-spin': loading }" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== MODAL CONFIRMACIÓN ===== -->
    <div
      class="modal fade"
      id="modalConfirmVentas"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header" :class="`bg-${confirmState.variante}`">
            <h5 class="modal-title text-white">
              <i :class="confirmState.icono" class="me-2" aria-hidden="true"></i>
              {{ confirmState.titulo }}
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cancelarConfirm"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3" v-html="confirmState.mensaje"></p>
            <div v-if="confirmState.detalle" class="alert alert-warning small mb-0">
              <i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
              <span>{{ confirmState.detalle }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelarConfirm">
              {{ confirmState.textoCancelar }}
            </button>
            <button
              type="button"
              class="btn"
              :class="`btn-${confirmState.variante}`"
              @click="aceptarConfirm"
            >
              {{ confirmState.textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <EnviarEmailModal :venta="ventaParaEmail" :cliente="ventaParaEmail?.cliente" />
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount
} from 'vue'
import { useRouter } from 'vue-router'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import EnviarEmailModal from './EnviarEmailModal.vue'

const router = useRouter()
const toast = useToast()

// ===== CONSTANTES =====
const SEARCH_DEBOUNCE_MS = 400
const ESTADOS_SRI_VALIDOS = new Set([
  'PENDIENTE', 'FIRMADO', 'AUTORIZADO', 'RECHAZADA', 'DEVUELTA', 'RECIBIDA'
])

// ===== STATE =====
const ventas = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const totalPages = ref(1)
const loading = ref(false)
const searchInput = ref('')
const search = ref('')
const filtroEstadoSri = ref('')
const menuAbierto = ref(null)
const ventaParaEmail = ref(null)

// 🆕 Stats globales (independientes del filtro/paginación)
const stats = ref({ total: 0, firmados: 0, autorizados: 0, rechazados: 0 })

// 🆕 Mapa de ids en proceso (evita doble click)
const procesando = reactive({})

// 🆕 Confirmación reactiva
const confirmState = reactive({
  titulo: '',
  mensaje: '',
  detalle: '',
  textoConfirmar: 'Confirmar',
  textoCancelar: 'Cancelar',
  variante: 'primary',
  icono: 'fas fa-question-circle',
  resolve: null
})

let modalConfirm = null

// ===== GUARDS =====
let searchTimer = null
let unmounted = false
let requestSeq = 0
let abortController = null

// ===== HELPERS =====
const estaProcesando = (id) => Boolean(procesando[String(id)])

const formatFecha = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  } catch {
    return ''
  }
}

const formatHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleTimeString('es-EC', {
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return ''
  }
}

const formatMonto = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(2)
}

const getInitials = (n) => {
  if (!n || typeof n !== 'string') return '?'
  return n.split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?'
}

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// ===== BADGES SRI =====
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

// ===== PERMISOS DE ACCIÓN =====
const puedeFirmar = (v) =>
  Boolean(v?.clave_acceso) &&
  !['FIRMADO', 'AUTORIZADO', 'RECHAZADA', 'DEVUELTA'].includes(v?.estado_sri)

const puedeEnviarSri = (v) =>
  Boolean(v?.clave_acceso) && v?.estado_sri === 'FIRMADO'

const puedeReintentar = (v) =>
  Boolean(v?.clave_acceso) && ['RECHAZADA', 'DEVUELTA'].includes(v?.estado_sri)

const puedeConsultar = (v) =>
  Boolean(v?.clave_acceso) && ['PENDIENTE', 'RECIBIDA', 'FIRMADO'].includes(v?.estado_sri)

// ===== CONFIRMACIÓN =====
const pedirConfirmacion = (opts = {}) => {
  return new Promise((resolve) => {
    confirmState.titulo = opts.titulo || 'Confirmar acción'
    confirmState.mensaje = opts.mensaje || '¿Estás seguro?'
    confirmState.detalle = opts.detalle || ''
    confirmState.textoConfirmar = opts.textoConfirmar || 'Confirmar'
    confirmState.textoCancelar = opts.textoCancelar || 'Cancelar'
    confirmState.variante = opts.variante || 'primary'
    confirmState.icono = opts.icono || 'fas fa-question-circle'
    confirmState.resolve = resolve

    if (!modalConfirm) {
      modalConfirm = new Modal(
        document.getElementById('modalConfirmVentas'),
        { backdrop: 'static' }
      )
    }
    modalConfirm.show()
  })
}

const aceptarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(true)
}

const cancelarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(false)
}

// ===== BÚSQUEDA =====
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (unmounted) return
    search.value = searchInput.value
    page.value = 1
    cargar()
  }, SEARCH_DEBOUNCE_MS)
}

const limpiarBusqueda = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  searchInput.value = ''
  search.value = ''
  page.value = 1
  cargar()
}

// ===== PAGINACIÓN =====
const reload = () => {
  page.value = 1
  cargar()
}

const goToPage = (p) => {
  const next = Math.min(Math.max(1, p), totalPages.value)
  if (next === page.value) return
  page.value = next
  cargar()
}

// ===== FILTROS =====
const cambiarFiltroSri = (estado) => {
  const norm = ESTADOS_SRI_VALIDOS.has(estado) ? estado : ''
  filtroEstadoSri.value = norm
  reload()
}

// ===== CARGA PRINCIPAL =====
const cargar = async () => {
  // Cancelar request previa
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
  }
  abortController = new AbortController()
  const mySeq = ++requestSeq

  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('limit', String(limit.value))
    params.set('sortBy', 'fecha_emision')
    params.set('sortDir', 'desc')
    if (search.value) params.set('search', search.value)
    if (filtroEstadoSri.value) params.set('estado_sri', filtroEstadoSri.value)

    const res = await api.request(`/ventas?${params.toString()}`, {
      method: 'GET',
      signal: abortController.signal
    })

    if (unmounted || mySeq !== requestSeq) return

    if (Array.isArray(res)) {
      ventas.value = res
      total.value = res.length
      totalPages.value = 1
    } else {
      ventas.value = Array.isArray(res?.data) ? res.data : []
      total.value = Number(res?.total) || 0
      totalPages.value = Math.max(1, Number(res?.totalPages) || 1)
      if (page.value > totalPages.value) page.value = totalPages.value
    }

    // 🆕 Cerrar dropdown si la venta ya no está en la lista
    if (menuAbierto.value) {
      const sigue = ventas.value.some(v => String(v._id) === String(menuAbierto.value))
      if (!sigue) menuAbierto.value = null
    }
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort || mySeq !== requestSeq) return
    console.error('Error al cargar ventas:', e)
    toast.error('Error al cargar: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted && mySeq === requestSeq) loading.value = false
  }
}

// ===== STATS =====
const cargarStats = async () => {
  try {
    const res = await api.request('/estadisticas/dashboard', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return

    stats.value = {
      total: Number(res?.facturasMes) || 0,
      firmados: Number(res?.sri?.firmados) || 0,
      autorizados: Number(res?.sri?.autorizados) || 0,
      rechazados: Number(res?.sri?.rechazados) || 0
    }
  } catch (e) {
    if (unmounted) return
    console.warn('No se pudieron cargar stats:', e?.message)
  }
}

const cargarTodo = async () => {
  await Promise.all([cargar(), cargarStats()])
}

// ===== DROPDOWN =====
const toggleMenuAcciones = (id) => {
  const s = String(id)
  menuAbierto.value = menuAbierto.value === s ? null : s
}

const cerrarMenu = () => { menuAbierto.value = null }

const handleClickOutside = () => cerrarMenu()

// ===== ACCIONES SRI =====
/**
 * Envuelve una acción SRI individual para consistencia:
 * - Confirmación previa
 * - Guard de procesamiento
 * - Actualización de stats
 */
const ejecutarAccionSri = async (row, { url, confirmOpts, loadingMsg }) => {
  const confirmado = await pedirConfirmacion(confirmOpts)
  if (!confirmado) return

  const id = String(row._id)
  if (procesando[id]) return
  procesando[id] = true

  try {
    const res = await api.request(url, { method: 'POST', loaderMessage: loadingMsg })
    if (unmounted) return

    if (res?.success) {
      toast.success(`✅ Autorizado: ${res.numero_autorizacion || 'S/N'}`)
    } else if (['RECHAZADA', 'DEVUELTA'].includes(res?.estado)) {
      const msgs = (res?.mensajes || []).slice(0, 2)
        .map(m => `${m.identificador || ''}: ${m.mensaje || ''}`.trim())
        .filter(Boolean)
        .join(' | ')
      toast.error(`❌ Rechazado: ${msgs || 'Sin detalle'}`, { timeout: 8000 })
    } else {
      toast.warning(`Estado: ${res?.estado || 'desconocido'}`)
    }
    await Promise.all([cargar(), cargarStats()])
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) procesando[id] = false
  }
}

const firmar = (row) => ejecutarAccionSri(row, {
  url: `/ventas/${row._id}/firmar`,
  loadingMsg: 'Firmando…',
  confirmOpts: {
    titulo: 'Firmar documento',
    mensaje: `¿Firmar electrónicamente <strong>${escapeHtml(row.numero_factura)}</strong>?`,
    detalle: 'Se usará el certificado configurado actualmente.',
    textoConfirmar: 'Firmar',
    variante: 'warning',
    icono: 'fas fa-signature'
  }
})

const enviarAlSRI = (row) => ejecutarAccionSri(row, {
  url: `/sri/enviar/${row._id}`,
  loadingMsg: 'Enviando al SRI…',
  confirmOpts: {
    titulo: 'Enviar al SRI',
    mensaje: `¿Enviar <strong>${escapeHtml(row.numero_factura)}</strong> al SRI?`,
    detalle: 'Esta acción consume tiempo del servidor. No cierres la ventana.',
    textoConfirmar: 'Enviar',
    variante: 'success',
    icono: 'fas fa-paper-plane'
  }
})

const consultarSRI = async (row) => {
  const id = String(row._id)
  if (procesando[id]) return
  procesando[id] = true

  try {
    const res = await api.request(`/sri/consultar/${row._id}`, {
      method: 'POST',
      loaderMessage: 'Consultando…'
    })
    if (unmounted) return

    if (res?.success) toast.success(`✅ Autorizado: ${res.numero_autorizacion || 'S/N'}`)
    else toast.info(`Estado: ${res?.estado || 'desconocido'}`)
    await cargar()
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) procesando[id] = false
  }
}

// ===== DESCARGA XML =====
const descargarXML = async (row, firmado) => {
  cerrarMenu()
  try {
    const endpoint = firmado
      ? `/ventas/${row._id}/xml-firmado`
      : `/ventas/${row._id}/xml`
    const nombreArchivo = `${row.clave_acceso || 'comprobante'}${firmado ? '_firmado' : ''}.xml`

    await api.download(endpoint, nombreArchivo)
    if (!unmounted) toast.success('XML descargado')
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  }
}

// ===== EMAIL =====
const abrirModalEmail = (row) => {
  cerrarMenu()
  ventaParaEmail.value = row
  // El modal se autoabre por watch en EnviarEmailModal
}

// ===== NAVEGACIÓN =====
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

// ===== ELIMINAR =====
const confirmarEliminar = async (row) => {
  cerrarMenu()
  if (row.estado_sri === 'AUTORIZADO') {
    toast.warning('No se puede eliminar una factura autorizada')
    return
  }

  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar venta',
    mensaje: `¿Eliminar <strong>${escapeHtml(row.numero_factura)}</strong>?`,
    detalle: 'Esta acción no se puede deshacer. Se revertirá el stock de los productos.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado) return

  const id = String(row._id)
  if (procesando[id]) return
  procesando[id] = true

  try {
    await api.request(`/ventas/${row._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando…'
    })
    if (unmounted) return
    toast.success('Venta eliminada')
    await Promise.all([cargar(), cargarStats()])
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) procesando[id] = false
  }
}

// ===== WATCH =====
// Cerrar dropdown si el filtro cambia o si se recarga
watch([search, filtroEstadoSri], () => { cerrarMenu() })

// ===== LIFECYCLE =====
onMounted(() => {
  cargarTodo()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  unmounted = true
  document.removeEventListener('click', handleClickOutside)

  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }

  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
    abortController = null
  }

  try { modalConfirm?.hide() } catch { /* noop */ }

  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
})
</script>

<style scoped>
/* ==== MANTENER TUS ESTILOS ORIGINALES ==== */
/* Solo agrego los del modal de confirmación (que no tenías) */

.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

/* Los demás estilos son los mismos que ya tenías */
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
.stat-number { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; font-variant-numeric: tabular-nums; }
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
.action-icon-btn:hover:not(:disabled) { transform: translateY(-1px); }
.action-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-action-warning { border-color: #f39c12; color: #f39c12; } .btn-action-warning:hover:not(:disabled) { background: #f39c12; color: #fff; }
.btn-action-success { border-color: #27ae60; color: #27ae60; } .btn-action-success:hover:not(:disabled) { background: #27ae60; color: #fff; }
.btn-action-info { border-color: #3498db; color: #3498db; } .btn-action-info:hover:not(:disabled) { background: #3498db; color: #fff; }
.btn-action-secondary:hover:not(:disabled) { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }

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
.btn-refresh:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }

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