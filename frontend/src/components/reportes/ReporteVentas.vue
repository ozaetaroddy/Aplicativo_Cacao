<template>
  <div class="reporte-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-green"><i class="fas fa-chart-bar"></i></span>
          Reporte de Ventas
        </h1>
        <p class="page-subtitle">
          Listado de ventas por rango de fechas, con totales y exportación
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarExcel"
          :disabled="loading || ventas.length === 0"
          aria-label="Exportar a Excel"
        >
          <i class="fas fa-file-excel"></i>
          Excel
        </button>
        <button
          class="btn-danger"
          @click="exportarPDF"
          :disabled="loading || ventas.length === 0"
          aria-label="Exportar a PDF"
        >
          <i class="fas fa-file-pdf"></i>
          PDF
        </button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="filters-card">
      <div class="filters-grid">
        <div class="form-field">
          <label class="form-label" for="rep-desde">Desde</label>
          <input
            id="rep-desde"
            type="date"
            class="form-input"
            v-model="desde"
            :disabled="loading"
          />
        </div>
        <div class="form-field">
          <label class="form-label" for="rep-hasta">Hasta</label>
          <input
            id="rep-hasta"
            type="date"
            class="form-input"
            v-model="hasta"
            :disabled="loading"
          />
        </div>
        <div class="quick-dates">
          <span class="quick-dates-label">Rápido:</span>
          <button
            v-for="q in quickDates"
            :key="q.label"
            type="button"
            class="quick-chip"
            :disabled="loading"
            @click="aplicarQuickDate(q)"
          >
            {{ q.label }}
          </button>
        </div>
        <div class="filters-actions">
          <button
            class="btn-primary"
            @click="generar"
            :disabled="loading || !desde || !hasta"
            aria-label="Generar reporte"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
            {{ loading ? 'Generando...' : 'Generar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- STATS -->
    <div v-if="ventas.length > 0 && !loading" class="stats-grid">
      <div class="stat-card stat-card-info">
        <div class="stat-icon azul"><i class="fas fa-file-invoice"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ ventas.length.toLocaleString() }}</div>
          <div class="stat-label">Comprobantes</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon cyan"><i class="fas fa-coins"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ formatCurrency(totalSubtotal) }}</div>
          <div class="stat-label">Subtotal</div>
        </div>
      </div>
      <div class="stat-card stat-card-warning">
        <div class="stat-icon naranja"><i class="fas fa-percent"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ formatCurrency(totalIva) }}</div>
          <div class="stat-label">IVA</div>
        </div>
      </div>
      <div class="stat-card stat-card-success">
        <div class="stat-icon verde"><i class="fas fa-dollar-sign"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ formatCurrency(totalTotal) }}</div>
          <div class="stat-label">Total</div>
        </div>
      </div>
    </div>

    <!-- META -->
    <div v-if="fechaGeneracion && !loading" class="meta-info">
      <i class="far fa-clock"></i>
      Reporte generado el {{ fechaGeneracion }}
      <span v-if="hayRango" class="meta-range">
        · Período: {{ formatFecha(desde) }} → {{ formatFecha(hasta) }}
      </span>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Ventas
          <span v-if="!loading" class="header-count">{{ ventas.length }}</span>
        </div>
      </div>
      <div class="card-body p-0">
        <!-- Skeleton -->
        <div v-if="loading" class="loading-block">
          <div class="spinner-lg"></div>
          <p>Cargando reporte...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="ventas.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-chart-bar"></i></div>
          <div class="empty-title">
            {{ consultado ? 'Sin ventas en el período' : 'Selecciona fechas y genera el reporte' }}
          </div>
          <div class="empty-text">
            {{
              consultado
                ? 'No se encontraron ventas con los filtros aplicados'
                : 'Elige un rango de fechas y presiona "Generar"'
            }}
          </div>
          <button
            v-if="!consultado"
            class="empty-action"
            @click="aplicarQuickDate(quickDates[2])"
          >
            <i class="fas fa-calendar-alt"></i> Este mes
          </button>
        </div>

        <!-- Tabla -->
        <div v-else class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:130px;">Fecha</th>
                <th>Cliente</th>
                <th style="width:160px;">Nº Factura</th>
                <th style="width:110px;" class="text-end">Subtotal</th>
                <th style="width:100px;" class="text-end">IVA</th>
                <th style="width:120px;" class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in ventas" :key="v._id">
                <td>
                  <div class="cell-fecha">{{ formatFecha(v.fecha_emision) }}</div>
                </td>
                <td>
                  <div class="cell-cliente">
                    <div class="cliente-avatar">{{ inicial(v.cliente?.nombre) }}</div>
                    <div class="cliente-nombre" :title="v.cliente?.nombre">
                      {{ v.cliente?.nombre || 'N/A' }}
                    </div>
                  </div>
                </td>
                <td>
                  <code class="doc-badge">{{ v.numero_factura || '—' }}</code>
                </td>
                <td class="text-end">
                  <span class="money-num">{{ formatCurrency(v.subtotal) }}</span>
                </td>
                <td class="text-end">
                  <span class="money-num">{{ formatCurrency(v.iva) }}</span>
                </td>
                <td class="text-end">
                  <span class="money-total">{{ formatCurrency(v.total) }}</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="tfoot-totales">
                <td colspan="3" class="text-end">TOTALES</td>
                <td class="text-end">{{ formatCurrency(totalSubtotal) }}</td>
                <td class="text-end">{{ formatCurrency(totalIva) }}</td>
                <td class="text-end">{{ formatCurrency(totalTotal) }}</td>
              </tr>
            </tfoot>
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
import { formatCurrency, roundTo2 } from '../../utils/formatters'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()

