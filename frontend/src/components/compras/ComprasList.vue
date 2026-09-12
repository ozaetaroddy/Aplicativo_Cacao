<template>
  <div class="compras-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-shopping-cart"></i></span>
          Compras
        </h1>
        <p class="page-subtitle">Gestiona las facturas de compras y gastos de tu empresa</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-secondary-action" @click="abrirModalImportar">
          <i class="fas fa-file-import"></i>
          <span>Importar TXT</span>
        </button>
        <router-link to="/compras/nuevo" class="btn-primary-action">
          <i class="fas fa-plus"></i>
          <span>Nueva Compra</span>
        </router-link>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-row">
      <div class="kpi-stat" style="--stat-color: #3498db;">
        <div class="stat-icon"><i class="fas fa-file-invoice"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.total }}</div>
          <div class="stat-label">Total compras (mes)</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #27ae60;">
        <div class="stat-icon"><i class="fas fa-boxes"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.inventario }}</div>
          <div class="stat-label">Inventario (mes)</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #f39c12;">
        <div class="stat-icon"><i class="fas fa-receipt"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.gastos }}</div>
          <div class="stat-label">Gastos (mes)</div>
        </div>
      </div>
      <div class="kpi-stat" style="--stat-color: #e74c3c;">
        <div class="stat-icon"><i class="fas fa-clock"></i></div>
        <div class="stat-body">
          <div class="stat-number">{{ stats.pendientes }}</div>
          <div class="stat-label">Por pagar</div>
        </div>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="filters-bar">
      <div class="filters-group">
        <span class="filters-label"><i class="fas fa-filter"></i> Filtrar:</span>
        <button class="filter-chip" :class="{ active: filtroTipo === '' }" @click="cambiarFiltroTipo('')">
          <i class="fas fa-list"></i><span>Todas</span>
        </button>
        <button class="filter-chip chip-success" :class="{ active: filtroTipo === 'inventario' }" @click="cambiarFiltroTipo('inventario')">
          <i class="fas fa-boxes"></i><span>Inventario</span>
        </button>
        <button class="filter-chip chip-warning" :class="{ active: filtroTipo === 'gasto' }" @click="cambiarFiltroTipo('gasto')">
          <i class="fas fa-receipt"></i><span>Gastos</span>
        </button>
      </div>
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input
          v-model="search"
          @input="onSearchInput"
          placeholder="Buscar por Nº, proveedor, RUC..."
          type="text"
        />
        <button v-if="search" @click="search = ''; reload()" class="clear-btn">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="min-width:100px;">Fecha</th>
                <th style="min-width:130px;">Nº Factura</th>
                <th style="min-width:200px;">Proveedor</th>
                <th style="min-width:100px;">Tipo</th>
                <th style="min-width:100px;">Estado</th>
                <th style="min-width:110px;" class="text-end">Subtotal</th>
                <th style="min-width:100px;" class="text-end">IVA</th>
                <th style="min-width:110px;" class="text-end">Total</th>
                <th style="width:120px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="loading">
                <tr v-for="n in 5" :key="`sk-${n}`">
                  <td v-for="col in 9" :key="`c-${col}`">
                    <div class="skeleton-line"></div>
                  </td>
                </tr>
              </template>

              <tr v-else-if="compras.length === 0">
                <td colspan="9" class="empty-state-cell">
                  <div class="empty-state">
                    <div class="empty-icon"><i class="fas fa-shopping-cart"></i></div>
                    <div class="empty-title">No hay compras registradas</div>
                    <div class="empty-text">
                      {{ filtroTipo ? `No hay compras de tipo "${filtroTipo}"` : 'Registra tu primera compra para comenzar' }}
                    </div>
                    <router-link to="/compras/nuevo" class="btn-empty-action">
                      <i class="fas fa-plus"></i> Crear Nueva Compra
                    </router-link>
                  </div>
                </td>
              </tr>

              <tr v-else v-for="c in compras" :key="c._id" class="compra-row">
                <td>
                  <div class="cell-date">
                    <div class="date-main">{{ formatFecha(c.fecha_emision) }}</div>
                    <div class="date-sub">{{ formatHora(c.fecha_emision) }}</div>
                  </div>
                </td>
                <td><span class="badge-doc">{{ c.numero_factura }}</span></td>
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar">{{ getInitials(c.proveedor?.nombre) }}</div>
                    <div class="cliente-info">
                      <div class="cliente-nombre">{{ c.proveedor?.nombre || 'N/A' }}</div>
                      <div class="cliente-ruc">{{ c.proveedor?.ruc || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="badge-tipo" :class="c.tipo_compra === 'inventario' ? 'tipo-inventario' : 'tipo-gasto'">
                    <i :class="c.tipo_compra === 'inventario' ? 'fas fa-boxes' : 'fas fa-receipt'"></i>
                    {{ c.tipo_compra || 'inventario' }}
                  </span>
                </td>
                <td>
                  <span class="badge-pago" :class="c.estado_pago === 'pagado' ? 'badge-pago-ok' : 'badge-pago-pending'">
                    <i :class="c.estado_pago === 'pagado' ? 'fas fa-check' : 'fas fa-clock'"></i>
                    {{ c.estado_pago || 'pendiente' }}
                  </span>
                </td>
                <td class="text-end"><div class="cell-money">${{ (c.subtotal || 0).toFixed(2) }}</div></td>
                <td class="text-end"><div class="cell-money">${{ (c.iva || 0).toFixed(2) }}</div></td>
                <td class="text-end"><div class="cell-total">${{ (c.total || 0).toFixed(2) }}</div></td>
                <td>
                  <div class="actions-cell">
                    <router-link :to="`/compras/editar/${c._id}`" class="action-icon-btn btn-action-secondary" title="Editar">
                      <i class="fas fa-edit"></i>
                    </router-link>
                    <button class="action-icon-btn btn-action-danger" @click="eliminar(c)" title="Eliminar">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- PAGINACIÓN SERVER-SIDE -->
        <div class="table-footer">
          <div class="footer-info">
            Mostrando <strong>{{ compras.length }}</strong> de <strong>{{ total }}</strong> registros
          </div>
          <div class="pagination-controls">
            <select class="limit-select" v-model.number="limit" @change="reload">
              <option :value="10">10 / pág</option>
              <option :value="20">20 / pág</option>
              <option :value="50">50 / pág</option>
              <option :value="100">100 / pág</option>
            </select>
            <button class="btn-page" :disabled="page === 1" @click="goToPage(1)"><i class="fas fa-angle-double-left"></i></button>
            <button class="btn-page" :disabled="page === 1" @click="goToPage(page - 1)"><i class="fas fa-angle-left"></i></button>
            <span class="page-info">{{ page }} / {{ totalPages || 1 }}</span>
            <button class="btn-page" :disabled="page >= totalPages" @click="goToPage(page + 1)"><i class="fas fa-angle-right"></i></button>
            <button class="btn-page" :disabled="page >= totalPages" @click="goToPage(totalPages)"><i class="fas fa-angle-double-right"></i></button>
            <button class="btn-refresh" @click="cargar" :disabled="loading"><i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL IMPORTAR TXT -->
    <div class="modal fade" id="modalImportar" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header modal-header-import">
            <div>
              <h5 class="modal-title"><i class="fas fa-file-import"></i> Importar Facturas desde TXT</h5>
              <p class="modal-subtitle">Sube el archivo del SRI con formato separado por tabuladores</p>
            </div>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle me-2"></i>
              <div>
                Seleccione un archivo TXT con el formato de facturas del SRI.
                Puede seleccionar individualmente si cada factura es de <strong>Inventario</strong> o <strong>Gasto</strong>.
              </div>
            </div>

            <div class="import-file-row">
              <div class="file-input-wrapper">
                <input type="file" id="fileInput" accept=".txt" @change="procesarArchivo" ref="fileInput" />
                <label for="fileInput" class="file-input-label">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <span>{{ archivoNombre || 'Seleccionar archivo TXT' }}</span>
                </label>
              </div>
              <div class="import-actions">
                <button class="btn-import-action btn-outline" @click="seleccionarTodos('inventario')" :disabled="!lineas.length">
                  <i class="fas fa-boxes"></i> Todos Inventario
                </button>
                <button class="btn-import-action btn-outline" @click="seleccionarTodos('gasto')" :disabled="!lineas.length">
                  <i class="fas fa-receipt"></i> Todos Gasto
                </button>
                <button class="btn-import-action btn-primary" @click="importarFacturas" :disabled="!lineas.length || importando">
                  <i class="fas fa-upload" :class="{ 'fa-spin': importando }"></i>
                  {{ importando ? 'Importando...' : `Importar ${lineas.length}` }}
                </button>
              </div>
            </div>

            <div v-if="lineas.length > 0" class="import-preview">
              <div class="preview-header">
                <h6><i class="fas fa-list"></i> Vista previa ({{ lineas.length }} líneas)</h6>
              </div>
              <div class="preview-table-wrapper">
                <table class="table-modern preview-table">
                  <thead>
                    <tr>
                      <th style="width:40px;">#</th>
                      <th>RUC Emisor</th>
                      <th>Razón Social</th>
                      <th>Fecha</th>
                      <th class="text-end">Total</th>
                      <th style="width:140px;">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(linea, idx) in lineas" :key="idx">
                      <td>{{ idx + 1 }}</td>
                      <td class="font-monospace small">{{ linea.ruc }}</td>
                      <td class="small">{{ linea.razonSocial }}</td>
                      <td class="small">{{ linea.fecha }}</td>
                      <td class="text-end small">${{ linea.total.toFixed(2) }}</td>
                      <td>
                        <select class="form-select form-select-sm" v-model="linea.tipo">
                          <option value="inventario">Inventario</option>
                          <option value="gasto">Gasto</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="resultadoImportacion" class="import-result">
              <div class="alert" :class="resultadoImportacion.errores.length > 0 ? 'alert-warning' : 'alert-success'">
                <i :class="resultadoImportacion.errores.length > 0 ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'"></i>
                <div>
                  <strong>{{ resultadoImportacion.importados }}</strong> facturas importadas correctamente.
                  <span v-if="resultadoImportacion.errores.length > 0">
                    <br><small>{{ resultadoImportacion.errores.length }} errores encontrados</small>
                  </span>
                </div>
              </div>
              <div v-if="resultadoImportacion.errores.length > 0" class="import-errors">
                <div v-for="(err, idx) in resultadoImportacion.errores.slice(0, 10)" :key="idx" class="error-item">
                  <i class="fas fa-times-circle"></i>
                  <span>{{ err }}</span>
                </div>
                <div v-if="resultadoImportacion.errores.length > 10" class="error-more">
                  ... y {{ resultadoImportacion.errores.length - 10 }} errores más
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { Modal } from 'bootstrap'

const router = useRouter()
const toast = useToast()

const compras = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const totalPages = ref(1)
const loading = ref(false)
const search = ref('')
const filtroTipo = ref('')
const modalInstance = ref(null)

// Stats (mes actual)
const stats = ref({ total: 0, inventario: 0, gastos: 0, pendientes: 0 })

// Import
const fileInput = ref(null)
const lineas = ref([])
const archivoNombre = ref('')
const importando = ref(false)
const resultadoImportacion = ref(null)

let searchTimer = null
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; cargar() }, 400)
}

