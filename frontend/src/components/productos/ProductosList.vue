<template>
  <div class="productos-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-amber"><i class="fas fa-boxes"></i></span>
          Productos
        </h1>
        <p class="page-subtitle">
          Catálogo de productos, precios e inventario
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
        <router-link to="/productos/nuevo" class="btn-primary">
          <i class="fas fa-plus"></i>
          Nuevo producto
        </router-link>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-boxes"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ productos.length }}</div>
          <div class="stat-label">Total productos</div>
        </div>
      </div>
      <div class="stat-card stat-card-success">
        <div class="stat-icon verde"><i class="fas fa-check-circle"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ productosConStock }}</div>
          <div class="stat-label">Con stock</div>
        </div>
      </div>
      <div
        class="stat-card"
        :class="{ 'stat-card-warning': productosStockBajo > 0 }"
      >
        <div class="stat-icon naranja"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ productosStockBajo }}</div>
          <div class="stat-label">Stock bajo</div>
        </div>
      </div>
      <div
        class="stat-card"
        :class="{ 'stat-card-danger': productosSinStock > 0 }"
      >
        <div class="stat-icon rojo"><i class="fas fa-times-circle"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ productosSinStock }}</div>
          <div class="stat-label">Sin stock</div>
        </div>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="filters-bar">
      <div class="search-wrapper">
        <i class="fas fa-search search-icon"></i>
        <input
          type="text"
          class="search-input"
          v-model="search"
          placeholder="Buscar por nombre, código o código de barras..."
          aria-label="Buscar productos"
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
      <div class="filter-chips">
        <select
          class="filter-select"
          v-model="categoriaFiltro"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          <option v-for="c in categorias" :key="c._id" :value="c._id">
            {{ c.nombre }}
          </option>
        </select>
        <select
          class="filter-select"
          v-model="estadoFiltro"
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="activo">Solo activos</option>
          <option value="inactivo">Solo inactivos</option>
        </select>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Listado
          <span class="header-count">{{ productosFiltrados.length }}</span>
        </div>
        <div v-if="hayFiltros" class="header-tools">
          <button
            type="button"
            class="btn-clear-filters"
            @click="limpiarFiltros"
          >
            <i class="fas fa-times-circle"></i> Limpiar filtros
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:140px;">Código</th>
                <th>Producto</th>
                <th style="width:150px;">Categoría</th>
                <th style="width:110px;" class="text-end">P. Compra</th>
                <th style="width:110px;" class="text-end">P. Venta</th>
                <th style="width:130px;" class="text-center">Stock</th>
                <th style="width:130px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="i in 6" :key="`sk-${i}`" class="skeleton-row">
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 mx-auto"></div></td>
                  <td><div class="skeleton-line w-80 mx-auto"></div></td>
                </tr>
              </template>

              <!-- Empty (sin datos) -->
              <tr v-else-if="productos.length === 0">
                <td colspan="7" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-boxes"></i>
                    <div class="empty-title">Aún no hay productos</div>
                    <div class="empty-text">
                      Crea tu primer producto para empezar a facturar
                    </div>
                    <router-link to="/productos/nuevo" class="empty-action">
                      <i class="fas fa-plus"></i> Crear producto
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Empty (con filtros) -->
              <tr v-else-if="productosFiltrados.length === 0">
                <td colspan="7" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <div class="empty-title">Sin resultados</div>
                    <div class="empty-text">
                      No hay productos que coincidan con los filtros aplicados
                    </div>
                    <button class="empty-action" @click="limpiarFiltros">
                      <i class="fas fa-times"></i> Limpiar filtros
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Datos -->
              <tr
                v-else
                v-for="p in productosFiltrados"
                :key="p._id"
                :class="{ 'row-inactivo': p.estado === 'inactivo' }"
              >
                <td>
                  <code class="codigo-badge">{{ p.codigo || '—' }}</code>
                </td>
                <td>
                  <div class="prod-cell">
                    <div class="prod-avatar" :class="{ inactivo: p.estado === 'inactivo' }">
                      {{ inicial(p.nombre) }}
                    </div>
                    <div class="prod-info">
                      <div class="prod-nombre" :title="p.nombre">
                        {{ p.nombre }}
                        <span v-if="p.estado === 'inactivo'" class="badge-inactivo">
                          Inactivo
                        </span>
                      </div>
                      <div v-if="p.codigo_barras" class="prod-barcode">
                        <i class="fas fa-barcode"></i> {{ p.codigo_barras }}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="categoria-tag">
                    {{ obtenerCategoria(p.categoriaId) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="money-num money-compra">
                    {{ formatCurrency(p.precio_compra) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="money-num money-venta">
                    {{ formatCurrency(p.precio_venta) }}
                  </span>
                </td>
                <td class="text-center">
                  <span class="badge-stock" :class="claseStock(p)">
                    <i :class="iconoStock(p)"></i>
                    {{ formatCantidad(p.stock) }}
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <router-link
                      :to="`/productos/editar/${p._id}`"
                      class="btn-icon btn-edit"
                      title="Editar producto"
                      :aria-label="`Editar ${p.nombre}`"
                    >
                      <i class="fas fa-edit"></i>
                    </router-link>
                    <button
                      class="btn-icon btn-delete"
                      @click="pedirEliminar(p)"
                      :disabled="eliminandoId === p._id"
                      title="Eliminar producto"
                      :aria-label="`Eliminar ${p.nombre}`"
                    >
                      <i
                        class="fas fa-trash"
                        :class="{ 'fa-spin': eliminandoId === p._id }"
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
      id="modalConfirmProducto"
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
import { formatCurrency } from '../../utils/formatters'

const toast = useToast()

// ===== STATE =====
const productos = ref([])
const categorias = ref([])
const loading = ref(false)
const search = ref('')
const categoriaFiltro = ref('')
const estadoFiltro = ref('')
const eliminandoId = ref(null)

// Modales
let modalConfirm = null
let unmounted = false

// Confirm state
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
const productosConStock = computed(
  () => productos.value.filter(p => (Number(p.stock) || 0) > 0).length
)
const productosStockBajo = computed(
  () => productos.value.filter(p => esBajo(p)).length
)
const productosSinStock = computed(
  () => productos.value.filter(p => (Number(p.stock) || 0) <= 0).length
)

const hayFiltros = computed(
  () => Boolean(search.value || categoriaFiltro.value || estadoFiltro.value)
)

const productosFiltrados = computed(() => {
  let list = productos.value

  if (categoriaFiltro.value) {
    list = list.filter(p => p.categoriaId === categoriaFiltro.value)
  }
  if (estadoFiltro.value) {
    list = list.filter(p => (p.estado || 'activo') === estadoFiltro.value)
  }

  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return list

  return list.filter(p => {
    const nombre = String(p.nombre || '').toLowerCase()
    const codigo = String(p.codigo || '').toLowerCase()
    const barcode = String(p.codigo_barras || '').toLowerCase()
    return nombre.includes(q) || codigo.includes(q) || barcode.includes(q)
  })
})

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const esBajo = (p) => {
  const stock = Number(p.stock) || 0
  const min = Number(p.stock_minimo) || 0
  return min > 0 && stock > 0 && stock <= min
}

const esSinStock = (p) => (Number(p.stock) || 0) <= 0

const claseStock = (p) => {
  if (esSinStock(p)) return 'stock-danger'
  if (esBajo(p)) return 'stock-warning'
  return 'stock-ok'
}

const iconoStock = (p) => {
  if (esSinStock(p)) return 'fas fa-times-circle'
  if (esBajo(p)) return 'fas fa-exclamation-triangle'
  return 'fas fa-check-circle'
}

const obtenerCategoria = (id) => {
  if (!id) return 'Sin categoría'
  const cat = categorias.value.find(c => c._id === id)
  return cat ? cat.nombre : 'Sin categoría'
}

const limpiarFiltros = () => {
  search.value = ''
  categoriaFiltro.value = ''
  estadoFiltro.value = ''
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
      modalConfirm = new Modal(document.getElementById('modalConfirmProducto'), {
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
    const [prodsRes, catsRes] = await Promise.allSettled([
      api.request('/productos?limit=5000&sortBy=nombre&sortDir=asc', {
        method: 'GET',
        skipLoader: true
      }),
      api.request('/categorias', { method: 'GET', skipLoader: true })
    ])
    if (unmounted) return

    const extraer = (r) => {
      if (r.status !== 'fulfilled') return []
      const v = r.value
      return Array.isArray(v) ? v : (v?.data || [])
    }

    productos.value = extraer(prodsRes)
    categorias.value = extraer(catsRes)
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar productos: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== ELIMINAR =====
const pedirEliminar = async (p) => {
  if (eliminandoId.value === p._id) return

  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar producto',
    mensaje: `¿Eliminar el producto "${p.nombre}"?`,
    detalle:
      'Si el producto tiene movimientos de kardex, se marcará como inactivo ' +
      'en lugar de eliminarse para preservar el historial.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado || unmounted) return

  eliminandoId.value = p._id
  try {
    const res = await api.request(`/productos/${p._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando...'
    })
    if (unmounted) return

    // El backend puede responder con `softDeleted: true`
    if (res?.softDeleted) {
      toast.info(res.message || 'Producto desactivado (conserva historial)')
    } else {
      toast.success('Producto eliminado')
    }
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'PRODUCTO_NOT_FOUND') {
      toast.error('El producto ya no existe')
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
.productos-page {
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
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}
.title-icon-amber {
  background: linear-gradient(135deg, #f39c12, #d68910);
  box-shadow: 0 6px 16px rgba(243,156,18,0.3);
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
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  box-shadow: 0 4px 12px rgba(243,156,18,0.3);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(243,156,18,0.4);
  color: #fff;
}
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #f39c12; color: #f39c12; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

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
  border-left: 4px solid transparent;
  transition: all var(--transition);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-success { border-left-color: #27ae60; }
.stat-card-warning { border-left-color: #f39c12; background: rgba(243,156,18,0.04); }
.stat-card-danger { border-left-color: #e74c3c; background: rgba(231,76,60,0.04); }

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
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }

.stat-info { flex: 1; min-width: 0; }
.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  margin-top: 4px;
}

/* FILTROS */
.filters-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}
.search-wrapper { position: relative; flex: 1; min-width: 240px; }
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 10px 40px 10px 40px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-fast);
}
.search-input:focus {
  border-color: #f39c12;
  box-shadow: 0 0 0 4px rgba(243,156,18,0.12);
  background: var(--bg-card);
}
.search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
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

.filter-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-select {
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.82rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: all var(--transition-fast);
}
.filter-select:focus { border-color: #f39c12; box-shadow: 0 0 0 3px rgba(243,156,18,0.12); }

/* CARD HEADER */
.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.header-count {
  margin-left: 6px;
  padding: 2px 10px;
  background: rgba(243,156,18,0.15);
  color: #d68910;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 800;
}
.header-tools { display: flex; gap: 8px; }
.btn-clear-filters {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(231,76,60,0.08);
  border: 1px solid rgba(231,76,60,0.3);
  border-radius: var(--radius-md);
  color: #c0392b;
  font-weight: 600;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.btn-clear-filters:hover { background: #e74c3c; color: #fff; }

/* TABLA */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
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
.row-inactivo { opacity: 0.7; }

.codigo-badge {
  background: var(--bg-table-stripe);
  padding: 3px 10px;
  border-radius: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.prod-cell { display: flex; align-items: center; gap: 12px; min-width: 0; }
.prod-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(243,156,18,0.25);
}
.prod-avatar.inactivo {
  background: linear-gradient(135deg, #95a5a6, #7f8c8d);
  box-shadow: none;
}
.prod-info { min-width: 0; flex: 1; }
.prod-nombre {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.88rem;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge-inactivo {
  padding: 2px 8px;
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  border-radius: var(--radius-full);
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.prod-barcode {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  margin-top: 2px;
}
.prod-barcode i { margin-right: 4px; opacity: 0.6; }

.categoria-tag {
  display: inline-block;
  padding: 3px 10px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
}

.money-num {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.85rem;
}
.money-compra { color: #7f8c8d; }
.money-venta { color: #16a085; }

.badge-stock {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.stock-ok { background: var(--success-bg); color: var(--success); }
.stock-warning { background: rgba(243,156,18,0.15); color: #d68910; }
.stock-danger { background: rgba(231,76,60,0.15); color: #c0392b; }

.actions-cell { display: flex; gap: 6px; justify-content: center; }
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
  background: rgba(243,156,18,0.1);
  border: 1px solid rgba(243,156,18,0.3);
  border-radius: var(--radius-md);
  color: #d68910;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.empty-action:hover { background: #f39c12; color: #fff; border-color: #f39c12; }

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
.ms-auto { margin-left: auto; }
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
  .filters-bar { flex-direction: column; align-items: stretch; }
  .search-wrapper { min-width: 0; }
  .prod-nombre { max-width: 160px; }
}
</style>