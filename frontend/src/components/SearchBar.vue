<template>
  <div class="search-container" ref="container">
    <div class="search-input-wrapper">
      <i class="fas fa-search search-icon" aria-hidden="true"></i>
      <input
        ref="searchInput"
        type="text"
        class="search-input"
        v-model="query"
        @input="onInput"
        @focus="showResults = true"
        @keydown.down.prevent="moverSeleccion(1)"
        @keydown.up.prevent="moverSeleccion(-1)"
        @keydown.enter.prevent="seleccionarActual"
        @keydown.escape="cerrarTodo"
        placeholder="Buscar productos, clientes, facturas…"
        aria-label="Búsqueda global"
        autocomplete="off"
        role="combobox"
        :aria-expanded="showResults && hasResults ? 'true' : 'false'"
        aria-controls="global-search-results"
      />
      <button
        v-if="query"
        type="button"
        class="clear-btn"
        @click="clearSearch"
        aria-label="Limpiar búsqueda"
      >
        <i class="fas fa-times-circle" aria-hidden="true"></i>
      </button>
      <kbd v-else class="search-kbd">Ctrl K</kbd>
    </div>

    <transition name="fade">
      <div
        v-if="showResults && (query.length >= 2 || cargando)"
        id="global-search-results"
        class="search-results"
        role="listbox"
      >
        <!-- Cargando -->
        <div v-if="cargando" class="search-loading">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Buscando…</span>
        </div>

        <!-- Sin resultados -->
        <div v-else-if="results.length === 0" class="no-results">
          <i class="fas fa-search-minus" aria-hidden="true"></i>
          No se encontraron resultados para "<strong>{{ query }}</strong>"
        </div>

        <!-- Resultados -->
        <template v-else>
          <div
            v-for="(result, idx) in results"
            :key="result.id + ':' + idx"
            class="result-item"
            :class="{ 'result-selected': idx === seleccionIndex }"
            role="option"
            :aria-selected="idx === seleccionIndex ? 'true' : 'false'"
            @mousedown.prevent="navigateTo(result)"
            @mouseenter="seleccionIndex = idx"
          >
            <div class="result-icon" :class="`result-icon-${result.tipoKey}`">
              <i :class="result.icon" aria-hidden="true"></i>
            </div>
            <div class="result-content">
              <div class="result-title">{{ result.title }}</div>
              <div class="result-subtitle">{{ result.subtitle }}</div>
            </div>
            <span class="result-badge" :class="`badge-${result.tipoKey}`">
              {{ result.tipo }}
            </span>
          </div>

          <div v-if="resultadosOcultos > 0" class="result-more">
            … y {{ resultadosOcultos }} resultado(s) más
          </div>
        </template>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'

const router = useRouter()

// ===== CONSTANTES =====
const DEBOUNCE_MS = 300
const MIN_CHARS = 2
const MAX_POR_TIPO = 4
const MAX_TOTAL = 10

// ===== STATE =====
const query = ref('')
const showResults = ref(false)
const cargando = ref(false)
const results = ref([])
const seleccionIndex = ref(0)

const searchInput = ref(null)
const container = ref(null)

let debounceTimer = null
let abortController = null
let unmounted = false

// ===== COMPUTED =====
const hasResults = computed(() => results.value.length > 0)
const resultadosOcultos = computed(() =>
  results.value.filter((r) => r._hidden).length
)

// ===== HELPERS =====
const formatMonto = (n) => {
  const v = Number(n)
  return Number.isFinite(v) ? v.toFixed(2) : '0.00'
}

const getInitials = (s) => {
  if (!s || typeof s !== 'string') return '?'
  return s.trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?'
}

const norm = (v) => String(v || '').toLowerCase()

// ===== BÚSQUEDA =====
const onInput = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  seleccionIndex.value = 0

  if (query.value.trim().length < MIN_CHARS) {
    results.value = []
    cargando.value = false
    return
  }

  debounceTimer = setTimeout(() => buscar(), DEBOUNCE_MS)
}

