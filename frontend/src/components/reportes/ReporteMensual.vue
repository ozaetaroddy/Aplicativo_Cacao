<template>
  <div>
    <h4 class="section-title"><i class="fas fa-file-invoice"></i> Reporte Mensual para Declaración</h4>

    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Mes</label>
        <select class="form-select" v-model="mes">
          <option v-for="i in 12" :key="i" :value="i">{{ i }}</option>
        </select>
      </div>
      <div class="col-md-3">
        <label class="form-label">Año</label>
        <input type="number" class="form-control" v-model="anio" />
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary" @click="generar" :disabled="cargando">
          <i class="fas fa-sync" :class="{ 'fa-spin': cargando }"></i> Generar
        </button>
      </div>
      <div class="col-md-4 d-flex align-items-end gap-2">
        <button class="btn btn-success" @click="exportExcel" :disabled="!reporte">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-danger" @click="exportPDF" :disabled="!reporte">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
      </div>
    </div>

    <div v-if="reporte" class="card card-cacao">
      <div class="card-header">Resumen del Mes</div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-4">
            <div class="total-box">
              <h5>Compras Inventario</h5>
              <div class="number">${{ reporte.totalComprasInventario.toFixed(2) }}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="total-box">
              <h5>Compras Gastos</h5>
              <div class="number">${{ reporte.totalComprasGasto.toFixed(2) }}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="total-box">
              <h5>IVA Generado</h5>
              <div class="number">${{ reporte.totalIva.toFixed(2) }}</div>
            </div>
          </div>
        </div>
        <div class="row mt-3">
          <div class="col-md-4">
            <div class="total-box">
              <h5>Base Imponible IVA</h5>
              <div class="number">${{ reporte.baseImponibleIva.toFixed(2) }}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="total-box">
              <h5>Total Retenido</h5>
              <div class="number">${{ reporte.totalRetenido.toFixed(2) }}</div>
            </div>
          </div>
        </div>

        <hr />
        <h6>Detalle de Compras</h6>
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Nº Factura</th>
                <th>Tipo</th>
                <th>Subtotal</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Retención</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in reporte.compras" :key="c._id">
                <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
                <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
                <td>{{ c.numero_factura }}</td>
                <td>{{ c.tipo_compra }}</td>
                <td>${{ c.subtotal.toFixed(2) }}</td>
                <td>${{ c.iva.toFixed(2) }}</td>
                <td><strong>${{ c.total.toFixed(2) }}</strong></td>
                <td>${{ c.retencion_valor?.toFixed(2) || '0.00' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()
const { request } = useMongoDB()
const mes = ref(new Date().getMonth() + 1)
const anio = ref(new Date().getFullYear())
const reporte = ref(null)
const cargando = ref(false)

const generar = async () => {
  cargando.value = true
  try {
    const data = await request(`/reportes/declaracion/${mes.value}/${anio.value}`)
    reporte.value = data
    toast.success('Reporte generado correctamente')
  } catch (e) {
    toast.error('Error al generar reporte: ' + e.message)
  } finally {
    cargando.value = false
  }
}

const exportExcel = () => {
  if (!reporte.value) return
  const data = reporte.value.compras.map(c => ({
    Fecha: new Date(c.fecha_emision).toLocaleDateString(),
    Proveedor: c.proveedor?.nombre || 'N/A',
    'Nº Factura': c.numero_factura,
    Tipo: c.tipo_compra,
    Subtotal: c.subtotal,
    IVA: c.iva,
    Total: c.total,
    Retención: c.retencion_valor || 0
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Declaración')
  XLSX.writeFile(wb, `declaracion_${mes.value}_${anio.value}.xlsx`)
  toast.success('Excel exportado')
}

const exportPDF = () => {
  if (!reporte.value) return
  const doc = new jsPDF()
  doc.text(`Reporte Declaración ${mes.value}/${anio.value}`, 14, 22)
  const tableData = reporte.value.compras.map(c => [
    new Date(c.fecha_emision).toLocaleDateString(),
    c.proveedor?.nombre || 'N/A',
    c.numero_factura,
    c.tipo_compra,
    c.subtotal.toFixed(2),
    c.iva.toFixed(2),
    c.total.toFixed(2),
    (c.retencion_valor || 0).toFixed(2)
  ])
  autoTable(doc, {
    head: [['Fecha', 'Proveedor', 'Nº Factura', 'Tipo', 'Subtotal', 'IVA', 'Total', 'Retención']],
    body: tableData,
    startY: 30
  })
  doc.save(`declaracion_${mes.value}_${anio.value}.pdf`)
  toast.success('PDF generado')
}
</script>