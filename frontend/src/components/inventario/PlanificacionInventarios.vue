<template>
  <div class="planificacion-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-indigo"><i class="fas fa-calendar-alt"></i></span>
          Planificación de Inventarios
        </h1>
        <p class="page-subtitle">
          Calcula cuánto pedir en función del stock actual y el mínimo
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar productos"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
      </div>
    </div>

    <!-- ALERTA INFORMATIVA -->
    <div class="info-card">
      <div class="info-icon"><i class="fas fa-info-circle"></i></div>
      <div class="info-body">
        <strong>¿Cómo funciona?</strong>
        <div class="small">
          Selecciona un producto y el sistema te dirá cuánto pedir para volver
          a niveles seguros. La cantidad sugerida = stock mínimo − stock actual.
        </div>
      </div>
    </div>

    <!-- CALCULADORA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-calculator me-2"></i>
        Calculadora de pedido
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-field form-field-full">
            <label class="form-label" for="plan-producto">
              <span class="required">*</span> Producto
            </label>
            <div class="search-wrapper">
              <i class="fas fa-search search-icon"></i>
              <input
                id="plan-producto"
                type="text"
                class="form-input"
                placeholder="Buscar producto por nombre o código..."
                v-model="busquedaProducto"
                @focus="mostrarLista = true"
                @blur="cerrarLista"
              />
            </div>

            <transition name="dropdown">
              <div v-if="mostrarLista && productosFiltrados.length > 0" class="search-dropdown">
                <div
                  v-for="p in productosFiltrados.slice(0, 10)"
                  :key="p._id"
                  class="dropdown-row"
                  @mousedown.prevent="seleccionarProducto(p)"
                >
                  <div class="row-icon"><i class="fas fa-box"></i></div>
                  <div class="row-content">
                    <div class="row-title">{{ p.nombre }}</div>
                    <div class="row-meta">
                      <code>{{ p.codigo }}</code>
                      <span>Stock: {{ p.stock }}</span>
                    </div>
                  </div>
                  <div class="row-stock" :class="claseStockResumen(p)">
                    {{ estadoResumen(p) }}
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- Producto seleccionado -->
          <template v-if="productoActual">
            <div class="kpi-grid">
              <div class="kpi-tile">
                <div class="kpi-icon azul"><i class="fas fa-cube"></i></div>
                <div class="kpi-body">
                  <div class="kpi-label">Stock actual</div>
                  <div class="kpi-value">{{ formatCantidad(productoActual.stock) }}</div>
                </div>
              </div>

              <div class="kpi-tile">
                <div class="kpi-icon naranja"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="kpi-body">
                  <div class="kpi-label">Stock mínimo</div>
                  <div class="kpi-value">{{ formatCantidad(productoActual.stock_minimo) }}</div>
                </div>
              </div>

              <div class="kpi-tile" :class="claseKpiFaltante">
                <div class="kpi-icon" :class="claseIconoFaltante">
                  <i class="fas fa-arrow-down"></i>
                </div>
                <div class="kpi-body">
                  <div class="kpi-label">Faltante</div>
                  <div class="kpi-value">{{ formatCantidad(faltante) }}</div>
                </div>
              </div>
            </div>

            <div class="acciones-row">
              <div class="form-field">
                <label class="form-label" for="plan-cantidad">
                  Cantidad a pedir
                </label>
                <input
                  id="plan-cantidad"
                  type="number"
                  class="form-input"
                  v-model.number="cantidadPedir"
                  min="0"
                  step="1"
                />
              </div>
              <div class="acciones-buttons">
                <button
                  type="button"
                  class="btn-sugerir"
                  @click="sugerirPedido"
                  :disabled="!productoActual"
                >
                  <i class="fas fa-lightbulb"></i>
                  Sugerir cantidad
                </button>
                <button
                  type="button"
                  class="btn-secondary"
                  @click="limpiarSeleccion"
                >
                  <i class="fas fa-undo"></i>
                  Limpiar
                </button>
              </div>
            </div>

            <!-- Sugerencia visible -->
            <transition name="fade">
              <div v-if="mostrarSugerencia" class="sugerencia-box" :class="claseSugerencia">
                <div class="sugerencia-icon">
                  <i :class="iconoSugerencia"></i>
                </div>
                <div class="sugerencia-body">
                  <strong>{{ tituloSugerencia }}</strong>
                  <div class="small">{{ detalleSugerencia }}</div>
                </div>
              </div>
            </transition>
          </template>

          <!-- Sin producto -->
          <div v-else class="empty-seleccion">
            <i class="fas fa-hand-pointer"></i>
            <span>Selecciona un producto para calcular el pedido</span>
          </div>
        </div>
      </div>
    </div>

    <!-- LISTA PRODUCTOS EN RIESGO -->
    <div v-if="productosBajo.length > 0" class="card-cacao">
      <div class="card-header card-header-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Productos en riesgo ({{ productosBajo.length }})
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Código</th>
                <th class="text-end">Stock</th>
                <th class="text-end">Mínimo</th>
                <th class="text-end">Faltante</th>
                <th style="width:120px;" class="text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in productosBajo" :key="p._id">
                <td>
                  <div class="prod-nombre" :title="p.nombre">{{ p.nombre }}</div>
                </td>
                <td><code class="codigo-badge">{{ p.codigo }}</code></td>
                <td class="text-end">
                  <span :class="Number(p.stock) <= 0 ? 'text-danger fw-bold' : 'text-warning fw-bold'">
                    {{ formatCantidad(p.stock) }}
                  </span>
                </td>
                <td class="text-end text-muted">{{ formatCantidad(p.stock_minimo) }}</td>
                <td class="text-end">
                  <span class="faltante-badge">
                    {{ formatCantidad(calcularFaltante(p)) }}
                  </span>
                </td>
                <td class="text-center">
                  <button
                    type="button"
                    class="btn-icon-plan"
                    @click="seleccionarProducto(p)"
                    title="Planificar pedido"
                  >
                    <i class="fas fa-calendar-plus"></i>
                  </button>
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
const loading = ref(false)
const busquedaProducto = ref('')
const mostrarLista = ref(false)
const productoSeleccionadoId = ref('')
const cantidadPedir = ref(0)
const mostrarSugerencia = ref(false)

