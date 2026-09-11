<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 no-print">
      <h4 class="section-title"><i class="fas fa-file-invoice"></i> Anexo Transaccional (ATS)</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-danger" @click="exportarPDF" :disabled="!data">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="btn btn-success" @click="exportarExcel" :disabled="!data">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-outline-primary" @click="exportarCSV" :disabled="!data">
          <i class="fas fa-file-csv"></i> CSV
        </button>
        <button class="btn btn-outline-secondary" @click="imprimir" :disabled="!data">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card card-cacao mb-3 no-print">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-md-3">
            <label class="form-label">Año</label>
            <input type="number" class="form-control" v-model.number="anio" min="2020" max="2100" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Mes</label>
            <select class="form-select" v-model.number="mes">
              <option v-for="(nombre, idx) in MESES" :key="idx" :value="idx + 1">
                {{ nombre }}
              </option>
            </select>
          </div>
          <div class="col-md-6 d-flex gap-2">
            <button class="btn btn-primary flex-grow-1" @click="cargar" :disabled="loading">
              <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
              {{ loading ? 'Generando...' : 'Generar ATS' }}
            </button>
            <button class="btn btn-outline-secondary" @click="mesAnterior">
              <i class="fas fa-chevron-left"></i> Mes anterior
            </button>
            <button class="btn btn-outline-secondary" @click="mesSiguiente">
              Siguiente <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert de explicación -->
    <div v-if="!data" class="alert alert-info no-print">
      <i class="fas fa-info-circle me-2"></i>
      <strong>¿Qué es el ATS?</strong> El Anexo Transaccional Simplificado es el reporte mensual que debes subir al SRI con todas tus ventas, compras y retenciones del mes. Selecciona el período y presiona <strong>Generar ATS</strong>.
    </div>

    <div v-if="data" ref="contenido">
      <!-- Encabezado -->
      <div class="reporte-header mb-3">
        <h5 class="text-center mb-1">ANEXO TRANSACCIONAL SIMPLIFICADO</h5>
        <p class="text-center text-muted small mb-0">Período: <strong>{{ data.periodo.nombre }}</strong></p>
        <p class="text-center text-muted small">
          System Ozaet's Electronics — Generado: {{ formatFechaHora(data.generado) }}
        </p>
      </div>

      <!-- KPIs del período -->
      <div class="row g-3 mb-4">
        <div class="col-md-3 col-6">
          <div class="kpi-box" style="border-left-color: #3498db;">
            <div class="kpi-label">Ventas del mes</div>
            <div class="kpi-value" style="color: #3498db;">{{ formatCurrency(data.totales.ventas.total) }}</div>
            <div class="kpi-sub">{{ data.totales.ventas.cantidad }} comprobantes</div>
          </div>
        </div>
        <div class="col-md-3 col-6">
          <div class="kpi-box" style="border-left-color: #e67e22;">
            <div class="kpi-label">Compras del mes</div>
            <div class="kpi-value" style="color: #e67e22;">{{ formatCurrency(data.totales.compras.total) }}</div>
            <div class="kpi-sub">{{ data.totales.compras.cantidad }} comprobantes</div>
          </div>
        </div>
        <div class="col-md-3 col-6">
          <div class="kpi-box" style="border-left-color: #9b59b6;">
            <div class="kpi-label">Retenciones</div>
            <div class="kpi-value" style="color: #9b59b6;">{{ formatCurrency(data.totales.retenciones.valor) }}</div>
            <div class="kpi-sub">{{ data.totales.retenciones.cantidad }} aplicadas</div>
          </div>
        </div>
        <div class="col-md-3 col-6">
          <div class="kpi-box" :style="{ borderLeftColor: data.totales.ivaPorPagar > 0 ? '#e74c3c' : '#27ae60' }">
            <div class="kpi-label">IVA por Pagar</div>
            <div class="kpi-value" :style="{ color: data.totales.ivaPorPagar > 0 ? '#e74c3c' : '#27ae60' }">
              {{ formatCurrency(data.totales.ivaPorPagar) }}
            </div>
            <div class="kpi-sub">Ventas - Compras</div>
          </div>
        </div>
      </div>

      <!-- Resumen numérico -->
      <div class="card card-cacao mb-3">
        <div class="card-header"><i class="fas fa-calculator me-2"></i> Resumen de Bases Imponibles</div>
        <div class="card-body">
          <table class="table table-cacao table-sm mb-0">
            <thead>
              <tr>
                <th>Concepto</th>
                <th class="text-end">Base 0%</th>
                <th class="text-end">Base IVA</th>
                <th class="text-end">IVA</th>
                <th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Ventas</strong></td>
                <td class="text-end">{{ formatCurrency(data.totales.ventas.base0) }}</td>
                <td class="text-end">{{ formatCurrency(data.totales.ventas.baseIVA) }}</td>
                <td class="text-end">{{ formatCurrency(data.totales.ventas.iva) }}</td>
                <td class="text-end fw-bold">{{ formatCurrency(data.totales.ventas.total) }}</td>
              </tr>
              <tr>
                <td><strong>Compras</strong></td>
                <td class="text-end">{{ formatCurrency(data.totales.compras.base0) }}</td>
                <td class="text-end">{{ formatCurrency(data.totales.compras.baseIVA) }}</td>
                <td class="text-end">{{ formatCurrency(data.totales.compras.iva) }}</td>
                <td class="text-end fw-bold">{{ formatCurrency(data.totales.compras.total) }}</td>
              </tr>
              <tr class="table-light fw-bold">
                <td>DIFERENCIA (IVA por pagar)</td>
                <td class="text-end">—</td>
                <td class="text-end">—</td>
                <td class="text-end" :style="{ color: data.totales.ivaPorPagar > 0 ? '#e74c3c' : '#27ae60' }">
                  {{ formatCurrency(data.totales.ivaPorPagar) }}
                </td>
                <td class="text-end">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sección 1: Ventas -->
      <div class="card card-cacao mb-3">
        <div class="card-header">
          <i class="fas fa-hand-holding-usd me-2"></i>
          Sección 1 — VENTAS ({{ data.ventas.length }})
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-cacao table-sm">
              <thead>
                <tr>
                  <th style="width:60px;">Tipo ID</th>
                  <th style="width:150px;">Identificación</th>
                  <th>Razón Social</th>
                  <th style="width:60px;" class="text-center">Comp.</th>
                  <th style="width:130px;">Nº Comprobante</th>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:100px;" class="text-end">Base 0%</th>
                  <th style="width:100px;" class="text-end">Base IVA</th>
                  <th style="width:90px;" class="text-end">IVA</th>
                  <th style="width:110px;" class="text-end">Total</th>
                  <th style="width:60px;">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="data.ventas.length === 0">
                  <td colspan="11" class="text-center text-muted py-3">Sin ventas en el período</td>
                </tr>
                <tr v-else v-for="(v, idx) in data.ventas" :key="idx">
                  <td class="small">{{ v.tipo_id }}</td>
                  <td class="small font-monospace">{{ v.identificacion }}</td>
                  <td class="small">{{ v.razon_social }}</td>
                  <td class="small text-center">{{ v.tipo_comprobante }}</td>
                  <td class="small font-monospace">{{ v.numero_comprobante }}</td>
                  <td class="small">{{ formatFecha(v.fecha_emision) }}</td>
                  <td class="text-end small">{{ v.base_0.toFixed(2) }}</td>
                  <td class="text-end small">{{ v.base_iva.toFixed(2) }}</td>
                  <td class="text-end small">{{ v.iva.toFixed(2) }}</td>
                  <td class="text-end small fw-bold">{{ v.total.toFixed(2) }}</td>
                  <td class="small text-center">
                    <span class="badge" :class="v.estado === 'AUTORIZADO' ? 'bg-success' : 'bg-secondary'">
                      {{ v.estado }}
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="data.ventas.length > 0">
                <tr class="table-light fw-bold">
                  <td colspan="6" class="text-end">TOTALES</td>
                  <td class="text-end">{{ data.totales.ventas.base0.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.ventas.baseIVA.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.ventas.iva.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.ventas.total.toFixed(2) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Sección 2: Compras -->
      <div class="card card-cacao mb-3">
        <div class="card-header">
          <i class="fas fa-shopping-cart me-2"></i>
          Sección 2 — COMPRAS ({{ data.compras.length }})
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-cacao table-sm">
              <thead>
                <tr>
                  <th style="width:60px;">Tipo ID</th>
                  <th style="width:150px;">Identificación</th>
                  <th>Razón Social</th>
                  <th style="width:130px;">Nº Comprobante</th>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:100px;" class="text-end">Base 0%</th>
                  <th style="width:100px;" class="text-end">Base IVA</th>
                  <th style="width:90px;" class="text-end">IVA</th>
                  <th style="width:110px;" class="text-end">Total</th>
                  <th style="width:110px;" class="text-end">Retención</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="data.compras.length === 0">
                  <td colspan="10" class="text-center text-muted py-3">Sin compras en el período</td>
                </tr>
                <tr v-else v-for="(c, idx) in data.compras" :key="idx">
                  <td class="small">{{ c.tipo_id }}</td>
                  <td class="small font-monospace">{{ c.identificacion }}</td>
                  <td class="small">{{ c.razon_social }}</td>
                  <td class="small font-monospace">{{ c.numero_comprobante }}</td>
                  <td class="small">{{ formatFecha(c.fecha_emision) }}</td>
                  <td class="text-end small">{{ c.base_0.toFixed(2) }}</td>
                  <td class="text-end small">{{ c.base_iva.toFixed(2) }}</td>
                  <td class="text-end small">{{ c.iva.toFixed(2) }}</td>
                  <td class="text-end small fw-bold">{{ c.total.toFixed(2) }}</td>
                  <td class="text-end small">
                    <span v-if="c.retencion_valor > 0" style="color: #9b59b6;">{{ c.retencion_valor.toFixed(2) }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="data.compras.length > 0">
                <tr class="table-light fw-bold">
                  <td colspan="5" class="text-end">TOTALES</td>
                  <td class="text-end">{{ data.totales.compras.base0.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.compras.baseIVA.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.compras.iva.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.compras.total.toFixed(2) }}</td>
                  <td class="text-end">{{ data.totales.compras.retenciones.toFixed(2) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Sección 3: Retenciones -->
      <div class="card card-cacao mb-3">
        <div class="card-header">
          <i class="fas fa-percent me-2"></i>
          Sección 3 — RETENCIONES ({{ data.retenciones.length }})
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-cacao table-sm">
              <thead>
                <tr>
                  <th style="width:60px;">Tipo ID</th>
                  <th style="width:150px;">Identificación</th>
                  <th>Razón Social</th>
                  <th style="width:130px;">Nº Factura</th>
                  <th style="width:130px;">Nº Retención</th>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:100px;">Tipo</th>
                  <th style="width:100px;" class="text-end">Base</th>
                  <th style="width:70px;" class="text-end">%</th>
                  <th style="width:110px;" class="text-end">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="data.retenciones.length === 0">
                  <td colspan="10" class="text-center text-muted py-3">Sin retenciones en el período</td>
                </tr>
                <tr v-else v-for="(r, idx) in data.retenciones" :key="idx">
                  <td class="small">{{ r.tipo_id }}</td>
                  <td class="small font-monospace">{{ r.identificacion }}</td>
                  <td class="small">{{ r.razon_social }}</td>
                  <td class="small font-monospace">{{ r.numero_factura }}</td>
                  <td class="small font-monospace">{{ r.numero_retencion }}</td>
                  <td class="small">{{ formatFecha(r.fecha_retencion) }}</td>
                  <td class="small">{{ r.tipo_retencion || '—' }}</td>
                  <td class="text-end small">{{ r.base_imponible.toFixed(2) }}</td>
                  <td class="text-end small">{{ r.porcentaje }}%</td>
                  <td class="text-end small fw-bold">{{ r.valor_retenido.toFixed(2) }}</td>
                </tr>
              </tbody>
              <tfoot v-if="data.retenciones.length > 0">
                <tr class="table-light fw-bold">
                  <td colspan="7" class="text-end">TOTALES</td>
                  <td class="text-end">{{ data.totales.retenciones.base.toFixed(2) }}</td>
                  <td></td>
                  <td class="text-end">{{ data.totales.retenciones.valor.toFixed(2) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Notas -->
      <div class="alert alert-warning mt-3">
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Nota:</strong> Este reporte es una aproximación del ATS oficial del SRI.
        Para subirlo al portal del SRI debes descargar el XML o el archivo con el formato exacto desde el sistema oficial DIMM.
        Usa este reporte para <strong>verificar</strong> los datos antes de declarar.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'

const toast = useToast()

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const anio = ref(new Date().getFullYear())
const mes = ref(new Date().getMonth() + 1)
const data = ref(null)
const loading = ref(false)
const contenido = ref(null)

const formatFecha = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatFechaHora = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-EC')
}

const cargar = async () => {
  loading.value = true
  try {
    data.value = await api.request(`/anexos/ats/${anio.value}/${mes.value}`, {
      method: 'GET',
      loaderMessage: 'Generando ATS...'
    })
    if (data.value.ventas.length === 0 && data.value.compras.length === 0) {
      toast.info('No hay movimientos en el período seleccionado')
    }
  } catch (e) {
    toast.error('Error: ' + e.message)
    data.value = null
  } finally {
    loading.value = false
  }
}

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

const exportarPDF = () => {
  if (!data.value) return

  const doc = new jsPDF('l', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ANEXO TRANSACCIONAL SIMPLIFICADO (ATS)', pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${data.value.periodo.nombre}`, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.text(`System Ozaet's Electronics - Generado: ${formatFechaHora(data.value.generado)}`, pageWidth / 2, y, { align: 'center' })
  y += 8

  // Ventas
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`SECCIÓN 1 — VENTAS (${data.value.ventas.length})`, 10, y)
  y += 4

  doc.autoTable({
    startY: y,
    head: [['Tipo ID', 'Identificación', 'Razón Social', 'Comp.', 'Nº Comp.', 'Fecha', 'Base 0%', 'Base IVA', 'IVA', 'Total']],
    body: data.value.ventas.map(v => [
      v.tipo_id, v.identificacion, v.razon_social, v.tipo_comprobante,
      v.numero_comprobante, formatFecha(v.fecha_emision),
      v.base_0.toFixed(2), v.base_iva.toFixed(2), v.iva.toFixed(2), v.total.toFixed(2)
    ]),
    foot: [[
      '', '', '', '', '', 'TOTALES',
      data.value.totales.ventas.base0.toFixed(2),
      data.value.totales.ventas.baseIVA.toFixed(2),
      data.value.totales.ventas.iva.toFixed(2),
      data.value.totales.ventas.total.toFixed(2)
    ]],
    theme: 'striped',
    headStyles: { fillColor: [44, 62, 80], fontSize: 7 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1 },
    margin: { left: 8, right: 8 }
  })

  y = doc.lastAutoTable.finalY + 8

  // Compras
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`SECCIÓN 2 — COMPRAS (${data.value.compras.length})`, 10, y)
  y += 4

  doc.autoTable({
    startY: y,
    head: [['Tipo ID', 'Identificación', 'Razón Social', 'Nº Comp.', 'Fecha', 'Base 0%', 'Base IVA', 'IVA', 'Total', 'Retención']],
    body: data.value.compras.map(c => [
      c.tipo_id, c.identificacion, c.razon_social, c.numero_comprobante,
      formatFecha(c.fecha_emision),
      c.base_0.toFixed(2), c.base_iva.toFixed(2), c.iva.toFixed(2),
      c.total.toFixed(2), (c.retencion_valor || 0).toFixed(2)
    ]),
    foot: [[
      '', '', '', '', 'TOTALES',
      data.value.totales.compras.base0.toFixed(2),
      data.value.totales.compras.baseIVA.toFixed(2),
      data.value.totales.compras.iva.toFixed(2),
      data.value.totales.compras.total.toFixed(2),
      data.value.totales.compras.retenciones.toFixed(2)
    ]],
    theme: 'striped',
    headStyles: { fillColor: [230, 126, 34], fontSize: 7 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1 },
    margin: { left: 8, right: 8 }
  })

  y = doc.lastAutoTable.finalY + 8

  // Retenciones
  if (data.value.retenciones.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`SECCIÓN 3 — RETENCIONES (${data.value.retenciones.length})`, 10, y)
    y += 4

    doc.autoTable({
      startY: y,
      head: [['Tipo ID', 'Identificación', 'Razón Social', 'Nº Factura', 'Nº Retención', 'Fecha', 'Tipo', 'Base', '%', 'Valor']],
      body: data.value.retenciones.map(r => [
        r.tipo_id, r.identificacion, r.razon_social,
        r.numero_factura, r.numero_retencion, formatFecha(r.fecha_retencion),
        r.tipo_retencion || '—',
        r.base_imponible.toFixed(2), `${r.porcentaje}%`, r.valor_retenido.toFixed(2)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [155, 89, 182], fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1 },
      margin: { left: 8, right: 8 }
    })
  }

  doc.save(`ATS_${data.value.periodo.anio}_${String(data.value.periodo.mes).padStart(2, '0')}.pdf`)
  toast.success('PDF generado correctamente')
}

const exportarExcel = () => {
  if (!data.value) return

  const wb = XLSX.utils.book_new()

  // Hoja: Resumen
  const resumenRows = [
    ['ANEXO TRANSACCIONAL SIMPLIFICADO'],
    [`Período: ${data.value.periodo.nombre}`],
    [],
    ['RESUMEN DE BASES IMPONIBLES'],
    ['Concepto', 'Base 0%', 'Base IVA', 'IVA', 'Total'],
    ['Ventas',
      data.value.totales.ventas.base0,
      data.value.totales.ventas.baseIVA,
      data.value.totales.ventas.iva,
      data.value.totales.ventas.total],
    ['Compras',
      data.value.totales.compras.base0,
      data.value.totales.compras.baseIVA,
      data.value.totales.compras.iva,
      data.value.totales.compras.total],
    [],
    ['IVA POR PAGAR', data.value.totales.ivaPorPagar],
    [],
    ['RETENCIONES'],
    ['Cantidad', data.value.totales.retenciones.cantidad],
    ['Base imponible', data.value.totales.retenciones.base],
    ['Valor retenido', data.value.totales.retenciones.valor]
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(resumenRows)
  ws1['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja: Ventas
  const ventasRows = data.value.ventas.map(v => ({
    'Tipo ID': v.tipo_id,
    Identificación: v.identificacion,
    'Razón Social': v.razon_social,
    'Tipo Comp.': v.tipo_comprobante,
    'Nº Comprobante': v.numero_comprobante,
    Fecha: formatFecha(v.fecha_emision),
    'Base 0%': v.base_0,
    'Base IVA': v.base_iva,
    IVA: v.iva,
    Total: v.total,
    'Forma Pago': v.forma_pago,
    Estado: v.estado
  }))
  const ws2 = XLSX.utils.json_to_sheet(ventasRows.length > 0 ? ventasRows : [{ Nota: 'Sin ventas' }])
  ws2['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Ventas')

  // Hoja: Compras
  const comprasRows = data.value.compras.map(c => ({
    'Tipo ID': c.tipo_id,
    Identificación: c.identificacion,
    'Razón Social': c.razon_social,
    'Nº Comprobante': c.numero_comprobante,
    Fecha: formatFecha(c.fecha_emision),
    'Base 0%': c.base_0,
    'Base IVA': c.base_iva,
    IVA: c.iva,
    Total: c.total,
    Retención: c.retencion_valor || 0,
    'Tipo Compra': c.tipo_compra
  }))
  const ws3 = XLSX.utils.json_to_sheet(comprasRows.length > 0 ? comprasRows : [{ Nota: 'Sin compras' }])
  ws3['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Compras')

  // Hoja: Retenciones
  if (data.value.retenciones.length > 0) {
    const retRows = data.value.retenciones.map(r => ({
      'Tipo ID': r.tipo_id,
      Identificación: r.identificacion,
      'Razón Social': r.razon_social,
      'Nº Factura': r.numero_factura,
      'Nº Retención': r.numero_retencion,
      Fecha: formatFecha(r.fecha_retencion),
      'Tipo Retención': r.tipo_retencion,
      Base: r.base_imponible,
      Porcentaje: r.porcentaje,
      Valor: r.valor_retenido
    }))
    const ws4 = XLSX.utils.json_to_sheet(retRows)
    ws4['!cols'] = [
      { wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 18 },
      { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, ws4, 'Retenciones')
  }

  XLSX.writeFile(wb, `ATS_${data.value.periodo.anio}_${String(data.value.periodo.mes).padStart(2, '0')}.xlsx`)
  toast.success('Excel generado correctamente')
}

const exportarCSV = () => {
  if (!data.value) return

  // CSV combinado
  let csv = 'SECCIÓN,TIPO ID,IDENTIFICACIÓN,RAZÓN SOCIAL,COMPROBANTE,Nº COMPROBANTE,FECHA,BASE 0%,BASE IVA,IVA,TOTAL\n'

  data.value.ventas.forEach(v => {
    csv += `VENTA,${v.tipo_id},${v.identificacion},"${v.razon_social}",${v.tipo_comprobante},${v.numero_comprobante},${formatFecha(v.fecha_emision)},${v.base_0.toFixed(2)},${v.base_iva.toFixed(2)},${v.iva.toFixed(2)},${v.total.toFixed(2)}\n`
  })

  data.value.compras.forEach(c => {
    csv += `COMPRA,${c.tipo_id},${c.identificacion},"${c.razon_social}",,${c.numero_comprobante},${formatFecha(c.fecha_emision)},${c.base_0.toFixed(2)},${c.base_iva.toFixed(2)},${c.iva.toFixed(2)},${c.total.toFixed(2)}\n`
  })

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ATS_${data.value.periodo.anio}_${String(data.value.periodo.mes).padStart(2, '0')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success('CSV generado correctamente')
}

const imprimir = () => window.print()

onMounted(() => {
  // No cargar automáticamente, esperar acción del usuario
})
</script>

<style scoped>
.kpi-box {
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid #3498db;
  border-radius: 10px;
  transition: var(--transition);
}
.kpi-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}
.kpi-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
}
.kpi-value {
  font-size: 1.3rem;
  font-weight: 700;
  margin-top: 4px;
}
.kpi-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.reporte-header {
  padding: 12px;
  background: var(--bg-table-stripe);
  border-radius: 10px;
}

.font-monospace {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

@media print {
  .no-print { display: none !important; }
  .section-title { font-size: 18pt; }
  .card-cacao { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
  .table-cacao { font-size: 8pt; }
  .badge { font-size: 7pt; }
  body { background: #fff; }
}
</style>