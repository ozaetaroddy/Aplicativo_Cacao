<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-history"></i> Auditoría del Sistema</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" @click="cargar">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Actualizar
        </button>
      </div>
    </div>

    <!-- Tarjetas de estadísticas rápidas -->
    <div class="row g-3 mb-4" v-if="stats">
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(52,152,219,0.12); color:#3498db;">
            <i class="fas fa-list"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ stats.totalRegistros }}</div>
            <div class="stat-mini-label">Registros totales</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(46,204,113,0.12); color:#2ecc71;">
            <i class="fas fa-calendar-week"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ stats.ultimos7dias }}</div>
            <div class="stat-mini-label">Últimos 7 días</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(243,156,18,0.12); color:#f39c12;">
            <i class="fas fa-edit"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ countPorAccion('actualizar') }}</div>
            <div class="stat-mini-label">Actualizaciones</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(231,76,60,0.12); color:#e74c3c;">
            <i class="fas fa-trash-alt"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ countPorAccion('eliminar') }}</div>
            <div class="stat-mini-label">Eliminaciones</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card card-cacao mb-3">
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-3">
            <label class="form-label small mb-1">Buscar</label>
            <input type="text" class="form-control form-control-sm" v-model="search" @input="onSearchInput" placeholder="Usuario, número, detalle..." />
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1">Acción</label>
            <select class="form-select form-select-sm" v-model="accion" @change="reload">
              <option value="">Todas</option>
              <option value="crear">Crear</option>
              <option value="actualizar">Actualizar</option>
              <option value="eliminar">Eliminar</option>
              <option value="login">Login</option>
              <option value="importar">Importar</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1">Colección</label>
            <select class="form-select form-select-sm" v-model="coleccion" @change="reload">
              <option value="">Todas</option>
              <option value="ventas">Ventas</option>
              <option value="compras">Compras</option>
              <option value="clientes">Clientes</option>
              <option value="proveedores">Proveedores</option>
              <option value="productos">Productos</option>
              <option value="categorias">Categorías</option>
              <option value="retenciones">Retenciones</option>
              <option value="auth">Autenticación</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1">Desde</label>
            <input type="date" class="form-control form-control-sm" v-model="desde" @change="reload" />
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1">Hasta</label>
            <input type="date" class="form-control form-control-sm" v-model="hasta" @change="reload" />
          </div>
          <div class="col-md-1">
            <button class="btn btn-sm btn-outline-secondary w-100" @click="limpiarFiltros" title="Limpiar">
              <i class="fas fa-undo"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabla -->
    <div class="card card-cacao">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th style="width:150px;">Fecha</th>
                <th style="width:100px;">Acción</th>
                <th style="width:120px;">Módulo</th>
                <th>Usuario</th>
                <th>Documento</th>
                <th>Detalle</th>
                <th style="width:120px;">IP</th>
                <th style="width:80px;">Ver</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="registros.length === 0">
                <td colspan="8" class="text-center text-muted py-4">
                  No hay registros de auditoría
                </td>
              </tr>
              <tr v-else v-for="reg in registros" :key="reg._id">
                <td class="small">
                  <div>{{ formatFecha(reg.fecha) }}</div>
                  <div class="text-muted" style="font-size:0.7rem;">{{ formatHora(reg.fecha) }}</div>
                </td>
                <td>
                  <span class="badge-audit" :class="badgeClass(reg.accion)">
                    {{ reg.accion }}
                  </span>
                </td>
                <td>
                  <span class="badge bg-secondary">{{ reg.coleccion }}</span>
                </td>
                <td class="small">
                  <div class="fw-bold">{{ reg.usuarioNombre || reg.usuarioEmail }}</div>
                  <div class="text-muted" style="font-size:0.7rem;">{{ reg.usuarioEmail }}</div>
                </td>
                <td class="small">
                  <code v-if="reg.documentoNumero">{{ reg.documentoNumero }}</code>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="small text-muted">
                  {{ reg.detalle || '—' }}
                </td>
                <td class="small text-muted">
                  <code>{{ reg.ip || '—' }}</code>
                </td>
                <td>
                  <button class="btn btn-sm btn-outline-primary" @click="verDetalle(reg)" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="table-pagination d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
          <div class="text-muted small">
            Mostrando {{ startIndex }} - {{ endIndex }} de {{ total }} registros
          </div>
          <div class="d-flex align-items-center gap-2">
            <select class="form-select form-select-sm" style="width:auto;" v-model.number="limit" @change="reload">
              <option :value="20">20 / pág</option>
              <option :value="50">50 / pág</option>
              <option :value="100">100 / pág</option>
            </select>
            <nav>
              <ul class="pagination pagination-sm mb-0">
                <li class="page-item" :class="{ disabled: page === 1 }">
                  <button class="page-link" @click="goToPage(1)">&laquo;</button>
                </li>
                <li class="page-item" :class="{ disabled: page === 1 }">
                  <button class="page-link" @click="goToPage(page - 1)">&lsaquo;</button>
                </li>
                <li class="page-item disabled">
                  <span class="page-link">Página {{ page }} / {{ totalPages || 1 }}</span>
                </li>
                <li class="page-item" :class="{ disabled: page >= totalPages }">
                  <button class="page-link" @click="goToPage(page + 1)">&rsaquo;</button>
                </li>
                <li class="page-item" :class="{ disabled: page >= totalPages }">
                  <button class="page-link" @click="goToPage(totalPages)">&raquo;</button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de detalle -->
    <div class="modal fade" id="modalAuditoria" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-history me-2"></i>
              Detalle de auditoría
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" v-if="registroActual">
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="text-muted small">Acción</label>
                <div>
                  <span class="badge-audit" :class="badgeClass(registroActual.accion)">
                    {{ registroActual.accion }}
                  </span>
                </div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">Fecha</label>
                <div>{{ formatFechaHora(registroActual.fecha) }}</div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">Usuario</label>
                <div>
                  <strong>{{ registroActual.usuarioNombre || registroActual.usuarioEmail }}</strong>
                  <div class="text-muted small">{{ registroActual.usuarioEmail }}</div>
                </div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">Rol</label>
                <div>{{ registroActual.usuarioRol || '—' }}</div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">Colección</label>
                <div><span class="badge bg-secondary">{{ registroActual.coleccion }}</span></div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">Documento</label>
                <div><code>{{ registroActual.documentoNumero || '—' }}</code></div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">IP</label>
                <div><code>{{ registroActual.ip || '—' }}</code></div>
              </div>
              <div class="col-md-6">
                <label class="text-muted small">User Agent</label>
                <div class="small text-muted" style="word-break: break-all;">
                  {{ registroActual.userAgent || '—' }}
                </div>
              </div>
              <div class="col-12" v-if="registroActual.detalle">
                <label class="text-muted small">Detalle</label>
                <div>{{ registroActual.detalle }}</div>
              </div>
            </div>

            <!-- Comparación antes/después -->
            <div v-if="registroActual.datosAnteriores || registroActual.datosNuevos" class="row g-3">
              <div class="col-md-6" v-if="registroActual.datosAnteriores">
                <label class="text-muted small">Datos anteriores</label>
                <pre class="json-viewer json-before">{{ prettyJson(registroActual.datosAnteriores) }}</pre>
              </div>
              <div class="col-md-6" v-if="registroActual.datosNuevos">
                <label class="text-muted small">Datos nuevos</label>
                <pre class="json-viewer json-after">{{ prettyJson(registroActual.datosNuevos) }}</pre>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const registros = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(30)