let unmounted = false

// ===== COMPUTED =====
const productosFiltrados = computed(() => {
  const q = String(busquedaProducto.value || '').trim().toLowerCase()
  if (!q) return productos.value.slice(0, 20)
  return productos.value
    .filter(p => {
      const nombre = String(p.nombre || '').toLowerCase()
      const codigo = String(p.codigo || '').toLowerCase()
      return nombre.includes(q) || codigo.includes(q)
    })
    .slice(0, 20)
})

const productoActual = computed(() =>
  productos.value.find(p => p._id === productoSeleccionadoId.value) || null
)

const faltante = computed(() => {
  if (!productoActual.value) return 0
  const min = Number(productoActual.value.stock_minimo) || 0
  const actual = Number(productoActual.value.stock) || 0
  return Math.max(0, min - actual)
})

const productosBajo = computed(() =>
  productos.value
    .filter(p => {
      const min = Number(p.stock_minimo) || 0
      const actual = Number(p.stock) || 0
      return min > 0 && actual < min
    })
    .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0))
)

// Sugerencia
const claseSugerencia = computed(() => {
  if (faltante.value > 0) return 'sugerencia-warning'
  return 'sugerencia-ok'
})
const iconoSugerencia = computed(() =>
  faltante.value > 0 ? 'fas fa-shopping-cart' : 'fas fa-check-circle'
)
const tituloSugerencia = computed(() =>
  faltante.value > 0
    ? `Se sugiere pedir ${formatCantidad(faltante.value)} unidades`
    : 'Stock suficiente'
)
const detalleSugerencia = computed(() =>
  faltante.value > 0
    ? `Para alcanzar el stock mínimo (${formatCantidad(productoActual.value.stock_minimo)})`
    : `Tienes ${formatCantidad(productoActual.value.stock)} unidades, por encima del mínimo`
)

// KPI faltante
const claseKpiFaltante = computed(() => (faltante.value > 0 ? 'kpi-warning' : 'kpi-ok'))
const claseIconoFaltante = computed(() => (faltante.value > 0 ? 'naranja' : 'verde'))

// ===== HELPERS =====
const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const calcularFaltante = (p) => {
  const min = Number(p.stock_minimo) || 0
  const actual = Number(p.stock) || 0
  return Math.max(0, min - actual)
}

const claseStockResumen = (p) => {
  const stock = Number(p.stock) || 0
  const min = Number(p.stock_minimo) || 0
  if (stock <= 0) return 'stock-danger'
  if (min > 0 && stock < min) return 'stock-warning'
  return 'stock-ok'
}

const estadoResumen = (p) => {
  const stock = Number(p.stock) || 0
  const min = Number(p.stock_minimo) || 0
  if (stock <= 0) return 'Sin stock'
  if (min > 0 && stock < min) return 'Bajo'
  return 'OK'
}

// ===== ACCIONES =====
const cerrarLista = () => {
  setTimeout(() => { mostrarLista.value = false }, 200)
}

const seleccionarProducto = (p) => {
  productoSeleccionadoId.value = p._id
  busquedaProducto.value = ''
  mostrarLista.value = false
  cantidadPedir.value = 0
  mostrarSugerencia.value = false
}

const limpiarSeleccion = () => {
  productoSeleccionadoId.value = ''
  busquedaProducto.value = ''
  cantidadPedir.value = 0
  mostrarSugerencia.value = false
}

const sugerirPedido = () => {
  if (!productoActual.value) {
    toast.warning('Selecciona un producto primero')
    return
  }

  const sugerencia = faltante.value
  cantidadPedir.value = sugerencia
  mostrarSugerencia.value = true

  if (sugerencia === 0) {
    toast.info('El stock actual es suficiente')
  } else {
    toast.success(`Sugerido: pedir ${sugerencia} unidades`)
  }
}

// ===== CARGA =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/productos?limit=5000&sortBy=nombre&sortDir=asc', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return
    productos.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar productos: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(cargar)
