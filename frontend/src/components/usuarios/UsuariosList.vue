<template>
  <div>
    <!-- ===== HEADER ===== -->
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title">
        <i class="fas fa-user-cog" aria-hidden="true"></i> Gestión de Usuarios
      </h4>
      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-outline-primary"
          @click="cargarTodo"
          :disabled="loading"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }" aria-hidden="true"></i>
          Actualizar
        </button>
        <router-link to="/usuarios/nuevo" class="btn btn-success">
          <i class="fas fa-plus" aria-hidden="true"></i> Nuevo Usuario
        </router-link>
      </div>
    </div>

    <!-- ===== ESTADÍSTICAS GLOBALES ===== -->
    <div class="row g-3 mb-4">
      <div class="col-md-3 col-sm-6">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(52,152,219,0.12); color:#3498db;">
            <i class="fas fa-users" aria-hidden="true"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ stats.total }}</div>
            <div class="stat-mini-label">Total usuarios</div>
          </div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(46,204,113,0.12); color:#2ecc71;">
            <i class="fas fa-user-check" aria-hidden="true"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ stats.activos }}</div>
            <div class="stat-mini-label">Activos</div>
          </div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(231,76,60,0.12); color:#e74c3c;">
            <i class="fas fa-user-times" aria-hidden="true"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ stats.inactivos }}</div>
            <div class="stat-mini-label">Inactivos</div>
          </div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(155,89,182,0.12); color:#8e44ad;">
            <i class="fas fa-user-shield" aria-hidden="true"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ stats.admins }}</div>
            <div class="stat-mini-label">Administradores</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== FILTROS ===== -->
    <div class="card card-cacao mb-3">
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-5">
            <label class="form-label small mb-1" for="usr-search">Buscar</label>
            <input
              id="usr-search"
              type="text"
              class="form-control form-control-sm"
              v-model="searchInput"
              @input="onSearchInput"
              placeholder="Nombre o email…"
              autocomplete="off"
            />
          </div>
          <div class="col-md-3">
            <label class="form-label small mb-1" for="usr-rol">Rol</label>
            <select
              id="usr-rol"
              class="form-select form-select-sm"
              v-model="filtroRol"
              @change="reload"
            >
              <option value="">Todos los roles</option>
              <option value="admin">Administrador</option>
              <option value="contador">Contador</option>
              <option value="vendedor">Vendedor</option>
              <option value="bodeguero">Bodeguero</option>
              <option value="auditor">Auditor</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1" for="usr-estado">Estado</label>
            <select
              id="usr-estado"
              class="form-select form-select-sm"
              v-model="filtroActivo"
              @change="reload"
            >
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
          <div class="col-md-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary w-100"
              @click="limpiarFiltros"
              :disabled="!hayFiltros"
            >
              <i class="fas fa-undo" aria-hidden="true"></i> Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
    <div class="card card-cacao">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th style="width:130px;">Rol</th>
                <th style="width:110px;">Estado</th>
                <th style="width:120px;">Creado</th>
                <th style="width:180px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  <span class="ms-2">Cargando…</span>
                </td>
              </tr>
              <tr v-else-if="usuarios.length === 0">
                <td colspan="7" class="text-center text-muted py-4">
                  <i class="fas fa-inbox me-2" aria-hidden="true"></i>
                  No hay usuarios que coincidan con los filtros
                </td>
              </tr>
              <tr
                v-else
                v-for="u in usuarios"
                :key="String(u._id)"
              >
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div
                      class="user-avatar"
                      :style="{ background: getAvatarColor(u.rol) }"
                      aria-hidden="true"
                    >
                      {{ getInitials(u.nombre) }}
                    </div>
                    <div>
                      <div class="fw-bold">{{ u.nombre }}</div>
                      <div v-if="esUsuarioActual(u)" class="small text-muted">
                        <i class="fas fa-user-circle me-1"></i>Tú
                      </div>
                    </div>
                  </div>
                </td>
                <td class="small">{{ u.email }}</td>
                <td class="small">{{ u.telefono || '—' }}</td>
                <td>
                  <span class="badge-rol" :class="`rol-${u.rol}`">
                    {{ getRolLabel(u.rol) }}
                  </span>
                </td>
                <td>
                  <span class="badge" :class="u.activo ? 'bg-success' : 'bg-secondary'">
                    {{ u.activo ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="small text-muted">{{ formatFecha(u.createdAt) }}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary me-1"
                    @click="editar(u)"
                    :title="`Editar ${u.nombre}`"
                    :aria-label="`Editar ${u.nombre}`"
                  >
                    <i class="fas fa-edit"></i>
                  </button>

                  <!-- Toggle sólo si no es uno mismo -->
                  <button
                    v-if="!esUsuarioActual(u)"
                    type="button"
                    class="btn btn-sm me-1"
                    :class="u.activo ? 'btn-outline-warning' : 'btn-outline-success'"
                    @click="confirmarToggle(u)"
                    :disabled="procesandoId === String(u._id)"
                    :title="u.activo ? 'Desactivar' : 'Activar'"
                    :aria-label="u.activo ? 'Desactivar usuario' : 'Activar usuario'"
                  >
                    <i
                      :class="[
                        u.activo ? 'fas fa-user-slash' : 'fas fa-user-check',
                        { 'fa-spin': procesandoId === String(u._id) }
                      ]"
                    ></i>
                  </button>

                  <!-- Eliminar sólo si no es uno mismo -->
                  <button
                    v-if="!esUsuarioActual(u)"
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    @click="confirmarEliminar(u)"
                    :disabled="procesandoId === String(u._id)"
                    title="Eliminar"
                    aria-label="Eliminar usuario"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ===== PAGINACIÓN ===== -->
        <div class="table-pagination d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
          <div class="text-muted small">
            Mostrando {{ startIndex }} - {{ endIndex }} de {{ total }} usuarios
          </div>
          <div class="d-flex align-items-center gap-2">
            <select
              class="form-select form-select-sm"
              style="width:auto;"
              v-model.number="limit"
              @change="reload"
              aria-label="Usuarios por página"
            >
              <option :value="10">10 / pág</option>
              <option :value="20">20 / pág</option>
              <option :value="50">50 / pág</option>
            </select>
            <nav aria-label="Paginación de usuarios">
              <ul class="pagination pagination-sm mb-0">
                <li class="page-item" :class="{ disabled: page === 1 }">
                  <button
                    type="button"
                    class="page-link"
                    @click="goToPage(page - 1)"
                    aria-label="Página anterior"
                  >&lsaquo;</button>
                </li>
                <li class="page-item disabled">
                  <span class="page-link">Página {{ page }} / {{ totalPages || 1 }}</span>
                </li>
                <li class="page-item" :class="{ disabled: page >= totalPages }">
                  <button
                    type="button"
                    class="page-link"
                    @click="goToPage(page + 1)"
                    aria-label="Página siguiente"
                  >&rsaquo;</button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== MODAL CONFIRMACIÓN ===== -->
    <div
      class="modal fade"
      id="modalConfirmUsuarios"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header" :class="`bg-${confirmState.variante}`">
            <h5 class="modal-title text-white">
              <i :class="confirmState.icono" class="me-2"></i>
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
              <i class="fas fa-exclamation-triangle me-2"></i>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()

// ===== CONSTANTS =====
const SEARCH_DEBOUNCE_MS = 400

// ===== STATE =====
const usuarios = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const totalPages = ref(1)
const loading = ref(false)
const procesandoId = ref(null)

// 🆕 Stats globales (independientes de la paginación)
const stats = ref({ total: 0, activos: 0, inactivos: 0, admins: 0 })

// Búsqueda con valor inmediato + valor debounced
const searchInput = ref('')
const search = ref('')
const filtroRol = ref('')
const filtroActivo = ref('')

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

// ===== COMPUTED =====
const currentUserId = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null')
    return u?.id ? String(u.id) : null
  } catch {
    return null
  }
})

