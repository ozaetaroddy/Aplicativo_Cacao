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
              <th>Clave de Acceso</th>
              <th>Estado SRI</th>
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
              <td class="font-monospace small">{{ doc.numero_factura || doc.numero_guia || 'N/A' }}</td>
              <td class="font-monospace small">
                <span v-if="doc.clave_acceso" :title="doc.clave_acceso">
                  {{ doc.clave_acceso.substring(0, 15) }}...
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span class="badge" :class="getEstadoSriClass(doc.estado_sri)">
                  {{ doc.estado_sri || 'N/A' }}
                </span>
              </td>
              <td><strong>{{ formatCurrency(doc.total) }}</strong></td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-1" @click="verDocumento(doc)" title="Ver documento">
                  <i class="fas fa-eye"></i>
                </button>
                <button
                  v-if="doc.clave_acceso"
                  class="btn btn-sm btn-outline-success"
                  @click="verXml(doc)"
                  title="Ver XML"
                >
                  <i class="fas fa-file-code"></i>
                </button>
              </td>
            </tr>
            <tr v-if="documentos.length === 0 && !cargando && buscado">
              <td colspan="7" class="text-muted text-center">No hay documentos que coincidan con los filtros</td>
            </tr>
            <tr v-if="!buscado && documentos.length === 0">
              <td colspan="7" class="text-muted text-center">Seleccione un tipo y presione Buscar</td>
            </tr>
            <tr v-if="cargando">
              <td colspan="7" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============ MODAL DE VISTA PREVIA PROFESIONAL ============ -->
    <div class="modal fade" id="modalDocumento" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header modal-header-doc">
            <div class="d-flex align-items-center gap-3">
              <div class="doc-icon">
                <i class="fas fa-file-invoice"></i>
              </div>
              <div>
                <h5 class="modal-title mb-0">
                  {{ getTipoDocLabel(documentoActual?.tipo_documento) }}
                </h5>
                <div class="small text-muted">{{ documentoActual?.numero_factura || documentoActual?.numero_guia || 'Sin número' }}</div>
              </div>
            </div>
            <button type="button" class="btn-close" @click="cerrarModal"></button>
          </div>

          <div class="modal-body modal-body-doc" id="documentoContenido">
            <div v-if="documentoActual" class="documento-preview">

              <!-- ============ ENCABEZADO ============ -->
              <div class="doc-header">
                <div class="doc-header-left">
                  <div class="logo-empresa">
                    <div class="logo-icon">S</div>
                    <div>
                      <div class="empresa-nombre">
                        {{ documentoActual.razon_social_emisor || "System Ozaet's Electronics" }}
                      </div>
                      <div class="empresa-sub">Sistema Contable</div>
                    </div>
                  </div>
                  <div class="empresa-info">
                    <div><strong>RUC:</strong> {{ documentoActual.ruc_emisor || '1790012345001' }}</div>
                    <div><strong>Dir. Matriz:</strong> Av. Amazonas N34-451, Quito</div>
                  </div>
                </div>

                <div class="doc-header-center">
                  <div class="doc-tipo-badge">
                    {{ getTipoDocLabel(documentoActual.tipo_documento).toUpperCase() }}
                  </div>
                  <div class="doc-numero-badge">
                    Nº {{ documentoActual.numero_factura || documentoActual.numero_guia || 'N/A' }}
                  </div>
                  <div class="doc-fecha">
                    <i class="far fa-calendar"></i>
                    {{ documentoActual.fecha_emision ? new Date(documentoActual.fecha_emision).toLocaleDateString('es-EC', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '' }}
                  </div>
                  <div class="ambiente-badge" :class="documentoActual.ambiente_sri === '2' ? 'amb-produccion' : 'amb-pruebas'">
                    {{ documentoActual.ambiente_sri === '2' ? '● PRODUCCIÓN' : '● AMBIENTE DE PRUEBAS' }}
                  </div>
                </div>

                <div class="doc-header-right">
                  <div class="empresa-info">
                    <div><strong>Obligado contab.:</strong> NO</div>
                    <div><strong>Tipo emisión:</strong> NORMAL</div>
                    <div><strong>Moneda:</strong> DÓLAR</div>
                  </div>
                </div>
              </div>

              <!-- ============ CLAVE DE ACCESO ============ -->
              <div v-if="documentoActual.clave_acceso" class="clave-section">
                <div class="clave-left">
                  <div class="clave-label">
                    <i class="fas fa-key me-1"></i> Clave de Acceso (49 dígitos)
                  </div>
                  <div class="clave-valor">{{ documentoActual.clave_acceso }}</div>
                  <div class="autorizacion-info">
                    <div><strong>Nº Autorización:</strong> {{ documentoActual.numero_autorizacion || documentoActual.clave_acceso }}</div>
                    <div><strong>Fecha:</strong> {{ documentoActual.fecha_emision ? new Date(documentoActual.fecha_emision).toLocaleString('es-EC') : '' }}</div>
                  </div>
                </div>
                <div class="barcode-container">
                  <svg class="barcode-svg" :viewBox="`0 0 ${getBarcodeWidth(documentoActual.clave_acceso)} 60`" preserveAspectRatio="none">
                    <rect
                      v-for="(bar, i) in generarBarras(documentoActual.clave_acceso)"
                      :key="i"
                      :x="bar.x"
                      y="0"
                      :width="bar.width"
                      height="60"
                      :fill="bar.black ? '#1a1a1a' : 'transparent'"
                    />
                  </svg>
                  <div class="barcode-numero">{{ documentoActual.clave_acceso }}</div>
                </div>
              </div>

              <!-- ============ INFO CLIENTE ============ -->
              <div class="cliente-section">
                <div class="cliente-box">
                  <div class="cliente-box-title">
                    <i class="fas fa-user me-1"></i>
                    {{ documentoActual.cliente ? 'Datos del Cliente' : 'Datos del Proveedor' }}
                  </div>
                  <div class="cliente-row">
                    <span class="cliente-row-label">Razón Social:</span>
                    <span class="cliente-row-value">
                      {{ documentoActual.cliente?.nombre || documentoActual.proveedor?.nombre || 'Consumidor Final' }}
                    </span>
                  </div>
                  <div class="cliente-row">
                    <span class="cliente-row-label">RUC/Cédula:</span>
                    <span class="cliente-row-value font-monospace">
                      {{ documentoActual.cliente?.ruc || documentoActual.proveedor?.ruc || '9999999999999' }}
                    </span>
                  </div>
                  <div class="cliente-row" v-if="documentoActual.cliente?.direccion || documentoActual.proveedor?.direccion">
                    <span class="cliente-row-label">Dirección:</span>
                    <span class="cliente-row-value">
                      {{ documentoActual.cliente?.direccion || documentoActual.proveedor?.direccion }}
                    </span>
                  </div>
                </div>

                <div class="cliente-box">
                  <div class="cliente-box-title">
                    <i class="fas fa-info-circle me-1"></i> Datos del Documento
                  </div>
                  <div class="cliente-row" v-if="documentoActual.cliente?.telefono || documentoActual.proveedor?.telefono">
                    <span class="cliente-row-label">Teléfono:</span>
                    <span class="cliente-row-value">{{ documentoActual.cliente?.telefono || documentoActual.proveedor?.telefono }}</span>
                  </div>
                  <div class="cliente-row" v-if="documentoActual.cliente?.email || documentoActual.proveedor?.email">
                    <span class="cliente-row-label">Email:</span>
                    <span class="cliente-row-value">{{ documentoActual.cliente?.email || documentoActual.proveedor?.email }}</span>
                  </div>
                  <div class="cliente-row">
                    <span class="cliente-row-label">Forma Pago:</span>
                    <span class="cliente-row-value">{{ documentoActual.forma_pago || 'Sin sistema financiero' }}</span>
                  </div>
                  <div class="cliente-row">
                    <span class="cliente-row-label">Estado:</span>
                    <span class="cliente-row-value">
                      <span class="badge" :class="documentoActual.estado_pago === 'pagado' ? 'bg-success' : 'bg-warning text-dark'">
                        {{ (documentoActual.estado_pago || 'pendiente').toUpperCase() }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- ============ TABLA DE PRODUCTOS ============ -->
              <div class="detalles-section">
                <div class="detalles-title">Detalle de Productos y Servicios</div>
                <table class="detalles-table">
                  <thead>
                    <tr>
                      <th style="width:35px;" class="text-center">#</th>
                      <th>Descripción</th>
                      <th style="width:75px;" class="text-center">Cant.</th>
                      <th style="width:85px;" class="text-right">P. Unit.</th>
                      <th style="width:75px;" class="text-right">Desc.</th>
                      <th style="width:65px;" class="text-center">IVA</th>
                      <th style="width:95px;" class="text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, idx) in documentoActual.detalles || []" :key="idx">
                      <td class="text-center">{{ idx + 1 }}</td>
                      <td>
                        <div class="product-name">{{ item.nombre || obtenerNombreProducto(item.productoId) }}</div>
                        <div v-if="item.codigo" class="product-code">Código: {{ item.codigo }}</div>
                      </td>
                      <td class="text-center">{{ item.cantidad }}</td>
                      <td class="text-right font-monospace">
                        ${{ (item.precio_unitario || item.costo_unitario || 0).toFixed(2) }}
                      </td>
                      <td class="text-right font-monospace">$0.00</td>
                      <td class="text-center">
                        <span class="badge-iva" :class="item.aplica_iva !== false ? 'iva-si' : 'iva-no'">
                          {{ item.aplica_iva !== false ? '15%' : '0%' }}
                        </span>
                      </td>
                      <td class="text-right font-monospace fw-bold">
                        ${{ ((item.cantidad || 0) * (item.precio_unitario || item.costo_unitario || 0)).toFixed(2) }}
                      </td>
                    </tr>
                    <tr v-if="!documentoActual.detalles || documentoActual.detalles.length === 0">
                      <td colspan="7" class="text-center text-muted py-4">Sin detalles registrados</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ============ TOTALES ============ -->
              <div class="totales-section">
                <div class="totales-box">
                  <div class="total-row">
                    <span class="label">Subtotal</span>
                    <span class="value">${{ (documentoActual.subtotal || 0).toFixed(2) }}</span>
                  </div>
                  <div class="total-row">
                    <span class="label">IVA 15%</span>
                    <span class="value">${{ (documentoActual.iva || 0).toFixed(2) }}</span>
                  </div>
                  <div class="total-row">
                    <span class="label">Descuento</span>
                    <span class="value">$0.00</span>
                  </div>
                  <div class="total-final">
                    <span class="label">TOTAL A PAGAR</span>
                    <span class="value">${{ (documentoActual.total || 0).toFixed(2) }}</span>
                  </div>
                </div>
              </div>

              <!-- ============ OBSERVACIONES ============ -->
              <div v-if="documentoActual.observaciones" class="info-adicional">
                <div class="info-adicional-title">
                  <i class="fas fa-comment me-1"></i> Información Adicional
                </div>
                <div>{{ documentoActual.observaciones }}</div>
              </div>

              <!-- ============ FIRMAS ============ -->
              <div class="firma-section">
                <div class="firma-box">
                  <div class="firma-line"></div>
                  <div class="firma-label">Firma del Cliente</div>
                </div>
                <div class="firma-box">
                  <div class="firma-line"></div>
                  <div class="firma-label">{{ documentoActual.razon_social_emisor || "System Ozaet's Electronics" }}</div>
                </div>
              </div>

              <!-- ============ FOOTER ============ -->
              <div class="doc-footer">
                <div><strong>Documento generado por Sistema Contable</strong></div>
                <div>{{ documentoActual.razon_social_emisor || "System Ozaet's Electronics" }} — RUC: {{ documentoActual.ruc_emisor || '1790012345001' }}</div>
                <div v-if="documentoActual.clave_acceso" class="mt-1">
                  <i class="fas fa-check-circle text-success me-1"></i>
                  Este documento es una representación impresa de un comprobante electrónico autorizado por el SRI
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer modal-footer-doc">
            <button class="btn btn-outline-secondary" @click="cerrarModal">
              <i class="fas fa-times me-1"></i> Cerrar
            </button>
            <div class="ms-auto d-flex gap-2 flex-wrap">
              <button class="btn btn-primary" @click="imprimirModal('A4')">
                <i class="fas fa-print me-1"></i> Imprimir A4
              </button>
              <button class="btn btn-primary" @click="imprimirModal('A2')">
                <i class="fas fa-print me-1"></i> Imprimir A2
              </button>
              <button class="btn btn-primary" @click="imprimirModal('ticket')">
                <i class="fas fa-receipt me-1"></i> Ticket
              </button>
              <button class="btn btn-danger" @click="guardarPDF">
                <i class="fas fa-file-pdf me-1"></i> PDF
              </button>
              <button class="btn btn-success" @click="verXml(documentoActual)" :disabled="!documentoActual?.clave_acceso">
                <i class="fas fa-file-code me-1"></i> XML
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ MODAL XML ============ -->
    <div class="modal fade" id="modalXmlDoc" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-file-code me-2"></i> XML del Comprobante</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div v-if="xmlDoc" class="xml-viewer">
              <pre>{{ xmlDoc }}</pre>
            </div>
            <div v-else class="text-center py-4 text-muted">
              <i class="fas fa-spinner fa-spin"></i> Cargando XML...
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-primary" @click="copiarXml" :disabled="!xmlDoc">
              <i class="fas fa-copy me-1"></i> Copiar
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
import { formatCurrency } from '../utils/formatters'
import { useToast } from 'vue-toastification'
import { printService } from '../services/printService'
import { api } from '../services/api'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useRoute } from 'vue-router'

const route = useRoute()
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

const xmlDoc = ref('')
let modalXmlInstance = null

const obtenerNombreProducto = (id) => {
  if (!id) return 'Producto eliminado'
  const prod = productosMap.value[id]
  return prod ? prod.nombre : 'Producto eliminado'
}

const getTipoDocLabel = (tipo) => {
  const labels = {
    factura: 'Factura',
    guia_remision: 'Guía de Remisión',
    exportacion: 'Factura de Exportación',
    reembolso: 'Factura de Reembolso',
    retencion: 'Comprobante de Retención',
    liquidacion: 'Liquidación de Compra',
    nota_credito: 'Nota de Crédito',
    proforma: 'Proforma'
  }
  return labels[tipo] || tipo
}

const getEstadoSriClass = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'bg-success'
    case 'PENDIENTE':
    case 'RECIBIDA': return 'bg-info'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'bg-danger'
    default: return 'bg-secondary'
  }
}

