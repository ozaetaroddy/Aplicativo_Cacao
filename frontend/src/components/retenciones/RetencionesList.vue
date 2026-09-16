<template>
  <div class="retenciones-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-purple"><i class="fas fa-percent"></i></span>
          Retenciones
        </h1>
        <p class="page-subtitle">
          Comprobantes de retención aplicados por proveedor
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
        <router-link to="/retenciones/nuevo" class="btn-primary">
          <i class="fas fa-plus"></i>
          Nueva retención
        </router-link>
      </div>
    </div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon azul"><i class="fas fa-percent"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ retenciones.length }}</div>
          <div class="stat-label">Total retenciones</div>
        </div>
      </div>
      <div class="stat-card stat-card-purple">
        <div class="stat-icon morado"><i class="fas fa-dollar-sign"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ formatCurrency(totalRetenido) }}</div>
          <div class="stat-label">Total retenido</div>
        </div>
      </div>
      <div class="stat-card stat-card-success">
        <div class="stat-icon verde"><i class="fas fa-users"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ proveedoresUnicos }}</div>
          <div class="stat-label">Proveedores</div>
        </div>
      </div>
      <div class="stat-card stat-card-info">
        <div class="stat-icon cyan"><i class="fas fa-calendar-alt"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ retencionesDelMes }}</div>
          <div class="stat-label">Este mes</div>
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
          placeholder="Buscar por proveedor, RUC o N° factura..."
          aria-label="Buscar retenciones"
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
          v-for="f in filtrosImpuesto"
          :key="f.value"
          type="button"
          class="filter-chip"
          :class="{ active: filtroImpuesto === f.value }"
          @click="filtroImpuesto = f.value"
        >
          <i :class="f.icon"></i>
          <span>{{ f.label }}</span>
        </button>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Listado
          <span class="header-count">{{ retencionesFiltradas.length }}</span>
        </div>
      </div>
      <div class="card-body p-0">
        <!-- Skeleton -->
        <div v-if="loading" class="loading-block">
          <div class="spinner-lg"></div>
          <p>Cargando retenciones...</p>
        </div>

        <!-- Empty (sin datos) -->
        <div v-else-if="retenciones.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-percent"></i></div>
          <div class="empty-title">Aún no hay retenciones</div>
          <div class="empty-text">
            Registra tu primera retención cuando apliques un porcentaje a un
            proveedor
          </div>
          <router-link to="/retenciones/nuevo" class="empty-action">
            <i class="fas fa-plus"></i> Nueva retención
          </router-link>
        </div>

        <!-- Empty (filtros) -->
        <div v-else-if="retencionesFiltradas.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-search"></i></div>
          <div class="empty-title">Sin resultados</div>
          <div class="empty-text">
            No hay retenciones que coincidan con los filtros aplicados
          </div>
          <button class="empty-action" @click="limpiarFiltros">
            <i class="fas fa-times"></i> Limpiar filtros
          </button>
        </div>

        <!-- Tabla -->
        <div v-else class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:120px;">Fecha</th>
                <th>Proveedor</th>
                <th style="width:180px;">N° Factura</th>
                <th style="width:130px;">Tipo</th>
                <th style="width:110px;" class="text-end">Base</th>
                <th style="width:80px;" class="text-end">%</th>
                <th style="width:120px;" class="text-end">Retenido</th>
                <th style="width:110px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in retencionesFiltradas" :key="r._id">
                <td>
                  <div class="fecha-cell">{{ formatFecha(r.fecha_emision) }}</div>
                </td>
                <td>
                  <div class="proveedor-cell">
                    <div class="proveedor-avatar">{{ inicial(nombreProveedor(r)) }}</div>
                    <div class="proveedor-info">
                      <div class="proveedor-nombre" :title="nombreProveedor(r)">
                        {{ nombreProveedor(r) }}
                      </div>
                      <div v-if="rucProveedor(r)" class="proveedor-ruc">
                        {{ rucProveedor(r) }}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <code class="doc-badge">{{ r.numero_factura || '—' }}</code>
                </td>
                <td>
                  <span
                    class="badge-tipo-retencion"
                    :class="claseImpuesto(r)"
                  >
                    <i :class="iconoImpuesto(r)"></i>
                    {{ etiquetaTipo(r) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="money-num">{{ formatCurrency(r.base_imponible) }}</span>
                </td>
                <td class="text-end">
                  <span class="porcentaje-badge">{{ r.porcentaje || 0 }}%</span>
                </td>
                <td class="text-end">
                  <span class="money-total">{{ formatCurrency(r.valor_retenido) }}</span>
                </td>
                <td>
                  <div class="actions-cell">
                    <button
                      class="btn-icon btn-delete"
                      @click="pedirEliminar(r)"
                      :disabled="eliminandoId === r._id"
                      title="Eliminar retención"
                      :aria-label="`Eliminar retención de ${nombreProveedor(r)}`"
                    >
                      <i
                        class="fas fa-trash"
                        :class="{ 'fa-spin': eliminandoId === r._id }"
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
      id="modalConfirmRetencion"
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
import { formatCurrency, roundTo2 } from '../../utils/formatters'

const toast = useToast()

// ===== CONSTANTES =====
const FILTROS_IMPUESTO = Object.freeze([
  { value: '', label: 'Todas', icon: 'fas fa-list' },
  { value: 'RENTA', label: 'Renta', icon: 'fas fa-file-invoice-dollar' },
  { value: 'IVA', label: 'IVA', icon: 'fas fa-percent' }
])

// ===== STATE =====
const retenciones = ref([])
const loading = ref(false)
const search = ref('')
const filtroImpuesto = ref('')
const eliminandoId = ref(null)

// Modales
let modalConfirm = null
let unmounted = false

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

const filtrosImpuesto = FILTROS_IMPUESTO

// ===== COMPUTED =====
const totalRetenido = computed(() =>
  roundTo2(retenciones.value.reduce((s, r) => s + (Number(r.valor_retenido) || 0), 0))
)

const proveedoresUnicos = computed(() => {
  const set = new Set()
  retenciones.value.forEach(r => {
    const id = r.proveedorId || r.proveedor?._id
    if (id) set.add(String(id))
  })
  return set.size
})

const retencionesDelMes = computed(() => {
  const hoy = new Date()
  const mes = hoy.getMonth()
  const anio = hoy.getFullYear()
  return retenciones.value.filter(r => {
    if (!r.fecha_emision) return false
    const f = new Date(r.fecha_emision)
    return f.getMonth() === mes && f.getFullYear() === anio
  }).length
})

const retencionesFiltradas = computed(() => {
  let list = retenciones.value

  // Filtro por impuesto
  if (filtroImpuesto.value) {
    list = list.filter(r => {
      const imp = String(r.impuesto_retencion || '').toUpperCase()
      return imp === filtroImpuesto.value
    })
  }

  // Búsqueda por texto
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return list

  return list.filter(r => {
    const nombre = String(nombreProveedor(r) || '').toLowerCase()
    const ruc = String(rucProveedor(r) || '').toLowerCase()
    const numFactura = String(r.numero_factura || '').toLowerCase()
    return nombre.includes(q) || ruc.includes(q) || numFactura.includes(q)
  })
})

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  } catch { return '—' }
}

