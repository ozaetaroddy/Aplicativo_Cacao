<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-cloud-upload-alt"></i> Envío al SRI</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" @click="cargar" :disabled="loading">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Actualizar
        </button>
        <button class="btn btn-success" @click="enviarPendientes" :disabled="!hayPendientes || enviandoMasivo">
          <i class="fas fa-paper-plane" :class="{ 'fa-spin': enviandoMasivo }"></i>
          Enviar pendientes ({{ pendientes.length }})
        </button>
      </div>
    </div>

    <!-- Estado general -->
    <div class="row g-3 mb-4" v-if="estado">
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" :style="{ background: estado.ambiente === '2' ? 'rgba(39,174,96,0.15)' : 'rgba(243,156,18,0.15)', color: estado.ambiente === '2' ? '#27ae60' : '#f39c12' }">
            <i :class="estado.ambiente === '2' ? 'fas fa-check-circle' : 'fas fa-flask'"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ estado.ambienteNombre }}</div>
            <div class="stat-mini-label">Ambiente SRI</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" :style="{ background: estado.tieneCertificado ? 'rgba(39,174,96,0.15)' : 'rgba(231,76,60,0.15)', color: estado.tieneCertificado ? '#27ae60' : '#e74c3c' }">
            <i :class="estado.tieneCertificado ? 'fas fa-shield-alt' : 'fas fa-shield-virus'"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ estado.tieneCertificado ? 'OK' : 'Falta' }}</div>
            <div class="stat-mini-label">Certificado</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(52,152,219,0.15); color:#3498db;">
            <i class="fas fa-check-double"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ estado.documentos.autorizados }}</div>
            <div class="stat-mini-label">Autorizados</div>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-mini-card">
          <div class="stat-mini-icon" style="background: rgba(231,76,60,0.15); color:#e74c3c;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div>
            <div class="stat-mini-number">{{ estado.documentos.rechazados }}</div>
            <div class="stat-mini-label">Rechazados</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Alerta de configuración -->
    <div v-if="estado && !estado.tieneCertificado" class="alert alert-danger">
      <i class="fas fa-exclamation-triangle me-2"></i>
      <strong>No tienes certificado de firma electrónica cargado.</strong>
      Ve a <router-link to="/certificado-firma" class="alert-link">Certificado Firma</router-link> para subirlo.
    </div>

    <!-- Resumen de estados -->
    <div v-if="estado" class="row g-3 mb-4">
      <div class="col-md-3 col-6">
        <div class="kpi-estado" style="border-left-color: #f39c12;">
          <div class="kpi-label">Pendientes</div>
          <div class="kpi-valor" style="color:#f39c12;">{{ estado.documentos.pendientes }}</div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="kpi-estado" style="border-left-color: #3498db;">
          <div class="kpi-label">Firmados</div>
          <div class="kpi-valor" style="color:#3498db;">{{ estado.documentos.firmados }}</div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="kpi-estado" style="border-left-color: #27ae60;">
          <div class="kpi-label">Autorizados</div>
          <div class="kpi-valor" style="color:#27ae60;">{{ estado.documentos.autorizados }}</div>
        </div>
      </div>
      <div class="col-md-3 col-6">
        <div class="kpi-estado" style="border-left-color: #e74c3c;">
          <div class="kpi-label">Rechazados</div>
          <div class="kpi-valor" style="color:#e74c3c;">{{ estado.documentos.rechazados }}</div>
        </div>
      </div>
    </div>

    <!-- Lista de documentos firmados pendientes de envío -->
    <div class="card card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Documentos listos para enviar al SRI ({{ pendientes.length }})
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nº Documento</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Clave Acceso</th>
                <th style="width:180px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="pendientes.length === 0">
                <td colspan="6" class="text-center text-muted py-4">
                  <i class="fas fa-check-circle fa-2x text-success mb-2 d-block"></i>
                  No hay documentos pendientes de envío al SRI
                </td>
              </tr>
              <tr v-else v-for="v in pendientes" :key="v._id">
                <td class="small">{{ new Date(v.fecha_emision).toLocaleDateString('es-EC') }}</td>
                <td class="small font-monospace">{{ v.numero_factura }}</td>
                <td class="small">{{ v.cliente?.nombre || 'N/A' }}</td>
                <td class="small fw-bold">${{ (v.total || 0).toFixed(2) }}</td>
                <td class="small font-monospace">
                  <span :title="v.clave_acceso">{{ (v.clave_acceso || '').substring(0, 15) }}...</span>
                </td>
                <td>
                  <button
                    class="btn btn-sm btn-success me-1"
                    @click="enviarUno(v)"
                    :disabled="enviando[v._id]"
                    title="Enviar al SRI"
                  >
                    <i class="fas fa-paper-plane" :class="{ 'fa-spin': enviando[v._id] }"></i>
                    {{ enviando[v._id] ? 'Enviando...' : 'Enviar' }}
                  </button>
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    @click="consultar(v)"
                    :disabled="enviando[v._id]"
                    title="Consultar autorización"
                  >
                    <i class="fas fa-search"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal de respuesta -->
    <div class="modal fade" id="modalRespuestaSri" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header" :class="respuestaActual?.success ? 'bg-success text-white' : 'bg-danger text-white'">
            <h5 class="modal-title">
              <i :class="respuestaActual?.success ? 'fas fa-check-circle' : 'fas fa-times-circle'" class="me-2"></i>
              {{ respuestaActual?.success ? 'Documento autorizado' : 'Error al enviar' }}
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" v-if="respuestaActual">
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="text-muted small">Estado SRI</label>
                <div><span class="badge" :class="badgeEstado(respuestaActual.estado)">{{ respuestaActual.estado }}</span></div>
              </div>
              <div class="col-md-6" v-if="respuestaActual.numero_autorizacion">
                <label class="text-muted small">Nº Autorización</label>
                <div class="font-monospace small">{{ respuestaActual.numero_autorizacion }}</div>
              </div>
              <div class="col-md-6" v-if="respuestaActual.fecha_autorizacion">
                <label class="text-muted small">Fecha Autorización</label>
                <div>{{ formatFechaHora(respuestaActual.fecha_autorizacion) }}</div>
              </div>
            </div>

            <!-- Mensajes de error del SRI -->
            <div v-if="respuestaActual.mensajes && respuestaActual.mensajes.length > 0" class="alert alert-warning">
              <strong><i class="fas fa-exclamation-triangle me-2"></i>Mensajes del SRI:</strong>
              <ul class="mb-0 mt-2">
                <li v-for="(m, idx) in respuestaActual.mensajes" :key="idx">
                  <strong>{{ m.identificador }}:</strong> {{ m.mensaje }}
                  <div v-if="m.informacionAdicional" class="small text-muted">{{ m.informacionAdicional }}</div>
                </li>
              </ul>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
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
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { find } = useMongoDB()