// ===== CONSTANTES =====
const QUICK_DATES = Object.freeze([
  { label: 'Hoy', tipo: 'hoy' },
  { label: 'Últimos 7 días', tipo: 'dias', dias: 7 },
  { label: 'Este mes', tipo: 'mes' },
  { label: 'Este año', tipo: 'anio' }
])

// ===== STATE =====
const desde = ref('')
const hasta = ref('')
const ventas = ref([])
const loading = ref(false)
const consultado = ref(false)
const fechaGeneracion = ref('')

let unmounted = false

const quickDates = QUICK_DATES

// ===== COMPUTED =====
const totalSubtotal = computed(() =>
  roundTo2(ventas.value.reduce((acc, v) => acc + (Number(v.subtotal) || 0), 0))
)
const totalIva = computed(() =>
  roundTo2(ventas.value.reduce((acc, v) => acc + (Number(v.iva) || 0), 0))
)
const totalTotal = computed(() =>
  roundTo2(ventas.value.reduce((acc, v) => acc + (Number(v.total) || 0), 0))
)
const hayRango = computed(() => Boolean(desde.value && hasta.value))

// ===== HELPERS =====
const formatFecha = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}

const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

const toISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const aplicarQuickDate = (q) => {
  const hoy = new Date()
  if (q.tipo === 'hoy') {
    desde.value = toISODate(hoy)
    hasta.value = toISODate(hoy)
  } else if (q.tipo === 'dias') {
    const inicio = new Date(hoy)
    inicio.setDate(inicio.getDate() - (q.dias || 0))
    desde.value = toISODate(inicio)
    hasta.value = toISODate(hoy)
  } else if (q.tipo === 'mes') {
    desde.value = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    hasta.value = toISODate(hoy)
  } else if (q.tipo === 'anio') {
    desde.value = toISODate(new Date(hoy.getFullYear(), 0, 1))
    hasta.value = toISODate(hoy)
  }
}