// ===== CÓDIGO DE BARRAS SVG =====
const generarBarras = (texto) => {
  if (!texto) return []
  const barras = []
  let x = 0
  let black = true
  for (let i = 0; i < texto.length; i++) {
    const charCode = texto.charCodeAt(i)
    const widths = [
      (charCode % 4) + 1,
      ((charCode >> 2) % 4) + 1,
      ((charCode >> 4) % 3) + 1,
      ((charCode >> 6) % 3) + 1
    ]
    widths.forEach(w => {
      barras.push({ x, width: w, black })
      x += w + 1
      black = !black
    })
  }
  return barras
}

const getBarcodeWidth = (texto) => {
  if (!texto) return 100
  return generarBarras(texto).reduce((sum, b) => sum + b.width + 1, 0)
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

const imprimirModal = (formato) => {
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

    // Encabezado
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.text(doc.razon_social_emisor || "System Ozaet's Electronics", pageWidth / 2, y, { align: 'center' })
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

    // Clave de acceso
    if (doc.clave_acceso) {
      pdf.setFontSize(8)
      pdf.setFont('courier', 'bold')
      pdf.text('CLAVE DE ACCESO:', 14, y)
      y += 4
      pdf.setFont('courier', 'normal')
      const clavePartes = doc.clave_acceso.match(/.{1,49}/g) || []
      clavePartes.forEach(parte => {
        pdf.text(parte, 14, y)
        y += 4
      })
      y += 4
    }

    // Datos del cliente
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
        item.nombre || obtenerNombreProducto(item.productoId),
        item.cantidad,
        `$${(item.precio_unitario || item.costo_unitario || 0).toFixed(2)}`,
        item.aplica_iva !== false ? '15%' : '0%',
        `$${((item.cantidad || 0) * (item.precio_unitario || item.costo_unitario || 0)).toFixed(2)}`
      ])
      pdf.autoTable({
        startY: y,
        head: [['#', 'Producto', 'Cant.', 'P. Unit.', 'IVA', 'Subtotal']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [26, 58, 92], fontSize: 9 },
        styles: { fontSize: 9 },
        margin: { left: 14, right: 14 }
      })
      y = pdf.lastAutoTable.finalY + 10
    }

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Subtotal: $${(doc.subtotal || 0).toFixed(2)}`, pageWidth - 74, y)
    y += 6
    pdf.text(`IVA 15%: $${(doc.iva || 0).toFixed(2)}`, pageWidth - 74, y)
    y += 8
    pdf.setFontSize(12)
    pdf.text(`TOTAL: $${(doc.total || 0).toFixed(2)}`, pageWidth - 74, y)

    pdf.save(`documento_${doc.numero_factura || doc.numero_guia || 'sin_numero'}.pdf`)
    toast.success('PDF guardado')
  } catch (error) {
    console.error('Error generando PDF:', error)
    toast.error('Error al generar el PDF: ' + error.message)
  }
}

// ===== VER XML =====
const verXml = async (doc) => {
  if (!doc?._id) return
  if (!doc.clave_acceso && !['factura', 'liquidacion', 'nota_credito', 'guia_remision', 'retencion', 'exportacion', 'reembolso'].includes(doc.tipo_documento)) {
    toast.warning('Este documento no requiere XML')
    return
  }

  xmlDoc.value = ''
  if (!modalXmlInstance) {
    const modalEl = document.getElementById('modalXmlDoc')
    modalXmlInstance = new Modal(modalEl)
  }
  modalXmlInstance.show()

  try {
    const res = await api.request(`/ventas/${doc._id}/xml-preview`, {
      method: 'GET'
    })
    xmlDoc.value = res.xml || ''
  } catch (e) {
    toast.error('Error al cargar XML: ' + e.message)
    xmlDoc.value = 'Error: ' + e.message
  }
}

const copiarXml = async () => {
  try {
    await navigator.clipboard.writeText(xmlDoc.value)
    toast.success('XML copiado')
  } catch (e) {
    toast.error('No se pudo copiar')
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
  cargarDatos()
})
</script>

<style scoped>
/* ==========================================
   MODAL HEADER/FOOTER
   ========================================== */
.modal-header-doc {
  background: linear-gradient(135deg, #1a3a5c, #2c3e50);
  color: #fff;
  border-bottom: 3px solid var(--accent-color);
}
.modal-header-doc .btn-close {
  filter: invert(1);
}
.doc-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(241,196,15,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
  font-size: 1.3rem;
}
.modal-body-doc {
  padding: 24px;
  background: #f4f6f9;
}
.modal-footer-doc {
  border-top: 1px solid var(--border-color);
  padding: 12px 20px;
}

/* ==========================================
   DOCUMENTO PREVIEW
   ========================================== */
.documento-preview {
  background: #fff;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.85rem;
  color: #1a1a1a;
  max-width: 950px;
  margin: 0 auto;
}

/* ============ HEADER ============ */
.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding-bottom: 14px;
  border-bottom: 3px double #1a3a5c;
  margin-bottom: 14px;
}
.doc-header-left { flex: 1; }
.doc-header-center { flex: 1.2; text-align: center; }
.doc-header-right { flex: 0.9; text-align: right; }

.logo-empresa {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.logo-icon {
  width: 44px;
  height: 44px;
  background: #1a3a5c;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f1c40f;
  font-size: 1.4rem;
  font-weight: 800;
  flex-shrink: 0;
}
.empresa-nombre {
  font-size: 1.1rem;
  font-weight: 800;
  color: #1a3a5c;
  line-height: 1.1;
}
.empresa-sub {
  font-size: 0.7rem;
  color: #666;
}
.empresa-info {
  font-size: 0.78rem;
  color: #333;
  margin-top: 6px;
}
.empresa-info div { margin: 2px 0; }

.doc-tipo-badge {
  display: inline-block;
  padding: 8px 20px;
  background: #1a3a5c;
  color: #fff;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  margin-bottom: 6px;
}
.doc-numero-badge {
  font-size: 1rem;
  font-weight: 700;
  color: #c0392b;
  margin-bottom: 4px;
  font-family: 'JetBrains Mono', monospace;
}
.doc-fecha {
  font-size: 0.8rem;
  color: #555;
  margin-bottom: 6px;
}
.ambiente-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
}
.amb-produccion { background: #27ae60; }
.amb-pruebas { background: #e67e22; }

/* ============ CLAVE DE ACCESO ============ */
.clave-section {
  display: flex;
  gap: 15px;
  align-items: center;
  padding: 12px 14px;
  background: #f8f9fa;
  border-left: 4px solid #1a3a5c;
  border-radius: 6px;
  margin-bottom: 14px;
}
.clave-left { flex: 1; min-width: 0; }
.clave-label {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  margin-bottom: 4px;
}
.clave-valor {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.72rem;
  color: #1a3a5c;
  font-weight: 700;
  word-break: break-all;
  line-height: 1.4;
  margin-bottom: 6px;
  letter-spacing: 0.3px;
}
.autorizacion-info {
  font-size: 0.7rem;
  color: #555;
  line-height: 1.5;
}
.autorizacion-info strong { color: #1a3a5c; }
.barcode-container {
  flex-shrink: 0;
  text-align: center;
  max-width: 280px;
}
.barcode-svg {
  height: 45px;
  width: 240px;
}
.barcode-numero {
  font-family: 'Courier New', monospace;
  font-size: 0.5rem;
  color: #333;
  margin-top: 2px;
  letter-spacing: -0.3px;
  word-break: break-all;
}

/* ============ CLIENTE ============ */
.cliente-section {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}
.cliente-box {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d5dbe0;
  border-radius: 6px;
  background: #fafbfc;
}
.cliente-box-title {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px dashed #d5dbe0;
}
.cliente-row {
  display: flex;
  font-size: 0.78rem;
  margin: 3px 0;
  line-height: 1.3;
}
.cliente-row-label {
  min-width: 85px;
  color: #666;
  font-weight: 600;
}
.cliente-row-value {
  flex: 1;
  color: #1a1a1a;
  font-weight: 500;
}

/* ============ TABLA DETALLES ============ */
.detalles-section { margin-bottom: 14px; }
.detalles-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: #1a3a5c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 0;
  border-bottom: 2px solid #1a3a5c;
}
.detalles-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.detalles-table thead {
  background: #1a3a5c;
  color: #fff;
}
.detalles-table thead th {
  padding: 8px 8px;
  text-align: left;
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.detalles-table tbody td {
  padding: 10px 8px;
  border-bottom: 1px solid #e9ecef;
  vertical-align: top;
}
.detalles-table tbody tr:nth-child(even) {
  background: #f8f9fa;
}
.detalles-table tbody tr:hover {
  background: rgba(52,152,219,0.05);
}
.product-name {
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 2px;
}
.product-code {
  font-size: 0.72rem;
  color: #888;
  font-family: 'JetBrains Mono', monospace;
}
.badge-iva {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
}
.iva-si { background: rgba(52,152,219,0.15); color: #2980b9; }
.iva-no { background: rgba(127,140,141,0.15); color: #7f8c8d; }

/* ============ TOTALES ============ */
.totales-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
}
.totales-box {
  width: 100%;
  max-width: 340px;
  border: 1px solid #d5dbe0;
  border-radius: 6px;
  overflow: hidden;
}
.total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 14px;
  font-size: 0.85rem;
  border-bottom: 1px solid #e9ecef;
}
.total-row:last-child { border-bottom: none; }
.total-row .label { color: #555; font-weight: 500; }
.total-row .value {
  color: #1a1a1a;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}
.total-final {
  display: flex;
  justify-content: space-between;
  padding: 14px;
  background: linear-gradient(135deg, #1a3a5c, #2c3e50);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 800;
}
.total-final .label { letter-spacing: 0.5px; }
.total-final .value { font-family: 'JetBrains Mono', monospace; }

/* ============ INFO ADICIONAL ============ */
.info-adicional {
  padding: 10px 14px;
  background: #f8f9fa;
  border-left: 3px solid #e67e22;
  border-radius: 6px;
  margin-bottom: 14px;
  font-size: 0.78rem;
}
.info-adicional-title {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  margin-bottom: 4px;
}

/* ============ FIRMAS ============ */
.firma-section {
  margin-top: 30px;
  display: flex;
  justify-content: space-around;
  gap: 40px;
}
.firma-box { flex: 1; text-align: center; }
.firma-line {
  border-top: 1px solid #1a1a1a;
  margin: 40px 20px 6px;
}
.firma-label { font-size: 0.75rem; color: #555; }

/* ============ FOOTER ============ */
.doc-footer {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 2px solid #1a3a5c;
  text-align: center;
  font-size: 0.72rem;
  color: #666;
  line-height: 1.7;
}
.doc-footer strong { color: #1a3a5c; }

/* ============ XML VIEWER ============ */
.xml-viewer {
  background: #1e1e1e;
  border-radius: 10px;
  padding: 16px;
  max-height: 65vh;
  overflow: auto;
}
.xml-viewer pre {
  color: #d4d4d4;
  font-size: 0.78rem;
  line-height: 1.6;
  margin: 0;
  font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ============ UTILIDADES ============ */
.font-monospace {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
}

/* ============ RESPONSIVE ============ */
@media (max-width: 768px) {
  .documento-preview {
    padding: 16px;
    font-size: 0.78rem;
  }
  .doc-header {
    flex-direction: column;
    gap: 12px;
  }
  .doc-header-center,
  .doc-header-right {
    text-align: left;
  }
  .clave-section {
    flex-direction: column;
  }
  .barcode-container {
    max-width: 100%;
  }
  .cliente-section {
    flex-direction: column;
  }
  .firma-section {
    flex-direction: column;
    gap: 20px;
  }
}
</style>