<template>
  <div>
    <h4 class="section-title"><i class="fas fa-chart-bar"></i> Reporte de Ventas</h4>
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Desde</label>
        <input type="date" class="form-control" v-model="desde">
      </div>
      <div class="col-md-3">
        <label class="form-label">Hasta</label>
        <input type="date" class="form-control" v-model="hasta">
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary" @click="generar" :disabled="loading">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Generar
        </button>
      </div>
      <div class="col-md-4 d-flex align-items-end gap-2">
        <button class="btn btn-success" @click="exportExcel" :disabled="ventas.length === 0">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-danger" @click="exportPDF" :disabled="ventas.length === 0">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
      </div>
    </div>

    <div v-if="fechaGeneracion" class="text-muted small mb-2">
      <i class="far fa-clock"></i> Reporte generado el {{ fechaGeneracion }}
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="card card-cacao">
      <div class="card-body table-responsive" id="reporteVentasTable">
        <table class="table table-cacao">
          <thead><tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Nº Factura</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="v in ventas" :key="v._id">
              <td>{{ new Date(v.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ v.cliente?.nombre || 'N/A' }}</td>
              <td>{{ v.numero_factura || 'N/A' }}</td>
              <td>{{ formatCurrency(v.subtotal) }}</td>
              <td>{{ formatCurrency(v.iva) }}</td>
              <td><strong>{{ formatCurrency(v.total) }}</strong></td>
            </tr>
            <tr v-if="ventas.length === 0 && !loading && !error">
              <td colspan="6" class="text-muted text-center">Seleccione fechas y genere el reporte</td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td>
            </tr>
          </tbody>
          <tfoot v-if="ventas.length > 0">
            <tr>
              <td colspan="3" class="text-end"><strong>Totales</strong></td>
              <td><strong>{{ formatCurrency(totalSubtotal) }}</strong></td>
              <td><strong>{{ formatCurrency(totalIva) }}</strong></td>
              <td><strong>{{ formatCurrency(totalTotal) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { roundTo2, formatCurrency } from '../../utils/formatters'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const { reporteVentas } = useMongoDB()
const desde = ref('')
const hasta = ref('')
const ventas = ref([])
const loading = ref(false)
const error = ref(null)
const fechaGeneracion = ref('')

const totalSubtotal = computed(() => roundTo2(ventas.value.reduce((acc, v) => acc + (v.subtotal || 0), 0)))
const totalIva = computed(() => roundTo2(ventas.value.reduce((acc, v) => acc + (v.iva || 0), 0)))
const totalTotal = computed(() => roundTo2(ventas.value.reduce((acc, v) => acc + (v.total || 0), 0)))

const generar = async () => {
  if (!desde.value || !hasta.value) {
    alert('Seleccione ambas fechas')
    return
  }
  loading.value = true
  error.value = null
  try {
    const data = await reporteVentas(desde.value, hasta.value)
    ventas.value = data
    const now = new Date()
    fechaGeneracion.value = now.toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })
  } catch (e) {
    error.value = e.message || 'Error al cargar el reporte'
    console.error(e)
  } finally {
    loading.value = false
  }
}

const exportExcel = () => {
  if (ventas.value.length === 0) return alert('No hay datos para exportar')
  const data = ventas.value.map(v => ({
    Fecha: new Date(v.fecha_emision).toLocaleDateString(),
    Cliente: v.cliente?.nombre || 'N/A',
    'Nº Factura': v.numero_factura || 'N/A',
    Subtotal: roundTo2(v.subtotal || 0),
    IVA: roundTo2(v.iva || 0),
    Total: roundTo2(v.total || 0)
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
  XLSX.writeFile(wb, 'reporte_ventas.xlsx')
}

const exportPDF = () => {
  if (ventas.value.length === 0) return alert('No hay datos para exportar')
  const doc = new jsPDF()
  doc.text('Reporte de Ventas', 14, 22)
  doc.setFontSize(10)
  doc.text(`Generado el: ${new Date().toLocaleString('es-EC')}`, 14, 30)
  const tableData = ventas.value.map(v => [
    new Date(v.fecha_emision).toLocaleDateString(),
    v.cliente?.nombre || 'N/A',
    v.numero_factura || 'N/A',
    roundTo2(v.subtotal || 0).toFixed(2),
    roundTo2(v.iva || 0).toFixed(2),
    roundTo2(v.total || 0).toFixed(2)
  ])
  autoTable(doc, {
    head: [['Fecha', 'Cliente', 'Nº Factura', 'Subtotal', 'IVA', 'Total']],
    body: tableData,
    startY: 35,
    foot: [['', '', '', totalSubtotal.value.toFixed(2), totalIva.value.toFixed(2), totalTotal.value.toFixed(2)]]
  })
  doc.save('reporte_ventas.pdf')
}
</script>