const startIndex = computed(() =>
  total.value === 0 ? 0 : (page.value - 1) * limit.value + 1
)
const endIndex = computed(() => Math.min(page.value * limit.value, total.value))

const hayFiltros = computed(() =>
  Boolean(search.value || filtroRol.value || filtroActivo.value)
)

// ===== HELPERS =====
const esUsuarioActual = (u) =>
  currentUserId.value && String(u._id) === currentUserId.value

const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC')
  } catch {
    return '—'
  }
}

const getInitials = (nombre) => {
  if (!nombre || typeof nombre !== 'string') return '?'
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}

const getAvatarColor = (rol) => {
  const colors = {
    admin: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    contador: 'linear-gradient(135deg, #3498db, #2980b9)',
    vendedor: 'linear-gradient(135deg, #27ae60, #1e8449)',
    bodeguero: 'linear-gradient(135deg, #f39c12, #d68910)',
    auditor: 'linear-gradient(135deg, #8e44ad, #6c3483)'
  }
  return colors[rol] || 'linear-gradient(135deg, #7f8c8d, #5d6d7e)'
}

const getRolLabel = (rol) => {
  const labels = {
    admin: 'Admin',
    contador: 'Contador',
    vendedor: 'Vendedor',
    bodeguero: 'Bodeguero',
    auditor: 'Auditor'
  }
  return labels[rol] || rol || '—'
}

// 🆕 Escapar para el mensaje del modal (evita inyección HTML)
const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

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
        document.getElementById('modalConfirmUsuarios'),
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

const limpiarFiltros = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  searchInput.value = ''
  search.value = ''
  filtroRol.value = ''
  filtroActivo.value = ''
  page.value = 1
  cargar()
}

// ===== PAGINACIÓN =====
const goToPage = (p) => {
  const next = Math.min(Math.max(1, p), totalPages.value)
  if (next === page.value) return
  page.value = next
  cargar()
}

const reload = () => {
  page.value = 1
  cargar()
}

