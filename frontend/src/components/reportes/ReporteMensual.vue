<template>
  <div class="reporte-mensual-page">
    <!-- HEADER -->
    <div class="page-header no-print">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-purple"><i class="fas fa-file-invoice"></i></span>
          Reporte Mensual — Declaración de IVA
        </h1>
        <p class="page-subtitle">
          Resumen de compras, retenciones y bases imponibles del mes
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarExcel"
          :disabled="!reporte || cargando"
          aria-label="Exportar a Excel"
        >
          <i class="fas fa-file-excel"></i>
          Excel
        </button>
        <button
          class="btn-danger"
          @click="exportarPDF"
          :disabled="!reporte || cargando"
          aria-label="Exportar a PDF"
        >
          <i class="fas fa-file-pdf"></i>
          PDF
        </button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="filters-card no-print">
      <div class="filters-grid">
        <div class="form-field">
          <label class="form-label" for="rep-mes">Mes</label>
          <select
            id="rep-mes"
            class="form-input"
            v-model.number="mes"
            :disabled="cargando"
          >
            <option v-for="(nombre, idx) in MESES" :key="idx" :value="idx + 1">
              {{ nombre }}
            </option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label" for="rep-anio">Año</label>
          <input
            id="rep-anio"
            type="number"
            class="form-input"
            v-model.number="anio"
            min="2020"
            max="2100"
            :disabled="cargando"
          />
        </div>
        <div class="nav-buttons">
          <button
            type="button"
            class="nav-btn"
            @click="mesAnterior"
            :disabled="cargando"
            aria-label="Mes anterior"
          >
            <i class="fas fa-chevron-left"></i>
          </button>
          <button
            type="button"
            class="nav-btn"
            @click="mesActual"
            :disabled="cargando"
          >
            Hoy
          </button>
          <button
            type="button"
            class="nav-btn"
            @click="mesSiguiente"
            :disabled="cargando"
            aria-label="Mes siguiente"
          >
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="filters-actions">
          <button
            type="button"
            class="btn-primary"
            @click="cargar"
            :disabled="cargando"
            aria-label="Generar reporte"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': cargando }"></i>
            {{ cargando ? 'Generando...' : 'Generar' }}
          </button>
        </div>
      </div>
      <div class="period-preview">
        <i class="fas fa-calendar-alt"></i>
        Período seleccionado: <strong>{{ nombrePeriodo }}</strong>
      </div>
    </div>

    <!-- LOADING -->
    <div v-if="cargando" class="loading-block">
      <div class="spinner-lg"></div>
      <p>Generando declaración de {{ nombrePeriodo }}...</p>
    </div>

    <!-- EMPTY -->
    <div v-else-if="!reporte" class="empty-block">
      <div class="empty-icon"><i class="fas fa-file-invoice"></i></div>
      <div class="empty-title">Declaración de IVA mensual</div>
      <div class="empty-text">
        Selecciona el mes y año, luego presiona <strong>Generar</strong> para ver
        el resumen de compras, retenciones y bases imponibles del período.
      </div>
    </div>

    <!-- REPORTE -->
    <div v-else>
      <!-- STATS -->
      <div class="stats-grid">
        <div class="stat-card stat-card-info">
          <div class="stat-icon azul"><i class="fas fa-boxes"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(reporte.totales?.comprasInventario) }}</div>
            <div class="stat-label">Compras inventario</div>
          </div>
        </div>
        <div class="stat-card stat-card-warning">
          <div class="stat-icon naranja"><i class="fas fa-receipt"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(reporte.totales?.comprasGasto) }}</div>
            <div class="stat-label">Compras gastos</div>
          </div>
        </div>
        <div class="stat-card stat-card-purple">
          <div class="stat-icon morado"><i class="fas fa-percent"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(reporte.totales?.iva) }}</div>
            <div class="stat-label">IVA generado</div>
          </div>
        </div>
        <div class="stat-card stat-card-success">
          <div class="stat-icon verde"><i class="fas fa-hand-holding-usd"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(reporte.totales?.retenido) }}</div>
            <div class="stat-label">Total retenido</div>
          </div>
        </div>
      </div>

      <!-- RESUMEN NUMÉRICO -->
      <div class="card-cacao">
        <div class="card-header">
          <i class="fas fa-calculator me-2"></i>
          Resumen de bases imponibles
        </div>
        <div class="card-body p-0">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Concepto</th>
                <th class="text-end">Base imponible</th>
                <th class="text-end">IVA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compras — Inventario</td>
                <td class="text-end">{{ formatCurrency(reporte.totales?.baseImponibleIva) }}</td>
                <td class="text-end">{{ formatCurrency(reporte.totales?.iva) }}</td>
              </tr>
              <tr class="tfoot-totales">
                <td>TOTALES</td>
                <td class="text-end">{{ formatCurrency(reporte.totales?.comprasTotal) }}</td>
                <td class="text-end">{{ formatCurrency(reporte.totales?.iva) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- DETALLE COMPRAS -->
      <div class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-list me-2"></i>
            Detalle de compras
            <span class="header-count">{{ reporte.compras?.length || 0 }}</span>
          </div>
          <span v-if="reporte._meta?.truncado" class="header-warning">
            <i class="fas fa-exclamation-triangle"></i> Truncado a {{ reporte._meta.maxDetalle }}
          </span>
        </div>
        <div class="card-body p-0">
          <div v-if="!reporte.compras || reporte.compras.length === 0" class="empty-inline">
            <i class="fas fa-inbox"></i>
            <span>Sin compras registradas en el período</span>
          </div>
          <div v-else class="table-responsive">
            <table class="table-modern">
              <thead>
                <tr>
                  <th style="width:120px;">Fecha</th>
                  <th>Proveedor</th>
                  <th style="width:160px;">N° Factura</th>
                  <th style="width:110px;">Tipo</th>
                  <th style="width:110px;" class="text-end">Subtotal</th>
                  <th style="width:100px;" class="text-end">IVA</th>
                  <th style="width:110px;" class="text-end">Total</th>
                  <th style="width:110px;" class="text-end">Retención</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in reporte.compras" :key="c._id">
                  <td class="small">{{ formatFecha(c.fecha_emision) }}</td>
                  <td>
                    <div class="prod-nombre" :title="c.proveedor?.nombre">
                      {{ c.proveedor?.nombre || 'Proveedor eliminado' }}
                    </div>
                  </td>
                  <td><code class="doc-badge">{{ c.numero_factura || '—' }}</code></td>
                  <td>
                    <span class="badge-tipo" :class="c.tipo_compra === 'inventario' ? 'tipo-inventario' : 'tipo-gasto'">
                      {{ c.tipo_compra || 'inventario' }}
                    </span>
                  </td>
                  <td class="text-end money-num">{{ formatCurrency(c.subtotal) }}</td>
                  <td class="text-end money-num">{{ formatCurrency(c.iva) }}</td>
                  <td class="text-end money-total">{{ formatCurrency(c.total) }}</td>
                  <td class="text-end money-num">{{ formatCurrency(c.retencion_valor || 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- DETALLE RETENCIONES -->
      <div v-if="reporte.retenciones?.length > 0" class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-percent me-2"></i>
            Detalle de retenciones
            <span class="header-count">{{ reporte.retenciones.length }}</span>
          </div>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table-modern">
              <thead>
                <tr>
                  <th style="width:120px;">Fecha</th>
                  <th>Proveedor</th>
                  <th style="width:160px;">N° Factura</th>
                  <th style="width:130px;">N° Retención</th>
                  <th class="text-end" style="width:110px;">Base</th>
                  <th class="text-end" style="width:80px;">%</th>
                  <th class="text-end" style="width:110px;">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in reporte.retenciones" :key="r._id">
                  <td class="small">{{ formatFecha(r.fecha_emision) }}</td>
                  <td>
                    <div class="prod-nombre" :title="r.proveedor?.nombre">
                      {{ r.proveedor?.nombre || 'Proveedor eliminado' }}
                    </div>
                  </td>
                  <td><code class="doc-badge">{{ r.numero_factura || '—' }}</code></td>
                  <td><code class="doc-badge">{{ r.numero_retencion || '—' }}</code></td>
                  <td class="text-end money-num">{{ formatCurrency(r.base_imponible) }}</td>
                  <td class="text-end">{{ r.porcentaje || 0 }}%</td>
                  <td class="text-end money-total">{{ formatCurrency(r.valor_retenido) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- META -->
      <div v-if="reporte._meta?.tiempoMs" class="meta-info">
        <i class="far fa-clock"></i>
        Reporte generado en {{ reporte._meta.tiempoMs }}ms
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { formatCurrency } from '../../utils/formatters'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()

// ===== CONSTANTES =====
const MESES = Object.freeze([
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
])

// ===== STATE =====
const mes = ref(new Date().getMonth() + 1)
const anio = ref(new Date().getFullYear())
const reporte = ref(null)
const cargando = ref(false)

let unmounted = false

// ===== COMPUTED =====
const nombrePeriodo = computed(() => {
  const idx = Number(mes.value) - 1
  const nombre = MESES[idx] || `Mes ${mes.value}`
  return `${nombre} ${anio.value}`
})

// ===== HELPERS =====
const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch { return '—' }
}

// ===== NAVEGACIÓN MESES =====
const mesAnterior = () => {
  if (mes.value === 1) {
    mes.value = 12
    anio.value--
  } else {
    mes.value--
  }
  cargar()
}

const mesSiguiente = () => {
  if (mes.value === 12) {
    mes.value = 1
    anio.value++
  } else {
    mes.value++
  }
  cargar()
}

const mesActual = () => {
  const hoy = new Date()
  mes.value = hoy.getMonth() + 1
  anio.value = hoy.getFullYear()
  cargar()
}

// ===== CARGAR =====
const cargar = async () => {
  if (!Number.isInteger(mes.value) || mes.value < 1 || mes.value > 12) {
    toast.error('Mes inválido (1-12)')
    return
  }
  if (!Number.isInteger(anio.value) || anio.value < 2000 || anio.value > 2100) {
    toast.error('Año fuera de rango (2000-2100)')
    return
  }
  if (cargando.value) return

  cargando.value = true
  try {
    const res = await api.request(
      `/reportes/declaracion/${mes.value}/${anio.value}`,
      { method: 'GET', loaderMessage: 'Generando declaración...' }
    )
    if (unmounted) return

    reporte.value = res
    const totalCompras = res?.totales?.cantidadCompras || 0
    const totalRetenciones = res?.totales?.cantidadRetenciones || 0

    if (totalCompras === 0 && totalRetenciones === 0) {
      toast.info(`No hay movimientos en ${nombrePeriodo.value}`)
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'MES_INVALIDO') toast.error('Mes inválido (1-12)')
    else if (codigo === 'ANIO_INVALIDO') toast.error('Año fuera de rango')
    else if (codigo === 'SIN_CONFIG_EMPRESA') toast.error('No hay configuración de empresa')
    else toast.error('Error al generar reporte: ' + e.message)

    reporte.value = null
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== EXPORTAR EXCEL =====
const exportarExcel = () => {
  if (!reporte.value) return

  const wb = XLSX.utils.book_new()

  // Hoja: Resumen
  const resumen = [
    ['REPORTE DE DECLARACIÓN DE IVA'],
    [`Período: ${nombrePeriodo.value}`],
    [],
    ['RESUMEN DE COMPRAS'],
    ['Compras Inventario', reporte.value.totales?.comprasInventario || 0],
    ['Compras Gastos', reporte.value.totales?.comprasGasto || 0],
    ['Compras Total', reporte.value.totales?.comprasTotal || 0],
    ['Base Imponible IVA', reporte.value.totales?.baseImponibleIva || 0],
    ['IVA', reporte.value.totales?.iva || 0],
    ['Retenido', reporte.value.totales?.retenido || 0],
    [],
    ['Cantidad Compras', reporte.value.totales?.cantidadCompras || 0],
    ['Cantidad Retenciones', reporte.value.totales?.cantidadRetenciones || 0]
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(resumen)
  ws1['!cols'] = [{ wch: 30 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja: Compras
  if (reporte.value.compras?.length > 0) {
    const compras = reporte.value.compras.map(c => ({
      Fecha: formatFecha(c.fecha_emision),
      Proveedor: c.proveedor?.nombre || 'N/A',
      'N° Factura': c.numero_factura || '',
      Tipo: c.tipo_compra || '',
      Subtotal: c.subtotal || 0,
      IVA: c.iva || 0,
      Total: c.total || 0,
      Retención: c.retencion_valor || 0
    }))
    const ws2 = XLSX.utils.json_to_sheet(compras)
    ws2['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Compras')
  }

  // Hoja: Retenciones
  if (reporte.value.retenciones?.length > 0) {
    const rets = reporte.value.retenciones.map(r => ({
      Fecha: formatFecha(r.fecha_emision),
      Proveedor: r.proveedor?.nombre || 'N/A',
      'N° Factura': r.numero_factura || '',
      'N° Retención': r.numero_retencion || '',
      Base: r.base_imponible || 0,
      Porcentaje: r.porcentaje || 0,
      Valor: r.valor_retenido || 0
    }))
    const ws3 = XLSX.utils.json_to_sheet(rets)
    ws3['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, ws3, 'Retenciones')
  }

  const sufijo = `${anio.value}_${String(mes.value).padStart(2, '0')}`
  XLSX.writeFile(wb, `declaracion_iva_${sufijo}.xlsx`)
  toast.success('Excel generado correctamente')
}

// ===== EXPORTAR PDF =====
const exportarPDF = () => {
  if (!reporte.value) return

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('REPORTE DE DECLARACIÓN DE IVA', pageWidth / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${nombrePeriodo.value}`, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, pageWidth / 2, y, { align: 'center' })
  doc.setTextColor(0)
  y += 10

  // Resumen
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('RESUMEN', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Valor']],
    body: [
      ['Compras Inventario', formatCurrency(reporte.value.totales?.comprasInventario)],
      ['Compras Gastos', formatCurrency(reporte.value.totales?.comprasGasto)],
      ['Compras Total', formatCurrency(reporte.value.totales?.comprasTotal)],
      ['Base Imponible IVA', formatCurrency(reporte.value.totales?.baseImponibleIva)],
      ['IVA Generado', formatCurrency(reporte.value.totales?.iva)],
      ['Total Retenido', formatCurrency(reporte.value.totales?.retenido)]
    ],
    theme: 'striped',
    headStyles: { fillColor: [142, 68, 173], fontSize: 9 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  })

  y = doc.lastAutoTable.finalY + 8

  // Detalle compras
  if (reporte.value.compras?.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`DETALLE DE COMPRAS (${reporte.value.compras.length})`, 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Proveedor', 'N° Factura', 'Subtotal', 'IVA', 'Total']],
      body: reporte.value.compras.map(c => [
        formatFecha(c.fecha_emision),
        (c.proveedor?.nombre || 'N/A').slice(0, 30),
        c.numero_factura || '—',
        (c.subtotal || 0).toFixed(2),
        (c.iva || 0).toFixed(2),
        (c.total || 0).toFixed(2)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
      styles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 55 },
        2: { cellWidth: 30 },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    })
  }

  doc.save(`declaracion_iva_${anio.value}_${String(mes.value).padStart(2, '0')}.pdf`)
  toast.success('PDF generado correctamente')
}

// ===== LIFECYCLE =====
onMounted(() => {
  // No cargar automáticamente: el usuario decide
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.reporte-mensual-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-purple { background: linear-gradient(135deg, #8e44ad, #6c3483); box-shadow: 0 6px 16px rgba(142,68,173,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary, .btn-danger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
}
.btn-primary { background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; box-shadow: 0 4px 12px rgba(142,68,173,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(142,68,173,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.filters-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px 20px; }
.filters-grid { display: grid; grid-template-columns: 1.2fr 0.8fr auto 1fr; gap: 16px; align-items: end; }
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-input { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.form-input:focus { border-color: #8e44ad; box-shadow: 0 0 0 4px rgba(142,68,173,0.15); background: var(--bg-card); }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }

.nav-buttons { display: flex; gap: 4px; }
.nav-btn { padding: 10px 14px; background: var(--bg-table-stripe); border: 1.5px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-secondary); font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.nav-btn:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; background: rgba(142,68,173,0.06); }
.nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.filters-actions { display: flex; justify-content: flex-end; }
.filters-actions .btn-primary { padding: 11px 24px; }

.period-preview { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-light); font-size: 0.82rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
.period-preview i { color: #8e44ad; }
.period-preview strong { color: var(--text-primary); font-weight: 700; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); border-left: 4px solid transparent; transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-info { border-left-color: #3498db; }
.stat-card-warning { border-left-color: #f39c12; }
.stat-card-purple { border-left-color: #8e44ad; }
.stat-card-success { border-left-color: #27ae60; }

.stat-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }
.stat-icon.verde { background: rgba(39,174,96,0.12); color: #27ae60; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.3rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

/* TABLA */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-count { margin-left: 6px; padding: 2px 10px; background: rgba(142,68,173,0.15); color: #6c3483; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }
.header-warning { font-size: 0.72rem; color: #d68910; display: inline-flex; align-items: center; gap: 4px; }

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.prod-nombre { font-weight: 600; color: var(--text-primary); font-size: 0.85rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-badge { background: var(--bg-table-stripe); padding: 3px 10px; border-radius: 6px; font-family: var(--font-mono, monospace); font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.badge-tipo { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: var(--radius-full); font-size: 0.68rem; font-weight: 700; text-transform: capitalize; }
.tipo-inventario { background: var(--success-bg); color: var(--success); }
.tipo-gasto { background: rgba(243,156,18,0.15); color: #d68910; }
.money-num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text-secondary); font-size: 0.85rem; }
.money-total { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }
.tfoot-totales { background: var(--bg-table-stripe); font-weight: 800; }
.tfoot-totales td { padding: 14px 12px; border-top: 2px solid var(--border-color); }

.empty-inline { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-inline i { font-size: 2rem; opacity: 0.35; }

.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #8e44ad; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-block { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 2px dashed var(--border-color); border-radius: var(--radius-lg); }
.empty-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--bg-table-stripe); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 1.8rem; margin: 0 auto 14px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; color: var(--text-muted); max-width: 460px; margin: 0 auto; line-height: 1.5; }
.meta-info { font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 4px; }

@media (max-width: 992px) {
  .filters-grid { grid-template-columns: 1fr 1fr; }
  .nav-buttons, .filters-actions { grid-column: 1 / -1; }
  .filters-actions { justify-content: stretch; }
  .filters-actions .btn-primary { width: 100%; justify-content: center; }
}
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>