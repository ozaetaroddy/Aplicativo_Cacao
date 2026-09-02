<template>
  <div>
    <h4 class="section-title"><i class="fas fa-chart-bar"></i> Reporte de Compras</h4>
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
        <button class="btn btn-success" @click="exportExcel" :disabled="compras.length === 0">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-danger" @click="exportPDF" :disabled="compras.length === 0">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
      </div>
    </div>

    <div v-if="fechaGeneracion" class="text-muted small mb-2">
      <i class="far fa-clock"></i> Reporte generado el {{ fechaGeneracion }}
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="card card-cacao">
      <div class="card-body table-responsive" id="reporteComprasTable">
        <table class="table table-cacao">
          <thead><tr>
            <th>Fecha</th>
            <th>Proveedor</th>
            <th>Nº Factura</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="c in compras" :key="c._id">
              <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
              <td>{{ c.numero_factura || 'N/A' }}</td>
              <td>{{ formatCurrency(c.subtotal) }}</td>
              <td>{{ formatCurrency(c.iva) }}</td>
              <td><strong>{{ formatCurrency(c.total) }}</strong></td>
            </tr>
            <tr v-if="compras.length === 0 && !loading && !error">
              <td colspan="6" class="text-muted text-center">Seleccione fechas y genere el reporte</td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td>
            </tr>
          </tbody>
          <tfoot v-if="compras.length > 0">
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
import { useToast } from 'vue-toastification'

const toast = useToast()
const { reporteCompras } = useMongoDB()
const desde = ref('')
const hasta = ref('')
const compras = ref([])
const loading = ref(false)
const error = ref(null)
const fechaGeneracion = ref('')

const totalSubtotal = computed(() => roundTo2(compras.value.reduce((acc, c) => acc + (c.subtotal || 0), 0)))
const totalIva = computed(() => roundTo2(compras.value.reduce((acc, c) => acc + (c.iva || 0), 0)))
const totalTotal = computed(() => roundTo2(compras.value.reduce((acc, c) => acc + (c.total || 0), 0)))

const generar = async () => {
  if (!desde.value || !hasta.value) {
    toast.warning('Seleccione ambas fechas')
    return
  }
  loading.value = true
  error.value = null
  try {
    const data = await reporteCompras(desde.value, hasta.value)
    compras.value = data
    const now = new Date()
    fechaGeneracion.value = now.toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    })
    if (data.length === 0) toast.info('No hay compras en el período seleccionado')
  } catch (e) {
    error.value = e.message || 'Error al cargar el reporte'
    console.error(e)
    toast.error('Error al cargar el reporte: ' + e.message)
  } finally {
    loading.value = false
  }
}

const exportExcel = () => {
  if (compras.value.length === 0) {
    toast.warning('No hay datos para exportar')
    return
  }
  const data = compras.value.map(c => ({
    Fecha: new Date(c.fecha_emision).toLocaleDateString(),
    Proveedor: c.proveedor?.nombre || 'N/A',
    'Nº Factura': c.numero_factura || 'N/A',
    Subtotal: roundTo2(c.subtotal || 0),
    IVA: roundTo2(c.iva || 0),
    Total: roundTo2(c.total || 0)
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Compras')
  XLSX.writeFile(wb, 'reporte_compras.xlsx')
  toast.success('Excel generado correctamente')
}

const exportPDF = () => {
  if (compras.value.length === 0) {
    toast.warning('No hay datos para exportar')
    return
  }
  const doc = new jsPDF()
  doc.text('Reporte de Compras', 14, 22)
  doc.setFontSize(10)
  doc.text(`Generado el: ${new Date().toLocaleString('es-EC')}`, 14, 30)
  const tableData = compras.value.map(c => [
    new Date(c.fecha_emision).toLocaleDateString(),
    c.proveedor?.nombre || 'N/A',
    c.numero_factura || 'N/A',
    roundTo2(c.subtotal || 0).toFixed(2),
    roundTo2(c.iva || 0).toFixed(2),
    roundTo2(c.total || 0).toFixed(2)
  ])
  autoTable(doc, {
    head: [['Fecha', 'Proveedor', 'Nº Factura', 'Subtotal', 'IVA', 'Total']],
    body: tableData,
    startY: 35,
    foot: [['', '', '', totalSubtotal.value.toFixed(2), totalIva.value.toFixed(2), totalTotal.value.toFixed(2)]]
  })
  doc.save('reporte_compras.pdf')
  toast.success('PDF generado correctamente')
}
</script>