<template>
  <div>
    <h4 class="section-title"><i class="fas fa-search"></i> Consultar Documentos</h4>

    <!-- FILTROS -->
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Tipo de Documento</label>
        <select class="form-select" v-model="tipoDocumento">
          <option value="factura">Factura</option>
          <option value="guia_remision">Guía de Remisión</option>
          <option value="exportacion">Factura de Exportación</option>
          <option value="reembolso">Factura de Reembolso</option>
          <option value="retencion">Comprobante de Retención</option>
          <option value="liquidacion">Liquidación de Compra</option>
          <option value="nota_credito">Nota de Crédito</option>
          <option value="proforma">Proforma</option>
          <option value="compras">Compras</option>
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label">Desde</label>
        <input type="date" class="form-control" v-model="fechaDesde">
      </div>
      <div class="col-md-2">
        <label class="form-label">Hasta</label>
        <input type="date" class="form-control" v-model="fechaHasta">
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary w-100" @click="cargarDatos">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
      <div class="col-md-3 d-flex align-items-end justify-content-end">
        <button class="btn btn-outline-secondary" @click="limpiarFiltros">
          <i class="fas fa-undo"></i> Limpiar
        </button>
      </div>
    </div>

    <!-- TABLA DE RESULTADOS -->
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente/Proveedor</th>
              <th>Nº Documento</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in documentos" :key="doc._id">
              <td>{{ new Date(doc.fecha_emision).toLocaleDateString() }}</td>
              <td>
                <a href="#" @click.prevent="verDocumento(doc)" class="text-primary">
                  {{ doc.cliente?.nombre || doc.proveedor?.nombre || 'N/A' }}
                </a>
              </td>
              <td>{{ doc.numero_factura || doc.numero_guia || 'N/A' }}</td>
              <td><strong>{{ formatCurrency(doc.total) }}</strong></td>
              <td>
                <button class="btn btn-sm btn-outline-primary" @click="verDocumento(doc)" title="Ver documento">
                  <i class="fas fa-eye"></i>
                </button>
              </td>
            </tr>
            <tr v-if="documentos.length === 0 && !cargando && buscado">
              <td colspan="5" class="text-muted text-center">No hay documentos que coincidan con los filtros</td>
            </tr>
            <tr v-if="!buscado && documentos.length === 0">
              <td colspan="5" class="text-muted text-center">Seleccione un tipo y presione Buscar</td>
            </tr>
            <tr v-if="cargando">
              <td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL DE VISTA PREVIA (se mantiene igual, pero con el mismo contenido que antes) -->
    <!-- ... (el modal no se modifica) ... -->
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import { useMongoDB } from '../composables/useMongoDB'
import { formatCurrency } from '../utils/formatters'
import { useToast } from 'vue-toastification'
import { printService } from '../services/printService'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const toast = useToast()
const { find } = useMongoDB()
const tipoDocumento = ref('factura')
const fechaDesde = ref('')
const fechaHasta = ref('')
const documentos = ref([])
const cargando = ref(false)
const buscado = ref(false)

const modalInstance = ref(null)
const documentoActual = ref(null)
const formatoImpresion = ref('A4')
const productosMap = ref({})

const obtenerNombreProducto = (id) => {
  if (!id) return 'Producto eliminado'
  const prod = productosMap.value[id]
  return prod ? prod.nombre : 'Producto eliminado'
}

const cargarDatos = async () => {
  cargando.value = true
  buscado.value = true
  try {
    // Cargar productos para mapear nombres
    const productos = await find('productos')
    productosMap.value = {}
    productos.forEach(p => productosMap.value[p._id] = p)

    let datos = []
    if (tipoDocumento.value === 'compras') {
      datos = await find('compras')
    } else {
      const todasVentas = await find('ventas')
      datos = todasVentas.filter(d => d.tipo_documento === tipoDocumento.value)
    }

    // Aplicar filtros de fecha (si se seleccionaron)
    if (fechaDesde.value) {
      const desde = new Date(fechaDesde.value)
      datos = datos.filter(d => new Date(d.fecha_emision) >= desde)
    }
    if (fechaHasta.value) {
      const hasta = new Date(fechaHasta.value)
      hasta.setHours(23, 59, 59, 999)
      datos = datos.filter(d => new Date(d.fecha_emision) <= hasta)
    }

    console.log('📄 Documentos cargados:', datos.length)
    documentos.value = datos
  } catch (e) {
    console.error('Error cargando documentos:', e)
    toast.error('Error al cargar los documentos: ' + e.message)
  } finally {
    cargando.value = false
  }
}

