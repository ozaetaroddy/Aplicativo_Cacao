<template>
  <div class="modal fade" id="modalEnviarEmail" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content modal-content-clean">
        <div class="modal-header bg-primary text-white">
          <h5 class="modal-title">
            <i class="fas fa-envelope me-2" aria-hidden="true"></i>
            Enviar comprobante por email
          </h5>
          <button
            type="button"
            class="btn-close btn-close-white"
            data-bs-dismiss="modal"
            aria-label="Cerrar"
            :disabled="enviando"
          ></button>
        </div>

        <div class="modal-body">
          <div v-if="!venta" class="text-muted text-center py-4">
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            <p class="mb-0 mt-2">Cargando…</p>
          </div>

          <div v-else>
            <!-- Info del documento -->
            <div class="info-documento mb-4">
              <div class="row">
                <div class="col-md-6">
                  <div class="small text-muted">Documento</div>
                  <div class="fw-bold">
                    {{ (venta.tipo_documento || 'documento').toUpperCase() }}
                    Nº {{ venta.numero_factura || '—' }}
                  </div>
                </div>
                <div class="col-md-6 text-md-end">
                  <div class="small text-muted">Total</div>
                  <div class="fw-bold h5 mb-0">${{ formatMonto(venta.total) }}</div>
                </div>
              </div>
            </div>

            <!-- Alerta estado SRI -->
            <div v-if="venta.estado_sri !== 'AUTORIZADO'" class="alert alert-warning small mb-3">
              <i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
              <strong>Este documento no está autorizado por el SRI</strong>
              (Estado: {{ venta.estado_sri || 'PENDIENTE' }}).
              Puedes enviarlo igual, pero no tiene validez fiscal completa.
            </div>
            <div v-else class="alert alert-success small mb-3">
              <i class="fas fa-check-circle me-2" aria-hidden="true"></i>
              Documento <strong>autorizado por el SRI</strong>.
              <div v-if="venta.numero_autorizacion" class="mt-1 small">
                Nº Autorización: <code>{{ venta.numero_autorizacion }}</code>
              </div>
            </div>

            <form @submit.prevent="enviar">
              <!-- Email destino -->
              <div class="mb-3">
                <label class="form-label" for="email-destino">
                  <span class="text-danger">*</span> Email del destinatario
                </label>
                <input
                  id="email-destino"
                  type="email"
                  class="form-control"
                  :class="{ 'is-invalid': !!errorEmail }"
                  v-model="form.email"
                  placeholder="cliente@ejemplo.com"
                  required
                  :disabled="enviando"
                  autocomplete="email"
                  maxlength="200"
                  @blur="touchedEmail = true"
                  @input="errorEmail = ''"
                />
                <div v-if="errorEmail" class="invalid-feedback">{{ errorEmail }}</div>
                <small v-else-if="!emailClienteOriginal" class="text-warning">
                  <i class="fas fa-info-circle me-1" aria-hidden="true"></i>
                  El cliente no tenía email registrado. Ingresa uno.
                </small>
              </div>

              <!-- Asunto -->
              <div class="mb-3">
                <label class="form-label" for="email-asunto">Asunto</label>
                <input
                  id="email-asunto"
                  type="text"
                  class="form-control"
                  v-model="form.asunto"
                  :placeholder="asuntoPorDefecto"
                  :disabled="enviando"
                  maxlength="200"
                />
                <small class="text-muted">Dejar vacío para usar el asunto por defecto</small>
              </div>

              <!-- Mensaje -->
              <div class="mb-3">
                <label class="form-label" for="email-mensaje">Mensaje (opcional)</label>
                <textarea
                  id="email-mensaje"
                  class="form-control"
                  v-model="form.mensaje"
                  rows="4"
                  placeholder="Mensaje personalizado. Dejar vacío para usar el mensaje por defecto."
                  :disabled="enviando"
                  maxlength="5000"
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
                    <i class="fas fa-file-pdf text-danger me-1" aria-hidden="true"></i>
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
                    <i class="fas fa-file-code text-success me-1" aria-hidden="true"></i>
                    XML firmado
                    <span v-if="!venta.xml_firmado" class="text-muted small">(no disponible)</span>
                  </label>
                </div>
              </div>

              <!-- Historial -->
              <div v-if="historial.length > 0" class="mt-4">
                <h6 class="text-muted">
                  <i class="fas fa-history" aria-hidden="true"></i>
                  Historial de envíos ({{ historial.length }})
                </h6>
                <div class="historial-list">
                  <div v-for="(h, idx) in historial" :key="idx" class="historial-item">
                    <i class="fas fa-envelope text-primary" aria-hidden="true"></i>
                    <div>
                      <div class="small"><strong>{{ h.email }}</strong></div>
                      <div class="text-muted small">
                        {{ formatFechaHora(h.fecha) }} — por {{ h.enviado_por || 'N/A' }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Error con aria-live -->
              <div
                v-if="error"
                class="alert alert-danger mt-3"
                role="alert"
                aria-live="polite"
              >
                <i class="fas fa-exclamation-circle me-2" aria-hidden="true"></i>
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
            :disabled="enviando || !form.email || !venta"
          >
            <i
              class="fas fa-paper-plane"
              :class="{ 'fa-spin': enviando }"
              aria-hidden="true"
            ></i>
            {{ enviando ? 'Enviando…' : 'Enviar comprobante' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { pdfService } from '../../services/pdfService'
import { useToast } from 'vue-toastification'

const props = defineProps({
  venta: { type: Object, default: null },
  cliente: { type: Object, default: null },
  obtenerNombreProducto: {
    type: Function,
    default: (id) => (id ? `Producto ${String(id).slice(-6)}` : 'Producto')
  }
})

const toast = useToast()

// ===== CONSTANTES =====
const PDF_GENERATION_TIMEOUT_MS = 20_000
const HISTORIAL_MAX = 50

// ===== STATE =====
const form = ref({
  email: '',
  asunto: '',
  mensaje: '',
  incluir_pdf: true,
  incluir_xml: true
})

const enviando = ref(false)
const error = ref('')
const errorEmail = ref('')
const touchedEmail = ref(false)
const historial = ref([])

// 🔧 FIX: instancia de Bootstrap Modal para poder abrirlo
//    programáticamente desde el padre.
let modalInstance = null

let unmounted = false
let abortController = null

// ===== COMPUTED =====
const emailClienteOriginal = computed(() => props.cliente?.email || '')

const asuntoPorDefecto = computed(() => {
  if (!props.venta) return ''
  const tipo = (props.venta.tipo_documento || 'comprobante').toUpperCase()
  return `Comprobante Electrónico ${tipo} Nº ${props.venta.numero_factura || ''}`.trim()
})

// ===== HELPERS =====
const formatMonto = (n) => {
  const v = Number(n)
  return Number.isFinite(v) ? v.toFixed(2) : '0.00'
}

const formatFechaHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC')
  } catch {
    return ''
  }
}

const validarEmail = (email) => {
  if (!email) return 'El email es obligatorio'
  if (email.length > 200) return 'Email demasiado largo'
  if (/[\r\n\0]/.test(email)) return 'Email contiene caracteres inválidos'
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) return 'Formato de email inválido'
  return ''
}

