<template>
  <div class="certificado-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-shield-alt"></i></span>
          Certificado de Firma Electrónica
        </h1>
        <p class="page-subtitle">Usa tu archivo .p12 para firmar comprobantes electrónicos</p>
      </div>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="loading-state">
      <div class="spinner-lg"></div>
      <p>Cargando información...</p>
    </div>

    <!-- CERTIFICADO ACTUAL -->
    <div v-else-if="infoCert && infoCert.cargado" class="cert-actual-wrapper">
      <div class="cert-status-card" :class="certStatusClass">
        <div class="cert-status-icon">
          <i :class="certStatusIcon"></i>
        </div>
        <div class="cert-status-content">
          <div class="cert-status-label">
            {{ infoCert.vencido ? 'CERTIFICADO VENCIDO' : (infoCert.por_vencer ? 'CERTIFICADO POR VENCER' : 'CERTIFICADO VIGENTE') }}
          </div>
          <div class="cert-status-message">
            {{ certStatusMessage }}
          </div>
        </div>
        <div v-if="!infoCert.vencido" class="cert-dias-badge" :class="certStatusClass">
          <div class="dias-num">{{ infoCert.dias_restantes }}</div>
          <div class="dias-label">días restantes</div>
        </div>
      </div>

      <div class="cert-detalles-card card-cacao">
        <div class="card-header">
          <i class="fas fa-certificate me-2"></i> Detalles del Certificado
        </div>
        <div class="card-body">
          <div class="detalles-grid">
            <div class="detalle-item full-width">
              <label>Titular (Subject)</label>
              <div class="detalle-valor">
                <i class="fas fa-user-circle"></i>
                <span>{{ extraerCN(infoCert.info?.subject) }}</span>
              </div>
            </div>
            <div class="detalle-item full-width">
              <label>Emisor</label>
              <div class="detalle-valor">
                <i class="fas fa-building"></i>
                <span>{{ extraerCN(infoCert.info?.issuer) }}</span>
              </div>
            </div>
            <div class="detalle-item">
              <label>Número de serie</label>
              <div class="detalle-valor">
                <i class="fas fa-hashtag"></i>
                <code>{{ infoCert.info?.serialNumber || 'N/A' }}</code>
              </div>
            </div>
            <div class="detalle-item">
              <label>Archivo</label>
              <div class="detalle-valor">
                <i class="fas fa-file"></i>
                <span>{{ infoCert.nombre_archivo }}</span>
              </div>
            </div>
            <div class="detalle-item">
              <label>Válido desde</label>
              <div class="detalle-valor">
                <i class="fas fa-calendar-check"></i>
                <span>{{ formatFecha(infoCert.info?.validityNotBefore) }}</span>
              </div>
            </div>
            <div class="detalle-item">
              <label>Válido hasta</label>
              <div class="detalle-valor">
                <i class="fas fa-calendar-times"></i>
                <span>{{ formatFecha(infoCert.info?.validityNotAfter) }}</span>
              </div>
            </div>
            <div class="detalle-item">
              <label>Subido por</label>
              <div class="detalle-valor">
                <i class="fas fa-user"></i>
                <span>{{ infoCert.subido_por }}</span>
              </div>
            </div>
            <div class="detalle-item">
              <label>Fecha de carga</label>
              <div class="detalle-valor">
                <i class="fas fa-clock"></i>
                <span>{{ formatFechaHora(infoCert.subido_en) }}</span>
              </div>
            </div>
          </div>

          <!-- ALERTAS -->
          <div v-if="infoCert.por_vencer" class="cert-alerta warn">
            <i class="fas fa-exclamation-triangle"></i>
            <div>
              <strong>Certificado próximo a vencer</strong>
              <div class="small">Contacta a tu proveedor para renovarlo antes del {{ formatFecha(infoCert.info?.validityNotAfter) }}</div>
            </div>
          </div>
          <div v-if="infoCert.vencido" class="cert-alerta danger">
            <i class="fas fa-times-circle"></i>
            <div>
              <strong>Certificado vencido</strong>
              <div class="small">No podrás firmar documentos hasta subir uno nuevo</div>
            </div>
          </div>
        </div>
        <div class="card-footer cert-footer">
          <button class="btn-action secondary" @click="toggleFormulario">
            <i class="fas fa-sync-alt"></i>
            {{ mostrarFormulario ? 'Ocultar formulario' : 'Reemplazar certificado' }}
          </button>
          <button class="btn-action danger" @click="abrirModalEliminar">
            <i class="fas fa-trash"></i>
            Eliminar certificado
          </button>
        </div>
      </div>
    </div>

    <!-- SIN CERTIFICADO -->
    <div v-else-if="!loading" class="cert-empty-card card-cacao">
      <div class="cert-empty-icon">
        <i class="fas fa-shield-virus"></i>
      </div>
      <h3 class="cert-empty-title">No tienes certificado cargado</h3>
      <p class="cert-empty-desc">
        Necesitas un certificado de firma electrónica para poder emitir
        comprobantes al SRI. Súbelo a continuación.
      </p>
    </div>

    <!-- FORMULARIO DE SUBIDA -->
    <transition name="slide-down">
      <div v-if="!infoCert?.cargado || mostrarFormulario" class="card-cacao">
        <div class="card-header">
          <i class="fas fa-upload me-2"></i>
          {{ infoCert?.cargado ? 'Reemplazar Certificado' : 'Subir Certificado' }}
        </div>
        <div class="card-body">
          <form @submit.prevent="subirCertificado">
            <div class="form-grid">
              <!-- ARCHIVO -->
              <div class="form-field">
                <label class="form-label">
                  <span class="required">*</span> Archivo .p12 o .pfx
                </label>
                <div
                  class="drop-zone"
                  :class="{ 'has-file': archivo, 'drag-over': dragOver }"
                  @dragover.prevent="dragOver = true"
                  @dragleave.prevent="dragOver = false"
                  @drop.prevent="onDrop"
                  @click="abrirSelectorArchivo"
                >
                  <input
                    ref="fileInput"
                    type="file"
                    accept=".p12,.pfx"
                    @change="onFileChange"
                    style="display: none"
                  />
                  <template v-if="!archivo">
                    <i class="fas fa-cloud-upload-alt drop-icon"></i>
                    <div class="drop-title">Arrastra tu archivo aquí</div>
                    <div class="drop-sub">o haz click para seleccionar</div>
                    <div class="drop-hint">Formatos permitidos: .p12, .pfx</div>
                  </template>
                  <template v-else>
                    <i class="fas fa-file-certificate file-icon"></i>
                    <div class="file-info">
                      <div class="file-name">{{ archivo.name }}</div>
                      <div class="file-size">{{ formatBytes(archivo.size) }}</div>
                    </div>
                    <button type="button" class="file-remove" @click.stop="quitarArchivo">
                      <i class="fas fa-times"></i>
                    </button>
                  </template>
                </div>
              </div>

              <!-- PASSWORD -->
              <div class="form-field">
                <label class="form-label">
                  <span class="required">*</span> Contraseña del certificado
                </label>
                <div class="input-wrapper">
                  <i class="fas fa-key input-icon"></i>
                  <input
                    :type="mostrarPassword ? 'text' : 'password'"
                    class="form-control with-icon"
                    v-model="password"
                    placeholder="Contraseña del .p12"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="toggle-pass"
                    @click="mostrarPassword = !mostrarPassword"
                    tabindex="-1"
                  >
                    <i :class="mostrarPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                  </button>
                </div>
                <small class="form-hint">
                  Es la contraseña que definiste al descargar el certificado.
                  Si no la recuerdas, contacta a tu entidad certificadora.
                </small>
              </div>
            </div>

            <!-- ERRORES / ÉXITO -->
            <transition name="fade">
              <div v-if="errorMensaje" class="alert alert-danger">
                <i class="fas fa-exclamation-circle"></i>
                <span>{{ errorMensaje }}</span>
              </div>
            </transition>
            <transition name="fade">
              <div v-if="exitoMensaje" class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <span>{{ exitoMensaje }}</span>
              </div>
            </transition>

            <!-- BOTONES -->
            <div class="form-actions">
              <button
                type="submit"
                class="btn-submit"
                :disabled="!archivo || !password || cargando"
              >
                <i class="fas fa-upload" :class="{ 'fa-spin': cargando }"></i>
                {{ cargando ? 'Subiendo...' : 'Subir certificado' }}
              </button>
              <button
                v-if="infoCert?.cargado && mostrarFormulario"
                type="button"
                class="btn-cancel"
                @click="cancelar"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </transition>

    <!-- AYUDA -->
    <div class="card-cacao ayuda-card">
      <div class="card-header">
        <i class="fas fa-question-circle me-2"></i>
        ¿Cómo obtengo mi certificado?
      </div>
      <div class="card-body">
        <div class="pasos-ayuda">
          <div class="paso">
            <div class="paso-num">1</div>
            <div class="paso-content">
              <strong>Contrata con una entidad autorizada</strong>
              <div class="small">En Ecuador, las principales son:</div>
              <div class="entidades">
                <span class="entidad-tag">BCE</span>
                <span class="entidad-tag">Security Data</span>
                <span class="entidad-tag">ANF AC</span>
                <span class="entidad-tag">Uanataca</span>
                <span class="entidad-tag">Corporación Registro Civil</span>
              </div>
            </div>
          </div>
          <div class="paso">
            <div class="paso-num">2</div>
            <div class="paso-content">
              <strong>Recibirás un archivo .p12 y una contraseña</strong>
              <div class="small">Guárdalos en un lugar seguro. La contraseña es personal.</div>
            </div>
          </div>
          <div class="paso">
            <div class="paso-num">3</div>
            <div class="paso-content">
              <strong>Súbelo aquí con la contraseña</strong>
              <div class="small">El sistema validará que el certificado sea del titular correcto.</div>
            </div>
          </div>
          <div class="paso">
            <div class="paso-num">4</div>
            <div class="paso-content">
              <strong>El sistema firmará automáticamente</strong>
              <div class="small">Cada factura que emitas será firmada y enviada al SRI sin intervención manual.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL ELIMINAR -->
    <div class="modal fade" id="modalEliminarCert" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title"><i class="fas fa-exclamation-triangle me-2"></i> Eliminar Certificado</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p>¿Estás seguro de que quieres eliminar el certificado actual?</p>
            <div class="alert alert-warning small mb-0">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <strong>No podrás firmar facturas</strong> hasta que subas uno nuevo.
              Los documentos existentes no se verán afectados.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger" @click="eliminarCertificado" :disabled="eliminando">
              <i class="fas fa-trash" :class="{ 'fa-spin': eliminando }"></i>
              {{ eliminando ? 'Eliminando...' : 'Sí, eliminar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const loading = ref(true)
const infoCert = ref(null)
const mostrarFormulario = ref(false)
const mostrarPassword = ref(false)
const cargando = ref(false)
const eliminando = ref(false)
const archivo = ref(null)
const password = ref('')
const errorMensaje = ref('')
const exitoMensaje = ref('')
const dragOver = ref(false)
const fileInput = ref(null)
let modalEliminar = null

// ===== COMPUTED =====
const certStatusClass = computed(() => {
  if (!infoCert.value) return ''
  if (infoCert.value.vencido) return 'status-danger'
  if (infoCert.value.por_vencer) return 'status-warn'
  return 'status-ok'
})

const certStatusIcon = computed(() => {
  if (!infoCert.value) return 'fas fa-shield-alt'
  if (infoCert.value.vencido) return 'fas fa-times-circle'
  if (infoCert.value.por_vencer) return 'fas fa-exclamation-triangle'
  return 'fas fa-check-circle'
})

const certStatusMessage = computed(() => {
  if (!infoCert.value) return ''
  if (infoCert.value.vencido) {
    return `El certificado venció el ${formatFecha(infoCert.value.info?.validityNotAfter)}. Debes renovarlo para poder facturar.`
  }
  if (infoCert.value.por_vencer) {
    return `Vence pronto. Contacta a tu entidad certificadora para renovarlo.`
  }
  return `Tu certificado está vigente y listo para firmar facturas.`
})

// ===== HELPERS =====
const formatFecha = (fecha) => {
  if (!fecha) return 'N/A'
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatFechaHora = (fecha) => {
  if (!fecha) return 'N/A'
  return new Date(fecha).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
}

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const extraerCN = (texto) => {
  if (!texto) return 'N/A'
  const match = texto.match(/CN=([^,]+)/)
  return match ? match[1] : texto
}

// ===== ARCHIVO =====
const validarExtension = (f) => {
  const nombre = f.name.toLowerCase()
  if (!nombre.endsWith('.p12') && !nombre.endsWith('.pfx')) {
    return false
  }
  return true
}

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB

const setArchivo = (f) => {
  if (!validarExtension(f)) {
    errorMensaje.value = 'El archivo debe ser .p12 o .pfx'
    toast.warning('Formato de archivo no válido')
    return
  }
  if (f.size > MAX_SIZE) {
    errorMensaje.value = `El archivo es demasiado grande (${formatBytes(f.size)}). Máximo: ${formatBytes(MAX_SIZE)}`
    toast.warning('Archivo demasiado grande')
    return
  }
  archivo.value = f
  errorMensaje.value = ''
  exitoMensaje.value = ''
}

const onFileChange = (event) => {
  const f = event.target.files?.[0]
  if (f) setArchivo(f)
}

const onDrop = (event) => {
  dragOver.value = false
  const f = event.dataTransfer.files?.[0]
  if (f) setArchivo(f)
}

const abrirSelectorArchivo = () => {
  fileInput.value?.click()
}

const quitarArchivo = () => {
  archivo.value = null
  if (fileInput.value) fileInput.value.value = ''
  errorMensaje.value = ''
}

// ===== CARGA =====
const cargarInfo = async () => {
  loading.value = true
  try {
    infoCert.value = await api.request('/certificado/info', { method: 'GET' })
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const toggleFormulario = () => {
  mostrarFormulario.value = !mostrarFormulario.value
}

const cancelar = () => {
  mostrarFormulario.value = false
  archivo.value = null
  password.value = ''
  errorMensaje.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

// ===== SUBIR =====
const subirCertificado = async () => {
  if (!archivo.value || !password.value) return

  errorMensaje.value = ''
  exitoMensaje.value = ''
  cargando.value = true

  try {
    // Leer archivo como base64
    const archivo_base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(archivo.value)
    })

    const res = await api.request('/certificado/subir', {
      method: 'POST',
      body: JSON.stringify({
        archivo_base64,
        password: password.value,
        nombre_archivo: archivo.value.name
      }),
      loaderMessage: 'Cargando certificado...'
    })

    exitoMensaje.value = `Certificado cargado. Vigente hasta ${formatFecha(res.certificado.valido_hasta)}`
    toast.success('Certificado cargado correctamente')

    // Limpiar formulario
    archivo.value = null
    password.value = ''
    if (fileInput.value) fileInput.value.value = ''
    mostrarFormulario.value = false

    await cargarInfo()
  } catch (e) {
    errorMensaje.value = e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}

// ===== ELIMINAR =====
const abrirModalEliminar = () => {
  if (!modalEliminar) {
    modalEliminar = new Modal(document.getElementById('modalEliminarCert'))
  }
  modalEliminar.show()
}

const eliminarCertificado = async () => {
  eliminando.value = true
  try {
    await api.request('/certificado', { method: 'DELETE', loaderMessage: 'Eliminando...' })
    toast.success('Certificado eliminado')
    modalEliminar.hide()
    await cargarInfo()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    eliminando.value = false
  }
}

onMounted(cargarInfo)
</script>

<style scoped>
.certificado-page { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #27ae60, #1e8449); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; box-shadow: 0 6px 16px rgba(39,174,96,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

/* LOADING */
.loading-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 48px; height: 48px; margin: 0 auto 16px; border: 4px solid var(--border-color); border-top-color: #27ae60; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ESTADO CERT */
.cert-actual-wrapper { display: flex; flex-direction: column; gap: 16px; }

.cert-status-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 22px 26px;
  border-radius: var(--radius-lg);
  border-left: 5px solid;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  flex-wrap: wrap;
}
.cert-status-card.status-ok { border-left-color: #27ae60; background: linear-gradient(135deg, rgba(39,174,96,0.04), transparent); }
.cert-status-card.status-warn { border-left-color: #f39c12; background: linear-gradient(135deg, rgba(243,156,18,0.05), transparent); }
.cert-status-card.status-danger { border-left-color: #e74c3c; background: linear-gradient(135deg, rgba(231,76,60,0.05), transparent); }

.cert-status-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; flex-shrink: 0; }
.status-ok .cert-status-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.status-warn .cert-status-icon { background: rgba(243,156,18,0.15); color: #f39c12; }
.status-danger .cert-status-icon { background: rgba(231,76,60,0.15); color: #e74c3c; }

.cert-status-content { flex: 1; min-width: 200px; }
.cert-status-label { font-size: 0.7rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
.status-ok .cert-status-label { color: #1e8449; }
.status-warn .cert-status-label { color: #d68910; }
.status-danger .cert-status-label { color: #c0392b; }
.cert-status-message { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.4; }

.cert-dias-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 20px; border-radius: 12px; min-width: 100px; }
.status-ok.cert-dias-badge { background: rgba(39,174,96,0.1); }
.status-warn.cert-dias-badge { background: rgba(243,156,18,0.15); }
.dias-num { font-size: 2rem; font-weight: 800; line-height: 1; }
.status-ok .dias-num { color: #27ae60; }
.status-warn .dias-num { color: #f39c12; }
.dias-label { font-size: 0.65rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin-top: 4px; opacity: 0.8; }

/* DETALLES */
.detalles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 24px; }
.detalle-item { min-width: 0; }
.detalle-item.full-width { grid-column: 1 / -1; }
.detalle-item label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-muted); display: block; margin-bottom: 6px; }
.detalle-valor { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-primary); word-break: break-word; }
.detalle-valor i { color: var(--primary-color); font-size: 0.9rem; flex-shrink: 0; }
.detalle-valor code { background: var(--bg-table-stripe); padding: 2px 8px; border-radius: 4px; font-family: var(--font-mono, monospace); font-size: 0.78rem; }

.cert-alerta { display: flex; gap: 12px; padding: 14px 16px; border-radius: var(--radius-md); margin-top: 16px; align-items: flex-start; }
.cert-alerta.warn { background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.3); color: #d68910; }
.cert-alerta.danger { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.3); color: #c0392b; }
.cert-alerta i { font-size: 1.3rem; flex-shrink: 0; margin-top: 2px; }
.cert-alerta strong { display: block; margin-bottom: 2px; }
.cert-alerta .small { font-size: 0.78rem; opacity: 0.85; }

.cert-footer { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: 1.5px solid;
}
.btn-action.secondary { background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary); }
.btn-action.secondary:hover { border-color: var(--primary-color); color: var(--primary-color); }
.btn-action.danger { background: transparent; border-color: #e74c3c; color: #e74c3c; }
.btn-action.danger:hover { background: #e74c3c; color: #fff; }

/* EMPTY CERT */
.cert-empty-card { text-align: center; padding: 50px 30px; }
.cert-empty-icon { width: 90px; height: 90px; margin: 0 auto 20px; border-radius: 50%; background: rgba(155,89,182,0.1); color: #9b59b6; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
.cert-empty-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; color: var(--text-primary); }
.cert-empty-desc { font-size: 0.9rem; color: var(--text-muted); max-width: 480px; margin: 0 auto; }

/* FORM */
.form-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 900px) { .form-grid { grid-template-columns: 1fr 1fr; } }

.form-field { display: flex; flex-direction: column; gap: 8px; }
.form-label { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.required { color: #e74c3c; margin-right: 4px; }
.form-hint { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; }

/* DROP ZONE */
.drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-table-stripe);
  cursor: pointer;
  transition: all var(--transition);
  min-height: 180px;
}
.drop-zone:hover { border-color: #27ae60; background: rgba(39,174,96,0.04); }
.drop-zone.drag-over { border-color: #27ae60; background: rgba(39,174,96,0.1); transform: scale(1.01); }
.drop-zone.has-file { flex-direction: row; justify-content: flex-start; gap: 16px; padding: 20px; border-style: solid; border-color: #27ae60; background: rgba(39,174,96,0.05); min-height: auto; }

.drop-icon { font-size: 2.5rem; color: var(--primary-color); margin-bottom: 8px; }
.drop-title { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; }
.drop-sub { font-size: 0.82rem; color: var(--text-muted); margin-top: 2px; }
.drop-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 10px; opacity: 0.7; }

.file-icon { font-size: 2rem; color: #27ae60; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-weight: 700; color: var(--text-primary); font-size: 0.9rem; word-break: break-all; }
.file-size { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.file-remove { width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(231,76,60,0.15); color: #e74c3c; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all var(--transition-fast); flex-shrink: 0; }
.file-remove:hover { background: #e74c3c; color: #fff; }

/* PASSWORD INPUT */
.input-wrapper { position: relative; display: flex; align-items: center; }
.input-icon { position: absolute; left: 14px; color: var(--text-muted); font-size: 0.9rem; pointer-events: none; }
.form-control {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  transition: all var(--transition-fast);
  outline: none;
}
.form-control.with-icon { padding-left: 42px; padding-right: 42px; }
.form-control:focus { border-color: #27ae60; box-shadow: 0 0 0 4px rgba(39,174,96,0.15); background: var(--bg-card); }
.toggle-pass { position: absolute; right: 8px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 8px; border-radius: var(--radius-sm); }
.toggle-pass:hover { color: var(--primary-color); background: var(--bg-table-stripe); }

/* ALERTS */
.alert { display: flex; gap: 12px; padding: 14px 18px; border-radius: var(--radius-md); font-size: 0.85rem; margin-top: 16px; align-items: center; }
.alert-danger { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.3); color: #c0392b; }
.alert-success { background: rgba(39,174,96,0.08); border: 1px solid rgba(39,174,96,0.3); color: #1e8449; }
.alert i { font-size: 1.15rem; flex-shrink: 0; }

/* ACTIONS */
.form-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
.btn-submit, .btn-cancel {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: none;
}
.btn-submit { background: linear-gradient(135deg, #27ae60, #1e8449); color: #fff; box-shadow: 0 4px 12px rgba(39,174,96,0.3); }
.btn-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(39,174,96,0.4); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { background: transparent; border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-cancel:hover { border-color: #e74c3c; color: #e74c3c; }

/* AYUDA */
.ayuda-card .card-header { background: linear-gradient(135deg, rgba(52,152,219,0.08), transparent); }
.pasos-ayuda { display: flex; flex-direction: column; gap: 20px; }
.paso { display: flex; gap: 16px; align-items: flex-start; }
.paso-num { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #3498db, #2980b9); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; font-size: 0.95rem; }
.paso-content { flex: 1; }
.paso-content strong { display: block; color: var(--text-primary); font-size: 0.92rem; margin-bottom: 4px; }
.paso-content .small { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; }

.entidades { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.entidad-tag { padding: 3px 10px; border-radius: var(--radius-full); background: var(--bg-table-stripe); color: var(--text-secondary); font-size: 0.72rem; font-weight: 600; border: 1px solid var(--border-color); }

/* TRANSICIONES */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-12px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .page-subtitle { padding-left: 0; }
  .cert-status-card { flex-direction: column; align-items: flex-start; text-align: left; }
  .cert-dias-badge { width: 100%; flex-direction: row; justify-content: space-between; padding: 10px 14px; }
  .dias-num { font-size: 1.5rem; }
}
</style>