const limpiarFiltros = () => {
  tipoDocumento.value = 'factura'
  fechaDesde.value = ''
  fechaHasta.value = ''
  documentos.value = []
  buscado.value = false
}

const verDocumento = (doc) => {
  documentoActual.value = doc
  formatoImpresion.value = 'A4'
  abrirModal()
}

const abrirModal = () => {
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalDocumento')
    modalInstance.value = new Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })
  }
  modalInstance.value.show()
}

const cerrarModal = () => {
  if (modalInstance.value) {
    modalInstance.value.hide()
  }
}

const imprimirDoc = (formato) => {
  if (!documentoActual.value) {
    toast.warning('No hay documento para imprimir')
    return
  }
  printService.printDocument(documentoActual.value, formato, obtenerNombreProducto)
}

const guardarPDF = () => {
  const doc = documentoActual.value
  if (!doc) {
    toast.warning('No hay documento para generar PDF')
    return
  }
  try {
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    let y = 20

    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.text('System Ozaet\'s Electronics', pageWidth / 2, y, { align: 'center' })
    y += 8
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Sistema Contable - Documento Electrónico', pageWidth / 2, y, { align: 'center' })
    y += 10
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text((doc.tipo_documento || 'DOCUMENTO').toUpperCase(), pageWidth / 2, y, { align: 'center' })
    y += 8
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Nº: ${doc.numero_factura || doc.numero_guia || 'N/A'}`, pageWidth / 2, y, { align: 'center' })
    y += 6
    pdf.text(`Fecha Emisión: ${doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString() : 'N/A'}`, pageWidth / 2, y, { align: 'center' })
    y += 12

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Datos del Cliente/Proveedor:', 14, y)
    y += 6
    pdf.setFont('helvetica', 'normal')
    const cliente = doc.cliente || doc.proveedor || {}
    pdf.text(`Nombre: ${cliente.nombre || 'N/A'}`, 14, y)
    y += 5
    pdf.text(`RUC/Cédula: ${cliente.ruc || 'N/A'}`, 14, y)
    y += 5
    pdf.text(`Dirección: ${cliente.direccion || 'N/A'}`, 14, y)
    y += 5
    pdf.text(`Teléfono: ${cliente.telefono || 'N/A'}`, 14, y)
    y += 10

    if (doc.detalles && doc.detalles.length > 0) {
      const tableData = doc.detalles.map((item, idx) => [
        idx + 1,
        obtenerNombreProducto(item.productoId),
        item.cantidad,
        `${(item.precio_unitario || item.costo_unitario || 0).toFixed(2)}`,
        item.aplica_iva !== false ? 'Sí' : 'No',
        `${((item.cantidad || 0) * (item.precio_unitario || item.costo_unitario || 0)).toFixed(2)}`
      ])
      pdf.autoTable({
        startY: y,
        head: [['#', 'Producto', 'Cant.', 'P. Unit.', 'IVA', 'Subtotal']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 50 },
          2: { cellWidth: 20 },
          3: { cellWidth: 25 },
          4: { cellWidth: 15 },
          5: { cellWidth: 25 }
        },
        margin: { left: 14, right: 14 }
      })
      y = pdf.lastAutoTable.finalY + 10
    }

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Subtotal: ${(doc.subtotal || 0).toFixed(2)}`, pageWidth - 14 - 60, y, { align: 'right' })
    y += 6
    pdf.text(`IVA (15%): ${(doc.iva || 0).toFixed(2)}`, pageWidth - 14 - 60, y, { align: 'right' })
    y += 8
    pdf.setFontSize(12)
    pdf.text(`Total: ${(doc.total || 0).toFixed(2)}`, pageWidth - 14 - 60, y, { align: 'right' })
    y += 14

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'italic')
    pdf.text('Documento generado por Sistema Contable - System Ozaet\'s Electronics', pageWidth / 2, y + 10, { align: 'center' })

    const nombreArchivo = `documento_${doc.numero_factura || doc.numero_guia || 'sin_numero'}.pdf`
    pdf.save(nombreArchivo)
    toast.success('PDF guardado correctamente')
  } catch (error) {
    console.error('Error generando PDF:', error)
    toast.error('Error al generar el PDF: ' + error.message)
  }
}

// Cargar datos iniciales al montar
onMounted(async () => {
  const modalEl = document.getElementById('modalDocumento')
  if (modalEl) {
    modalInstance.value = new Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })
  }
  // Carga automática de facturas al entrar
  await cargarDatos()
})
</script>

<!-- el resto del template es igual, solo se agrega la carga inicial -->