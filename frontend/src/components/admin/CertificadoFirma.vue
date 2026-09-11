<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-shield-alt"></i> Certificado de Firma Electrónica</h4>
    </div>

    <!-- Info general -->
    <div class="alert alert-info">
      <i class="fas fa-info-circle me-2"></i>
      <strong>¿Qué es esto?</strong> Es el archivo <code>.p12</code> o <code>.pfx</code> que te entrega tu proveedor de firma electrónica (BCE, Security Data, ANF, etc.). Se usa para firmar electrónicamente las facturas antes de enviarlas al SRI.
    </div>

    <!-- Cargando -->
    <div v-if="loading" class="text-center py-4">
      <i class="fas fa-spinner fa-spin fa-2x"></i>
    </div>

    <!-- Estado actual del certificado -->
    <div v-else-if="infoCert && infoCert.cargado" class="card card-cacao mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="fas fa-certificate me-2"></i> Certificado Actual</span>
        <span
          class="badge"
          :class="infoCert.vencido ? 'bg-danger' : (infoCert.por_vencer ? 'bg-warning text-dark' : 'bg-success')"
        >
          {{ infoCert.vencido ? 'VENCIDO' : (infoCert.por_vencer ? 'POR VENCER' : 'VIGENTE') }}
        </span>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="text-muted small">Titular</label>
            <div class="fw-bold">{{ extraerCN(infoCert.info?.subject) }}</div>
          </div>
          <div class="col-md-6">
            <label class="text-muted small">Emisor</label>
            <div>{{ extraerCN(infoCert.info?.issuer) }}</div>
          </div>
          <div class="col-md-6">
            <label class="text-muted small">Válido desde</label>
            <div>{{ formatFecha(infoCert.info?.validityNotBefore) }}</div>
          </div>
          <div class="col-md-6">
            <label class="text-muted small">Válido hasta</label>
            <div>{{ formatFecha(infoCert.info?.validityNotAfter) }}</div>
          </div>
          <div class="col-md-6">
            <label class="text-muted small">Días restantes</label>
            <div>
              <span class="badge" :class="infoCert.dias_restantes > 30 ? 'bg-success' : 'bg-warning text-dark'">
                {{ infoCert.dias_restantes }} días
              </span>
            </div>
          </div>
          <div class="col-md-6">
            <label class="text-muted small">Subido por</label>
            <div class="small">{{ infoCert.subido_por }} — {{ formatFecha(infoCert.subido_en) }}</div>
          </div>
        </div>

        <div v-if="infoCert.por_vencer" class="alert alert-warning mt-3 mb-0">
          <i class="fas fa-exclamation-triangle me-2"></i>
          Tu certificado vence en <strong>{{ infoCert.dias_restantes }} días</strong>. Contacta a tu proveedor para renovarlo.
        </div>
        <div v-if="infoCert.vencido" class="alert alert-danger mt-3 mb-0">
          <i class="fas fa-times-circle me-2"></i>
          Tu certificado <strong>ya venció</strong>. No se pueden firmar documentos.
        </div>
      </div>
      <div class="card-footer d-flex justify-content-between">
        <button class="btn btn-sm btn-outline-primary" @click="mostrarFormulario = !mostrarFormulario">
          <i class="fas fa-sync"></i> Reemplazar certificado
        </button>
        <button class="btn btn-sm btn-outline-danger" @click="eliminarCertificado">
          <i class="fas fa-trash"></i> Eliminar certificado
        </button>
      </div>
    </div>

    <!-- Sin certificado o mostrando formulario -->
    <div v-if="!infoCert?.cargado || mostrarFormulario" class="card card-cacao">
      <div class="card-header">
        <i class="fas fa-upload me-2"></i> {{ infoCert?.cargado ? 'Reemplazar Certificado' : 'Subir Certificado' }}
      </div>
      <div class="card-body">
        <form @submit.prevent="subirCertificado">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Archivo .p12 / .pfx</label>
              <input
                type="file"
                class="form-control"
                accept=".p12,.pfx"
                @change="onFileChange"
                ref="fileInput"
                required
              />
              <small class="text-muted">El archivo que te entregó tu proveedor de firma electrónica</small>
            </div>
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Contraseña del certificado</label>
              <input
                type="password"
                class="form-control"
                v-model="password"
                placeholder="Contraseña del .p12"
                required
              />
              <small class="text-muted">Es la contraseña que pusiste al descargar el certificado</small>
            </div>
          </div>

          <div v-if="errorMensaje" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle me-2"></i> {{ errorMensaje }}
          </div>

          <div v-if="exitoMensaje" class="alert alert-success mt-3">
            <i class="fas fa-check-circle me-2"></i> {{ exitoMensaje }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success" :disabled="!archivo || !password || cargando">
              <i class="fas fa-upload" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Subiendo...' : 'Subir certificado' }}
            </button>
            <button v-if="mostrarFormulario && infoCert?.cargado" type="button" class="btn btn-secondary ms-2" @click="cancelar">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Ayuda -->
    <div class="card card-cacao mt-4">
      <div class="card-header"><i class="fas fa-question-circle me-2"></i> ¿Cómo obtengo mi certificado?</div>
      <div class="card-body">
        <ol class="mb-0">
          <li>Contrata un certificado de firma electrónica con cualquier entidad autorizada:
            <ul>
              <li><strong>BCE</strong> (Banco Central del Ecuador)</li>
              <li><strong>Security Data</strong></li>
              <li><strong>ANF AC Ecuador</strong></li>
              <li><strong>Uanataca</strong></li>
            </ul>
          </li>
          <li>Te entregarán un archivo <code>.p12</code> y una contraseña</li>
          <li>Súbelo aquí con la contraseña</li>
          <li>El sistema lo usará automáticamente para firmar cada factura</li>
        </ol>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const loading = ref(true)
const infoCert = ref(null)
const mostrarFormulario = ref(false)
const cargando = ref(false)
const archivo = ref(null)
const password = ref('')
const errorMensaje = ref('')
const exitoMensaje = ref('')
const fileInput = ref(null)

const onFileChange = (event) => {
  const f = event.target.files[0]
  archivo.value = f
  errorMensaje.value = ''
}

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

const subirCertificado = async () => {
  if (!archivo.value || !password.value) return

  errorMensaje.value = ''
  exitoMensaje.value = ''
  cargando.value = true

  try {
    // Leer archivo como base64
    const reader = new FileReader()
    const archivo_base64 = await new Promise((resolve, reject) => {
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
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

    exitoMensaje.value = `Certificado cargado correctamente. Vigente hasta ${formatFecha(res.certificado.valido_hasta)}`
    toast.success('Certificado cargado correctamente')

    // Limpiar
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

const eliminarCertificado = async () => {
  if (!confirm('¿Estás seguro de eliminar el certificado? No podrás firmar facturas hasta subir uno nuevo.')) return
  try {
    await api.request('/certificado', { method: 'DELETE' })
    toast.success('Certificado eliminado')
    cargarInfo()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const cancelar = () => {
  mostrarFormulario.value = false
  archivo.value = null
  password.value = ''
  errorMensaje.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const formatFecha = (fecha) => {
  if (!fecha) return 'N/A'
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const extraerCN = (texto) => {
  if (!texto) return 'N/A'
  const match = texto.match(/CN=([^,]+)/)
  return match ? match[1] : texto
}

onMounted(cargarInfo)
</script>