// ===== GENERAR =====
const generar = async () => {
  if (!desde.value || !hasta.value) {
    toast.warning('Selecciona ambas fechas')
    return
  }
  if (desde.value > hasta.value) {
    toast.warning('La fecha "desde" no puede ser posterior a "hasta"')
    return
  }
  if (loading.value) return

  loading.value = true
  consultado.value = true

  try {
    const params = new URLSearchParams()
    params.set('desde', desde.value)
    params.set('hasta', hasta.value)
    params.set('limit', '5000')
    params.set('sortBy', 'fecha_emision')
    params.set('sortDir', 'desc')

    const res = await api.request(`/reportes/ventas?${params.toString()}`, {
      method: 'GET',
      loaderMessage: 'Generando reporte...'
    })
    if (unmounted) return

    const data = Array.isArray(res) ? res : (res?.data || [])
    ventas.value = data

    fechaGeneracion.value = new Date().toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })

    if (data.length === 0) {
      toast.info('No hay ventas en el período seleccionado')
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'RANGO_INVALIDO' || codigo === 'DESDE_INVALIDO' || codigo === 'HASTA_INVALIDO') {
      toast.error(e.message || 'Rango de fechas inválido')
    } else if (codigo === 'RANGO_DEMASIADO_LARGO') {
      toast.warning(e.message || 'El rango es demasiado largo')
    } else {
      toast.error('Error al generar reporte: ' + e.message)
    }
    ventas.value = []
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== EXPORTAR EXCEL =====
const exportarExcel = () => {
  if (ventas.value.length === 0) {
    toast.warning('No hay datos para exportar')
    return
  }
  const rows = ventas.value.map(v => ({
    Fecha: formatFecha(v.fecha_emision),
    Cliente: v.cliente?.nombre || 'N/A',
    'Nº Factura': v.numero_factura || '',
    Subtotal: roundTo2(v.subtotal || 0),
    IVA: roundTo2(v.iva || 0),
    Total: roundTo2(v.total || 0)
  }))
  rows.push({
    Fecha: 'TOTALES',
    Cliente: '',
    'Nº Factura': '',
    Subtotal: totalSubtotal.value,
    IVA: totalIva.value,
    Total: totalTotal.value
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
  XLSX.writeFile(wb, `reporte_ventas_${desde.value}_${hasta.value}.xlsx`)
  toast.success('Excel generado')
}

// ===== EXPORTAR PDF =====
const exportarPDF = () => {
  if (ventas.value.length === 0) {
    toast.warning('No hay datos para exportar')
    return
  }
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('REPORTE DE VENTAS', pageWidth / 2, 16, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Del ${formatFecha(desde.value)} al ${formatFecha(hasta.value)}`, pageWidth / 2, 22, { align: 'center' })
  doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, pageWidth / 2, 27, { align: 'center' })

  autoTable(doc, {
    startY: 33,
    head: [['Fecha', 'Cliente', 'Nº Factura', 'Subtotal', 'IVA', 'Total']],
    body: ventas.value.map(v => [
      formatFecha(v.fecha_emision),
      v.cliente?.nombre || 'N/A',
      v.numero_factura || '—',
      roundTo2(v.subtotal).toFixed(2),
      roundTo2(v.iva).toFixed(2),
      roundTo2(v.total).toFixed(2)
    ]),
    foot: [[
      '', '', 'TOTALES',
      totalSubtotal.value.toFixed(2),
      totalIva.value.toFixed(2),
      totalTotal.value.toFixed(2)
    ]],
    theme: 'striped',
    headStyles: { fillColor: [39, 174, 96], textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  })

  doc.save(`reporte_ventas_${desde.value}_${hasta.value}.pdf`)
  toast.success('PDF generado')
}

// ===== LIFECYCLE =====
onMounted(() => {
  aplicarQuickDate(quickDates[2]) // Este mes por defecto
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.reporte-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-green { background: linear-gradient(135deg, #27ae60, #1e8449); box-shadow: 0 6px 16px rgba(39,174,96,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary, .btn-danger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
}
.btn-primary { background: linear-gradient(135deg, #27ae60, #1e8449); color: #fff; box-shadow: 0 4px 12px rgba(39,174,96,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(39,174,96,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #27ae60; color: #27ae60; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

/* FILTROS */
.filters-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px 20px; }
.filters-grid { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 16px; align-items: end; }
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-input { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.form-input:focus { border-color: #27ae60; box-shadow: 0 0 0 4px rgba(39,174,96,0.15); background: var(--bg-card); }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }

.quick-dates { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.quick-dates-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
.quick-chip { padding: 6px 12px; background: var(--bg-table-stripe); border: 1px solid var(--border-color); border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.quick-chip:hover:not(:disabled) { border-color: #27ae60; color: #27ae60; background: rgba(39,174,96,0.06); }
.quick-chip:disabled { opacity: 0.5; cursor: not-allowed; }

.filters-actions { display: flex; gap: 8px; }
.filters-actions .btn-primary { padding: 11px 24px; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); border-left: 4px solid transparent; transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-info { border-left-color: #3498db; }
.stat-card-warning { border-left-color: #f39c12; }
.stat-card-success { border-left-color: #27ae60; }

.stat-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.cyan { background: rgba(23,162,184,0.12); color: #17a2b8; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.verde { background: rgba(39,174,96,0.12); color: #27ae60; }

.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.3rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

.meta-info { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-muted); padding: 6px 4px; flex-wrap: wrap; }
.meta-info i { color: #27ae60; }
.meta-range { color: var(--text-secondary); font-weight: 600; }

.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-count { margin-left: 6px; padding: 2px 10px; background: rgba(39,174,96,0.15); color: #1e8449; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }

/* TABLA */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.cell-fecha { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }
.cell-cliente { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cliente-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #27ae60, #1e8449); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem; flex-shrink: 0; }
.cliente-nombre { font-weight: 600; color: var(--text-primary); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }

.doc-badge { background: var(--bg-table-stripe); padding: 3px 10px; border-radius: 6px; font-family: var(--font-mono, monospace); font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.money-num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text-secondary); font-size: 0.85rem; }
.money-total { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }

.tfoot-totales { background: var(--bg-table-stripe); font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }
.tfoot-totales td { padding: 14px 12px; border-top: 2px solid var(--border-color); }

/* LOADING/EMPTY */
.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #27ae60; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-block { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--bg-table-stripe); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 1.8rem; margin: 0 auto 14px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; margin-bottom: 16px; }
.empty-action { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(39,174,96,0.1); border: 1px solid rgba(39,174,96,0.3); border-radius: var(--radius-md); color: #1e8449; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.empty-action:hover { background: #27ae60; color: #fff; border-color: #27ae60; }

@media (max-width: 992px) {
  .filters-grid { grid-template-columns: 1fr 1fr; }
  .quick-dates, .filters-actions { grid-column: 1 / -1; }
}
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>