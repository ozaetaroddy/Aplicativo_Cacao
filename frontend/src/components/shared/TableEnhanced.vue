<template>
  <div class="table-enhanced">
    <div class="table-toolbar d-flex flex-wrap gap-2 mb-2">
      <div class="table-search">
        <input type="text" class="form-control form-control-sm" v-model="searchQuery" placeholder="Buscar..." />
      </div>
      <div class="table-filters d-flex gap-2">
        <select v-if="filterOptions.length" class="form-select form-select-sm" v-model="activeFilter">
          <option value="">Todos</option>
          <option v-for="opt in filterOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="ms-auto">
        <span class="text-muted small">Mostrando {{ paginatedData.length }} de {{ filteredData.length }}</span>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-cacao">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key" @click="sortBy(col.key)" style="cursor:pointer;">
              {{ col.label }}
              <i v-if="sortKey === col.key" :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
              <i v-else class="fas fa-sort text-muted"></i>
            </th>
            <th v-if="actions.length" style="width:120px;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in paginatedData" :key="row._id">
            <td v-for="col in columns" :key="col.key">
              <slot :name="col.key" :row="row" :value="row[col.key]">
                {{ formatValue(row[col.key]) }}
              </slot>
            </td>
            <td v-if="actions.length">
              <button v-for="action in actions" :key="action.key"
                      class="btn btn-sm me-1" :class="action.class || 'btn-outline-primary'"
                      @click="action.handler(row)">
                <i :class="action.icon"></i>
              </button>
            </td>
          </tr>
          <tr v-if="paginatedData.length === 0">
            <td :colspan="columns.length + (actions.length ? 1 : 0)" class="text-muted text-center py-3">
              No hay datos
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-pagination d-flex justify-content-between align-items-center mt-2">
      <span class="text-muted small">Página {{ currentPage }} de {{ totalPages }}</span>
      <div class="btn-group">
        <button class="btn btn-sm btn-outline-secondary" :disabled="currentPage === 1" @click="currentPage--">
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="btn btn-sm btn-outline-secondary disabled">{{ currentPage }}</span>
        <button class="btn btn-sm btn-outline-secondary" :disabled="currentPage === totalPages" @click="currentPage++">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },
  columns: { type: Array, required: true },
  actions: { type: Array, default: () => [] },
  filterOptions: { type: Array, default: () => [] },
  filterKey: { type: String, default: '' },
  itemsPerPage: { type: Number, default: 10 }
})

const searchQuery = ref('')
const sortKey = ref('')
const sortDirection = ref('asc')
const activeFilter = ref('')
const currentPage = ref(1)

const filteredData = computed(() => {
  let result = props.data
  // Filtro de búsqueda
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(row => {
      return props.columns.some(col => {
        const val = String(row[col.key] || '').toLowerCase()
        return val.includes(q)
      })
    })
  }
  // Filtro por categoría / estado
  if (activeFilter.value && props.filterKey) {
    result = result.filter(row => row[props.filterKey] === activeFilter.value)
  }
  // Ordenamiento
  if (sortKey.value) {
    result = [...result].sort((a, b) => {
      let va = a[sortKey.value] || ''
      let vb = b[sortKey.value] || ''
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDirection.value === 'asc' ? -1 : 1
      if (va > vb) return sortDirection.value === 'asc' ? 1 : -1
      return 0
    })
  }
  return result
})

const totalPages = computed(() => Math.ceil(filteredData.value.length / props.itemsPerPage))
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * props.itemsPerPage
  return filteredData.value.slice(start, start + props.itemsPerPage)
})

const sortBy = (key) => {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDirection.value = 'asc'
  }
}

const formatValue = (val) => {
  if (val === undefined || val === null) return ''
  if (typeof val === 'object' && val !== null) {
    // Si es un objeto, intentar convertirlo a string legible
    return Object.values(val).join(' ') || '[Object]'
  }
  if (typeof val === 'number') return val.toFixed(2)
  return val
}

// Resetear página al cambiar filtros
watch([searchQuery, activeFilter], () => { currentPage.value = 1 })
</script>

<style scoped>
.table-toolbar {
  background: #f8f9fa;
  padding: 8px 12px;
  border-radius: 8px;
}
.table-search input {
  width: 200px;
}
body.dark-mode .table-toolbar {
  background: #1e2a4a;
}
</style>