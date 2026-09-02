<template>
  <div>
    <h4 class="section-title"><i class="fas fa-file-pdf"></i> Reporte de Inventario</h4>

    <div class="card card-cacao mb-3">
      <div class="card-body">
        <button class="btn btn-primary" @click="generarReportePDF">
          <i class="fas fa-file-pdf"></i> Generar Reporte PDF
        </button>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-body table-responsive" id="tablaInventario">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Unidad</th>
              <th>Stock Actual</th>
              <th>Stock Mínimo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in productos" :key="p._id">
              <td>{{ p.codigo }}</td>
              <td>{{ p.nombre }}</td>
              <td>{{ p.unidad_medida }}</td>
              <td>{{ p.stock }}</td>
              <td>{{ p.stock_minimo }}</td>
              <td>
                <span v-if="p.stock <= p.stock_minimo" class="badge bg-danger">Stock Bajo</span>
                <span v-else-if="p.stock === 0" class="badge bg-secondary">Sin Stock</span>
                <span v-else class="badge bg-success">Normal</span>
              </td>
            </tr>
            <tr v-if="productos.length === 0">
              <td colspan="6" class="text-muted text-center">No hay productos registrados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const { find } = useMongoDB()
const productos = ref([])

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error(e)
  }
})

const generarReportePDF = () => {
  if (productos.value.length === 0) {
    alert('No hay productos para generar reporte')
    return
  }

  const pdf = new jsPDF('p', 'mm', 'a4')
  pdf.setFontSize(16)
  pdf.text('Reporte de Inventario', 14, 20)
  pdf.setFontSize(10)
  pdf.text(`Generado: ${new Date().toLocaleString()}`, 14, 28)

  const tableData = productos.value.map(p => [
    p.codigo || 'N/A',
    p.nombre || 'N/A',
    p.unidad_medida || 'N/A',
    p.stock || 0,
    p.stock_minimo || 0,
    p.stock <= p.stock_minimo ? 'Stock Bajo' : (p.stock === 0 ? 'Sin Stock' : 'Normal')
  ])

  pdf.autoTable({
    startY: 35,
    head: [['Código', 'Producto', 'Unidad', 'Stock', 'Mínimo', 'Estado']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 8 }
  })

  pdf.save('reporte_inventario.pdf')
}
</script>