const estado = ref(null)
const pendientes = ref([])
const loading = ref(false)
const enviando = ref({})
const enviandoMasivo = ref(false)
const respuestaActual = ref(null)
let modalInstance = null

const hayPendientes = computed(() => pendientes.value.length > 0)

const cargar = async () => {
  loading.value = true
  try {
    const [estadoData, firmados] = await Promise.all([
      api.request('/sri/estado', { method: 'GET' }),
      find('ventas')
    ])
    estado.value = estadoData
    // Filtrar los firmados pendientes de envío
    pendientes.value = (firmados || []).filter(v =>
      v.estado_sri === 'FIRMADO' && v.xml_firmado && v.clave_acceso
    )
  } catch (e) {
    toast.error('Error al cargar: ' + e.message)
  } finally {
    loading.value = false
  }
}

const enviarUno = async (venta) => {
  enviando.value = { ...enviando.value, [venta._id]: true }
  try {
    const res = await api.request(`/sri/enviar/${venta._id}`, {
      method: 'POST',
      loaderMessage: 'Enviando al SRI...'
    })
    respuestaActual.value = res
    mostrarModal()

    if (res.success) {
      toast.success(`Documento autorizado: ${res.numero_autorizacion}`)
    } else {
      toast.error('El SRI rechazó el documento')
    }

    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviando.value = { ...enviando.value, [venta._id]: false }
  }
}

const consultar = async (venta) => {
  enviando.value = { ...enviando.value, [venta._id]: true }
  try {
    const res = await api.request(`/sri/consultar/${venta._id}`, {
      method: 'POST',
      loaderMessage: 'Consultando autorización...'
    })
    respuestaActual.value = res
    mostrarModal()

    if (res.success) {
      toast.success(`Documento autorizado: ${res.numero_autorizacion}`)
    } else {
      toast.info(`Estado: ${res.estado}`)
    }

    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviando.value = { ...enviando.value, [venta._id]: false }
  }
}

const enviarPendientes = async () => {
  if (!confirm(`¿Enviar ${pendientes.value.length} documentos al SRI?\n\nEste proceso puede tardar varios minutos.`)) return

  enviandoMasivo.value = true
  try {
    const res = await api.request('/sri/enviar-pendientes', {
      method: 'POST',
      loaderMessage: 'Enviando documentos al SRI...'
    })
    const exitosos = res.resultados.filter(r => r.exito).length
    toast.success(`Envío completado: ${exitosos}/${res.total} autorizados`)
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviandoMasivo.value = false
  }
}

const mostrarModal = () => {
  if (!modalInstance) {
    const modalEl = document.getElementById('modalRespuestaSri')
    modalInstance = new Modal(modalEl)
  }
  modalInstance.show()
}

const badgeEstado = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'bg-success'
    case 'RECIBIDA': return 'bg-info'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'bg-danger'
    default: return 'bg-secondary'
  }
}

const formatFechaHora = (f) => {
  if (!f) return ''
  return new Date(f).toLocaleString('es-EC')
}

onMounted(cargar)
</script>

<style scoped>
.stat-mini-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  transition: var(--transition);
}
.stat-mini-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}
.stat-mini-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.stat-mini-number {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.stat-mini-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

.kpi-estado {
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid #3498db;
  border-radius: 10px;
  text-align: center;
}
.kpi-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
}
.kpi-valor {
  font-size: 1.6rem;
  font-weight: 800;
  margin-top: 4px;
}

.font-monospace {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
}
</style>