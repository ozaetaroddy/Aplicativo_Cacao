<template>
  <div class="data-table-paged">
    <!-- ===== TOOLBAR ===== -->
    <div class="table-toolbar">
      <div class="toolbar-row">
        <div class="toolbar-search">
          <i class="fas fa-search"></i>
          <input
            type="text"
            class="search-input"
            v-model="searchInput"
            @input="onSearchInput"
            placeholder="Buscar..."
          />
          <button v-if="searchInput" class="clear-search" @click="searchInput = ''; onSearchInput()" title="Limpiar">
            <i class="fas fa-times-circle"></i>
          </button>
        </div>
        <div class="toolbar-dates">
          <div class="date-field">
            <label>Desde</label>
            <input type="date" v-model="desde" @change="reload" />
          </div>
          <div class="date-field">
            <label>Hasta</label>
            <input type="date" v-model="hasta" @change="reload" />
          </div>
        </div>
        <button class="btn-clear" @click="clearFilters" title="Limpiar filtros">
          <i class="fas fa-undo"></i>
          <span>Limpiar</span>
        </button>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
    <div class="table-wrapper">
      <table class="table-modern">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? `width: ${col.width}` : ''"
              :class="{ 'sortable': col.sortable }"
              @click="col.sortable && sortBy(col.key)"
            >
              <div class="th-content">
                <span>{{ col.label }}</span>
                <span v-if="col.sortable" class="sort-indicator">
                  <i v-if="sortField === col.key" :class="sortDir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                  <i v-else class="fas fa-sort"></i>
                </span>
              </div>
            </th>
            <th v-if="actions.length" style="width: 140px;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <!-- Skeleton -->
          <template v-if="loading">
            <tr v-for="n in 5" :key="`sk-${n}`" class="skeleton-row">
              <td v-for="col in columns" :key="col.key">
                <div class="skeleton-line"></div>
              </td>
              <td v-if="actions.length">
                <div class="skeleton-line short"></div>
              </td>
            </tr>
          </template>

          <!-- Sin datos -->
          <tr v-else-if="data.length === 0">
            <td :colspan="columns.length + (actions.length ? 1 : 0)" class="empty-cell">
              <div class="empty-state">
                <div class="empty-icon">
                  <i class="fas fa-inbox"></i>
                </div>
                <div class="empty-title">No hay datos para mostrar</div>
                <div class="empty-text">Intenta ajustar los filtros o agrega un nuevo registro</div>
              </div>
            </td>
          </tr>

          <!-- Datos -->
          <tr v-else v-for="row in data" :key="row._id">
            <td v-for="col in columns" :key="col.key">
              <slot :name="col.key" :row="row" :value="row[col.key]">
                {{ formatValue(row[col.key]) }}
              </slot>
            </td>
            <td v-if="actions.length">
              <div class="actions-cell">
                <button
                  v-for="action in actionsVisibles(row)"
                  :key="action.key"
                  class="action-btn"
                  :class="action.class || 'btn-outline-primary'"
                  @click="action.handler(row)"
                  :title="action.title || ''"
                >
                  <i :class="action.icon"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== PAGINACIÓN ===== -->
    <div class="table-pagination">
      <div class="pagination-info">
        <span class="pagination-count">{{ startIndex }} - {{ endIndex }}</span>
        <span class="pagination-total">de {{ total }} registros</span>
      </div>
      <div class="pagination-controls">
        <select class="limit-select" v-model.number="limit" @change="reload">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        <div class="pagination-buttons">
          <button class="page-btn" :disabled="page === 1" @click="goToPage(1)" title="Primera">
            <i class="fas fa-angle-double-left"></i>
          </button>
          <button class="page-btn" :disabled="page === 1" @click="goToPage(page - 1)" title="Anterior">
            <i class="fas fa-angle-left"></i>
          </button>
          <span class="page-info">{{ page }} / {{ totalPages || 1 }}</span>
          <button class="page-btn" :disabled="page >= totalPages" @click="goToPage(page + 1)" title="Siguiente">
            <i class="fas fa-angle-right"></i>
          </button>
          <button class="page-btn" :disabled="page >= totalPages" @click="goToPage(totalPages)" title="Última">
            <i class="fas fa-angle-double-right"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const props = defineProps({
  endpoint: { type: String, required: true },
  columns: { type: Array, required: true },
  actions: { type: Array, default: () => [] },
  defaultLimit: { type: Number, default: 20 },
  defaultSort: { type: String, default: '' },
  defaultSortDir: { type: String, default: 'desc' },
  extraQuery: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['loaded'])
const toast = useToast()

const data = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(props.defaultLimit)
const totalPages = ref(1)
const loading = ref(false)

const searchInput = ref('')
const search = ref('')
const desde = ref('')
const hasta = ref('')
const sortField = ref(props.defaultSort)
const sortDir = ref(props.defaultSortDir)

let searchTimer = null

const startIndex = computed(() => total.value === 0 ? 0 : (page.value - 1) * limit.value + 1)
const endIndex = computed(() => Math.min(page.value * limit.value, total.value))

const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = searchInput.value
    page.value = 1
    cargar()
  }, 400)
}