onBeforeUnmount(() => { unmounted = true })
</script>

<style scoped>
.planificacion-page { display: flex; flex-direction: column; gap: 20px; }

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
.title-icon-indigo {
  background: linear-gradient(135deg, #5b6fd8, #4a5fc1);
  box-shadow: 0 6px 16px rgba(91,111,216,0.3);
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
.btn-secondary:hover:not(:disabled) { border-color: #5b6fd8; color: #5b6fd8; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* INFO CARD */
.info-card {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  background: rgba(91,111,216,0.06);
  border: 1px solid rgba(91,111,216,0.25);
  border-left: 4px solid #5b6fd8;
  border-radius: var(--radius-lg);
}
.info-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(91,111,216,0.15);
  color: #5b6fd8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.info-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; }
.info-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }

/* FORM */
.form-grid { display: flex; flex-direction: column; gap: 20px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-field-full { width: 100%; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-fast);
}
.form-input:focus {
  border-color: #5b6fd8;
  box-shadow: 0 0 0 4px rgba(91,111,216,0.15);
  background: var(--bg-card);
}

/* SEARCH */
.search-wrapper { position: relative; }
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
}
.search-wrapper .form-input { padding-left: 40px; }

.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 40px rgba(0,0,0,0.15);
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
}
.dropdown-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.dropdown-row:hover { background: var(--bg-table-stripe); }
.row-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: linear-gradient(135deg, #5b6fd8, #4a5fc1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.row-content { flex: 1; min-width: 0; }
.row-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-meta {
  display: flex;
  gap: 10px;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 2px;
}
.row-meta code {
  background: var(--bg-table-stripe);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
}
.row-stock {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.stock-ok { background: var(--success-bg); color: var(--success); }
.stock-warning { background: rgba(243,156,18,0.15); color: #d68910; }
.stock-danger { background: rgba(231,76,60,0.15); color: #c0392b; }

/* KPI GRID */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.kpi-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  transition: all var(--transition);
}
.kpi-tile:hover { transform: translateY(-2px); }
.kpi-ok { border-color: rgba(39,174,96,0.3); background: rgba(39,174,96,0.04); }
.kpi-warning { border-color: rgba(243,156,18,0.3); background: rgba(243,156,18,0.04); }

.kpi-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  flex-shrink: 0;
}
.kpi-icon.azul { background: rgba(52,152,219,0.15); color: #3498db; }
.kpi-icon.naranja { background: rgba(243,156,18,0.15); color: #f39c12; }
.kpi-icon.verde { background: rgba(39,174,96,0.15); color: #27ae60; }

.kpi-body { flex: 1; min-width: 0; }
.kpi-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
}
.kpi-value {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  margin-top: 3px;
}

/* ACCIONES */
.acciones-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.acciones-row .form-field { flex: 1; min-width: 200px; }
.acciones-buttons { display: flex; gap: 8px; }

.btn-sugerir {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  background: linear-gradient(135deg, #5b6fd8, #4a5fc1);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(91,111,216,0.3);
  font-family: inherit;
}
.btn-sugerir:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(91,111,216,0.4);
}
.btn-sugerir:disabled { opacity: 0.5; cursor: not-allowed; }

/* SUGERENCIA */
.sugerencia-box {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  border-radius: var(--radius-md);
  border-left: 4px solid;
}
.sugerencia-warning {
  background: rgba(243,156,18,0.08);
  border-color: #f39c12;
}
.sugerencia-ok {
  background: rgba(39,174,96,0.08);
  border-color: #27ae60;
}
.sugerencia-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.sugerencia-warning .sugerencia-icon { background: rgba(243,156,18,0.15); color: #f39c12; }
.sugerencia-ok .sugerencia-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.sugerencia-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; }
.sugerencia-body strong {
  display: block;
  color: var(--text-primary);
  font-size: 0.95rem;
  margin-bottom: 2px;
}

/* EMPTY SELECCION */
.empty-seleccion {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
}
.empty-seleccion i {
  font-size: 2rem;
  opacity: 0.3;
}

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
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }
.card-header-warning {
  background: linear-gradient(135deg, rgba(243,156,18,0.12), var(--bg-card)) !important;
  color: #d68910;
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
.codigo-badge {
  background: var(--bg-table-stripe);
  padding: 3px 8px;
  border-radius: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
}
.faltante-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: rgba(231,76,60,0.15);
  color: #c0392b;
  font-weight: 800;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.btn-icon-plan {
  width: 32px;
  height: 32px;
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
}
.btn-icon-plan:hover {
  border-color: #5b6fd8;
  color: #5b6fd8;
  background: rgba(91,111,216,0.08);
}

/* TRANSITIONS */
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.text-danger { color: var(--danger); }
.text-warning { color: #d68910; }
.text-muted { color: var(--text-muted); }
.fw-bold { font-weight: 700; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .kpi-grid { grid-template-columns: 1fr; }
  .acciones-buttons { width: 100%; }
  .acciones-buttons button { flex: 1; justify-content: center; }
}
</style>