const reload = () => { page.value = 1; cargar() }
const goToPage = (p) => {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  cargar()
}

const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const formatHora = (f) => f ? new Date(f).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : ''
const getInitials = (n) => n ? String(n).split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() : '?'

// ===== CARGA PAGINADA =====
const cargar = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', page.value)
    params.set('limit', limit.value)
    params.set('sortBy', 'fecha_emision')
    params.set('sortDir', 'desc')
    if (search.value) params.set('search', search.value)
    if (filtroTipo.value) params.set('tipo_compra', filtroTipo.value)

    const res = await api.request(`/compras?${params.toString()}`, { method: 'GET' })
    if (Array.isArray(res)) {
      compras.value = res
      total.value = res.length
      totalPages.value = 1
    } else {
      compras.value = res.data || []
      total.value = res.total || 0
      totalPages.value = res.totalPages || 1
    }
  } catch (e) {
    toast.error('Error al cargar: ' + e.message)
  } finally {
    loading.value = false
  }
}

// ===== STATS (mes actual) =====
const cargarStats = async () => {
  try {
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)

    const params = new URLSearchParams()
    params.set('desde', inicioMes)
    params.set('hasta', finMes)
    params.set('limit', '200')

    const res = await api.request(`/compras?${params.toString()}`, { method: 'GET', skipLoader: true })
    const datos = Array.isArray(res) ? res : (res.data || [])

    stats.value = {
      total: Array.isArray(res) ? datos.length : (res.total || 0),
      inventario: datos.filter(c => c.tipo_compra === 'inventario').length,
      gastos: datos.filter(c => c.tipo_compra === 'gasto').length,
      pendientes: datos.filter(c => c.estado_pago !== 'pagado').length
    }
  } catch (e) { /* silencioso */ }
}