const conTimeout = (promesa, ms, mensaje) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensaje)), ms)
    Promise.resolve(promesa).then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) }
    )
  })
}

// ===== API PÚBLICA (para el padre) =====
/**
 * Abre el modal. Se invoca desde el padre (`<EnviarEmailModal ref="..." />`).
 * 🔧 FIX: antes el modal nunca se abría porque no existía un watcher
 *    que lo disparara al cambiar `venta`.
 */
const abrir = () => {
  if (!modalInstance) {
    const el = document.getElementById('modalEnviarEmail')
    if (!el) return
    modalInstance = new Modal(el, { backdrop: 'static', keyboard: false })
  }
  modalInstance.show()
}

const cerrar = () => {
  modalInstance?.hide()
}

defineExpose({ abrir, cerrar })

// ===== WATCH =====
watch(
  () => props.venta,
  (v) => {
    if (!v) {
      form.value = {
        email: '',
        asunto: '',
        mensaje: '',
        incluir_pdf: true,
        incluir_xml: true
      }
      historial.value = []
      error.value = ''
      errorEmail.value = ''
      touchedEmail.value = false
      return
    }

    form.value = {
      email: props.cliente?.email || '',
      asunto: '',
      mensaje: '',
      incluir_pdf: true,
      incluir_xml: Boolean(v.xml_firmado)
    }
    error.value = ''
    errorEmail.value = ''
    touchedEmail.value = false
    historial.value = []

    cargarHistorial()
  },
  { immediate: true }
)

// ===== HISTORIAL =====
const cargarHistorial = async () => {
  if (!props.venta?._id) return

  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
  }
  abortController = new AbortController()

  try {
    const res = await api.request(`/email/historial/${props.venta._id}`, {
      method: 'GET',
      skipLoader: true,
      signal: abortController.signal
    })
    if (unmounted) return

    const envios = Array.isArray(res?.envios) ? res.envios : []
    historial.value = envios.slice(-HISTORIAL_MAX).reverse()
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort) return
    historial.value = []
  }
}

// ===== GENERAR PDF =====
const generarPDFBase64 = async () => {
  const task = pdfService.generarRIDEBase64(props.venta, {
    obtenerNombreProducto: props.obtenerNombreProducto
  })

  return conTimeout(
    task,
    PDF_GENERATION_TIMEOUT_MS,
    'La generación del PDF tardó demasiado'
  )
}

// ===== ENVIAR =====
const enviar = async () => {
  if (enviando.value || !props.venta?._id) return

  touchedEmail.value = true

  const errMail = validarEmail(form.value.email)
  if (errMail) {
    errorEmail.value = errMail
    error.value = 'Corrige los errores antes de enviar'
    return
  }
  errorEmail.value = ''
  error.value = ''

  enviando.value = true

  try {
    let pdfBase64 = ''
    if (form.value.incluir_pdf) {
      try {
        pdfBase64 = await generarPDFBase64()
      } catch (e) {
        console.warn('No se pudo generar el PDF:', e?.message)
        // Continuamos: se envía sin PDF
      }
    }
    if (unmounted) return

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
      loaderMessage: 'Enviando email…'
    })

    if (unmounted) return

    toast.success(`Comprobante enviado a ${res?.destinatario || form.value.email}`)

    await cargarHistorial()

    setTimeout(() => {
      if (unmounted) return
      cerrar()
    }, 1200)
  } catch (e) {
    if (unmounted) return
    error.value = e?.message || 'Error desconocido'
    toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) enviando.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(() => {
  const el = document.getElementById('modalEnviarEmail')
  if (el) {
    modalInstance = new Modal(el, { backdrop: 'static', keyboard: false })
  }
})

onBeforeUnmount(() => {
  unmounted = true

  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
    abortController = null
  }

  try { modalInstance?.hide() } catch { /* noop */ }
  modalInstance = null

  // Limpieza de datos sensibles
  form.value = {
    email: '',
    asunto: '',
    mensaje: '',
    incluir_pdf: true,
    incluir_xml: true
  }
  historial.value = []
  error.value = ''
  errorEmail.value = ''
})
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

.modal-content-clean {
  border-radius: 14px;
  overflow: hidden;
  border: none;
}

code {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  word-break: break-all;
}
</style>