<template>
  <div class="categorias-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-tags"></i></span>
          Categorías
        </h1>
        <p class="page-subtitle">
          Agrupa tus productos por categoría para organizarlos mejor
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar listado"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
        <router-link to="/categorias/nuevo" class="btn-primary">
          <i class="fas fa-plus"></i>
          Nueva categoría
        </router-link>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-tags"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ categorias.length }}</div>
          <div class="stat-label">Total categorías</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon verde"><i class="fas fa-box"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ categoriasConProductos }}</div>
          <div class="stat-label">Con productos</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gris"><i class="fas fa-inbox"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ categoriasVacias }}</div>
          <div class="stat-label">Sin productos</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon naranja"><i class="fas fa-cubes"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ totalProductos.toLocaleString() }}</div>
          <div class="stat-label">Productos asignados</div>
        </div>
      </div>
    </div>

    <!-- SEARCH -->
    <div class="search-bar">
      <div class="search-wrapper">
        <i class="fas fa-search search-icon"></i>
        <input
          type="text"
          class="search-input"
          v-model="search"
          placeholder="Buscar por nombre o descripción..."
          aria-label="Buscar categorías"
        />
        <button
          v-if="search"
          type="button"
          class="search-clear"
          @click="search = ''"
          aria-label="Limpiar búsqueda"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="search-info">
        <span v-if="search">
          {{ categoriasFiltradas.length }} resultado(s) para "{{ search }}"
        </span>
        <span v-else>
          {{ categorias.length }} categoría(s) en total
        </span>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Listado de categorías
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width: 60px;">#</th>
                <th>Nombre</th>
                <th>Descripción</th>
                <th style="width: 140px;" class="text-center">Productos</th>
                <th style="width: 160px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="i in 5" :key="`skel-${i}`" class="skeleton-row">
                  <td><div class="skeleton-line w-60"></div></td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-60 mx-auto"></div></td>
                  <td><div class="skeleton-line w-80 mx-auto"></div></td>
                </tr>
              </template>

              <!-- Empty (sin datos) -->
              <tr v-else-if="categorias.length === 0">
                <td colspan="5" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-tags"></i>
                    <div class="empty-title">Aún no hay categorías</div>
                    <div class="empty-text">
                      Crea tu primera categoría para empezar a organizar tus productos
                    </div>
                    <router-link to="/categorias/nuevo" class="empty-action">
                      <i class="fas fa-plus"></i> Crear categoría
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Empty (con búsqueda) -->
              <tr v-else-if="categoriasFiltradas.length === 0">
                <td colspan="5" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <div class="empty-title">Sin resultados</div>
                    <div class="empty-text">
                      No se encontraron categorías que coincidan con "{{ search }}"
                    </div>
                    <button class="empty-action" @click="search = ''">
                      <i class="fas fa-times"></i> Limpiar búsqueda
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Datos -->
              <tr v-else v-for="(c, idx) in categoriasFiltradas" :key="c._id">
                <td class="text-muted small">{{ idx + 1 }}</td>
                <td>
                  <div class="categoria-cell">
                    <div class="categoria-avatar">
                      {{ inicial(c.nombre) }}
                    </div>
                    <div class="categoria-nombre">{{ c.nombre }}</div>
                  </div>
                </td>
                <td>
                  <div class="categoria-desc" :title="c.descripcion">
                    {{ c.descripcion || '—' }}
                  </div>
                </td>
                <td class="text-center">
                  <span
                    class="badge-count"
                    :class="c.productosCount > 0 ? 'badge-count-ok' : 'badge-count-empty'"
                  >
                    <i :class="c.productosCount > 0 ? 'fas fa-box' : 'fas fa-inbox'"></i>
                    {{ c.productosCount || 0 }}
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <router-link
                      :to="`/categorias/editar/${c._id}`"
                      class="btn-icon btn-edit"
                      title="Editar categoría"
                      :aria-label="`Editar ${c.nombre}`"
                    >
                      <i class="fas fa-edit"></i>
                    </router-link>
                    <button
                      class="btn-icon btn-delete"
                      @click="pedirEliminar(c)"
                      :disabled="eliminandoId === c._id"
                      :title="
                        c.productosCount > 0
                          ? `No se puede eliminar: tiene ${c.productosCount} producto(s)`
                          : 'Eliminar categoría'
                      "
                      :aria-label="`Eliminar ${c.nombre}`"
                    >
                      <i
                        class="fas fa-trash"
                        :class="{ 'fa-spin': eliminandoId === c._id }"
                      ></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMACIÓN -->
    <div
      class="modal fade"
      id="modalConfirmCategoria"
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
            <p class="mb-3">{{ confirmState.mensaje }}</p>
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
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ===== STATE =====
const categorias = ref([])
const loading = ref(false)
const search = ref('')
const eliminandoId = ref(null)

// Modales
let modalConfirm = null
let unmounted = false

// 🆕 Confirm state (patrón consistente con el resto de la app)
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

// ===== COMPUTED =====
const categoriasFiltradas = computed(() => {
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return categorias.value
  return categorias.value.filter(c => {
    const nombre = String(c.nombre || '').toLowerCase()
    const desc = String(c.descripcion || '').toLowerCase()
    return nombre.includes(q) || desc.includes(q)
  })
})

