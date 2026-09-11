<template>
  <div class="modal fade" id="modalEnviarEmail" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h5 class="modal-title">
            <i class="fas fa-envelope me-2"></i>
            Enviar comprobante por email
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div v-if="!venta" class="text-muted text-center py-4">
            <i class="fas fa-spinner fa-spin"></i> Cargando...
          </div>

          <div v-else>
            <!-- Info del documento -->
            <div class="info-documento mb-4">
              <div class="row">
                <div class="col-md-6">
                  <div class="small text-muted">Documento</div>
                  <div class="fw-bold">
                    {{ venta.tipo_documento?.toUpperCase() }} Nº {{ venta.numero_factura }}
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="small text-muted">Total</div>
                  <div class="fw-bold h5 mb-0">${{ (venta.total || 0).toFixed(2) }}</div>
                </div>
              </div>
            </div>

            <!-- Alert de estado SRI -->
            <div v-if="venta.estado_sri !== 'AUTORIZADO'" class="alert alert-warning small mb-3">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <strong>Este documento no está autorizado por el SRI</strong>
              (Estado: {{ venta.estado_sri || 'PENDIENTE' }}).
              Puedes enviarlo igual, pero no tiene validez fiscal completa.
            </div>

            <div v-else class="alert alert-success small mb-3">
              <i class="fas fa-check-circle me-2"></i>
              Documento <strong>autorizado por el SRI</strong>.
              <div v-if="venta.numero_autorizacion" class="mt-1 small">
                Nº Autorización: <code>{{ venta.numero_autorizacion }}</code>
              </div>
            </div>

            <form @submit.prevent="enviar">
              <!-- Email destino -->
              <div class="mb-3">
                <label class="form-label">
                  <span class="text-danger">*</span> Email del destinatario
                </label>
                <input
                  type="email"
                  class="form-control"
                  v-model="form.email"
                  placeholder="cliente@ejemplo.com"
                  required
                  :disabled="enviando"
                />
                <small v-if="!emailClienteOriginal" class="text-warning">
                  El cliente no tenía email registrado. Ingresa uno.
                </small>
              </div>

              <!-- Asunto -->
              <div class="mb-3">
                <label class="form-label">Asunto</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.asunto"
                  :placeholder="asuntoPorDefecto"
                  :disabled="enviando"
                />
                <small class="text-muted">Dejar vacío para usar el asunto por defecto</small>
              </div>

              <!-- Mensaje -->
              <div class="mb-3">
                <label class="form-label">Mensaje (opcional)</label>
                <textarea
                  class="form-control"
                  v-model="form.mensaje"
                  rows="4"
                  placeholder="Mensaje personalizado. Dejar vacío para usar el mensaje por defecto."
                  :disabled="enviando"
                ></textarea>
              </div>

              <!-- Adjuntos -->
              <div class="mb-3">
                <label class="form-label">Adjuntos</label>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="chkPdf"
                    v-model="form.incluir_pdf"
                    :disabled="enviando"
                  />
                  <label class="form-check-label" for="chkPdf">
                    <i class="fas fa-file-pdf text-danger me-1"></i>
                    RIDE (PDF)
                  </label>
                </div>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="chkXml"
                    v-model="form.incluir_xml"
                    :disabled="enviando || !venta.xml_firmado"
                  />
                  <label class="form-check-label" for="chkXml">
                    <i class="fas fa-file-code text-success me-1"></i>
                    XML firmado
                    <span v-if="!venta.xml_firmado" class="text-muted small">(no disponible)</span>
                  </label>
                </div>
              </div>

              <!-- Historial -->
              <div v-if="historial.length > 0" class="mt-4">
                <h6 class="text-muted">
                  <i class="fas fa-history"></i>
                  Historial de envíos ({{ historial.length }})
                </h6>
                <div class="historial-list">
                  <div v-for="(h, idx) in historial" :key="idx" class="historial-item">
                    <i class="fas fa-envelope text-primary"></i>
                    <div>
                      <div class="small"><strong>{{ h.email }}</strong></div>
                      <div class="text-muted" style="font-size:0.7rem;">
                        {{ formatFechaHora(h.fecha) }} — por {{ h.enviado_por || 'N/A' }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Error -->
              <div v-if="error" class="alert alert-danger mt-3">
                <i class="fas fa-exclamation-circle me-2"></i>
                {{ error }}
              </div>
            </form>
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            data-bs-dismiss="modal"
            :disabled="enviando"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary"
            @click="enviar"
            :disabled="enviando || !form.email"
          >
            <i class="fas fa-paper-plane" :class="{ 'fa-spin': enviando }"></i>
            {{ enviando ? 'Enviando...' : 'Enviar comprobante' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const props = defineProps({
  venta: { type: Object, default: null },
  cliente: { type: Object, default: null }
})

const form = ref({
  email: '',
  asunto: '',
  mensaje: '',
  incluir_pdf: true,
  incluir_xml: true
})

const enviando = ref(false)
const error = ref('')
const historial = ref([])

const emailClienteOriginal = computed(() => props.cliente?.email || '')

const asuntoPorDefecto = computed(() => {
  if (!props.venta) return ''
  const tipo = props.venta.tipo_documento?.toUpperCase() || 'COMPROBANTE'
  return `Comprobante Electrónico ${tipo} Nº ${props.venta.numero_factura}`
})

watch(() => props.venta, (v) => {
  if (v) {
    form.value.email = props.cliente?.email || ''
    form.value.asunto = ''
    form.value.mensaje = ''
    form.value.incluir_pdf = true
    form.value.incluir_xml = !!v.xml_firmado
    error.value = ''
    cargarHistorial()
  }
})

const cargarHistorial = async () => {
  if (!props.venta?._id) return
  try {
    const res = await api.request(`/email/historial/${props.venta._id}`, { method: 'GET' })
    historial.value = res.envios || []
  } catch (e) {
    historial.value = []
  }
}

const generarPDFBase64 = async () => {
  const jsPDF = (await import('jspdf')).default
  await import('jspdf-autotable')

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const v = props.venta
  const c = props.cliente || {}

  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(v.razon_social_emisor || "System Ozaet's Electronics", pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Sistema Contable — Documento Electrónico', pageWidth / 2, y, { align: 'center' })
  y += 10
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text((v.tipo_documento || 'FACTURA').toUpperCase(), pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Nº: ${v.numero_factura || 'N/A'}`, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.text(
    `Fecha: ${v.fecha_emision ? new Date(v.fecha_emision).toLocaleDateString() : ''}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  )
  y += 8

  if (v.clave_acceso) {
    doc.setFontSize(7)
    doc.setFont('courier', 'bold')
    doc.text('CLAVE DE ACCESO:', 14, y)
    y += 4
    doc.setFont('courier', 'normal')
    const chunks = v.clave_acceso.match(/.{1,49}/g) || []
    chunks.forEach((chunk) => {
      doc.text(chunk, 14, y)
      y += 4
    })
    y += 4
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Datos del Cliente:', 14, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(`Nombre: ${c.nombre || 'N/A'}`, 14, y)
  y += 4
  doc.text(`RUC/Cédula: ${c.ruc || 'N/A'}`, 14, y)
  y += 4
  doc.text(`Dirección: ${c.direccion || 'N/A'}`, 14, y)
  y += 8

  if (v.detalles && v.detalles.length > 0) {
    const tableData = v.detalles.map((item, idx) => [
      idx + 1,
      item.nombre || 'Producto',
      item.cantidad,
      `$${(item.precio_unitario || 0).toFixed(2)}`,
      item.aplica_iva !== false ? '15%' : '0%',
      `$${((item.cantidad || 0) * (item.precio_unitario || 0)).toFixed(2)}`
    ])
    doc.autoTable({
      startY: y,
      head: [['#', 'Producto', 'Cant.', 'P. Unit.', 'IVA', 'Subtotal']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [26, 58, 92], fontSize: 9 },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Subtotal: $${(v.subtotal || 0).toFixed(2)}`, pageWidth - 60, y)
  y += 5
  doc.text(`IVA: $${(v.iva || 0).toFixed(2)}`, pageWidth - 60, y)
  y += 6
  doc.setFontSize(12)
  doc.text(`TOTAL: $${(v.total || 0).toFixed(2)}`, pageWidth - 60, y)

  return doc.output('datauristring').split(',')[1]
}

const enviar = async () => {
  if (!form.value.email) {
    error.value = 'Ingresa un email de destino'
    return
  }

  enviando.value = true
  error.value = ''

  try {
    let pdfBase64 = ''
    if (form.value.incluir_pdf) {
      try {
        pdfBase64 = await generarPDFBase64()
      } catch (e) {
        console.warn('No se pudo generar el PDF:', e)
      }
    }

    const res = await api.request(`/email/enviar/${props.venta._id}`, {
      method: 'POST',
      body: JSON.stringify({
        email: form.value.email,
        asunto: form.value.asunto || undefined,
        mensaje: form.value.mensaje || undefined,
        incluir_pdf: form.value.incluir_pdf && !!pdfBase64,
        incluir_xml: form.value.incluir_xml,
        pdf_base64: pdfBase64 || undefined
      }),
      loaderMessage: 'Enviando email...'
    })

    toast.success(`Comprobante enviado a ${res.destinatario}`)

    setTimeout(() => {
      const modalEl = document.getElementById('modalEnviarEmail')
      const modal = Modal.getInstance(modalEl)
      if (modal) modal.hide()
    }, 1200)
  } catch (e) {
    error.value = e.message
    toast.error('Error: ' + e.message)
  } finally {
    enviando.value = false
  }
}

const formatFechaHora = (f) => {
  if (!f) return ''
  return new Date(f).toLocaleString('es-EC')
}
</script>

<style scoped>
.info-documento {
  background: var(--bg-table-stripe);
  padding: 14px;
  border-radius: 10px;
  border-left: 4px solid var(--primary-color);
}

.historial-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-table-stripe);
}
.historial-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-bottom: 1px solid var(--border-color);
}
.historial-item:last-child {
  border-bottom: none;
}

code {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  word-break: break-all;
}
</style>