const buscar = async () => {
  const q = query.value.trim()
  if (q.length < MIN_CHARS) return

  // Cancelar request anterior
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
  }
  abortController = new AbortController()

  cargando.value = true

  try {
    // 4 requests paralelas con límites pequeños
    const [clientes, productos, ventas, compras] = await Promise.allSettled([
      api.request(
        `/clientes?search=${encodeURIComponent(q)}&limit=${MAX_POR_TIPO}`,
        { method: 'GET', skipLoader: true, signal: abortController.signal }
      ),
      api.request(
        `/productos?search=${encodeURIComponent(q)}&limit=${MAX_POR_TIPO}`,
        { method: 'GET', skipLoader: true, signal: abortController.signal }
      ),
      api.request(
        `/ventas?search=${encodeURIComponent(q)}&limit=${MAX_POR_TIPO}`,
        { method: 'GET', skipLoader: true, signal: abortController.signal }
      ),
      api.request(
        `/compras?search=${encodeURIComponent(q)}&limit=${MAX_POR_TIPO}`,
        { method: 'GET', skipLoader: true, signal: abortController.signal }
      )
    ])

    if (unmounted) return

    const extraer = (r) => {
      if (r.status !== 'fulfilled') return []
      const v = r.value
      return Array.isArray(v) ? v : (v?.data || [])
    }

    const out = []

    // Clientes
    for (const c of extraer(clientes)) {
      out.push({
        id: `cli:${c._id}`,
        tipoKey: 'cliente',
        icon: 'fas fa-user',
        tipo: 'Cliente',
        title: c.nombre || '(sin nombre)',
        subtitle: `RUC: ${c.ruc || 'N/A'}${c.telefono ? ' · ' + c.telefono : ''}`,
        routePath: `/clientes/editar/${c._id}`
      })
    }

    // Productos
    for (const p of extraer(productos)) {
      const codigo = typeof p.codigo === 'object'
        ? Object.values(p.codigo).join('')
        : (p.codigo || '')
      out.push({
        id: `prod:${p._id}`,
        tipoKey: 'producto',
        icon: 'fas fa-box',
        tipo: 'Producto',
        title: p.nombre || '(sin nombre)',
        subtitle: `Código: ${codigo || 'N/A'} · Stock: ${p.stock ?? 0}`,
        routePath: `/productos/editar/${p._id}`
      })
    }

    // Ventas
    for (const v of extraer(ventas)) {
      out.push({
        id: `venta:${v._id}`,
        tipoKey: 'venta',
        icon: 'fas fa-file-invoice',
        tipo: 'Venta',
        title: `${v.numero_factura || 'Factura'}`,
        subtitle: `Total: $${formatMonto(v.total)} · ${v.estado_sri || 'PENDIENTE'}`,
        routePath: `/consultar-documentos?tipo=venta&id=${v._id}`
      })
    }

    // Compras
    for (const c of extraer(compras)) {
      out.push({
        id: `compra:${c._id}`,
        tipoKey: 'compra',
        icon: 'fas fa-shopping-cart',
        tipo: 'Compra',
        title: `${c.numero_factura || 'Compra'}`,
        subtitle: `Total: $${formatMonto(c.total)} · ${c.estado_pago || 'pendiente'}`,
        routePath: `/consultar-documentos?tipo=compra&id=${c._id}`
      })
    }

    // Marcar los que exceden el máximo como "ocultos"
    results.value = out.map((r, i) => ({ ...r, _hidden: i >= MAX_TOTAL }))
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort) return
    console.error('Error en búsqueda:', e)
    results.value = []
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== NAVEGACIÓN POR TECLADO =====
const visibles = computed(() => results.value.slice(0, MAX_TOTAL))

const moverSeleccion = (delta) => {
  const total = visibles.value.length
  if (total === 0) return
  seleccionIndex.value = (seleccionIndex.value + delta + total) % total
}

const seleccionarActual = () => {
  const item = visibles.value[seleccionIndex.value]
  if (item) navigateTo(item)
}

// ===== NAVEGACIÓN =====
const navigateTo = (result) => {
  if (!result?.routePath) return
  router.push(result.routePath)
  showResults.value = false
  query.value = ''
  results.value = []
  searchInput.value?.blur()
}

const clearSearch = () => {
  query.value = ''
  results.value = []
  showResults.value = false
  searchInput.value?.focus()
}

const cerrarTodo = () => {
  showResults.value = false
  searchInput.value?.blur()
}

// ===== CLICK FUERA =====
const handleClickOutside = (e) => {
  if (container.value && !container.value.contains(e.target)) {
    showResults.value = false
  }
}

// ===== ATAJOS GLOBALES =====
const handleKeyboard = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
    if (query.value.length >= MIN_CHARS) {
      showResults.value = true
    }
  }
}

// ===== LIFECYCLE =====
onMounted(() => {
  document.addEventListener('keydown', handleKeyboard)
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  unmounted = true
  document.removeEventListener('keydown', handleKeyboard)
  document.removeEventListener('click', handleClickOutside)

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
    abortController = null
  }
})
</script>

<style scoped>
.search-container {
  position: relative;
  width: 100%;
  max-width: 500px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--text-muted);
  font-size: 0.9rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 44px 10px 40px;
  border-radius: 30px;
  border: 2px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-family: inherit;
  transition: var(--transition);
  outline: none;
}
.search-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--shadow-focus);
}

.search-kbd {
  position: absolute;
  right: 12px;
  padding: 2px 6px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.65rem;
  color: var(--text-muted);
  font-family: monospace;
  pointer-events: none;
}

.clear-btn {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px;
  display: flex;
  align-items: center;
  transition: var(--transition-fast);
}
.clear-btn:hover { color: #e74c3c; }

.search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 30px var(--shadow-hover);
  max-height: 420px;
  overflow-y: auto;
  z-index: 1000;
  padding: 6px 0;
}

.search-loading,
.no-results {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: var(--transition-fast);
}
.result-item:hover,
.result-item.result-selected {
  background: var(--bg-table-stripe);
}

.result-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.85rem;
}
.result-icon-cliente { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.result-icon-producto { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.result-icon-venta { background: rgba(16, 185, 129, 0.12); color: #059669; }
.result-icon-compra { background: rgba(139, 92, 246, 0.12); color: #7c3aed; }

.result-content { flex: 1; min-width: 0; }
.result-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-badge {
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.badge-cliente { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.badge-producto { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.badge-venta { background: rgba(16, 185, 129, 0.12); color: #059669; }
.badge-compra { background: rgba(139, 92, 246, 0.12); color: #7c3aed; }

.result-more {
  padding: 10px 16px;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border-light);
  margin-top: 4px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>