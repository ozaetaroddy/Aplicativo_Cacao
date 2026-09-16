<template>
  <div class="table-enhanced">
    <!-- ===== TOOLBAR ===== -->
    <div class="table-toolbar">
      <div class="table-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="text"
          class="form-control form-control-sm"
          v-model="searchInput"
          @input="onSearchInput"
          :placeholder="searchPlaceholder"
          :aria-label="searchPlaceholder"
        />
        <button
          v-if="searchInput"
          type="button"
          class="clear-search"
          @click="limpiarBusqueda"
          title="Limpiar búsqueda"
          aria-label="Limpiar búsqueda"
        >
          <i class="fas fa-times-circle"></i>
        </button>
      </div>

      <div class="table-filters">
        <select
          v-if="filterOptions.length"
          class="form-select form-select-sm"
          v-model="activeFilter"
          aria-label="Filtrar"
        >
          <option value="">Todos</option>
          <option v-for="opt in filterOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="ms-auto table-counter">
        <span class="text-muted small">
          Mostrando {{ paginatedData.length }} de {{ filteredData.length }}
        </span>
      </div>
    </div>

    <!-- ===== TABLA ===== -->
    <div class="table-responsive">
      <table class="table table-cacao">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? `width: ${col.width}` : ''"
              :class="{ sortable: col.sortable !== false }"
              :aria-sort="getAriaSort(col)"
              :tabindex="col.sortable !== false ? 0 : -1"
              @click="onHeaderClick(col)"
              @keydown.enter.prevent="onHeaderClick(col)"
              @keydown.space.prevent="onHeaderClick(col)"
            >
              <span class="th-content">
                <span>{{ col.label }}</span>
                <i
                  v-if="col.sortable !== false"
                  :class="iconoSort(col.key)"
                  aria-hidden="true"
                ></i>
              </span>
            </th>
            <th v-if="actions.length" style="width: 120px;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in paginatedData"
            :key="getRowKey(row, idx)"
            class="table-row"
            @click="emit('row-click', row)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              :style="col.align ? `text-align: ${col.align}` : ''"
            >
              <slot :name="col.key" :row="row" :value="row[col.key]">
                {{ formatValue(row[col.key], col) }}
              </slot>
            </td>
            <td v-if="actions.length">
              <div class="actions-cell">
                <button
                  v-for="action in actions"
                  :key="action.key"
                  type="button"
                  class="btn btn-sm action-btn"
                  :class="action.class || 'btn-outline-primary'"
                  :title="action.title || ''"
                  :aria-label="action.title || 'Acción'"
                  @click.stop="action.handler(row)"
                >
                  <i :class="action.icon" aria-hidden="true"></i>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="paginatedData.length === 0">
            <td
              :colspan="columns.length + (actions.length ? 1 : 0)"
              class="empty-cell"
            >
              <div class="empty-state">
                <i class="fas fa-inbox" aria-hidden="true"></i>
                <span>{{ emptyText }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== PAGINACIÓN ===== -->
    <div class="table-pagination">
      <span class="text-muted small">
        Página {{ currentPage }} de {{ totalPages }}
      </span>
      <div class="btn-group" role="group" aria-label="Paginación">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :disabled="currentPage === 1"
          @click="goToPage(1)"
          title="Primera página"
          aria-label="Primera página"
        >
          <i class="fas fa-angle-double-left"></i>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
          title="Página anterior"
          aria-label="Página anterior"
        >
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="btn btn-sm btn-outline-secondary disabled page-number" aria-current="page">
          {{ currentPage }}
        </span>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :disabled="currentPage >= totalPages"
          @click="goToPage(currentPage + 1)"
          title="Página siguiente"
          aria-label="Página siguiente"
        >
          <i class="fas fa-chevron-right"></i>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          :disabled="currentPage >= totalPages"
          @click="goToPage(totalPages)"
          title="Última página"
          aria-label="Última página"
        >
          <i class="fas fa-angle-double-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  actions: { type: Array, default: () => [] },
  filterOptions: { type: Array, default: () => [] },
  filterKey: { type: String, default: '' },
  itemsPerPage: { type: Number, default: 10 },
  rowKey: { type: String, default: '_id' },
  searchPlaceholder: { type: String, default: 'Buscar…' },
  emptyText: { type: String, default: 'No hay datos para mostrar' },
  searchDebounceMs: { type: Number, default: 250 }
})

const emit = defineEmits(['row-click', 'sort-change', 'page-change'])

// ===== STATE =====
const searchInput = ref('')     // valor inmediato del input
const searchQuery = ref('')     // valor debounced usado en filtrado
const sortKey = ref('')
const sortDirection = ref('asc')
const activeFilter = ref('')
const currentPage = ref(1)

let searchTimer = null
let unmounted = false

// ===== BÚSQUEDA CON DEBOUNCE =====
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (unmounted) return
    searchQuery.value = searchInput.value
    currentPage.value = 1
  }, Math.max(0, props.searchDebounceMs))
}

const limpiarBusqueda = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  searchInput.value = ''
  searchQuery.value = ''
  currentPage.value = 1
}

