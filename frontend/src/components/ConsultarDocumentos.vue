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
              <td><strong>${{ doc.total?.toFixed(2) || '0.00' }}</strong></td>
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

    <!-- MODAL DE VISTA PREVIA -->
    <div class="modal fade" id="modalDocumento" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-file-invoice me-2"></i>
              {{ documentoActual?.numero_factura || documentoActual?.numero_guia || 'Sin número' }}
            </h5>
            <button type="button" class="btn-close" @click="cerrarModal"></button>
          </div>
          <div class="modal-body" id="documentoContenido" style="overflow: auto; max-height: 70vh;">
            <div class="documento-preview" :class="formatoImpresion === 'ticket' ? 'ticket' : ''">
              <!-- Encabezado -->
              <div class="text-center mb-4">
                <h1 class="h3"><i class="fas fa-microchip me-2"></i>System Ozaet's Electronics</h1>
                <p class="text-muted">Sistema Contable - Documento Electrónico</p>
                <hr>
                <h2 class="h4">{{ (documentoActual?.tipo_documento || 'DOCUMENTO').toUpperCase() }}</h2>
                <p><strong>Nº:</strong> {{ documentoActual?.numero_factura || documentoActual?.numero_guia || 'N/A' }}</p>
                <p><strong>Fecha Emisión:</strong> {{ documentoActual?.fecha_emision ? new Date(documentoActual.fecha_emision).toLocaleDateString() : 'N/A' }}</p>
              </div>

              <!-- Datos del cliente/proveedor -->
              <div class="info-cliente mb-4">
                <div class="row">
                  <div class="col-md-6">
                    <p><strong>Cliente/Proveedor:</strong> {{ documentoActual?.cliente?.nombre || documentoActual?.proveedor?.nombre || 'N/A' }}</p>
                    <p><strong>RUC/Cédula:</strong> {{ documentoActual?.cliente?.ruc || documentoActual?.proveedor?.ruc || 'N/A' }}</p>
                  </div>
                  <div class="col-md-6">
                    <p><strong>Dirección:</strong> {{ documentoActual?.cliente?.direccion || documentoActual?.proveedor?.direccion || 'N/A' }}</p>
                    <p><strong>Teléfono:</strong> {{ documentoActual?.cliente?.telefono || documentoActual?.proveedor?.telefono || 'N/A' }}</p>
                  </div>
                </div>
              </div>

              <!-- Datos guía de remisión -->
              <div v-if="documentoActual?.tipo_documento === 'guia_remision'" class="mb-4">
                <div class="row">
                  <div class="col-md-6">
                    <p><strong>Establecimiento:</strong> {{ documentoActual.establecimiento || 'N/A' }}</p>
                    <p><strong>Nombre Comercial:</strong> {{ documentoActual.nombre_comercial || 'N/A' }}</p>
                    <p><strong>Punto de Emisión:</strong> {{ documentoActual.punto_emision || 'N/A' }}</p>
                  </div>
                  <div class="col-md-6">
                    <p><strong>Transportista:</strong> {{ documentoActual.transportista_razon_social || 'N/A' }}</p>
                    <p><strong>Identificación:</strong> {{ documentoActual.transportista_identificacion || 'N/A' }}</p>
                    <p><strong>Tipo:</strong> {{ documentoActual.transportista_tipo || 'N/A' }}</p>
                    <p><strong>Correo:</strong> {{ documentoActual.transportista_correo || 'N/A' }}</p>
                  </div>
                </div>
                <div class="row mt-2">
                  <div class="col-md-4"><strong>Dirección Partida:</strong> {{ documentoActual.direccion_partida || 'N/A' }}</div>
                  <div class="col-md-4"><strong>Inicio Transporte:</strong> {{ documentoActual.inicio_transporte || 'N/A' }}</div>
                  <div class="col-md-4"><strong>Fin Transporte:</strong> {{ documentoActual.fin_transporte || 'N/A' }}</div>
                  <div class="col-md-4"><strong>Placa:</strong> {{ documentoActual.placa_transporte || 'N/A' }}</div>
                </div>
              </div>

              <!-- Tabla de productos -->
              <div class="table-responsive">
                <table class="table table-bordered table-striped" id="tablaDetalles">
                  <thead class="table-light">
                    <tr>
                      <th>#</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio Unit.</th>
                      <th>¿Aplica IVA?</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, idx) in documentoActual?.detalles || []" :key="idx">
                      <td>{{ idx + 1 }}</td>
                      <td>{{ obtenerNombreProducto(item.productoId) }}</td>
                      <td>{{ item.cantidad }}</td>
                      <td>${{ (item.precio_unitario || item.costo_unitario || 0).toFixed(2) }}</td>
                      <td>{{ item.aplica_iva !== false ? 'Sí' : 'No' }}</td>
                      <td class="text-end">${{ (item.cantidad * (item.precio_unitario || item.costo_unitario || 0)).toFixed(2) }}</td>
                    </tr>
                    <tr v-if="!documentoActual?.detalles || documentoActual.detalles.length === 0">
                      <td colspan="6" class="text-center text-muted">Sin detalles</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Totales -->
              <div class="row mt-3">
                <div class="col-md-6 offset-md-6">
                  <table class="table table-borderless">
                    <tr>
                      <td><strong>Subtotal:</strong></td>
                      <td class="text-end">${{ documentoActual?.subtotal?.toFixed(2) || '0.00' }}</td>
                    </tr>
                    <tr>
                      <td><strong>IVA (15%):</strong></td>
                      <td class="text-end">${{ documentoActual?.iva?.toFixed(2) || '0.00' }}</td>
                    </tr>
                    <tr>
                      <td><strong class="h5">Total:</strong></td>
                      <td class="text-end h5">${{ documentoActual?.total?.toFixed(2) || '0.00' }}</td>
                    </tr>
                  </table>
                </div>
              </div>

              <!-- Pie de página -->
              <div class="text-center mt-4 text-muted small">
                <hr>
                <p>Documento generado por Sistema Contable - System Ozaet's Electronics</p>
                <p>Formato: {{ formatoImpresion }}</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="cerrarModal">Cerrar</button>
            <button class="btn btn-primary" @click="imprimirModal('A4')">
              <i class="fas fa-print me-1"></i> Imprimir A4
            </button>
            <button class="btn btn-primary" @click="imprimirModal('A2')">
              <i class="fas fa-print me-1"></i> Imprimir A2
            </button>
            <button class="btn btn-primary" @click="imprimirModal('ticket')">
              <i class="fas fa-receipt me-1"></i> Imprimir Ticket
            </button>
            <button class="btn btn-success" @click="guardarPDF">
              <i class="fas fa-file-pdf me-1"></i> Guardar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import { useMongoDB } from '../composables/useMongoDB'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

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

    if (fechaDesde.value) {
      const desde = new Date(fechaDesde.value)
      datos = datos.filter(d => new Date(d.fecha_emision) >= desde)
    }
    if (fechaHasta.value) {
      const hasta = new Date(fechaHasta.value)
      hasta.setHours(23, 59, 59, 999)
      datos = datos.filter(d => new Date(d.fecha_emision) <= hasta)
    }

    documentos.value = datos
  } catch (e) {
    console.error('Error cargando documentos:', e)
    alert('Error al cargar los documentos')
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

const imprimirModal = (formato) => {
  formatoImpresion.value = formato
  const contenido = document.getElementById('documentoContenido')
  if (!contenido) return

  const html = contenido.innerHTML
  const titulo = `Documento ${documentoActual.value?.numero_factura || documentoActual.value?.numero_guia || 'Sin número'}`

  const ventana = window.open('', '_blank', 'width=800,height=600')
  if (!ventana) {
    alert('Por favor, permita ventanas emergentes para imprimir')
    return
  }

  const estilosImpresion = `
    body { 
      font-family: 'Segoe UI', Arial, sans-serif; 
      padding: 20px; 
      margin: 0; 
      background: white;
    }
    .documento-preview { 
      max-width: 100%; 
      margin: 0 auto; 
    }
    .ticket { 
      max-width: 80mm; 
      margin: 0 auto; 
      font-size: 12px; 
    }
    .ticket .table { 
      font-size: 10px; 
    }
    .ticket .table td, .ticket .table th { 
      padding: 4px; 
    }
    .table { 
      width: 100%; 
      border-collapse: collapse; 
    }
    .table th, .table td { 
      border: 1px solid #dee2e6; 
      padding: 8px; 
    }
    .table-light { 
      background-color: #f8f9fa; 
    }
    .text-center { 
      text-align: center; 
    }
    .text-end { 
      text-align: right; 
    }
    .text-muted { 
      color: #6c757d; 
    }
    .mb-4 { 
      margin-bottom: 1.5rem; 
    }
    .mt-3 { 
      margin-top: 1rem; 
    }
    .mt-4 { 
      margin-top: 1.5rem; 
    }
    .h3 { 
      font-size: 1.5rem; 
    }
    .h4 { 
      font-size: 1.2rem; 
    }
    .h5 { 
      font-size: 1.1rem; 
    }
    .table-borderless td { 
      border: none; 
      padding: 4px; 
    }
    .btn { 
      display: none; 
    }
    @media print {
      .btn { display: none; }
      body { padding: 0.5in; }
      .ticket { max-width: 80mm; }
      .table { font-size: 10px; }
    }
  `

  const formatoClass = formato === 'ticket' ? 'ticket' : ''

  ventana.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${titulo}</title>
      <style>${estilosImpresion}</style>
    </head>
    <body>
      <div class="documento-preview ${formatoClass}">
        ${html}
      </div>
      <script>
        window.onload = function() {
          window.print();
          window.close();
        }
      <\/script>
    </body>
    </html>
  `)
  ventana.document.close()
}

const guardarPDF = () => {
  const doc = documentoActual.value
  if (!doc) {
    alert('No hay documento para generar PDF')
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

    // Tabla de productos
    if (doc.detalles && doc.detalles.length > 0) {
      const tableData = doc.detalles.map((item, idx) => [
        idx + 1,
        obtenerNombreProducto(item.productoId),
        item.cantidad,
        `$${(item.precio_unitario || item.costo_unitario || 0).toFixed(2)}`,
        item.aplica_iva !== false ? 'Sí' : 'No',
        `$${(item.cantidad * (item.precio_unitario || item.costo_unitario || 0)).toFixed(2)}`
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

    // Totales
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Subtotal: $${(doc.subtotal || 0).toFixed(2)}`, pageWidth - 14 - 60, y, { align: 'right' })
    y += 6
    pdf.text(`IVA (15%): $${(doc.iva || 0).toFixed(2)}`, pageWidth - 14 - 60, y, { align: 'right' })
    y += 8
    pdf.setFontSize(12)
    pdf.text(`Total: $${(doc.total || 0).toFixed(2)}`, pageWidth - 14 - 60, y, { align: 'right' })
    y += 14

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'italic')
    pdf.text('Documento generado por Sistema Contable - System Ozaet\'s Electronics', pageWidth / 2, y + 10, { align: 'center' })

    const nombreArchivo = `documento_${doc.numero_factura || doc.numero_guia || 'sin_numero'}.pdf`
    pdf.save(nombreArchivo)

  } catch (error) {
    console.error('Error generando PDF:', error)
    alert('Error al generar el PDF: ' + error.message)
  }
}

onMounted(() => {
  const modalEl = document.getElementById('modalDocumento')
  if (modalEl) {
    modalInstance.value = new Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })
  }
})
</script>

<style scoped>
.documento-preview {
  font-family: 'Segoe UI', Arial, sans-serif;
  background: white;
  padding: 20px;
  border-radius: 8px;
}
.ticket {
  max-width: 80mm;
  margin: 0 auto;
}
.ticket .table {
  font-size: 10px;
}
.ticket .table td, .ticket .table th {
  padding: 4px;
}
.info-cliente p {
  margin-bottom: 4px;
}
</style>