const nombreProveedor = (r) => r.proveedor?.nombre || 'Proveedor eliminado'
const rucProveedor = (r) => r.proveedor?.ruc || ''

const claseImpuesto = (r) => {
  const imp = String(r.impuesto_retencion || '').toUpperCase()
  if (imp === 'RENTA') return 'tipo-renta'
  if (imp === 'IVA') return 'tipo-iva'
  return 'tipo-neutral'
}

const iconoImpuesto = (r) => {
  const imp = String(r.impuesto_retencion || '').toUpperCase()
  if (imp === 'RENTA') return 'fas fa-file-invoice-dollar'
  if (imp === 'IVA') return 'fas fa-percent'
  return 'fas fa-circle'
}

const etiquetaTipo = (r) => {
  const imp = String(r.impuesto_retencion || '').toUpperCase()
  const codigo = r.tipo_retencion || ''
  if (imp && codigo) return `${imp} ${codigo}`
  return imp || codigo || '—'
}

const limpiarFiltros = () => {
  search.value = ''
  filtroImpuesto.value = ''
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
      modalConfirm = new Modal(document.getElementById('modalConfirmRetencion'), {
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
    const res = await api.request('/retenciones?limit=5000&sortBy=fecha_emision&sortDir=desc', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return
    retenciones.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar retenciones: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== ELIMINAR =====
const pedirEliminar = async (retencion) => {
  if (eliminandoId.value === retencion._id) return

  const confirmado = await pedirConfirmacion({
    titulo: 'Eliminar retención',
    mensaje: `¿Eliminar la retención de "${nombreProveedor(retencion)}"?`,
    detalle:
      retencion.numero_factura
        ? `N° factura: ${retencion.numero_factura}. Esta acción no se puede deshacer.`
        : 'Esta acción no se puede deshacer.',
    textoConfirmar: 'Eliminar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado || unmounted) return

  eliminandoId.value = retencion._id
  try {
    await api.request(`/retenciones/${retencion._id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando...'
    })
    if (unmounted) return
    toast.success('Retención eliminada correctamente')
    await cargar()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'RETENCION_NOT_FOUND') {
      toast.error('La retención ya no existe')
      await cargar()
    } else if (codigo === 'ID_INVALIDO') {
      toast.error('ID inválido')
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
.retenciones-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-purple { background: linear-gradient(135deg, #8e44ad, #6c3483); box-shadow: 0 6px 16px rgba(142,68,173,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
  text-decoration: none;
}
.btn-primary { background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; box-shadow: 0 4px 12px rgba(142,68,173,0.3); }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(142,68,173,0.4); color: #fff; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); border-left: 4px solid transparent; transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-purple { border-left-color: #8e44ad; }
.stat-card-success { border-left-color: #27ae60; }
.stat-card-info { border-left-color: #17a2b8; }

.stat-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }
.stat-icon.verde { background: rgba(39,174,96,0.12); color: #27ae60; }
.stat-icon.cyan { background: rgba(23,162,184,0.12); color: #17a2b8; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.4rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

/* FILTROS */
.filters-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); }
.search-wrapper { position: relative; flex: 1; min-width: 240px; }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem; pointer-events: none; }
.search-input { width: 100%; padding: 10px 40px 10px 40px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.search-input:focus { border-color: #8e44ad; box-shadow: 0 0 0 4px rgba(142,68,173,0.12); background: var(--bg-card); }
.search-clear { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; border-radius: 50%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.search-clear:hover { color: var(--danger); background: var(--bg-table-stripe); }

.filter-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-card); border: 1.5px solid var(--border-color); border-radius: var(--radius-full); color: var(--text-secondary); font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.filter-chip:hover { border-color: #8e44ad; color: #8e44ad; }
.filter-chip.active { background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; border-color: transparent; }

/* TABLA */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-count { margin-left: 6px; padding: 2px 10px; background: rgba(142,68,173,0.15); color: #6c3483; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 14px 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.fecha-cell { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }

.proveedor-cell { display: flex; align-items: center; gap: 12px; min-width: 0; }
.proveedor-avatar { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(142,68,173,0.25); }
.proveedor-info { min-width: 0; flex: 1; }
.proveedor-nombre { font-weight: 700; color: var(--text-primary); font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.proveedor-ruc { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono, monospace); margin-top: 2px; }

.doc-badge { background: var(--bg-table-stripe); padding: 3px 10px; border-radius: 6px; font-family: var(--font-mono, monospace); font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }

.badge-tipo-retencion { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
.tipo-renta { background: rgba(52,152,219,0.15); color: #2980b9; }
.tipo-iva { background: rgba(142,68,173,0.15); color: #6c3483; }
.tipo-neutral { background: var(--bg-table-stripe); color: var(--text-muted); }

.money-num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text-secondary); font-size: 0.85rem; }
.money-total { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }
.porcentaje-badge { display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm); background: rgba(142,68,173,0.1); color: #6c3483; font-weight: 800; font-size: 0.78rem; font-variant-numeric: tabular-nums; }

.actions-cell { display: flex; gap: 6px; justify-content: center; }
.btn-icon { width: 34px; height: 34px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; transition: all var(--transition-fast); text-decoration: none; }
.btn-delete:hover:not(:disabled) { border-color: #e74c3c !important; color: #e74c3c !important; background: rgba(231,76,60,0.08) !important; }
.btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }

/* LOADING/EMPTY */
.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #8e44ad; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-block { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--bg-table-stripe); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 1.8rem; margin: 0 auto 14px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; margin-bottom: 16px; max-width: 400px; margin-left: auto; margin-right: auto; }
.empty-action { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(142,68,173,0.1); border: 1px solid rgba(142,68,173,0.3); border-radius: var(--radius-md); color: #6c3483; font-weight: 600; font-size: 0.82rem; cursor: pointer; text-decoration: none; transition: all var(--transition-fast); font-family: inherit; }
.empty-action:hover { background: #8e44ad; color: #fff; border-color: #8e44ad; }

/* MODAL */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .filters-bar { flex-direction: column; align-items: stretch; }
  .proveedor-nombre { max-width: 140px; }
}
</style>