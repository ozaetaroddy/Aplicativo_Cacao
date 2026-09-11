<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-user-cog"></i> Gestión de Usuarios</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary" @click="cargar">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Actualizar
        </button>
        <router-link to="/usuarios/nuevo" class="btn btn-success">
          <i class="fas fa-plus"></i> Nuevo Usuario
        </router-link>
      </div>
    </div>

    <!-- Tarjetas de estadísticas -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(52,152,219,0.12); color:#3498db;">
            <i class="fas fa-users"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ total }}</div>
            <div class="stat-mini-label">Total usuarios</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(46,204,113,0.12); color:#2ecc71;">
            <i class="fas fa-user-check"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ countActivos }}</div>
            <div class="stat-mini-label">Activos</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(231,76,60,0.12); color:#e74c3c;">
            <i class="fas fa-user-times"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ countInactivos }}</div>
            <div class="stat-mini-label">Inactivos</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(155,89,182,0.12); color:#8e44ad;">
            <i class="fas fa-user-shield"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ countAdmins }}</div>
            <div class="stat-mini-label">Administradores</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card card-cacao mb-3">
      <div class="card-body">
        <div class="row g-2 align-items-end">
          <div class="col-md-5">
            <label class="form-label small mb-1">Buscar</label>
            <input type="text" class="form-control form-control-sm" v-model="search" @input="onSearchInput" placeholder="Nombre o email..." />
          </div>
          <div class="col-md-3">
            <label class="form-label small mb-1">Rol</label>
            <select class="form-select form-select-sm" v-model="filtroRol" @change="reload">
              <option value="">Todos los roles</option>
              <option value="admin">Administrador</option>
              <option value="contador">Contador</option>
              <option value="vendedor">Vendedor</option>
              <option value="bodeguero">Bodeguero</option>
              <option value="auditor">Auditor</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small mb-1">Estado</label>
            <select class="form-select form-select-sm" v-model="filtroActivo" @change="reload">
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
          <div class="col-md-2">
            <button class="btn btn-sm btn-outline-secondary w-100" @click="limpiarFiltros">
              <i class="fas fa-undo"></i> Limpiar
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
                <th>Usuario</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th style="width:130px;">Rol</th>
                <th style="width:110px;">Estado</th>
                <th style="width:100px;">Creado</th>
                <th style="width:180px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="usuarios.length === 0">
                <td colspan="7" class="text-center text-muted py-4">
                  No hay usuarios registrados
                </td>
              </tr>
              <tr v-else v-for="u in usuarios" :key="u._id">
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div class="user-avatar" :style="{ background: getAvatarColor(u.rol) }">
                      {{ getInitials(u.nombre) }}
                    </div>
                    <div>
                      <div class="fw-bold">{{ u.nombre }}</div>
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
                <td class="small text-muted">
                  {{ u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-EC') : '—' }}
                </td>
                <td>
                  <button class="btn btn-sm btn-outline-primary me-1" @click="editar(u)" title="Editar">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button
                    class="btn btn-sm me-1"
                    :class="u.activo ? 'btn-outline-warning' : 'btn-outline-success'"
                    @click="toggleActivo(u)"
                    :title="u.activo ? 'Desactivar' : 'Activar'"
                  >
                    <i :class="u.activo ? 'fas fa-user-slash' : 'fas fa-user-check'"></i>
                  </button>
                  <button
                    v-if="String(u._id) !== String(currentUserId)"
                    class="btn btn-sm btn-outline-danger"
                    @click="eliminar(u)"
                    title="Eliminar"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="table-pagination d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
          <div class="text-muted small">
            Mostrando {{ startIndex }} - {{ endIndex }} de {{ total }} usuarios
          </div>
          <div class="d-flex align-items-center gap-2">
            <select class="form-select form-select-sm" style="width:auto;" v-model.number="limit" @change="reload">
              <option :value="10">10 / pág</option>
              <option :value="20">20 / pág</option>
              <option :value="50">50 / pág</option>
            </select>
            <nav>
              <ul class="pagination pagination-sm mb-0">
                <li class="page-item" :class="{ disabled: page === 1 }">
                  <button class="page-link" @click="goToPage(page - 1)">&lsaquo;</button>
                </li>
                <li class="page-item disabled">
                  <span class="page-link">Página {{ page }} / {{ totalPages || 1 }}</span>
                </li>
                <li class="page-item" :class="{ disabled: page >= totalPages }">
                  <button class="page-link" @click="goToPage(page + 1)">&rsaquo;</button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()

const usuarios = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const totalPages = ref(1)
const loading = ref(false)

const search = ref('')
const filtroRol = ref('')
const filtroActivo = ref('')

const currentUserId = computed(() => {
  const u = JSON.parse(localStorage.getItem('user') || 'null')
  return u?.id || null
})

const countActivos = computed(() => usuarios.value.filter(u => u.activo).length)
const countInactivos = computed(() => usuarios.value.filter(u => !u.activo).length)
const countAdmins = computed(() => usuarios.value.filter(u => u.rol === 'admin').length)

const startIndex = computed(() => total.value === 0 ? 0 : (page.value - 1) * limit.value + 1)
const endIndex = computed(() => Math.min(page.value * limit.value, total.value))

let searchTimer = null
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
  filtroRol.value = ''
  filtroActivo.value = ''
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
    if (filtroRol.value) params.set('rol', filtroRol.value)
    if (filtroActivo.value) params.set('activo', filtroActivo.value)

    const response = await api.request(`/usuarios?${params.toString()}`, {
      method: 'GET'
    })

    usuarios.value = response.data || []
    total.value = response.total || 0
    totalPages.value = response.totalPages || 1
  } catch (e) {
    console.error('Error cargando usuarios:', e)
    toast.error('Error al cargar usuarios: ' + e.message)
  } finally {
    loading.value = false
  }
}

const editar = (u) => {
  router.push(`/usuarios/editar/${u._id}`)
}

const toggleActivo = async (u) => {
  try {
    const res = await api.request(`/usuarios/${u._id}/toggle-activo`, {
      method: 'PATCH',
      loaderMessage: 'Actualizando estado...'
    })
    toast.success(`Usuario ${res.activo ? 'activado' : 'desactivado'} correctamente`)
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const eliminar = async (u) => {
  if (!confirm(`¿Está seguro de eliminar al usuario "${u.nombre}" (${u.email})?\n\nEsta acción no se puede deshacer.`)) return
  try {
    await api.request(`/usuarios/${u._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando usuario...'
    })
    toast.success('Usuario eliminado correctamente')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const getInitials = (nombre) => {
  if (!nombre) return '?'
  return nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
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
  return labels[rol] || rol
}

onMounted(cargar)
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
</style>