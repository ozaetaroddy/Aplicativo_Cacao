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

    <div v-if="fechaGeneracion" class="text-muted small mb-2 text-start">
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
            <th>IVA (15%)</th>
            <th>Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="c in compras" :key="c._id">
              <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
              <td>{{ c.numero_factura || 'N/A' }}</td>
              <td>${{ c.subtotal?.toFixed(2) || '0.00' }}</td>
              <td>${{ c.iva?.toFixed(2) || '0.00' }}</td>
              <td><strong>${{ c.total?.toFixed(2) || '0.00' }}</strong></td>
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
              <td><strong>${{ totalSubtotal.toFixed(2) }}</strong></td>
              <td><strong>${{ totalIva.toFixed(2) }}</strong></td>
              <td><strong>${{ totalTotal.toFixed(2) }}</strong></td>
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
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const { reporteCompras } = useMongoDB()
const desde = ref('')
const hasta = ref('')
const compras = ref([])
const loading = ref(false)
const error = ref(null)
const fechaGeneracion = ref('')

const totalSubtotal = computed(() => compras.value.reduce((acc, c) => acc + (c.subtotal || 0), 0))
const totalIva = computed(() => compras.value.reduce((acc, c) => acc + (c.iva || 0), 0))
const totalTotal = computed(() => compras.value.reduce((acc, c) => acc + (c.total || 0), 0))

const generar = async () => {
  if (!desde.value || !hasta.value) {
    alert('Seleccione ambas fechas')
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
  } catch (e) {
    error.value = e.message || 'Error al cargar el reporte'
    console.error(e)
  } finally {
    loading.value = false
  }
}

const exportExcel = () => {
  if (compras.value.length === 0) return alert('No hay datos para exportar')
  const data = compras.value.map(c => ({
    Fecha: new Date(c.fecha_emision).toLocaleDateString(),
    Proveedor: c.proveedor?.nombre || 'N/A',
    'Nº Factura': c.numero_factura || 'N/A',
    Subtotal: c.subtotal || 0,
    'IVA (15%)': c.iva || 0,
    Total: c.total || 0
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Compras')
  XLSX.writeFile(wb, 'reporte_compras.xlsx')
}

const exportPDF = () => {
  if (compras.value.length === 0) return alert('No hay datos para exportar')
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('System Ozaet\'s Electronics', 14, 22)
  doc.setFontSize(12)
  doc.text('Reporte de Compras', 14, 32)
  doc.setFontSize(9)
  doc.text(`Generado el: ${new Date().toLocaleString('es-EC')}`, 14, 40)
  
  const tableData = compras.value.map(c => [
    new Date(c.fecha_emision).toLocaleDateString(),
    c.proveedor?.nombre || 'N/A',
    c.numero_factura || 'N/A',
    (c.subtotal || 0).toFixed(2),
    (c.iva || 0).toFixed(2),
    (c.total || 0).toFixed(2)
  ])
  autoTable(doc, {
    head: [['Fecha', 'Proveedor', 'Nº Factura', 'Subtotal', 'IVA (15%)', 'Total']],
    body: tableData,
    startY: 45,
    foot: [['', '', '', totalSubtotal.value.toFixed(2), totalIva.value.toFixed(2), totalTotal.value.toFixed(2)]],
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [44, 62, 80] }
  })
  doc.save('reporte_compras.pdf')
}
</script>