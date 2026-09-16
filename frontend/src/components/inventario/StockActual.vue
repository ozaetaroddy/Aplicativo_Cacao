<template>
  <div class="stock-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-cyan"><i class="fas fa-boxes"></i></span>
          Stock Actual
        </h1>
        <p class="page-subtitle">
          Inventario en tiempo real con alertas de stock bajo
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar inventario"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
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
          <div class="stat-value">{{ productosOk }}</div>
          <div class="stat-label">Con stock OK</div>
        </div>
      </div>
      <div class="stat-card" :class="{ 'stat-card-warning': productosBajo > 0 }">
        <div class="stat-icon naranja"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ productosBajo }}</div>
          <div class="stat-label">Stock bajo</div>
        </div>
      </div>
      <div class="stat-card" :class="{ 'stat-card-danger': productosSinStock > 0 }">
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
          placeholder="Buscar por nombre, código o categoría..."
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
        <button
          v-for="f in filtros"
          :key="f.value"
          type="button"
          class="filter-chip"
          :class="{ active: filtroStock === f.value }"
          @click="filtroStock = f.value"
        >
          <i :class="f.icon"></i>
          <span>{{ f.label }}</span>
          <span v-if="f.value === 'bajo'" class="chip-badge chip-badge-warning">
            {{ productosBajo }}
          </span>
          <span v-if="f.value === 'sin-stock'" class="chip-badge chip-badge-danger">
            {{ productosSinStock }}
          </span>
        </button>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Listado ({{ productosFiltrados.length }} de {{ productos.length }})
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th style="width:140px;">Código</th>
                <th>Producto</th>
                <th style="width:180px;">Categoría</th>
                <th style="width:100px;" class="text-end">Stock</th>
                <th style="width:100px;" class="text-end">Mínimo</th>
                <th style="width:140px;" class="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="i in 6" :key="`sk-${i}`" class="skeleton-row">
                  <td><div class="skeleton-line w-40"></div></td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-80"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 mx-auto"></div></td>
                </tr>
              </template>

              <!-- Empty -->
              <tr v-else-if="productos.length === 0">
                <td colspan="7" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-boxes"></i>
                    <div class="empty-title">No hay productos registrados</div>
                    <div class="empty-text">
                      Los productos aparecerán aquí cuando los crees
                    </div>
                    <router-link to="/productos/nuevo" class="empty-action">
                      <i class="fas fa-plus"></i> Crear producto
                    </router-link>
                  </div>
                </td>
              </tr>

              <!-- Sin resultados -->
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
              <tr v-else v-for="(prod, idx) in productosFiltrados" :key="prod._id">
                <td class="text-muted small">{{ idx + 1 }}</td>
                <td>
                  <code class="codigo-badge">{{ prod.codigo || '—' }}</code>
                </td>
                <td>
                  <div class="prod-nombre" :title="prod.nombre">{{ prod.nombre }}</div>
                </td>
                <td>
                  <span class="categoria-tag">
                    {{ obtenerCategoria(prod.categoriaId) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="stock-value" :class="claseStock(prod)">
                    {{ formatCantidad(prod.stock) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="stock-min text-muted">
                    {{ formatCantidad(prod.stock_minimo) }}
                  </span>
                </td>
                <td class="text-center">
                  <span class="badge-estado" :class="claseEstado(prod)">
                    <i :class="iconoEstado(prod)"></i>
                    {{ etiquetaEstado(prod) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ===== STATE =====
const productos = ref([])
const categorias = ref([])
const loading = ref(false)
const search = ref('')
const filtroStock = ref('')

let unmounted = false

// ===== FILTROS DISPONIBLES =====
const filtros = [
  { value: '', label: 'Todos', icon: 'fas fa-list' },
  { value: 'bajo', label: 'Stock bajo', icon: 'fas fa-exclamation-triangle' },
  { value: 'sin-stock', label: 'Sin stock', icon: 'fas fa-times-circle' }
]

// ===== COMPUTED =====
const productosOk = computed(
  () => productos.value.filter(p => !esBajo(p) && !esSinStock(p)).length
)
const productosBajo = computed(
  () => productos.value.filter(p => esBajo(p)).length
)
const productosSinStock = computed(
  () => productos.value.filter(p => esSinStock(p)).length
)

const productosFiltrados = computed(() => {
  let list = productos.value

  // Filtro por estado
  if (filtroStock.value === 'bajo') {
    list = list.filter(p => esBajo(p))
  } else if (filtroStock.value === 'sin-stock') {
    list = list.filter(p => esSinStock(p))
  }

  // Búsqueda
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return list

  return list.filter(p => {
    const nombre = String(p.nombre || '').toLowerCase()
    const codigo = String(p.codigo || '').toLowerCase()
    const cat = String(obtenerCategoria(p.categoriaId) || '').toLowerCase()
    return nombre.includes(q) || codigo.includes(q) || cat.includes(q)
  })
})

// ===== HELPERS =====
const esSinStock = (p) => (Number(p.stock) || 0) <= 0
const esBajo = (p) => {
  const stock = Number(p.stock) || 0
  const min = Number(p.stock_minimo) || 0
  return min > 0 && stock > 0 && stock <= min
}

const claseStock = (p) => {
  if (esSinStock(p)) return 'stock-danger'
  if (esBajo(p)) return 'stock-warning'
  return 'stock-ok'
}

const claseEstado = (p) => {
  if (esSinStock(p)) return 'estado-danger'
  if (esBajo(p)) return 'estado-warning'
  return 'estado-ok'
}

const iconoEstado = (p) => {
  if (esSinStock(p)) return 'fas fa-times-circle'
  if (esBajo(p)) return 'fas fa-exclamation-triangle'
  return 'fas fa-check-circle'
}

const etiquetaEstado = (p) => {
  if (esSinStock(p)) return 'Sin stock'
  if (esBajo(p)) return 'Bajo'
  return 'OK'
}

const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const obtenerCategoria = (id) => {
  if (!id) return 'Sin categoría'
  const cat = categorias.value.find(c => c._id === id)
  return cat ? cat.nombre : 'Sin categoría'
}

const limpiarFiltros = () => {
  search.value = ''
  filtroStock.value = ''
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
    if (!unmounted) toast.error('Error al cargar inventario: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(cargar)
onBeforeUnmount(() => { unmounted = true })
</script>

<style scoped>
.stock-page { display: flex; flex-direction: column; gap: 20px; }

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
.title-icon-cyan {
  background: linear-gradient(135deg, #17a2b8, #138496);
  box-shadow: 0 6px 16px rgba(23,162,184,0.3);
}
.page-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.btn-secondary:hover:not(:disabled) { border-color: #17a2b8; color: #17a2b8; }
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
  border-color: #17a2b8;
  box-shadow: 0 0 0 4px rgba(23,162,184,0.12);
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
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.filter-chip:hover { border-color: #17a2b8; color: #17a2b8; }
.filter-chip.active {
  background: linear-gradient(135deg, #17a2b8, #138496);
  color: #fff;
  border-color: transparent;
}
.chip-badge {
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: 0.65rem;
  font-weight: 800;
  min-width: 20px;
  text-align: center;
}
.chip-badge-warning { background: rgba(243,156,18,0.25); color: #d68910; }
.chip-badge-danger { background: rgba(231,76,60,0.25); color: #c0392b; }
.filter-chip.active .chip-badge { background: rgba(255,255,255,0.3); color: #fff; }

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

.codigo-badge {
  background: var(--bg-table-stripe);
  padding: 3px 10px;
  border-radius: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.prod-nombre {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.categoria-tag {
  display: inline-block;
  padding: 3px 10px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
}

.stock-value {
  font-weight: 800;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}
.stock-ok { color: var(--success); }
.stock-warning { color: #f39c12; }
.stock-danger { color: var(--danger); }
.stock-min { font-size: 0.8rem; font-variant-numeric: tabular-nums; }

.badge-estado {
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
.estado-ok { background: var(--success-bg); color: var(--success); }
.estado-warning { background: rgba(243,156,18,0.15); color: #d68910; }
.estado-danger { background: rgba(231,76,60,0.15); color: #c0392b; }

/* EMPTY */
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state i { font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 12px; }
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
  background: rgba(23,162,184,0.1);
  border: 1px solid rgba(23,162,184,0.3);
  border-radius: var(--radius-md);
  color: #17a2b8;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.empty-action:hover { background: #17a2b8; color: #fff; }

/* SKELETON */
.skeleton-row td { padding: 16px 12px; }
.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-table-stripe) 25%, var(--border-color) 50%, var(--bg-table-stripe) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.w-40 { width: 40%; }
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-80 { width: 80%; }
.skeleton-line.w-100 { width: 100%; }
.ms-auto { margin-left: auto; }
.mx-auto { margin-left: auto; margin-right: auto; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .filters-bar { flex-direction: column; align-items: stretch; }
}
</style>