const cambiarFiltroTipo = (tipo) => {
  filtroTipo.value = tipo
  reload()
}

const eliminar = async (c) => {
  if (!confirm(`¿Eliminar la compra ${c.numero_factura}?\n\nSe revertirá el inventario si era de tipo "inventario".`)) return
  try {
    await api.request(`/compras/${c._id}`, { method: 'DELETE', loaderMessage: 'Eliminando...' })
    toast.success('Compra eliminada')
    cargar()
    cargarStats()
  } catch (e) {
    toast.error('Error al eliminar: ' + e.message)
  }
}

// ===== MODAL IMPORTAR =====
const abrirModalImportar = () => {
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalImportar')
    modalInstance.value = new Modal(modalEl, { backdrop: 'static' })
  }
  lineas.value = []
  resultadoImportacion.value = null
  importando.value = false
  archivoNombre.value = ''
  if (fileInput.value) fileInput.value.value = ''
  modalInstance.value.show()
}

const procesarArchivo = (event) => {
  const file = event.target.files[0]
  if (!file) return
  archivoNombre.value = file.name

  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    const lineasRaw = contenido.split('\n').filter(l => l.trim() !== '')
    const dataLines = lineasRaw[0].toLowerCase().includes('ruc_emisor')
      ? lineasRaw.slice(1)
      : lineasRaw

    const parsed = dataLines.map(line => {
      const campos = line.split('\t').map(c => c.trim())
      if (campos.length < 11) return null
      return {
        ruc: campos[0],
        razonSocial: campos[1],
        tipoComprobante: campos[2],
        serie: campos[3],
        claveAcceso: campos[4],
        fechaAutorizacion: campos[5],
        fechaEmision: campos[6],
        identificacionReceptor: campos[7],
        valorSinImpuestos: parseFloat(campos[8]) || 0,
        iva: parseFloat(campos[9]) || 0,
        total: parseFloat(campos[10]) || 0,
        tipo: 'inventario',
        fecha: campos[6] ? new Date(campos[6]).toLocaleDateString() : ''
      }
    }).filter(l => l && l.ruc && l.total > 0)

    lineas.value = parsed
    resultadoImportacion.value = null
    toast.info(`${parsed.length} líneas procesadas`)
  }
  reader.readAsText(file)
}