const totalPages = ref(1)
const loading = ref(false)
const stats = ref(null)

const search = ref('')
const accion = ref('')
const coleccion = ref('')
const desde = ref('')
const hasta = ref('')

const modalInstance = ref(null)
const registroActual = ref(null)

let searchTimer = null

const startIndex = computed(() => total.value === 0 ? 0 : (page.value - 1) * limit.value + 1)
const endIndex = computed(() => Math.min(page.value * limit.value, total.value))

const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    cargar()
  }, 400)
}

const goToPage = (p) => {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  cargar()
}

const reload = () => {
  page.value = 1
  cargar()
}

const limpiarFiltros = () => {
  search.value = ''
  accion.value = ''
  coleccion.value = ''
  desde.value = ''
  hasta.value = ''
  page.value = 1
  cargar()
}

const cargar = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', page.value)
    params.set('limit', limit.value)
    if (search.value) params.set('search', search.value)
    if (accion.value) params.set('accion', accion.value)
    if (coleccion.value) params.set('coleccion', coleccion.value)
    if (desde.value) params.set('desde', desde.value)
    if (hasta.value) params.set('hasta', hasta.value)

    const response = await api.request(`/auditoria?${params.toString()}`, {
      method: 'GET',
      loaderMessage: 'Cargando auditoría...'
    })

    registros.value = response.data || []
    total.value = response.total || 0
    totalPages.value = response.totalPages || 1
  } catch (e) {
    console.error('Error cargando auditoría:', e)
    toast.error('Error al cargar auditoría: ' + e.message)
  } finally {
    loading.value = false
  }
}

const cargarStats = async () => {
  try {
    stats.value = await api.request('/auditoria/stats', { method: 'GET' })
  } catch (e) {
    console.error('Error cargando stats:', e)
  }
}

const countPorAccion = (acc) => {
  if (!stats.value?.porAccion) return 0
  const found = stats.value.porAccion.find(a => a._id === acc)
  return found ? found.total : 0
}

const formatFecha = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatHora = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const formatFechaHora = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'medium' })
}

const badgeClass = (acc) => {
  return {
    'badge-crear': acc === 'crear',
    'badge-actualizar': acc === 'actualizar',
    'badge-eliminar': acc === 'eliminar',
    'badge-login': acc === 'login',
    'badge-importar': acc === 'importar'
  }
}

const prettyJson = (obj) => {
  if (!obj) return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch (e) {
    return String(obj)
  }
}

const verDetalle = (reg) => {
  registroActual.value = reg
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalAuditoria')
    modalInstance.value = new Modal(modalEl)
  }
  modalInstance.value.show()
}

onMounted(() => {
  cargar()
  cargarStats()
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
}
.stat-mini-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

.badge-audit {
  display: inline-block;
  font-size: 0.7rem;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.badge-crear {
  background: rgba(39, 174, 96, 0.15);
  color: #27ae60;
}
.badge-actualizar {
  background: rgba(243, 156, 18, 0.15);
  color: #d68910;
}
.badge-eliminar {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}
.badge-login {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}
.badge-importar {
  background: rgba(155, 89, 182, 0.15);
  color: #8e44ad;
}

.json-viewer {
  background: #f8f9fa;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  font-size: 0.75rem;
  max-height: 350px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.json-before {
  border-left: 3px solid #e74c3c;
}
.json-after {
  border-left: 3px solid #27ae60;
}

body.dark-mode .json-viewer {
  background: #1a2744;
  color: #e0e0e0;
}

code {
  background: var(--bg-table-stripe);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-primary);
}
</style>