// ===== FILTRADO =====
const filteredData = computed(() => {
  let result = Array.isArray(props.data) ? props.data : []

  // Búsqueda de texto (case-insensitive, sobre todas las columnas)
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter(row =>
      props.columns.some(col => {
        const val = row?.[col.key]
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(q)
      })
    )
  }

  // Filtro por columna
  if (activeFilter.value && props.filterKey) {
    result = result.filter(row => row?.[props.filterKey] === activeFilter.value)
  }

  // Ordenamiento (nulls al final, siempre)
  if (sortKey.value) {
    const dir = sortDirection.value === 'asc' ? 1 : -1
    result = [...result].sort((a, b) => {
      let va = a?.[sortKey.value]
      let vb = b?.[sortKey.value]

      const vaNull = va === null || va === undefined || va === ''
      const vbNull = vb === null || vb === undefined || vb === ''
      if (vaNull && vbNull) return 0
      if (vaNull) return 1
      if (vbNull) return -1

      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()

      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }

  return result
})

// ===== PAGINACIÓN =====
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredData.value.length / Math.max(1, props.itemsPerPage)))
)

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * props.itemsPerPage
  return filteredData.value.slice(start, start + props.itemsPerPage)
})

// Clamp de página si el dataset se reduce (por filtro o cambio de props)
watch(
  () => [filteredData.value.length, props.itemsPerPage],
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  }
)

// Reset page cuando cambia el filtro
watch(activeFilter, () => { currentPage.value = 1 })

// ===== ORDENAMIENTO =====
const onHeaderClick = (col) => {
  if (col.sortable === false) return
  if (sortKey.value === col.key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = col.key
    sortDirection.value = 'asc'
  }
  emit('sort-change', { key: sortKey.value, direction: sortDirection.value })
}

const iconoSort = (key) => {
  if (sortKey.value !== key) return 'fas fa-sort text-muted sort-icon'
  return sortDirection.value === 'asc'
    ? 'fas fa-sort-up sort-icon active'
    : 'fas fa-sort-down sort-icon active'
}

const getAriaSort = (col) => {
  if (col.sortable === false) return undefined
  if (sortKey.value !== col.key) return 'none'
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}

// ===== FORMATO =====
/**
 * Formatea el valor por defecto de una celda.
 *
 * Personalización por columna:
 *   col.formatter(val) → string      (función custom, tiene prioridad)
 *   col.format = 'currency' | 'integer' | 'raw'
 *
 * Por compatibilidad, si no se indica `format` los números se muestran
 * con 2 decimales (comportamiento histórico).
 */
const formatValue = (val, col = {}) => {
  if (val === null || val === undefined) return ''

  if (typeof col.formatter === 'function') {
    try {
      const r = col.formatter(val)
      return r === null || r === undefined ? '' : String(r)
    } catch {
      // Cae al default
    }
  }

  if (val instanceof Date) return val.toLocaleDateString('es-EC')
  if (Array.isArray(val)) return val.join(', ')

  if (typeof val === 'object') {
    const escalares = Object.values(val).filter(
      v => v !== null && v !== undefined && typeof v !== 'object'
    )
    return escalares.join(' ') || '[objeto]'
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return ''
    switch (col.format) {
      case 'integer': return String(Math.trunc(val))
      case 'raw': return String(val)
      case 'currency': return val.toFixed(2)
      default: return val.toFixed(2)
    }
  }

  return String(val)
}

// ===== ROW KEY =====
const getRowKey = (row, idx) => {
  const k = row?.[props.rowKey]
  if (k !== undefined && k !== null) return String(k)
  return `__row-${idx}`
}

// ===== NAVEGACIÓN =====
const goToPage = (p) => {
  const next = Math.min(Math.max(1, p), totalPages.value)
  if (next === currentPage.value) return
  currentPage.value = next
  emit('page-change', next)
}

// ===== CLEANUP =====
onBeforeUnmount(() => {
  unmounted = true
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})
</script>

<style scoped>
.table-enhanced {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== TOOLBAR ===== */
.table-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  background: var(--bg-table-stripe);
  padding: 10px 14px;
  border-radius: 8px;
  transition: var(--transition);
}

.table-search {
  position: relative;
  display: flex;
  align-items: center;
}
.table-search > i {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
  font-size: 0.8rem;
  z-index: 1;
}
.table-search .form-control {
  padding-left: 30px;
  padding-right: 30px;
  min-width: 220px;
}
.clear-search {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: color var(--transition-fast);
  z-index: 1;
}
.clear-search:hover { color: var(--danger); }

.table-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.table-counter { white-space: nowrap; }

/* ===== TABLA ===== */
.table-cacao th.sortable {
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}
.table-cacao th.sortable:hover,
.table-cacao th.sortable:focus-visible {
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  outline: none;
}

.th-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sort-icon {
  font-size: 0.75em;
  transition: color var(--transition-fast);
}
.sort-icon.active { color: var(--primary-color); }

.table-row { cursor: default; }
.table-row:hover { background: var(--bg-table-stripe); }

.actions-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.action-btn {
  padding: 3px 8px;
  font-size: 0.75rem;
  line-height: 1;
}

.empty-cell { padding: 0 !important; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--text-muted);
}
.empty-state i { font-size: 1.8rem; opacity: 0.5; }

/* ===== PAGINACIÓN ===== */
.table-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.page-number { min-width: 40px; text-align: center; }

/* ===== RESPONSIVE ===== */
@media (max-width: 640px) {
  .table-search { width: 100%; }
  .table-search .form-control { min-width: 100%; width: 100%; }
  .table-counter { width: 100%; text-align: right; }
}
</style>