const categoriasConProductos = computed(
  () => categorias.value.filter(c => (c.productosCount || 0) > 0).length
)

const categoriasVacias = computed(
  () => categorias.value.filter(c => (c.productosCount || 0) === 0).length
)

const totalProductos = computed(() =>
  categorias.value.reduce((sum, c) => sum + (Number(c.productosCount) || 0), 0)
)

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

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
      modalConfirm = new Modal(document.getElementById('modalConfirmCategoria'), {
        backdrop: 'static'
      })
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

// ===== CARGA =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/categorias', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return
    categorias.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar categorías: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== ELIMINAR =====
const pedirEliminar = async (categoria) => {
  // Guard: no permitir si tiene productos (mejor UX que esperar el 409)
  if ((categoria.productosCount || 0) > 0) {
    toast.warning(
      `No se puede eliminar: tiene ${categoria.productosCount} producto(s) asignado(s)`
    )
    return
  }
  if (eliminandoId.value === categoria._id) return

  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar categoría',
    mensaje: `¿Eliminar la categoría "${categoria.nombre}"?`,
    detalle: 'Esta acción no se puede deshacer.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado || unmounted) return

  eliminandoId.value = categoria._id
  try {
    await api.request(`/categorias/${categoria._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando...'
    })
    if (unmounted) return
    toast.success('Categoría eliminada')
    await cargar()
  } catch (e) {
    if (unmounted) return
    // Mensajes específicos por código de error del backend
    const codigo = e?.codigo || e?.code
    if (codigo === 'CATEGORIA_CON_PRODUCTOS') {
      toast.error(
        e.message || 'La categoría tiene productos asociados y no puede eliminarse'
      )
    } else if (codigo === 'CATEGORIA_NOT_FOUND') {
      toast.error('La categoría ya no existe')
      await cargar()
    } else {
      toast.error('Error al eliminar: ' + e.message)
    }
  } finally {
    if (!unmounted) eliminandoId.value = null
  }
}

// ===== LIFECYCLE =====
onMounted(cargar)

onBeforeUnmount(() => {
  unmounted = true
  try { modalConfirm?.hide() } catch { /* noop */ }
  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
})
</script>

<style scoped>
.categorias-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* HEADER */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}
.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  letter-spacing: -0.03em;
}
.title-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(142, 68, 173, 0.3);
}
.page-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: none;
  text-decoration: none;
}
.btn-primary {
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  color: #fff;
  box-shadow: 0 4px 12px rgba(142, 68, 173, 0.3);
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(142, 68, 173, 0.4); color: #fff; }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

/* STATS */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all var(--transition);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.verde { background: rgba(46,204,113,0.12); color: #27ae60; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.gris { background: var(--bg-table-stripe); color: var(--text-muted); }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); line-height: 1; }
.stat-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  margin-top: 4px;
}

/* SEARCH */
.search-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 16px;
  color: var(--text-muted);
  font-size: 0.9rem;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 12px 42px 12px 44px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-fast);
}
.search-input:focus {
  border-color: #8e44ad;
  box-shadow: 0 0 0 4px rgba(142, 68, 173, 0.12);
  background: var(--bg-card);
}
.search-clear {
  position: absolute;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-clear:hover { color: var(--danger); background: var(--bg-table-stripe); }
.search-info {
  font-size: 0.75rem;
  color: var(--text-muted);
  padding-left: 4px;
}

/* TABLA */
.table-modern {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.table-modern thead { background: var(--bg-table-stripe); }
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
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.categoria-cell { display: flex; align-items: center; gap: 12px; }
.categoria-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #8e44ad, #6c3483);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.95rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(142, 68, 173, 0.25);
}
.categoria-nombre {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.9rem;
}
.categoria-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-count {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 700;
}
.badge-count-ok { background: rgba(46,204,113,0.15); color: #27ae60; }
.badge-count-empty { background: var(--bg-table-stripe); color: var(--text-muted); }

.actions-cell {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.btn-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  transition: all var(--transition-fast);
  text-decoration: none;
}
.btn-edit:hover {
  border-color: #3498db !important;
  color: #3498db !important;
  background: rgba(52,152,219,0.08) !important;
}
.btn-delete:hover:not(:disabled) {
  border-color: #e74c3c !important;
  color: #e74c3c !important;
  background: rgba(231,76,60,0.08) !important;
}
.btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }

/* EMPTY */
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state i { font-size: 3rem; opacity: 0.35; display: block; margin-bottom: 12px; }
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 4px;
}
.empty-text { font-size: 0.85rem; margin-bottom: 16px; }
.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(142,68,173,0.1);
  border: 1px solid rgba(142,68,173,0.3);
  border-radius: var(--radius-md);
  color: #8e44ad;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.empty-action:hover { background: #8e44ad; color: #fff; }

/* SKELETON */
.skeleton-row td { padding: 16px 12px; }
.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-table-stripe) 25%, var(--border-color) 50%, var(--bg-table-stripe) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-80 { width: 80%; }
.skeleton-line.w-100 { width: 100%; }
.mx-auto { margin-left: auto; margin-right: auto; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* MODAL */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .categoria-desc { max-width: 180px; }
}
</style>