<template>
  <div class="modal fade" id="modalXmlPreview" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="fas fa-file-code me-2" aria-hidden="true"></i>
            XML del Comprobante
            <span
              v-if="venta?.clave_acceso"
              class="badge ms-2"
              :class="venta.xml_firmado ? 'bg-success' : 'bg-secondary'"
            >
              {{ venta.xml_firmado ? 'Firmado' : 'Sin firmar' }}
            </span>
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Cerrar"
          ></button>
        </div>

        <div class="modal-body">
          <!-- Loading -->
          <div v-if="cargando" class="text-center py-5 text-muted">
            <i class="fas fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
            <p class="mt-2 mb-0">Cargando XML…</p>
          </div>

          <!-- Contenido -->
          <template v-else-if="xml">
            <div class="alert alert-info small mb-3">
              <i class="fas fa-info-circle me-2" aria-hidden="true"></i>
              Este es el XML generado con la estructura oficial del SRI.
              <template v-if="!venta?.xml_firmado">
                Aún <strong>no tiene firma electrónica</strong>; se agregará al enviarlo al SRI.
              </template>
              <template v-else>
                Ya está <strong>firmado electrónicamente</strong> y listo para enviar al SRI.
              </template>
            </div>

            <div class="xml-viewer">
              <pre>{{ xml }}</pre>
            </div>
          </template>

          <!-- Sin XML -->
          <div v-else class="text-center py-5 text-muted">
            <i class="fas fa-file-excel fa-2x mb-3" aria-hidden="true"></i>
            <p class="mb-0">No hay XML disponible para este comprobante.</p>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary me-auto"
            @click="cargar(venta)"
            :disabled="cargando || !venta?._id"
            title="Recargar XML"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': cargando }" aria-hidden="true"></i>
            Recargar
          </button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            Cerrar
          </button>
          <button
            type="button"
            class="btn btn-primary"
            @click="copiar"
            :disabled="!xml"
          >
            <i class="fas fa-copy me-1" aria-hidden="true"></i> Copiar
          </button>
          <button
            type="button"
            class="btn btn-success"
            @click="descargar"
            :disabled="!xml || descargando"
          >
            <i
              class="fas fa-download me-1"
              :class="{ 'fa-spin': descargando }"
              aria-hidden="true"
            ></i>
            {{ descargando ? 'Descargando…' : 'Descargar XML' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const props = defineProps({
  venta: { type: Object, default: null }
})

const toast = useToast()
const xml = ref('')
const cargando = ref(false)
const descargando = ref(false)

let unmounted = false
let abortController = null

/**
 * Carga el XML del comprobante. Cancela requests previas para
 * evitar race conditions si el usuario abre varios modales seguidos.
 */
const cargar = async (venta) => {
  // Cancelar previo
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
  }
  abortController = new AbortController()

  xml.value = ''

  if (!venta?._id) {
    cargando.value = false
    return
  }

  cargando.value = true
  try {
    const res = await api.request(`/ventas/${venta._id}/xml-preview`, {
      method: 'GET',
      signal: abortController.signal
    })
    if (unmounted) return
    xml.value = String(res?.xml || '')
  } catch (e) {
    const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
    if (unmounted || esAbort) return
    toast.error('Error al cargar XML: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) cargando.value = false
  }
}

/**
 * Copia al portapapeles con fallback para contextos sin HTTPS
 * (navigator.clipboard solo existe en secure contexts).
 */
const copiar = async () => {
  if (!xml.value) return

  // 1. Intento con la API moderna
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(xml.value)
      toast.success('XML copiado al portapapeles')
      return
    } catch {
      // cae al fallback
    }
  }

  // 2. Fallback: textarea oculto + execCommand
  try {
    const ta = document.createElement('textarea')
    ta.value = xml.value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) toast.success('XML copiado al portapapeles')
    else toast.error('No se pudo copiar el XML')
  } catch {
    toast.error('No se pudo copiar el XML')
  }
}

const descargar = async () => {
  if (!props.venta?._id || descargando.value) return

  descargando.value = true
  try {
    const firmado = Boolean(props.venta.xml_firmado)
    const endpoint = firmado
      ? `/ventas/${props.venta._id}/xml-firmado`
      : `/ventas/${props.venta._id}/xml`
    const nombre = `${props.venta.clave_acceso || 'comprobante'}${firmado ? '_firmado' : ''}.xml`

    await api.download(endpoint, nombre)
    if (!unmounted) toast.success('XML descargado')
  } catch (e) {
    if (!unmounted) toast.error('Error: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) descargando.value = false
  }
}

// ===== CLEANUP =====
onBeforeUnmount(() => {
  unmounted = true
  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
    abortController = null
  }
  xml.value = ''
})

defineExpose({ cargar })
</script>

<style scoped>
.xml-viewer {
  background: #1e1e1e;
  border-radius: 10px;
  padding: 16px;
  max-height: 60vh;
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
</style>