const seleccionarTodos = (tipo) => {
  lineas.value.forEach(l => { l.tipo = tipo })
}

const importarFacturas = async () => {
  if (lineas.value.length === 0) return
  importando.value = true
  resultadoImportacion.value = null

  try {
    const payload = {
      lineas: lineas.value.map(l => ({
        ruc: l.ruc,
        razonSocial: l.razonSocial,
        fechaEmision: l.fechaEmision,
        total: l.total,
        valorSinImpuestos: l.valorSinImpuestos,
        iva: l.iva,
        tipo_compra: l.tipo
      }))
    }
    const data = await api.request('/compras/importar-txt', {
      method: 'POST',
      body: JSON.stringify(payload),
      loaderMessage: 'Importando facturas...'
    })
    resultadoImportacion.value = data
    toast.success(`Importación completada: ${data.importados} facturas`)
    cargar()
    cargarStats()

    if (data.errores.length === 0) {
      setTimeout(() => { if (modalInstance.value) modalInstance.value.hide() }, 2000)
    }
  } catch (e) {
    toast.error('Error en la importación: ' + e.message)
  } finally {
    importando.value = false
  }
}

onMounted(() => {
  cargar()
  cargarStats()
})
</script>

<style scoped>
/* ==== HEADER ==== */
.compras-page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em; display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
.title-icon { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #e67e22, #d35400); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; box-shadow: 0 8px 20px rgba(230, 126, 34, 0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0; padding-left: 62px; }
.page-header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-primary-action, .btn-secondary-action { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem; transition: all var(--transition); cursor: pointer; text-decoration: none; border: none; font-family: inherit; }
.btn-primary-action { background: linear-gradient(135deg, #e67e22, #d35400); color: #fff; box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3); }
.btn-primary-action:hover { transform: translateY(-2px); color: #fff; }
.btn-secondary-action { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary-action:hover { border-color: #e67e22; color: #e67e22; }

/* ==== KPIs ==== */
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.kpi-stat { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); transition: all var(--transition); position: relative; overflow: hidden; }
.kpi-stat::after { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--stat-color); }
.kpi-stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon { width: 44px; height: 44px; border-radius: 12px; background: color-mix(in srgb, var(--stat-color) 15%, transparent); color: var(--stat-color); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; }
.stat-number { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.stat-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 2px; }

/* ==== FILTROS ==== */
.filters-bar { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.filters-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filters-label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; display: flex; align-items: center; gap: 6px; margin-right: 8px; }
.filter-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: var(--radius-full); background: var(--bg-table-stripe); border: 1.5px solid var(--border-color); font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.filter-chip:hover { border-color: #e67e22; color: #e67e22; }
.filter-chip.active { background: #e67e22; border-color: #e67e22; color: #fff; }
.chip-success.active { background: #27ae60; border-color: #27ae60; }
.chip-warning.active { background: #f39c12; border-color: #f39c12; }

.search-box { position: relative; display: flex; align-items: center; min-width: 260px; }
.search-box i.fa-search { position: absolute; left: 12px; color: var(--text-muted); font-size: 0.85rem; pointer-events: none; }
.search-box input { width: 100%; padding: 8px 36px 8px 36px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: var(--bg-input); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.search-box input:focus { border-color: #e67e22; box-shadow: 0 0 0 3px rgba(230, 126, 34, 0.15); background: var(--bg-card); }
.search-box .clear-btn { position: absolute; right: 8px; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; }

/* ==== TABLA ==== */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 14px 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.compra-row:hover { background: var(--bg-table-stripe); }
.cell-date .date-main { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
.cell-date .date-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
.badge-doc { font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; padding: 4px 10px; background: var(--bg-table-stripe); border: 1px solid var(--border-color); border-radius: 4px; }
.cliente-cell { display: flex; align-items: center; gap: 10px; }
.cliente-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #e67e22, #d35400); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.72rem; flex-shrink: 0; }
.cliente-nombre { font-weight: 600; font-size: 0.85rem; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cliente-ruc { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); }
.badge-tipo { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 700; text-transform: capitalize; }
.tipo-inventario { background: var(--success-bg); color: var(--success); }
.tipo-gasto { background: var(--warning-bg); color: #d68910; }
.badge-pago { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 700; text-transform: capitalize; }
.badge-pago-ok { background: var(--success-bg); color: var(--success); }
.badge-pago-pending { background: var(--warning-bg); color: #d68910; }
.cell-money { font-weight: 600; font-size: 0.85rem; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
.cell-total { font-weight: 800; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
.actions-cell { display: flex; gap: 4px; justify-content: center; }
.action-icon-btn { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; transition: all var(--transition-fast); padding: 0; }
.action-icon-btn:hover { transform: translateY(-1px); }
.btn-action-secondary:hover { background: #e67e22; color: #fff; border-color: #e67e22; }
.btn-action-danger { border-color: #e74c3c; color: #e74c3c; }
.btn-action-danger:hover { background: #e74c3c; color: #fff; border-color: #e74c3c; }

/* ==== PAGINACIÓN ==== */
.table-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--bg-table-stripe); flex-wrap: wrap; gap: 12px; }
.footer-info { font-size: 0.82rem; color: var(--text-muted); }
.footer-info strong { color: var(--text-primary); }
.pagination-controls { display: flex; align-items: center; gap: 6px; }
.limit-select { padding: 6px 10px; background: var(--bg-card); border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.btn-page { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; }
.btn-page:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-page:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; }
.page-info { padding: 0 8px; font-size: 0.82rem; font-weight: 600; }
.btn-refresh { padding: 8px 14px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: var(--bg-card); cursor: pointer; font-weight: 600; font-size: 0.82rem; }
.btn-refresh:hover { border-color: #e67e22; color: #e67e22; }

/* ==== EMPTY / SKELETON ==== */
.empty-state-cell { padding: 0 !important; }
.empty-state { text-align: center; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-table-stripe); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 2rem; }
.empty-title { font-weight: 700; font-size: 1.05rem; }
.empty-text { font-size: 0.85rem; color: var(--text-muted); max-width: 380px; }
.btn-empty-action { display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; background: #e67e22; color: #fff; border-radius: var(--radius-md); font-weight: 600; text-decoration: none; }
.skeleton-line { height: 14px; background: linear-gradient(90deg, var(--border-light) 25%, var(--bg-table-stripe) 50%, var(--border-light) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

/* ==== MODAL IMPORTAR ==== */
.modal-header-import { background: linear-gradient(135deg, #e67e22, #d35400); color: #fff; }
.modal-header-import .modal-title { display: flex; align-items: center; gap: 10px; font-size: 1.1rem; color: #fff; }
.modal-subtitle { font-size: 0.8rem; opacity: 0.85; margin: 4px 0 0; }
.import-file-row { display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap; margin-bottom: 20px; }
.file-input-wrapper { flex: 1; min-width: 260px; position: relative; }
.file-input-wrapper input[type="file"] { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; z-index: 2; }
.file-input-label { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border: 2px dashed var(--border-color); border-radius: var(--radius-md); background: var(--bg-table-stripe); color: var(--text-secondary); font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all var(--transition); height: 100%; }
.file-input-label:hover { border-color: #e67e22; color: #e67e22; background: rgba(230, 126, 34, 0.05); }
.file-input-label i { font-size: 1.3rem; }
.import-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-import-action { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: var(--radius-md); font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all var(--transition-fast); border: 1.5px solid; font-family: inherit; }
.btn-import-action.btn-outline { background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary); }
.btn-import-action.btn-outline:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; }
.btn-import-action.btn-primary { background: #e67e22; border-color: #e67e22; color: #fff; }
.btn-import-action.btn-primary:hover:not(:disabled) { background: #d35400; }
.btn-import-action:disabled { opacity: 0.5; cursor: not-allowed; }
.import-preview { margin-top: 20px; }
.preview-header { margin-bottom: 10px; }
.preview-header h6 { font-size: 0.9rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.preview-table-wrapper { max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.preview-table thead { position: sticky; top: 0; background: var(--bg-table-stripe); z-index: 5; }
.preview-table th, .preview-table td { padding: 8px 10px; }
.import-result { margin-top: 16px; }
.import-result .alert { display: flex; align-items: flex-start; gap: 12px; }
.import-errors { margin-top: 12px; max-height: 200px; overflow-y: auto; padding: 12px; background: rgba(231, 76, 60, 0.05); border-radius: var(--radius-md); }
.error-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: 0.8rem; color: var(--danger); }
.error-more { font-size: 0.78rem; color: var(--text-muted); padding: 6px 0; font-style: italic; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .filters-bar { flex-direction: column; align-items: stretch; }
  .search-box { min-width: 0; width: 100%; }
  .import-file-row { flex-direction: column; }
  .import-actions { justify-content: stretch; }
  .btn-import-action { flex: 1; justify-content: center; }
}
</style>