const sortBy = (field) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
  cargar()
}

const goToPage = (p) => {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  cargar()
}

const clearFilters = () => {
  searchInput.value = ''
  search.value = ''
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
    if (desde.value) params.set('desde', desde.value)
    if (hasta.value) params.set('hasta', hasta.value)
    if (sortField.value) {
      params.set('sortBy', sortField.value)
      params.set('sortDir', sortDir.value)
    }
    Object.entries(props.extraQuery).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v)
    })

    const url = `${props.endpoint}?${params.toString()}`
    const response = await api.request(url, { method: 'GET' })

    if (Array.isArray(response)) {
      data.value = response
      total.value = response.length
      totalPages.value = 1
    } else {
      data.value = response.data || []
      total.value = response.total || 0
      totalPages.value = response.totalPages || 1
    }
    emit('loaded', data.value)
  } catch (e) {
    console.error('Error cargando datos:', e)
    toast.error('Error al cargar datos: ' + e.message)
  } finally {
    loading.value = false
  }
}

const reload = () => {
  page.value = 1
  cargar()
}

const formatValue = (val) => {
  if (val === undefined || val === null) return ''
  if (typeof val === 'object') return Object.values(val).join(' ') || '[Object]'
  if (typeof val === 'number') return val.toFixed(2)
  return val
}

const actionsVisibles = (row) => {
  return props.actions.filter(a => !a.condition || a.condition(row))
}

onMounted(cargar)
defineExpose({ reload, cargar })
</script>

<style scoped>
.data-table-paged {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== TOOLBAR ===== */
.table-toolbar {
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.toolbar-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.toolbar-search {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 400px;
}
.toolbar-search i.fa-search {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.9rem;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 10px 40px 10px 40px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  color: var(--text-primary);
  transition: all var(--transition-fast);
  outline: none;
  font-family: inherit;
}
.search-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--shadow-focus);
}
.clear-search {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  transition: color var(--transition-fast);
}
.clear-search:hover {
  color: var(--danger);
}

.toolbar-dates {
  display: flex;
  gap: 10px;
}

.date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.date-field label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.date-field input {
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--text-primary);
  font-family: inherit;
  transition: all var(--transition-fast);
}
.date-field input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--shadow-focus);
}

.btn-clear {
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
  font-family: inherit;
  height: 40px;
}
.btn-clear:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg);
}

/* ===== TABLA ===== */
.table-wrapper {
  overflow-x: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.table-modern {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.table-modern thead {
  background: var(--bg-table-stripe);
  position: sticky;
  top: 0;
  z-index: 5;
}

.table-modern th {
  padding: 12px 14px;
  text-align: left;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}
.table-modern th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast);
}
.table-modern th.sortable:hover {
  color: var(--primary-color);
}

.th-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sort-indicator {
  color: var(--border-strong);
  font-size: 0.7rem;
  transition: color var(--transition-fast);
}
.table-modern th.sortable:hover .sort-indicator,
.table-modern th.sortable .sort-indicator i:not(.fa-sort) {
  color: var(--primary-color);
}

.table-modern td {
  padding: 14px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.table-modern tbody tr {
  transition: background var(--transition-fast);
}
.table-modern tbody tr:hover {
  background: var(--bg-table-stripe);
}
.table-modern tbody tr:last-child td {
  border-bottom: none;
}

/* ===== SKELETON ===== */
.skeleton-row td {
  padding: 16px 14px;
}
.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, var(--border-light) 25%, var(--bg-table-stripe) 50%, var(--border-light) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-xs);
}
.skeleton-line.short {
  width: 60%;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ===== EMPTY ===== */
.empty-cell {
  padding: 0 !important;
}
.empty-state {
  text-align: center;
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-table-stripe);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1.8rem;
  margin-bottom: 4px;
}
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
}
.empty-text {
  font-size: 0.82rem;
  color: var(--text-muted);
  max-width: 320px;
}

/* ===== ACCIONES ===== */
.actions-cell {
  display: flex;
  gap: 4px;
  justify-content: flex-start;
  flex-wrap: wrap;
}
.action-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: var(--radius-sm);
  border-width: 1.5px;
  border-style: solid;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* ===== PAGINACIÓN ===== */
.table-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 4px 2px;
}

.pagination-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.82rem;
}
.pagination-count {
  font-weight: 700;
  color: var(--text-primary);
}
.pagination-total {
  color: var(--text-muted);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.limit-select {
  padding: 6px 10px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast);
}
.limit-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.pagination-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-btn {
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
  font-size: 0.8rem;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--info-bg);
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  padding: 0 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  .toolbar-row {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-search {
    max-width: 100%;
  }
  .toolbar-dates {
    flex-direction: column;
  }
  .btn-clear {
    justify-content: center;
  }
  .table-modern {
    font-size: 0.78rem;
  }
  .table-modern th,
  .table-modern td {
    padding: 10px 8px;
  }
  .table-pagination {
    flex-direction: column;
    align-items: stretch;
  }
  .pagination-controls {
    justify-content: space-between;
  }
}
</style>