<template>
  <div class="modal fade" id="modalXmlPreview" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="fas fa-file-code me-2"></i>
            XML del Comprobante
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body" v-if="xml">
          <div class="alert alert-info small">
            <i class="fas fa-info-circle me-2"></i>
            Este es el XML generado con la estructura oficial del SRI.
            En el siguiente paso se le agregará la <strong>firma electrónica</strong> para enviarlo al SRI.
          </div>
          <div class="xml-viewer">
            <pre>{{ xml }}</pre>
          </div>
        </div>
        <div class="modal-body" v-else>
          <div class="text-center py-4 text-muted">
            <i class="fas fa-spinner fa-spin fa-2x"></i>
            <p class="mt-2">Cargando XML...</p>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          <button type="button" class="btn btn-primary" @click="copiar" :disabled="!xml">
            <i class="fas fa-copy me-1"></i> Copiar
          </button>
          <button type="button" class="btn btn-success" @click="descargar" :disabled="!xml">
            <i class="fas fa-download me-1"></i> Descargar XML
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const props = defineProps({
  venta: { type: Object, default: null }
})

const toast = useToast()
const xml = ref('')

const cargar = async (venta) => {
  xml.value = ''
  if (!venta?._id) return
  try {
    const res = await api.request(`/ventas/${venta._id}/xml-preview`, {
      method: 'GET',
      loaderMessage: 'Cargando XML...'
    })
    xml.value = res.xml || ''
  } catch (e) {
    toast.error('Error al cargar XML: ' + e.message)
  }
}

const copiar = async () => {
  try {
    await navigator.clipboard.writeText(xml.value)
    toast.success('XML copiado al portapapeles')
  } catch (e) {
    toast.error('No se pudo copiar el XML')
  }
}

const descargar = async () => {
  if (!props.venta?._id) return
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const response = await fetch(`${baseUrl}/ventas/${props.venta._id}/xml`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Error al descargar')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.venta.clave_acceso || 'comprobante'}.xml`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('XML descargado')
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

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