// ===== CARGA PRINCIPAL (listado paginado) =====
const cargar = async () => {
  const mySeq = ++requestSeq
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('limit', String(limit.value))
    if (search.value) params.set('search', search.value)
    if (filtroRol.value) params.set('rol', filtroRol.value)
    if (filtroActivo.value) params.set('activo', filtroActivo.value)

    const response = await api.request(`/usuarios?${params.toString()}`, {
      method: 'GET'
    })
    if (unmounted || mySeq !== requestSeq) return

    usuarios.value = Array.isArray(response?.data) ? response.data : []
    total.value = Number(response?.total) || 0
    totalPages.value = Math.max(1, Number(response?.totalPages) || 1)
    if (page.value > totalPages.value) page.value = totalPages.value
  } catch (e) {
    if (unmounted || mySeq !== requestSeq) return
    console.error('Error cargando usuarios:', e)
    toast.error('Error al cargar usuarios: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted && mySeq === requestSeq) loading.value = false
  }
}

// ===== CARGA DE STATS GLOBALES =====
/**
 * Obtiene los conteos REALES de todos los usuarios (no solo la página).
 * Se hace una llamada sin `page`/`limit` para que el backend devuelva el
 * array completo (hasta su `maxSinPaginar`).
 */
const cargarStats = async () => {
  try {
    const lista = await api.request('/usuarios', { method: 'GET' })
    if (unmounted) return

    const arr = Array.isArray(lista)
      ? lista
      : (Array.isArray(lista?.data) ? lista.data : [])

    stats.value = {
      total: arr.length,
      activos: arr.filter(u => u?.activo).length,
      inactivos: arr.filter(u => !u?.activo).length,
      admins: arr.filter(u => u?.rol === 'admin').length
    }
  } catch (e) {
    if (unmounted) return
    console.warn('No se pudieron cargar estadísticas globales:', e?.message)
    // No bloqueamos la UI: stats quedan en 0
  }
}

const cargarTodo = async () => {
  await Promise.all([cargar(), cargarStats()])
}

// ===== NAVEGACIÓN =====
const editar = (u) => {
  router.push(`/usuarios/editar/${u._id}`)
}

// ===== ACCIONES =====
const confirmarToggle = async (u) => {
  const activar = !u.activo
  const confirmado = await pedirConfirmacion({
    titulo: activar ? 'Activar usuario' : 'Desactivar usuario',
    mensaje: `¿${activar ? 'Activar' : 'Desactivar'} a <strong>${escapeHtml(u.nombre)}</strong>?`,
    detalle: activar
      ? 'El usuario podrá iniciar sesión de nuevo.'
      : 'Se cerrarán todas sus sesiones activas. No podrá iniciar sesión hasta que lo reactives.',
    textoConfirmar: activar ? 'Activar' : 'Desactivar',
    textoCancelar: 'Cancelar',
    variante: activar ? 'success' : 'warning',
    icono: activar ? 'fas fa-user-check' : 'fas fa-user-slash'
  })
  if (!confirmado) return

  const id = String(u._id)
  if (procesandoId.value) return
  procesandoId.value = id

  try {
    const res = await api.request(`/usuarios/${id}/toggle-activo`, {
      method: 'PATCH',
      loaderMessage: activar ? 'Activando…' : 'Desactivando…'
    })
    if (unmounted) return
    toast.success(`Usuario ${res?.activo ? 'activado' : 'desactivado'}`)
    await Promise.all([cargar(), cargarStats()])
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) procesandoId.value = null
  }
}

const confirmarEliminar = async (u) => {
  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar usuario',
    mensaje: `¿Eliminar a <strong>${escapeHtml(u.nombre)}</strong> (<code>${escapeHtml(u.email)}</code>)?`,
    detalle: 'Esta acción no se puede deshacer.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado) return

  const id = String(u._id)
  if (procesandoId.value) return
  procesandoId.value = id

  try {
    await api.request(`/usuarios/${id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando usuario…'
    })
    if (unmounted) return
    toast.success('Usuario eliminado')
    await Promise.all([cargar(), cargarStats()])
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) procesandoId.value = null
  }
}

// ===== LIFECYCLE =====
onMounted(() => {
  cargarTodo()
})

onBeforeUnmount(() => {
  unmounted = true

  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }

  try { modalConfirm?.hide() } catch { /* noop */ }

  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
})
</script>

<style scoped>
.stat-mini-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  transition: var(--transition);
}
.stat-mini-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}
.stat-mini-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.stat-mini-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat-mini-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

.user-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.badge-rol {
  display: inline-block;
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.rol-admin { background: rgba(231,76,60,0.15); color: #e74c3c; }
.rol-contador { background: rgba(52,152,219,0.15); color: #3498db; }
.rol-vendedor { background: rgba(39,174,96,0.15); color: #27ae60; }
.rol-bodeguero { background: rgba(243,156,18,0.15); color: #d68910; }
.rol-auditor { background: rgba(155,89,182,0.15); color: #8e44ad; }

.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }
</style>