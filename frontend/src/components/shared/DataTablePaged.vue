<template>
  <div class="data-table-paged">
    <!-- Toolbar -->
    <div class="table-toolbar">
      <div class="row g-2 align-items-end">
        <div class="col-md-4">
          <label class="form-label small mb-1">Buscar</label>
          <div class="position-relative">
            <i class="fas fa-search search-icon"></i>
            <input
              type="text"
              class="form-control form-control-sm ps-4"
              v-model="searchInput"
              @input="onSearchInput"
              placeholder="Buscar..."
            />
          </div>
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">Desde</label>
          <input type="date" class="form-control form-control-sm" v-model="desde" @change="reload" />
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">Hasta</label>
          <input type="date" class="form-control form-control-sm" v-model="hasta" @change="reload" />
        </div>
        <div class="col-md-2 text-end">
          <button class="btn btn-sm btn-outline-secondary" @click="clearFilters" title="Limpiar filtros">
            <i class="fas fa-undo"></i> Limpiar
          </button>
        </div>
      </div>
    </div>

    <!-- Tabla -->
    <div class="table-responsive">
      <table class="table table-cacao">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? `width: ${col.width}` : ''"
              :class="{ 'sortable': col.sortable }"
              @click="col.sortable && sortBy(col.key)"
            >
              {{ col.label }}
              <i v-if="col.sortable && sortField === col.key" :class="sortDir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
              <i v-else-if="col.sortable" class="fas fa-sort text-muted"></i>
            </th>
            <th v-if="actions.length" style="width:140px;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td :colspan="columns.length + (actions.length ? 1 : 0)" class="text-center py-4">
              <i class="fas fa-spinner fa-spin"></i> Cargando...
            </td>
          </tr>
          <tr v-else-if="data.length === 0">
            <td :colspan="columns.length + (actions.length ? 1 : 0)" class="text-center text-muted py-4">
              No hay datos
            </td>
          </tr>
          <tr v-else v-for="row in data" :key="row._id">
            <td v-for="col in columns" :key="col.key">
              <slot :name="col.key" :row="row" :value="row[col.key]">
                {{ formatValue(row[col.key]) }}
              </slot>
            </td>
            <td v-if="actions.length">
              <button v-for="action in actions" :key="action.key"
                      class="btn btn-sm me-1" :class="action.class || 'btn-outline-primary'"
                      @click="action.handler(row)" :title="action.title || ''">
                <i :class="action.icon"></i>
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
        <select class="form-select form-select-sm" style="width: auto;" v-model.number="limit" @change="reload">
          <option :value="10">10 / pág</option>
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

onMounted(cargar)
defineExpose({ reload, cargar })
</script>

<style scoped>
.table-toolbar {
  background: var(--bg-table-stripe);
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.8rem;
}
th.sortable {
  cursor: pointer;
  user-select: none;
}
th.sortable:hover {
  color: var(--primary-color);
}
.pagination .page-link {
  color: var(--text-primary);
  background: var(--bg-card);
  border-color: var(--border-color);
  cursor: pointer;
}
.pagination .page-item.active .page-link {
  background: var(--primary-color);
  border-color: var(--primary-color);
}
.pagination .page-item.disabled .page-link {
  opacity: 0.5;
}
</style>