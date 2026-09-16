<template>
  <div class="kardex-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-cyan"><i class="fas fa-clipboard-list"></i></span>
          Kardex
        </h1>
        <p class="page-subtitle">
          Historial de movimientos de inventario por producto, cliente o proveedor
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarCSV"
          :disabled="movimientos.length === 0 || !consultado"
          aria-label="Exportar a CSV"
        >
          <i class="fas fa-file-csv"></i>
          Exportar
        </button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="card-cacao filters-card">
      <div class="card-header">
        <i class="fas fa-filter me-2"></i>
        Filtros de búsqueda
      </div>
      <div class="card-body">
        <div class="filters-grid">
          <!-- TIPO -->
          <div class="form-field">
            <label class="form-label">Filtrar por</label>
            <div class="segment-control">
              <button
                v-for="t in tiposFiltro"
                :key="t.value"
                type="button"
                class="segment-btn"
                :class="{ active: tipoFiltro === t.value }"
                @click="cambiarTipoFiltro(t.value)"
              >
                <i :class="t.icon"></i>
                <span>{{ t.label }}</span>
              </button>
            </div>
          </div>

          <!-- ENTIDAD (searchable) -->
          <div class="form-field form-field-full">
            <label class="form-label" for="kdx-entidad">
              <span class="required">*</span> {{ etiquetaEntidad }}
            </label>
            <div class="search-wrapper">
              <i class="fas fa-search search-icon"></i>
              <input
                id="kdx-entidad"
                type="text"
                class="form-input"
                :placeholder="placeholderEntidad"
                v-model="busquedaEntidad"
                @focus="mostrarLista = true"
                @blur="cerrarLista"
                :disabled="loadingCatalogos"
              />
              <button
                v-if="entidadActual"
                type="button"
                class="search-clear"
                @click="limpiarEntidad"
                aria-label="Limpiar entidad"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>

            <!-- Dropdown -->
            <transition name="dropdown">
              <div
                v-if="mostrarLista && entidadesFiltradas.length > 0"
                class="search-dropdown"
              >
                <div
                  v-for="e in entidadesFiltradas.slice(0, 10)"
                  :key="e._id"
                  class="dropdown-row"
                  @mousedown.prevent="seleccionarEntidad(e)"
                >
                  <div class="row-avatar" :class="`avatar-${tipoFiltro}`">
                    <i :class="iconoEntidad"></i>
                  </div>
                  <div class="row-content">
                    <div class="row-title">{{ e.nombre }}</div>
                    <div class="row-meta">
                      <span v-if="e.codigo"><code>{{ e.codigo }}</code></span>
                      <span v-if="e.ruc">{{ e.ruc }}</span>
                      <span v-if="tipoFiltro === 'producto' && e.stock !== undefined">
                        <i class="fas fa-cube"></i> Stock: {{ formatCantidad(e.stock) }}
                      </span>
                    </div>
                  </div>
                  <i
                    v-if="entidadActual?._id === e._id"
                    class="fas fa-check-circle row-check"
                  ></i>
                </div>
              </div>
            </transition>

            <!-- Entidad seleccionada -->
            <transition name="fade">
              <div v-if="entidadActual" class="entidad-banner">
                <div class="banner-avatar" :class="`avatar-${tipoFiltro}`">
                  <i :class="iconoEntidad"></i>
                </div>
                <div class="banner-body">
                  <div class="banner-name">{{ entidadActual.nombre }}</div>
                  <div class="banner-meta">
                    <span v-if="entidadActual.codigo">
                      <strong>Código:</strong> {{ entidadActual.codigo }}
                    </span>
                    <span v-if="entidadActual.ruc">
                      <strong>RUC:</strong> {{ entidadActual.ruc }}
                    </span>
                    <span v-if="tipoFiltro === 'producto' && entidadActual.stock !== undefined">
                      <strong>Stock actual:</strong> {{ formatCantidad(entidadActual.stock) }}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  class="banner-change"
                  @click="limpiarEntidad"
                  aria-label="Cambiar entidad"
                >
                  <i class="fas fa-exchange-alt"></i>
                </button>
              </div>
            </transition>
          </div>

          <!-- FECHAS -->
          <div class="form-field">
            <label class="form-label" for="kdx-desde">Desde</label>
            <input
              id="kdx-desde"
              type="date"
              class="form-input"
              v-model="fechaDesde"
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="kdx-hasta">Hasta</label>
            <input
              id="kdx-hasta"
              type="date"
              class="form-input"
              v-model="fechaHasta"
            />
          </div>
        </div>

        <!-- Quick picks de fecha -->
        <div class="quick-dates">
          <span class="quick-dates-label">Rangos rápidos:</span>
          <button
            v-for="q in quickDates"
            :key="q.label"
            type="button"
            class="quick-date-chip"
            @click="aplicarQuickDate(q)"
          >
            <i :class="q.icon"></i>
            {{ q.label }}
          </button>
        </div>

        <!-- Acciones -->
        <div class="filters-actions">
          <button
            type="button"
            class="btn-secondary"
            @click="limpiarTodo"
            :disabled="loading || !hayFiltros"
          >
            <i class="fas fa-times"></i>
            Limpiar filtros
          </button>
          <button
            type="button"
            class="btn-primary"
            @click="consultar"
            :disabled="!entidadSeleccionada || loading"
          >
            <i class="fas fa-search" :class="{ 'fa-spin': loading }"></i>
            {{ loading ? 'Consultando...' : 'Consultar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- STATS (solo si hay movimientos) -->
    <transition name="fade">
      <div v-if="consultado && movimientos.length > 0" class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon azul"><i class="fas fa-list"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ movimientos.length }}</div>
            <div class="stat-label">Movimientos</div>
          </div>
        </div>

        <div class="stat-card stat-card-success">
          <div class="stat-icon verde"><i class="fas fa-arrow-down"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ totalEntradas }}</div>
            <div class="stat-label">Entradas</div>
          </div>
        </div>

        <div class="stat-card stat-card-danger">
          <div class="stat-icon rojo"><i class="fas fa-arrow-up"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ totalSalidas }}</div>
            <div class="stat-label">Salidas</div>
          </div>
        </div>

        <div v-if="tipoFiltro === 'producto'" class="stat-card stat-card-info">
          <div class="stat-icon cyan"><i class="fas fa-cube"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCantidad(entidadActual?.stock) }}</div>
            <div class="stat-label">Stock actual</div>
          </div>
        </div>
      </div>
    </transition>

    <!-- RESULTADOS -->
    <div v-if="consultado" class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-table me-2"></i>
          Movimientos
          <span v-if="movimientos.length > 0" class="header-count">
            {{ movimientos.length }}
          </span>
        </div>
        <span v-if="etiquetaPeriodo" class="header-period">
          <i class="fas fa-calendar-alt"></i>
          {{ etiquetaPeriodo }}
        </span>
      </div>
      <div class="card-body p-0">
        <!-- Skeleton -->
        <div v-if="loading" class="loading-block">
          <div class="spinner-lg"></div>
          <p>Consultando movimientos...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="movimientos.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-inbox"></i></div>
          <div class="empty-title">Sin movimientos</div>
          <div class="empty-text">
            No se encontraron movimientos para
            <strong>{{ entidadActual?.nombre }}</strong>
            <template v-if="hayFiltroFecha"> en el rango seleccionado</template>.
          </div>
        </div>

        <!-- Tabla -->
        <div v-else class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:150px;">Fecha</th>
                <th v-if="tipoFiltro !== 'producto'" style="min-width:200px;">Producto</th>
                <th style="width:140px;">Tipo</th>
                <th style="width:110px;" class="text-end">Cantidad</th>
                <th style="width:110px;" class="text-end">Costo unit.</th>
                <th style="width:110px;" class="text-end">Saldo</th>
                <th style="width:130px;">Referencia</th>
                <th style="width:180px;">Motivo / Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mov in movimientos" :key="mov._id" class="mov-row">
                <td>
                  <div class="cell-fecha">
                    <div class="fecha-main">{{ formatFecha(mov.fecha) }}</div>
                    <div class="fecha-sub">{{ formatHora(mov.fecha) }}</div>
                  </div>
                </td>
                <td v-if="tipoFiltro !== 'producto'">
                  <div class="prod-cell">
                    <div class="prod-nombre" :title="nombreProducto(mov.productoId)">
                      {{ nombreProducto(mov.productoId) }}
                    </div>
                    <div v-if="codigoProducto(mov.productoId)" class="prod-codigo">
                      {{ codigoProducto(mov.productoId) }}
                    </div>
                  </div>
                </td>
                <td>
                  <span class="badge-mov" :class="claseMov(mov.tipo_movimiento)">
                    <i :class="iconoMov(mov.tipo_movimiento)"></i>
                    {{ etiquetaMov(mov.tipo_movimiento) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="cantidad-num" :class="signoClase(mov.cantidad)">
                    {{ formatCantidadConSigno(mov.cantidad) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="money-num">{{ formatCurrency(mov.costo_unitario) }}</span>
                </td>
                <td class="text-end">
                  <span class="saldo-num">{{ formatCantidad(mov.saldo) }}</span>
                </td>
                <td>
                  <span class="ref-badge">{{ mov.referencia_tipo || '—' }}</span>
                </td>
                <td>
                  <div class="detalle-text" :title="mov.motivo">
                    {{ mov.motivo || '—' }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- EMPTY STATE INICIAL -->
    <div v-else class="empty-initial">
      <div class="empty-initial-icon">
        <i class="fas fa-clipboard-list"></i>
      </div>
      <div class="empty-initial-title">Selecciona un filtro para empezar</div>
      <div class="empty-initial-text">
        Elige un <strong>producto</strong>, <strong>cliente</strong> o
        <strong>proveedor</strong> y presiona <strong>Consultar</strong> para
        ver el historial de movimientos de inventario.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'

const toast = useToast()

// ===== CONSTANTES =====
const TIPOS_FILTRO = Object.freeze([
  { value: 'producto', label: 'Producto', icon: 'fas fa-box' },
  { value: 'cliente', label: 'Cliente', icon: 'fas fa-user' },
  { value: 'proveedor', label: 'Proveedor', icon: 'fas fa-truck' }
])

const QUICK_DATES = Object.freeze([
  { label: 'Hoy', icon: 'fas fa-calendar-day', dias: 0 },
  { label: 'Últimos 7 días', icon: 'fas fa-calendar-week', dias: 7 },
  { label: 'Este mes', icon: 'fas fa-calendar-alt', tipo: 'mes' },
  { label: 'Últimos 30 días', icon: 'fas fa-calendar', dias: 30 },
  { label: 'Este año', icon: 'fas fa-calendar-check', tipo: 'anio' }
])

// ===== STATE =====
const tipoFiltro = ref('producto')
const entidadSeleccionada = ref('')
const busquedaEntidad = ref('')
const mostrarLista = ref(false)
const fechaDesde = ref('')
const fechaHasta = ref('')

const movimientos = ref([])
const loading = ref(false)
const loadingCatalogos = ref(false)
const consultado = ref(false)

// Catálogos
const productos = ref([])
const clientes = ref([])
const proveedores = ref([])

let unmounted = false

// ===== COMPUTED =====
const tiposFiltro = TIPOS_FILTRO

const entidades = computed(() => {
  if (tipoFiltro.value === 'producto') return productos.value
  if (tipoFiltro.value === 'cliente') return clientes.value
  return proveedores.value
})

const entidadActual = computed(() =>
  entidades.value.find(e => e._id === entidadSeleccionada.value) || null
)

const entidadesFiltradas = computed(() => {
  const q = String(busquedaEntidad.value || '').trim().toLowerCase()
  const lista = entidades.value
  if (!q) return lista.slice(0, 20)
  return lista
    .filter(e => {
      const nombre = String(e.nombre || '').toLowerCase()
      const codigo = String(e.codigo || '').toLowerCase()
      const ruc = String(e.ruc || '').toLowerCase()
      return nombre.includes(q) || codigo.includes(q) || ruc.includes(q)
    })
    .slice(0, 20)
})

const etiquetaEntidad = computed(() => {
  if (tipoFiltro.value === 'producto') return 'Producto'
  if (tipoFiltro.value === 'cliente') return 'Cliente'
  return 'Proveedor'
})

const placeholderEntidad = computed(() => {
  if (tipoFiltro.value === 'producto') return 'Buscar producto por nombre o código...'
  if (tipoFiltro.value === 'cliente') return 'Buscar cliente por nombre o RUC...'
  return 'Buscar proveedor por nombre o RUC...'
})

const iconoEntidad = computed(() => {
  if (tipoFiltro.value === 'producto') return 'fas fa-box'
  if (tipoFiltro.value === 'cliente') return 'fas fa-user'
  return 'fas fa-truck'
})

const hayFiltroFecha = computed(() => Boolean(fechaDesde.value || fechaHasta.value))

const hayFiltros = computed(
  () =>
    Boolean(entidadSeleccionada.value) ||
    Boolean(fechaDesde.value) ||
    Boolean(fechaHasta.value)
)

const etiquetaPeriodo = computed(() => {
  if (!hayFiltroFecha.value) return 'Historial completo'
  if (fechaDesde.value && fechaHasta.value) {
    return `${formatFecha(fechaDesde.value)} → ${formatFecha(fechaHasta.value)}`
  }
  if (fechaDesde.value) return `Desde ${formatFecha(fechaDesde.value)}`
  return `Hasta ${formatFecha(fechaHasta.value)}`
})

// Totales (para las stat cards)
const totalEntradas = computed(() =>
  movimientos.value
    .filter(m => Number(m.cantidad) > 0)
    .reduce((sum, m) => sum + Math.abs(Number(m.cantidad) || 0), 0)
)
const totalSalidas = computed(() =>
  movimientos.value
    .filter(m => Number(m.cantidad) < 0)
    .reduce((sum, m) => sum + Math.abs(Number(m.cantidad) || 0), 0)
)

const quickDates = QUICK_DATES

// Mapa de productos para lookup rápido
const productosMap = computed(() => {
  const m = new Map()
  productos.value.forEach(p => m.set(String(p._id), p))
  return m
})

// ===== HELPERS =====
const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const formatCantidadConSigno = (n) => {
  const v = Number(n) || 0
  if (v === 0) return '0'
  const abs = Math.abs(v)
  const fmt = Number.isInteger(abs) ? abs.toLocaleString('es-EC') : abs.toFixed(2)
  return v > 0 ? `+${fmt}` : `-${fmt}`
}

const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return '—'
  }
}

const formatHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

const nombreProducto = (id) => {
  if (!id) return 'N/A'
  const p = productosMap.value.get(String(id))
  return p?.nombre || 'Producto eliminado'
}

const codigoProducto = (id) => {
  if (!id) return ''
  const p = productosMap.value.get(String(id))
  return p?.codigo || ''
}

const signoClase = (cantidad) => {
  const v = Number(cantidad) || 0
  if (v > 0) return 'cant-pos'
  if (v < 0) return 'cant-neg'
  return 'cant-zero'
}

const claseMov = (tipo) => {
  switch (tipo) {
    case 'compra': return 'mov-compra'
    case 'venta': return 'mov-venta'
    case 'ajuste': return 'mov-ajuste'
    case 'devolucion': return 'mov-devolucion'
    case 'traslado': return 'mov-traslado'
    case 'inicial': return 'mov-inicial'
    default: return 'mov-otro'
  }
}

const iconoMov = (tipo) => {
  switch (tipo) {
    case 'compra': return 'fas fa-cart-plus'
    case 'venta': return 'fas fa-file-invoice'
    case 'ajuste': return 'fas fa-sliders-h'
    case 'devolucion': return 'fas fa-undo'
    case 'traslado': return 'fas fa-exchange-alt'
    case 'inicial': return 'fas fa-flag'
    default: return 'fas fa-circle'
  }
}

const etiquetaMov = (tipo) => {
  switch (tipo) {
    case 'compra': return 'Compra'
    case 'venta': return 'Venta'
    case 'ajuste': return 'Ajuste'
    case 'devolucion': return 'Devolución'
    case 'traslado': return 'Traslado'
    case 'inicial': return 'Inicial'
    default: return tipo || '—'
  }
}

// ===== CARGA DE CATÁLOGOS =====
const cargarCatalogos = async () => {
  if (unmounted) return
  loadingCatalogos.value = true
  try {
    const [prodsRes, clisRes, provsRes] = await Promise.allSettled([
      api.request('/productos?limit=5000&sortBy=nombre&sortDir=asc', {
        method: 'GET',
        skipLoader: true
      }),
      api.request('/clientes', { method: 'GET', skipLoader: true }),
      api.request('/proveedores', { method: 'GET', skipLoader: true })
    ])
    if (unmounted) return

    const extraer = (r) => {
      if (r.status !== 'fulfilled') return []
      const v = r.value
      return Array.isArray(v) ? v : (v?.data || [])
    }

    productos.value = extraer(prodsRes)
    clientes.value = extraer(clisRes)
    proveedores.value = extraer(provsRes)
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar catálogos: ' + e.message)
  } finally {
    if (!unmounted) loadingCatalogos.value = false
  }
}

// ===== ACCIONES DE FILTRO =====
const cambiarTipoFiltro = (tipo) => {
  if (tipo === tipoFiltro.value) return
  tipoFiltro.value = tipo
  // Limpiar entidad al cambiar tipo
  entidadSeleccionada.value = ''
  busquedaEntidad.value = ''
  mostrarLista.value = false
  // Resetear resultado
  movimientos.value = []
  consultado.value = false
}

const cerrarLista = () => {
  setTimeout(() => {
    mostrarLista.value = false
  }, 200)
}

const seleccionarEntidad = (e) => {
  entidadSeleccionada.value = e._id
  busquedaEntidad.value = ''
  mostrarLista.value = false
}

const limpiarEntidad = () => {
  entidadSeleccionada.value = ''
  busquedaEntidad.value = ''
  movimientos.value = []
  consultado.value = false
}

const aplicarQuickDate = (q) => {
  const hoy = new Date()
  hoy.setHours(23, 59, 59, 999)

  if (q.tipo === 'mes') {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    fechaDesde.value = toISODate(inicio)
    fechaHasta.value = toISODate(hoy)
    return
  }
  if (q.tipo === 'anio') {
    const inicio = new Date(hoy.getFullYear(), 0, 1)
    fechaDesde.value = toISODate(inicio)
    fechaHasta.value = toISODate(hoy)
    return
  }
  const inicio = new Date(hoy)
  inicio.setDate(inicio.getDate() - (q.dias || 0))
  fechaDesde.value = toISODate(inicio)
  fechaHasta.value = toISODate(hoy)
}

const toISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const limpiarTodo = () => {
  entidadSeleccionada.value = ''
  busquedaEntidad.value = ''
  fechaDesde.value = ''
  fechaHasta.value = ''
  movimientos.value = []
  consultado.value = false
}

// ===== CONSULTAR =====
const consultar = async () => {
  if (!entidadSeleccionada.value) {
    toast.warning(`Selecciona un ${etiquetaEntidad.value.toLowerCase()}`)
    return
  }
  if (loading.value) return

  loading.value = true
  consultado.value = true

  try {
    // Construir URL según el tipo de filtro
    const baseUrl = (() => {
      if (tipoFiltro.value === 'producto') {
        return `/kardex/producto/${entidadSeleccionada.value}`
      }
      if (tipoFiltro.value === 'cliente') {
        return `/kardex/cliente/${entidadSeleccionada.value}`
      }
      return `/kardex/proveedor/${entidadSeleccionada.value}`
    })()

    const params = new URLSearchParams()
    if (fechaDesde.value) params.set('desde', fechaDesde.value)
    if (fechaHasta.value) params.set('hasta', fechaHasta.value)

    const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl

    const res = await api.request(url, {
      method: 'GET',
      loaderMessage: 'Consultando kardex...'
    })
    if (unmounted) return

    // El backend puede devolver array o { data }
    const data = Array.isArray(res) ? res : (res?.data || [])
    movimientos.value = data

    if (data.length === 0) {
      toast.info('No se encontraron movimientos con esos criterios')
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'ID_INVALIDO') {
      toast.error('El identificador no es válido')
    } else {
      toast.error('Error al consultar: ' + e.message)
    }
    movimientos.value = []
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== EXPORTAR CSV =====
const exportarCSV = () => {
  if (movimientos.value.length === 0) {
    toast.warning('No hay movimientos para exportar')
    return
  }

  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'Fecha',
    'Producto',
    'Código',
    'Tipo',
    'Cantidad',
    'Costo unitario',
    'Saldo',
    'Referencia',
    'Motivo'
  ]

  const rows = movimientos.value.map(m => [
    formatFecha(m.fecha),
    nombreProducto(m.productoId),
    codigoProducto(m.productoId),
    etiquetaMov(m.tipo_movimiento),
    formatCantidadConSigno(m.cantidad),
    formatCurrency(m.costo_unitario),
    formatCantidad(m.saldo),
    m.referencia_tipo || '',
    m.motivo || ''
  ])

  const csv = [
    headers.map(escapar).join(','),
    ...rows.map(r => r.map(escapar).join(','))
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url

  const entidadSlug = String(entidadActual.value?.nombre || 'kardex')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .slice(0, 40)

  a.download = `kardex_${tipoFiltro.value}_${entidadSlug}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  toast.success(`CSV exportado (${movimientos.value.length} movimientos)`)
}

// ===== LIFECYCLE =====
onMounted(cargarCatalogos)

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.kardex-page { display: flex; flex-direction: column; gap: 20px; }

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
}
.btn-primary {
  background: linear-gradient(135deg, #17a2b8, #138496);
  color: #fff;
  box-shadow: 0 4px 12px rgba(23,162,184,0.3);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(23,162,184,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #17a2b8; color: #17a2b8; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* FILTROS */
.filters-card .card-body { display: flex; flex-direction: column; gap: 16px; }
.filters-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-field-full { grid-column: 1 / -1; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-input {
  width: 100%;
  padding: 11px 14px;
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
  border-color: #17a2b8;
  box-shadow: 0 0 0 4px rgba(23,162,184,0.15);
  background: var(--bg-card);
}
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }

/* Segment control */
.segment-control {
  display: inline-flex;
  padding: 4px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-md);
  gap: 4px;
  width: 100%;
}
.segment-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.segment-btn:hover { color: #17a2b8; }
.segment-btn.active {
  background: var(--bg-card);
  color: #17a2b8;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
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
.search-wrapper .form-input { padding-left: 40px; padding-right: 40px; }
.search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
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

.row-avatar {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.avatar-producto { background: linear-gradient(135deg, #17a2b8, #138496); }
.avatar-cliente { background: linear-gradient(135deg, #3498db, #2980b9); }
.avatar-proveedor { background: linear-gradient(135deg, #e67e22, #d35400); }

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
  flex-wrap: wrap;
}
.row-meta code {
  background: var(--bg-table-stripe);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
}
.row-check { color: #17a2b8; font-size: 1rem; }

/* BANNER entidad */
.entidad-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  margin-top: 12px;
  background: linear-gradient(135deg, rgba(23,162,184,0.06), rgba(23,162,184,0.02));
  border: 1px solid rgba(23,162,184,0.25);
  border-left: 4px solid #17a2b8;
  border-radius: var(--radius-md);
}
.banner-avatar {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.banner-body { flex: 1; min-width: 0; }
.banner-name { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 4px; }
.banner-meta {
  display: flex;
  gap: 16px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.banner-meta strong { color: var(--text-muted); font-weight: 600; margin-right: 4px; }
.banner-change {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.banner-change:hover {
  border-color: #17a2b8;
  color: #17a2b8;
  background: rgba(23,162,184,0.08);
}

/* QUICK DATES */
.quick-dates {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
}
.quick-dates-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
  margin-right: 4px;
}
.quick-date-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.quick-date-chip:hover {
  border-color: #17a2b8;
  color: #17a2b8;
  background: rgba(23,162,184,0.06);
}

/* FILTERS ACTIONS */
.filters-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

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
.stat-card-danger { border-left-color: #e74c3c; }
.stat-card-info { border-left-color: #17a2b8; }

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
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }
.stat-icon.cyan { background: rgba(23,162,184,0.15); color: #17a2b8; }

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

/* CARD HEADER FLEX */
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
  background: rgba(23,162,184,0.15);
  color: #17a2b8;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 800;
}
.header-period {
  font-size: 0.75rem;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
.mov-row:hover { background: var(--bg-table-stripe); }

.cell-fecha .fecha-main {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.82rem;
}
.cell-fecha .fecha-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.prod-cell { min-width: 0; }
.prod-nombre {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-codigo {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  margin-top: 2px;
}

.badge-mov {
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
.mov-compra { background: rgba(39,174,96,0.15); color: #27ae60; }
.mov-venta { background: rgba(52,152,219,0.15); color: #2980b9; }
.mov-ajuste { background: rgba(243,156,18,0.15); color: #d68910; }
.mov-devolucion { background: rgba(231,76,60,0.15); color: #c0392b; }
.mov-traslado { background: rgba(142,68,173,0.15); color: #8e44ad; }
.mov-inicial { background: rgba(23,162,184,0.15); color: #17a2b8; }
.mov-otro { background: var(--bg-table-stripe); color: var(--text-muted); }

.cantidad-num {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
}
.cant-pos { color: #27ae60; }
.cant-neg { color: #e74c3c; }
.cant-zero { color: var(--text-muted); }

.money-num {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  font-weight: 600;
}

.saldo-num {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.ref-badge {
  display: inline-block;
  padding: 3px 8px;
  background: var(--bg-table-stripe);
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: capitalize;
}

.detalle-text {
  font-size: 0.78rem;
  color: var(--text-secondary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* LOADING / EMPTY */
.loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-muted);
}
.spinner-lg {
  width: 44px;
  height: 44px;
  border: 4px solid var(--border-color);
  border-top-color: #17a2b8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-block {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
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
  margin: 0 auto 14px;
}
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 4px;
}
.empty-text { font-size: 0.85rem; }

/* EMPTY INICIAL */
.empty-initial {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-card);
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
}
.empty-initial-icon {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: rgba(23,162,184,0.08);
  color: #17a2b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  margin: 0 auto 18px;
}
.empty-initial-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1.05rem;
  margin-bottom: 6px;
}
.empty-initial-text {
  font-size: 0.85rem;
  max-width: 460px;
  margin: 0 auto;
  line-height: 1.5;
}

/* TRANSITIONS */
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* RESPONSIVE */
@media (max-width: 992px) {
  .filters-grid { grid-template-columns: 1fr 1fr; }
  .form-field-full { grid-column: 1 / -1; }
}
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .filters-grid { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .segment-control { flex-wrap: wrap; }
  .filters-actions { flex-direction: column-reverse; }
  .filters-actions button { width: 100%; justify-content: center; }
}
</style>