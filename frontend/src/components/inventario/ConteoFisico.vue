<template>
  <div class="conteo-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-teal"><i class="fas fa-clipboard-check"></i></span>
          Conteo Físico
        </h1>
        <p class="page-subtitle">
          Registra el stock real contado y compara con el sistema
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarCSV"
          :disabled="loading || productos.length === 0"
          aria-label="Exportar CSV"
        >
          <i class="fas fa-file-csv"></i>
          Exportar
        </button>
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
      </div>
    </div>

    <!-- INFO -->
    <div class="info-card">
      <div class="info-icon"><i class="fas fa-info-circle"></i></div>
      <div class="info-body">
        <strong>Instrucciones</strong>
        <div class="small">
          Ingresa el stock real contado para cada producto. Las diferencias se
          resaltan automáticamente. Al guardar, puedes generar ajustes individuales.
        </div>
      </div>
    </div>

    <!-- STATS -->
    <div v-if="!loading && productos.length > 0" class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-clipboard-list"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ productos.length }}</div>
          <div class="stat-label">Productos a contar</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon verde"><i class="fas fa-check-circle"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ contadosCount }}</div>
          <div class="stat-label">Contados</div>
        </div>
      </div>
      <div class="stat-card" :class="{ 'stat-card-warning': conDiferencia > 0 }">
        <div class="stat-icon naranja"><i class="fas fa-not-equal"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ conDiferencia }}</div>
          <div class="stat-label">Con diferencia</div>
        </div>
      </div>
      <div class="stat-card" :class="{ 'stat-card-danger': diferenciaTotal !== 0 }">
        <div class="stat-icon rojo"><i class="fas fa-calculator"></i></div>
        <div class="stat-info">
          <div class="stat-value">
            {{ diferenciaTotal > 0 ? '+' : '' }}{{ diferenciaTotal }}
          </div>
          <div class="stat-label">Balance total</div>
        </div>
      </div>
    </div>

    <!-- FILTROS -->
    <div v-if="!loading && productos.length > 0" class="filters-bar">
      <div class="search-wrapper">
        <i class="fas fa-search search-icon"></i>
        <input
          type="text"
          class="search-input"
          v-model="search"
          placeholder="Buscar producto por nombre o código..."
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
          v-for="f in filtrosDisponibles"
          :key="f.value"
          type="button"
          class="filter-chip"
          :class="{ active: filtro === f.value }"
          @click="filtro = f.value"
        >
          <i :class="f.icon"></i>
          <span>{{ f.label }}</span>
        </button>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-clipboard-list me-2"></i>
        Hoja de conteo
        <span v-if="!loading" class="header-count">
          {{ productosFiltrados.length }} producto(s)
        </span>
      </div>
      <div class="card-body p-0">
        <!-- Loading -->
        <div v-if="loading" class="loading-block">
          <div class="spinner-lg"></div>
          <p>Cargando productos...</p>
        </div>

        <!-- Empty (sin productos) -->
        <div v-else-if="productos.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-boxes"></i></div>
          <div class="empty-title">No hay productos registrados</div>
          <div class="empty-text">
            Crea productos antes de hacer un conteo físico
          </div>
          <router-link to="/productos/nuevo" class="empty-action">
            <i class="fas fa-plus"></i> Crear producto
          </router-link>
        </div>

        <!-- Sin resultados -->
        <div v-else-if="productosFiltrados.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-search"></i></div>
          <div class="empty-title">Sin resultados</div>
          <div class="empty-text">Ajusta los filtros o la búsqueda</div>
          <button class="empty-action" @click="limpiarFiltros">
            <i class="fas fa-times"></i> Limpiar filtros
          </button>
        </div>

        <!-- Tabla -->
        <div v-else class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th style="width:140px;">Código</th>
                <th>Producto</th>
                <th style="width:110px;" class="text-end">Teórico</th>
                <th style="width:130px;">Conteo físico</th>
                <th style="width:120px;" class="text-end">Diferencia</th>
                <th style="width:100px;" class="text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(prod, idx) in productosFiltrados"
                :key="prod._id"
                :class="{ 'row-diferencia': tieneDiferencia(prod) }"
              >
                <td class="text-muted small">{{ idx + 1 }}</td>
                <td>
                  <code class="codigo-badge">{{ prod.codigo || '—' }}</code>
                </td>
                <td>
                  <div class="prod-nombre" :title="prod.nombre">{{ prod.nombre }}</div>
                </td>
                <td class="text-end">
                  <span class="teorico-num">{{ formatCantidad(prod.stock) }}</span>
                </td>
                <td>
                  <input
                    type="number"
                    class="form-control-conteo"
                    v-model.number="conteos[prod._id]"
                    min="0"
                    step="0.01"
                    @focus="onFocusConteo(prod._id)"
                  />
                </td>
                <td class="text-end">
                  <span class="diferencia-badge" :class="claseDiferencia(prod)">
                    {{ formatDiferencia(prod) }}
                  </span>
                </td>
                <td class="text-center">
                  <span class="estado-dot" :class="claseEstado(prod)">
                    <i :class="iconoEstado(prod)"></i>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ACCIONES -->
    <div v-if="!loading && productos.length > 0 && hayConteos" class="acciones-footer">
      <div class="acciones-info">
        <i class="fas fa-info-circle"></i>
        <span>
          <strong>{{ contadosCount }}</strong> producto(s) con conteo ·
          <strong>{{ conDiferencia }}</strong> con diferencia
        </span>
      </div>
      <div class="acciones-buttons">
        <button
          type="button"
          class="btn-secondary"
          @click="resetear"
          :disabled="cargando"
        >
          <i class="fas fa-undo"></i> Resetear
        </button>
        <button
          type="button"
          class="btn-primary"
          @click="guardarConteo"
          :disabled="cargando || conDiferencia === 0"
        >
          <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
          {{ cargando ? 'Guardando...' : 'Guardar conteo' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { roundTo2 } from '../../utils/formatters'

const toast = useToast()

// ===== STATE =====
const productos = ref([])
const conteos = ref({})
const loading = ref(false)
const cargando = ref(false)
const search = ref('')
const filtro = ref('')

let unmounted = false

// ===== FILTROS DISPONIBLES =====
const filtrosDisponibles = [
  { value: '', label: 'Todos', icon: 'fas fa-list' },
  { value: 'conteo', label: 'Con conteo', icon: 'fas fa-check' },
  { value: 'diferencia', label: 'Con diferencia', icon: 'fas fa-not-equal' },
  { value: 'pendiente', label: 'Sin contar', icon: 'fas fa-clock' }
]

// ===== COMPUTED =====
const hayConteos = computed(() =>
  Object.values(conteos.value).some(v => v !== undefined && v !== null && v !== '')
)

const contadosCount = computed(() =>
  Object.entries(conteos.value).filter(([, v]) =>
    v !== undefined && v !== null && v !== ''
  ).length
)

const conDiferencia = computed(() =>
  productos.value.filter(p => tieneDiferencia(p)).length
)

const diferenciaTotal = computed(() => {
  let total = 0
  for (const p of productos.value) {
    const conteo = Number(conteos.value[p._id])
    const teorico = Number(p.stock) || 0
    if (Number.isFinite(conteo) && conteo !== teorico) {
      total += conteo - teorico
    }
  }
  return roundTo2(total)
})

const productosFiltrados = computed(() => {
  let list = productos.value

  // Filtro por estado
  if (filtro.value === 'conteo') {
    list = list.filter(p => {
      const v = conteos.value[p._id]
      return v !== undefined && v !== null && v !== ''
    })
  } else if (filtro.value === 'diferencia') {
    list = list.filter(p => tieneDiferencia(p))
  } else if (filtro.value === 'pendiente') {
    list = list.filter(p => {
      const v = conteos.value[p._id]
      return v === undefined || v === null || v === ''
    })
  }

  // Búsqueda
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return list

  return list.filter(p => {
    const nombre = String(p.nombre || '').toLowerCase()
    const codigo = String(p.codigo || '').toLowerCase()
    return nombre.includes(q) || codigo.includes(q)
  })
})

// ===== HELPERS =====
const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const tieneDiferencia = (p) => {
  const v = conteos.value[p._id]
  if (v === undefined || v === null || v === '') return false
  const teorico = Number(p.stock) || 0
  const conteo = Number(v)
  return Number.isFinite(conteo) && conteo !== teorico
}

const diferencia = (p) => {
  const v = conteos.value[p._id]
  if (v === undefined || v === null || v === '') return null
  const teorico = Number(p.stock) || 0
  const conteo = Number(v)
  if (!Number.isFinite(conteo)) return null
  return roundTo2(conteo - teorico)
}

const formatDiferencia = (p) => {
  const d = diferencia(p)
  if (d === null) return '—'
  if (d === 0) return '0'
  return d > 0 ? `+${d}` : `${d}`
}

const claseDiferencia = (p) => {
  const d = diferencia(p)
  if (d === null) return 'dif-neutral'
  if (d === 0) return 'dif-ok'
  return d > 0 ? 'dif-pos' : 'dif-neg'
}

const claseEstado = (p) => {
  const v = conteos.value[p._id]
  if (v === undefined || v === null || v === '') return 'estado-pendiente'
  if (tieneDiferencia(p)) return 'estado-diferencia'
  return 'estado-ok'
}

const iconoEstado = (p) => {
  const v = conteos.value[p._id]
  if (v === undefined || v === null || v === '') return 'fas fa-clock'
  if (tieneDiferencia(p)) return 'fas fa-exclamation'
  return 'fas fa-check'
}

const onFocusConteo = (id) => {
  // Si aún no se ha tocado, dejarlo como está (ya tiene el valor teórico)
  if (conteos.value[id] === undefined) {
    const prod = productos.value.find(p => p._id === id)
    if (prod) conteos.value[id] = Number(prod.stock) || 0
  }
}

const limpiarFiltros = () => {
  search.value = ''
  filtro.value = ''
}

// ===== CARGAR =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/productos?limit=5000&sortBy=nombre&sortDir=asc', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return

    const data = Array.isArray(res) ? res : (res?.data || [])
    productos.value = data

    // Inicializar conteos con el stock teórico
    const nuevosConteos = {}
    data.forEach(p => {
      nuevosConteos[p._id] = Number(p.stock) || 0
    })
    conteos.value = nuevosConteos
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar productos: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== GUARDAR =====
const guardarConteo = async () => {
  if (conDiferencia.value === 0) {
    toast.info('No hay diferencias que guardar')
    return
  }
  if (cargando.value) return

  cargando.value = true
  try {
    // Construir la lista de diferencias
    const diferencias = productos.value
      .map(p => {
        const conteo = Number(conteos.value[p._id])
        const teorico = Number(p.stock) || 0
        if (!Number.isFinite(conteo)) return null
        if (conteo === teorico) return null
        return {
          productoId: p._id,
          stockTeorico: teorico,
          conteoFisico: conteo,
          diferencia: roundTo2(conteo - teorico)
        }
      })
      .filter(Boolean)

    // ⚠️ Endpoint a implementar en el backend:
    //   POST /api/inventario/conteo
    //   Body: { diferencias: [...] }
    //   El backend debe iterar y ajustar stock + registrar en kardex
    const res = await api.request('/inventario/conteo', {
      method: 'POST',
      body: JSON.stringify({ diferencias }),
      loaderMessage: 'Guardando conteo...'
    })
    if (unmounted) return

    toast.success(`Conteo guardado: ${res?.ajustados ?? diferencias.length} ajuste(s) aplicado(s)`)
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'RUTA_NO_ENCONTRADA' || e?.status === 404) {
      toast.error(
        'El endpoint POST /api/inventario/conteo no está disponible aún. ' +
        'Exporta el CSV y aplica los ajustes manualmente.'
      )
    } else if (codigo === 'VALIDACION') {
      toast.error(e.message || 'Datos inválidos')
    } else {
      toast.error('Error al guardar conteo: ' + e.message)
    }
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== RESET =====
const resetear = () => {
  const nuevosConteos = {}
  productos.value.forEach(p => {
    nuevosConteos[p._id] = Number(p.stock) || 0
  })
  conteos.value = nuevosConteos
  toast.info('Conteo reiniciado')
}

// ===== EXPORTAR CSV =====
const exportarCSV = () => {
  if (productos.value.length === 0) {
    toast.warning('No hay productos para exportar')
    return
  }

  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = ['Código', 'Producto', 'Teórico', 'Conteo', 'Diferencia', 'Estado']

  const rows = productos.value.map(p => {
    const v = conteos.value[p._id]
    const teorico = Number(p.stock) || 0
    const conteo = Number.isFinite(Number(v)) ? Number(v) : ''
    const dif = conteo !== '' ? roundTo2(conteo - teorico) : ''
    let estado = 'Pendiente'
    if (conteo !== '' && conteo === teorico) estado = 'OK'
    else if (conteo !== '' && conteo !== teorico) estado = 'Diferencia'

    return [
      p.codigo || '',
      p.nombre || '',
      formatCantidad(teorico),
      conteo === '' ? '' : formatCantidad(conteo),
      dif === '' ? '' : (dif > 0 ? `+${dif}` : dif),
      estado
    ]
  })

  const csv = [
    headers.map(escapar).join(','),
    ...rows.map(r => r.map(escapar).join(','))
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conteo_fisico_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  toast.success(`CSV exportado (${productos.value.length} productos)`)
}

// ===== LIFECYCLE =====
onMounted(cargar)
onBeforeUnmount(() => { unmounted = true })
</script>

<style scoped>
.conteo-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
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
.title-icon-teal {
  background: linear-gradient(135deg, #16a085, #138d75);
  box-shadow: 0 6px 16px rgba(22,160,133,0.3);
}
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
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
.btn-secondary:hover:not(:disabled) { border-color: #16a085; color: #16a085; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* INFO */
.info-card {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  background: rgba(22,160,133,0.06);
  border: 1px solid rgba(22,160,133,0.25);
  border-left: 4px solid #16a085;
  border-radius: var(--radius-lg);
}
.info-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(22,160,133,0.15);
  color: #16a085;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.info-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; }
.info-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }

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
  border-color: #16a085;
  box-shadow: 0 0 0 4px rgba(22,160,133,0.12);
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
.filter-chip:hover { border-color: #16a085; color: #16a085; }
.filter-chip.active {
  background: linear-gradient(135deg, #16a085, #138d75);
  color: #fff;
  border-color: transparent;
}

/* HEADER COUNT */
.header-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
}

/* TABLE */
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
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }
.row-diferencia { background: rgba(243,156,18,0.06); }

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
.teorico-num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.form-control-conteo {
  width: 100%;
  padding: 8px 12px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 700;
  font-family: inherit;
  text-align: right;
  font-variant-numeric: tabular-nums;
  outline: none;
  transition: all var(--transition-fast);
}
.form-control-conteo:focus {
  border-color: #16a085;
  box-shadow: 0 0 0 3px rgba(22,160,133,0.15);
  background: var(--bg-card);
}

.diferencia-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.dif-neutral { background: var(--bg-table-stripe); color: var(--text-muted); }
.dif-ok { background: var(--success-bg); color: var(--success); }
.dif-pos { background: rgba(52,152,219,0.15); color: #2980b9; }
.dif-neg { background: var(--danger-bg); color: var(--danger); }

.estado-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 0.7rem;
}
.estado-pendiente { background: var(--bg-table-stripe); color: var(--text-muted); }
.estado-ok { background: var(--success-bg); color: var(--success); }
.estado-diferencia { background: rgba(243,156,18,0.2); color: #d68910; }

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
  border-top-color: #16a085;
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
.empty-text { font-size: 0.85rem; margin-bottom: 16px; }
.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(22,160,133,0.1);
  border: 1px solid rgba(22,160,133,0.3);
  border-radius: var(--radius-md);
  color: #16a085;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: none;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.empty-action:hover { background: #16a085; color: #fff; }

/* ACCIONES FOOTER */
.acciones-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
  position: sticky;
  bottom: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}
.acciones-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.acciones-info i { color: #16a085; }
.acciones-info strong { color: var(--text-primary); }

.acciones-buttons { display: flex; gap: 10px; }

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  background: linear-gradient(135deg, #16a085, #138d75);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(22,160,133,0.3);
  font-family: inherit;
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(22,160,133,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .filters-bar { flex-direction: column; align-items: stretch; }
  .acciones-footer { flex-direction: column; align-items: stretch; }
  .acciones-buttons { width: 100%; }
  .acciones-buttons button { flex: 1; justify-content: center; }
}
</style>