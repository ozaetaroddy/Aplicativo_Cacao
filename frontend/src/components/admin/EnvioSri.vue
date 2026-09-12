<template>
  <div class="envio-sri-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-cloud-upload-alt"></i></span>
          Consola de Envío al SRI
        </h1>
        <p class="page-subtitle">Envía y consulta el estado de tus comprobantes electrónicos</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="cargar" :disabled="loading">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
        <button
          class="btn-primary"
          @click="enviarMasivo"
          :disabled="!hayPendientes || enviandoMasivo"
        >
          <i class="fas fa-paper-plane" :class="{ 'fa-spin': enviandoMasivo }"></i>
          Enviar pendientes ({{ pendientesFiltrados.length }})
        </button>
      </div>
    </div>

    <!-- PROGRESO EN VIVO -->
    <transition name="slide-down">
      <div v-if="progreso" class="progreso-card">
        <div class="progreso-header">
          <div>
            <strong>Enviando documentos al SRI...</strong>
            <span class="ms-2">{{ progreso.procesados }} / {{ progreso.total }}</span>
          </div>
          <div class="progreso-stats">
            <span class="stat-pill ok"><i class="fas fa-check"></i> {{ progreso.autorizados }}</span>
            <span class="stat-pill err"><i class="fas fa-times"></i> {{ progreso.rechazados }}</span>
            <span class="stat-pill warn" v-if="progreso.errores"><i class="fas fa-exclamation"></i> {{ progreso.errores }}</span>
          </div>
        </div>
        <div class="progreso-bar">
          <div class="progreso-fill" :style="{ width: `${progressPct}%` }"></div>
        </div>
      </div>
    </transition>

    <!-- KPIs -->
    <div v-if="estado" class="kpi-row">
      <div class="kpi-card" :class="estado.ambiente === '2' ? 'kpi-prod' : 'kpi-test'">
        <div class="kpi-icon" :class="estado.ambiente === '2' ? 'prod' : 'test'">
          <i :class="estado.ambiente === '2' ? 'fas fa-check-circle' : 'fas fa-flask'"></i>
        </div>
        <div>
          <div class="kpi-value">{{ estado.ambienteNombre }}</div>
          <div class="kpi-label">Ambiente SRI</div>
        </div>
      </div>

      <div class="kpi-card" :class="estado.tieneCertificado ? 'kpi-ok' : 'kpi-fail'">
        <div class="kpi-icon" :class="estado.tieneCertificado ? 'ok' : 'fail'">
          <i :class="estado.tieneCertificado ? 'fas fa-shield-alt' : 'fas fa-shield-virus'"></i>
        </div>
        <div>
          <div class="kpi-value">{{ estado.tieneCertificado ? 'OK' : 'Falta' }}</div>
          <div class="kpi-label">Certificado</div>
        </div>
      </div>

      <div class="kpi-card kpi-info">
        <div class="kpi-icon info"><i class="fas fa-check-double"></i></div>
        <div>
          <div class="kpi-value">{{ estado.documentos.autorizados }}</div>
          <div class="kpi-label">Autorizados</div>
        </div>
      </div>

      <div class="kpi-card kpi-warn">
        <div class="kpi-icon warn"><i class="fas fa-clock"></i></div>
        <div>
          <div class="kpi-value">{{ estado.documentos.firmados }}</div>
          <div class="kpi-label">Pendientes de envío</div>
        </div>
      </div>

      <div class="kpi-card kpi-danger">
        <div class="kpi-icon danger"><i class="fas fa-exclamation-triangle"></i></div>
        <div>
          <div class="kpi-value">{{ estado.documentos.totalRechazados || estado.documentos.rechazados }}</div>
          <div class="kpi-label">Rechazados</div>
        </div>
      </div>
    </div>

    <!-- ALERTA SIN CERTIFICADO -->
    <div v-if="estado && !estado.tieneCertificado" class="alert-card alert-danger">
      <div class="alert-icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="alert-body">
        <strong>Sin certificado de firma electrónica</strong>
        <div class="small">
          No podrás firmar documentos. Ve a
          <router-link to="/certificado-firma" class="alert-link">Certificado Firma</router-link>
          para cargarlo.
        </div>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="filters-bar">
      <div class="filters-group">
        <span class="filters-label"><i class="fas fa-filter"></i> Estado:</span>
        <button
          class="filter-chip"
          :class="{ active: filtro === 'FIRMADO' }"
          @click="filtro = 'FIRMADO'"
        >
          <i class="fas fa-signature"></i>
          <span>Listos para enviar</span>
          <span class="chip-count">{{ conteoPorEstado.FIRMADO || 0 }}</span>
        </button>
        <button
          class="filter-chip chip-danger"
          :class="{ active: filtro === 'RECHAZADA' }"
          @click="filtro = 'RECHAZADA'"
        >
          <i class="fas fa-times-circle"></i>
          <span>Rechazados</span>
          <span class="chip-count">{{ (conteoPorEstado.RECHAZADA || 0) + (conteoPorEstado.DEVUELTA || 0) }}</span>
        </button>
      </div>
      <button class="btn-stats" @click="cargarEstadisticas">
        <i class="fas fa-chart-bar"></i> Ver estadísticas
      </button>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Documentos ({{ pendientesFiltrados.length }})
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nº Documento</th>
                <th>Cliente</th>
                <th class="text-end">Total</th>
                <th>Clave acceso</th>
                <th>Estado</th>
                <th style="width:200px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="pendientesFiltrados.length === 0">
                <td colspan="7" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <div class="empty-title">
                      {{ filtro === 'FIRMADO' ? 'No hay documentos pendientes de envío' : 'No hay documentos rechazados' }}
                    </div>
                    <div class="empty-text">
                      {{ filtro === 'FIRMADO' ? 'Todos los firmados ya fueron enviados' : 'Todo en orden' }}
                    </div>
                  </div>
                </td>
              </tr>
              <tr v-else v-for="v in pendientesFiltrados" :key="v._id">
                <td class="small">{{ formatFecha(v.fecha_emision) }}</td>
                <td class="small font-mono">{{ v.numero_factura }}</td>
                <td class="small">{{ v.cliente?.nombre || 'N/A' }}</td>
                <td class="small text-end fw-bold">${{ (v.total || 0).toFixed(2) }}</td>
                <td class="small font-mono">
                  <span :title="v.clave_acceso" class="clave-corta">{{ (v.clave_acceso || '').substring(0, 15) }}...</span>
                </td>
                <td>
                  <span class="badge-sri" :class="badgeClase(v.estado_sri)">
                    <i :class="badgeIcono(v.estado_sri)"></i>
                    {{ v.estado_sri }}
                  </span>
                </td>
                <td class="text-center">
                  <button
                    v-if="v.estado_sri === 'FIRMADO'"
                    class="btn-accion-mini btn-success"
                    @click="enviarUno(v)"
                    :disabled="enviando[v._id]"
                  >
                    <i class="fas fa-paper-plane" :class="{ 'fa-spin': enviando[v._id] }"></i>
                    {{ enviando[v._id] ? 'Enviando' : 'Enviar' }}
                  </button>
                  <button
                    v-if="['RECHAZADA', 'DEVUELTA'].includes(v.estado_sri)"
                    class="btn-accion-mini btn-warning"
                    @click="reintentar(v)"
                    :disabled="enviando[v._id]"
                  >
                    <i class="fas fa-redo" :class="{ 'fa-spin': enviando[v._id] }"></i>
                    Reintentar
                  </button>
                  <button
                    class="btn-icon-mini"
                    @click="consultar(v)"
                    :disabled="enviando[v._id]"
                    title="Consultar autorización en el SRI"
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

    <!-- MODAL RESPUESTA -->
    <div class="modal fade" id="modalRespuestaSri" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header" :class="respuestaActual?.success ? 'bg-success' : 'bg-danger'">
            <h5 class="modal-title text-white">
              <i :class="respuestaActual?.success ? 'fas fa-check-circle' : 'fas fa-times-circle'" class="me-2"></i>
              {{ respuestaActual?.success ? 'Documento autorizado' : (respuestaActual?.estado === 'PENDIENTE' ? 'Pendiente en el SRI' : 'Error al enviar') }}
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" v-if="respuestaActual">
            <div class="info-grid">
              <div>
                <label>Estado</label>
                <span class="badge-sri" :class="badgeClase(respuestaActual.estado)">
                  {{ respuestaActual.estado }}
                </span>
              </div>
              <div v-if="respuestaActual.numero_autorizacion">
                <label>Nº Autorización</label>
                <code>{{ respuestaActual.numero_autorizacion }}</code>
              </div>
              <div v-if="respuestaActual.fecha_autorizacion">
                <label>Fecha de autorización</label>
                <span>{{ formatFechaHora(respuestaActual.fecha_autorizacion) }}</span>
              </div>
            </div>

            <div v-if="respuestaActual.mensajes?.length > 0" class="mensajes-sri">
              <div class="mensajes-titulo">
                <i class="fas fa-exclamation-triangle"></i>
                Mensajes del SRI
              </div>
              <div v-for="(m, idx) in respuestaActual.mensajes" :key="idx" class="mensaje-item">
                <div class="mensaje-id">{{ m.identificador }}</div>
                <div class="mensaje-texto">{{ m.mensaje }}</div>
                <div v-if="m.informacionAdicional" class="mensaje-extra">{{ m.informacionAdicional }}</div>
              </div>
            </div>

            <div v-else-if="respuestaActual.success" class="mensaje-exito">
              <i class="fas fa-check-circle"></i>
              El documento fue autorizado exitosamente por el SRI.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL ESTADÍSTICAS -->
    <div class="modal fade" id="modalEstadisticas" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header bg-dark text-white">
            <h5 class="modal-title"><i class="fas fa-chart-bar me-2"></i> Estadísticas SRI</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" v-if="estadisticas">
            <h6 class="mb-3">Por estado</h6>
            <div class="stats-chart">
              <div v-for="s in estadisticas.porEstado" :key="s._id" class="stat-row">
                <span class="badge-sri" :class="badgeClase(s._id)">{{ s._id || 'SIN ESTADO' }}</span>
                <div class="stat-bar-wrap">
                  <div class="stat-bar-fill" :style="{ width: `${(s.cantidad / maxCantidad) * 100}%` }"></div>
                </div>
                <div class="stat-count">{{ s.cantidad }}</div>
              </div>
            </div>

            <h6 class="mt-4 mb-3" v-if="estadisticas.topErrores?.length > 0">Errores más comunes</h6>
            <div v-if="estadisticas.topErrores?.length > 0" class="errores-list">
              <div v-for="(e, idx) in estadisticas.topErrores" :key="idx" class="error-row">
                <div class="error-ident">{{ e._id.identificador }}</div>
                <div class="error-text">{{ e._id.mensaje }}</div>
                <div class="error-count">×{{ e.cantidad }}</div>
              </div>
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
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()
const socket = inject('socket', null)

const estado = ref(null)
const documentos = ref([])
const loading = ref(false)
const enviando = ref({})
const enviandoMasivo = ref(false)
const filtro = ref('FIRMADO')
const respuestaActual = ref(null)
const estadisticas = ref(null)
const progreso = ref(null)

let modalRespuesta = null
let modalEstadisticas = null

const progresoPct = computed(() => {
  if (!progreso.value || !progreso.value.total) return 0
  return Math.round((progreso.value.procesados / progreso.value.total) * 100)
})

const maxCantidad = computed(() => {
  if (!estadisticas.value?.porEstado?.length) return 1
  return Math.max(...estadisticas.value.porEstado.map(e => e.cantidad))
})

const conteoPorEstado = computed(() => {
  const map = {}
  documentos.value.forEach(d => {
    map[d.estado_sri] = (map[d.estado_sri] || 0) + 1
  })
  return map
})

const pendientesFiltrados = computed(() => {
  if (filtro.value === 'RECHAZADA') {
    return documentos.value.filter(d => ['RECHAZADA', 'DEVUELTA'].includes(d.estado_sri))
  }
  return documentos.value.filter(d => d.estado_sri === filtro.value)
})

const hayPendientes = computed(() => pendientesFiltrados.value.length > 0)

const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-EC') : ''
const formatFechaHora = (f) => f ? new Date(f).toLocaleString('es-EC') : ''

const badgeClase = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'badge-success'
    case 'RECIBIDA': return 'badge-info'
    case 'FIRMADO': return 'badge-primary'
    case 'PENDIENTE': return 'badge-warning'
    case 'RECHAZADA':
    case 'DEVUELTA': return 'badge-danger'
    default: return 'badge-secondary'
  }
}
const badgeIcono = (estado) => {
  switch (estado) {
    case 'AUTORIZADO': return 'fas fa-check-double'
    case 'FIRMADO': return 'fas fa-signature'
    case 'PENDIENTE': return 'fas fa-clock'
    case 'RECIBIDA': return 'fas fa-inbox'
    case 'RECHAZADA': return 'fas fa-times-circle'
    case 'DEVUELTA': return 'fas fa-undo'
    default: return 'fas fa-circle'
  }
}

// ===== CARGA =====
const cargar = async () => {
  loading.value = true
  try {
    // 1. Cargar estado general
    const estadoData = await api.request('/sri/estado', { method: 'GET', skipLoader: true })
    estado.value = estadoData

    // 2. Cargar documentos firmados + rechazados
    const [firmados, rechazados, devueltos] = await Promise.all([
      api.request('/ventas?estado_sri=FIRMADO&limit=100&sortBy=fecha_emision&sortDir=desc', { method: 'GET', skipLoader: true }),
      api.request('/ventas?estado_sri=RECHAZADA&limit=100&sortBy=fecha_emision&sortDir=desc', { method: 'GET', skipLoader: true }),
      api.request('/ventas?estado_sri=DEVUELTA&limit=100&sortBy=fecha_emision&sortDir=desc', { method: 'GET', skipLoader: true })
    ])

    const extraer = (r) => Array.isArray(r) ? r : (r.data || [])
    documentos.value = [
      ...extraer(firmados),
      ...extraer(rechazados),
      ...extraer(devueltos)
    ]
  } catch (e) {
    toast.error('Error al cargar: ' + e.message)
  } finally {
    loading.value = false
  }
}

// ===== ENVIAR UNO =====
const enviarUno = async (venta) => {
  enviando.value = { ...enviando.value, [venta._id]: true }
  try {
    const res = await api.request(`/sri/enviar/${venta._id}`, {
      method: 'POST',
      loaderMessage: 'Enviando al SRI...'
    })
    respuestaActual.value = res
    mostrarModalRespuesta()

    if (res.success) {
      toast.success(`Autorizado: ${res.numero_autorizacion}`)
    } else if (['RECHAZADA', 'DEVUELTA'].includes(res.estado)) {
      toast.error('El SRI rechazó el documento')
    } else {
      toast.warning(`Estado: ${res.estado}`)
    }
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviando.value = { ...enviando.value, [venta._id]: false }
  }
}

// ===== REINTENTAR =====
const reintentar = async (venta) => {
  enviando.value = { ...enviando.value, [venta._id]: true }
  try {
    const res = await api.request(`/sri/reintentar/${venta._id}`, {
      method: 'POST',
      loaderMessage: 'Reintentando envío...'
    })
    respuestaActual.value = res
    mostrarModalRespuesta()

    if (res.success) toast.success(`Autorizado: ${res.numero_autorizacion}`)
    else toast.warning(`Estado: ${res.estado}`)

    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviando.value = { ...enviando.value, [venta._id]: false }
  }
}

// ===== CONSULTAR =====
const consultar = async (venta) => {
  enviando.value = { ...enviando.value, [venta._id]: true }
  try {
    const res = await api.request(`/sri/consultar/${venta._id}`, {
      method: 'POST',
      loaderMessage: 'Consultando autorización...'
    })
    respuestaActual.value = res
    mostrarModalRespuesta()
    if (res.success) toast.success(`Autorizado: ${res.numero_autorizacion}`)
    else toast.info(`Estado: ${res.estado}`)
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviando.value = { ...enviando.value, [venta._id]: false }
  }
}

// ===== ENVÍO MASIVO =====
const enviarMasivo = async () => {
  const total = pendientesFiltrados.value.length
  if (!confirm(`¿Enviar ${total} documentos al SRI?\n\nEste proceso puede tardar varios minutos.`)) return

  enviandoMasivo.value = true
  progreso.value = { total, procesados: 0, autorizados: 0, rechazados: 0, errores: 0 }

  try {
    const res = await api.request('/sri/enviar-pendientes', {
      method: 'POST',
      body: JSON.stringify({ limite: total }),
      loaderMessage: 'Enviando documentos al SRI...'
    })
    toast.success(`✅ Envío completado: ${res.autorizados} autorizados de ${res.total}`)
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    enviandoMasivo.value = false
    // El progreso se limpia tras 3s
    setTimeout(() => { progreso.value = null }, 3000)
  }
}

// ===== ESTADÍSTICAS =====
const cargarEstadisticas = async () => {
  try {
    estadisticas.value = await api.request('/sri/estadisticas', { method: 'GET' })
    if (!modalEstadisticas) {
      const el = document.getElementById('modalEstadisticas')
      modalEstadisticas = new Modal(el)
    }
    modalEstadisticas.show()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== MODAL RESPUESTA =====
const mostrarModalRespuesta = () => {
  if (!modalRespuesta) {
    const el = document.getElementById('modalRespuestaSri')
    modalRespuesta = new Modal(el)
  }
  modalRespuesta.show()
}

// ===== WEBSOCKET =====
const manejarProgreso = (data) => {
  progreso.value = {
    total: data.total,
    procesados: data.procesados || 0,
    autorizados: data.autorizados || 0,
    rechazados: data.rechazados || 0,
    errores: data.errores || 0
  }
}

const manejarCompletado = (data) => {
  if (progreso.value) {
    progreso.value = { ...progreso.value, ...data, procesados: data.total }
  }
  toast.success(`Envío masivo completado: ${data.autorizados} autorizados`)
  cargar()
}

const manejarError = (data) => {
  toast.error('Error en envío masivo: ' + data.error)
  progreso.value = null
}

onMounted(() => {
  cargar()
  if (socket) {
    socket.on('sri-progreso', manejarProgreso)
    socket.on('sri-completado', manejarCompletado)
    socket.on('sri-error', manejarError)
    socket.on('sri-documento-actualizado', cargar)
  }
})

onBeforeUnmount(() => {
  if (socket) {
    socket.off('sri-progreso', manejarProgreso)
    socket.off('sri-completado', manejarCompletado)
    socket.off('sri-error', manejarError)
    socket.off('sri-documento-actualizado', cargar)
  }
})
</script>

<style scoped>
.envio-sri-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* HEADER */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}
.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.title-icon {
  width: 42px; height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(52,152,219,0.3);
}
.page-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}
.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-primary, .btn-secondary {
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
  border: none;
}
.btn-primary {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  color: #fff;
  box-shadow: 0 4px 12px rgba(39,174,96,0.3);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(39,174,96,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

/* PROGRESO */
.progreso-card {
  background: linear-gradient(135deg, rgba(52,152,219,0.08), rgba(155,89,182,0.06));
  border: 1px solid rgba(52,152,219,0.3);
  border-left: 4px solid #3498db;
  border-radius: var(--radius-lg);
  padding: 16px 20px;
}
.progreso-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.progreso-stats { display: flex; gap: 8px; }
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
}
.stat-pill.ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.stat-pill.err { background: rgba(231,76,60,0.15); color: #e74c3c; }
.stat-pill.warn { background: rgba(243,156,18,0.15); color: #d68910; }
.progreso-bar {
  height: 8px;
  background: rgba(52,152,219,0.15);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.progreso-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2ecc71);
  border-radius: inherit;
  transition: width 0.3s ease;
}

/* KPIs */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left-width: 4px;
  border-left-style: solid;
  border-radius: var(--radius-lg);
  transition: all var(--transition);
}
.kpi-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.kpi-prod, .kpi-ok { border-left-color: #27ae60; }
.kpi-test, .kpi-warn { border-left-color: #f39c12; }
.kpi-info { border-left-color: #3498db; }
.kpi-fail, .kpi-danger { border-left-color: #e74c3c; }

.kpi-icon {
  width: 42px; height: 42px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}
.kpi-icon.prod, .kpi-icon.ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.kpi-icon.test, .kpi-icon.warn { background: rgba(243,156,18,0.15); color: #f39c12; }
.kpi-icon.info { background: rgba(52,152,219,0.15); color: #3498db; }
.kpi-icon.fail, .kpi-icon.danger { background: rgba(231,76,60,0.15); color: #e74c3c; }

.kpi-value { font-size: 1.4rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.kpi-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  margin-top: 2px;
}

/* ALERTA */
.alert-card {
  display: flex;
  gap: 14px;
  padding: 14px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid;
}
.alert-danger { background: rgba(231,76,60,0.08); border-color: rgba(231,76,60,0.3); }
.alert-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: rgba(231,76,60,0.15);
  color: #e74c3c;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.alert-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; }
.alert-body strong { color: var(--text-primary); display: block; margin-bottom: 2px; }
.alert-link { color: #e74c3c; font-weight: 700; text-decoration: underline; }

/* FILTROS */
.filters-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}
.filters-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filters-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  background: var(--bg-table-stripe);
  border: 1.5px solid var(--border-color);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.filter-chip:hover { border-color: var(--primary-color); color: var(--primary-color); }
.filter-chip.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}
.filter-chip.chip-danger.active { background: #e74c3c; border-color: #e74c3c; }
.chip-count {
  background: rgba(255,255,255,0.25);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}
.filter-chip:not(.active) .chip-count {
  background: var(--border-color);
  color: var(--text-muted);
}

.btn-stats {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.btn-stats:hover { border-color: var(--primary-color); color: var(--primary-color); }

/* TABLA */
.table-modern {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th {
  padding: 14px 12px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}
.table-modern td {
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }
.font-mono { font-family: 'JetBrains Mono', monospace; }
.clave-corta { cursor: help; color: var(--primary-color); }
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center;
  padding: 50px 20px;
  color: var(--text-muted);
}
.empty-state i { font-size: 3rem; color: #27ae60; opacity: 0.5; margin-bottom: 12px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; }

/* BADGES SRI */
.badge-sri {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.badge-success { background: rgba(39,174,96,0.15); color: #27ae60; }
.badge-primary { background: rgba(52,152,219,0.15); color: #3498db; }
.badge-info { background: rgba(52,152,219,0.15); color: #3498db; }
.badge-warning { background: rgba(243,156,18,0.15); color: #d68910; }
.badge-danger { background: rgba(231,76,60,0.15); color: #e74c3c; }
.badge-secondary { background: var(--bg-table-stripe); color: var(--text-muted); }

/* BOTONES ACCIÓN */
.btn-accion-mini {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  border: 1.5px solid;
  margin-right: 4px;
}
.btn-success { background: rgba(39,174,96,0.1); border-color: #27ae60; color: #1e8449; }
.btn-success:hover:not(:disabled) { background: #27ae60; color: #fff; }
.btn-warning { background: rgba(243,156,18,0.1); border-color: #f39c12; color: #d68910; }
.btn-warning:hover:not(:disabled) { background: #f39c12; color: #fff; }
.btn-accion-mini:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-icon-mini {
  width: 30px; height: 30px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  transition: all var(--transition-fast);
}
.btn-icon-mini:hover:not(:disabled) { border-color: var(--info); color: var(--info); }
.btn-icon-mini:disabled { opacity: 0.5; cursor: not-allowed; }

/* MODAL */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.info-grid label {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
.info-grid code {
  background: var(--bg-table-stripe);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  word-break: break-all;
  display: inline-block;
}

.mensajes-sri {
  background: rgba(243,156,18,0.08);
  border: 1px solid rgba(243,156,18,0.3);
  border-radius: 10px;
  padding: 14px 16px;
}
.mensajes-titulo {
  font-weight: 700;
  font-size: 0.85rem;
  color: #d68910;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.mensaje-item {
  padding: 10px 12px;
  background: var(--bg-card);
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 3px solid #f39c12;
}
.mensaje-id {
  font-family: monospace;
  font-weight: 700;
  color: #d68910;
  font-size: 0.75rem;
  margin-bottom: 4px;
}
.mensaje-texto { font-size: 0.85rem; color: var(--text-primary); }
.mensaje-extra { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; font-style: italic; }

.mensaje-exito {
  padding: 20px;
  text-align: center;
  color: #27ae60;
  background: rgba(39,174,96,0.08);
  border-radius: 10px;
}
.mensaje-exito i { font-size: 2rem; display: block; margin-bottom: 8px; }

/* ESTADÍSTICAS */
.stats-chart { display: flex; flex-direction: column; gap: 10px; }
.stat-row { display: flex; align-items: center; gap: 12px; }
.stat-row .badge-sri { min-width: 120px; justify-content: center; }
.stat-bar-wrap {
  flex: 1;
  height: 22px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2980b9);
  border-radius: inherit;
  transition: width 0.6s ease;
}
.stat-count { font-weight: 700; min-width: 40px; text-align: right; }

.errores-list { display: flex; flex-direction: column; gap: 8px; }
.error-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(231,76,60,0.05);
  border-left: 3px solid #e74c3c;
  border-radius: 8px;
  font-size: 0.82rem;
}
.error-ident { font-family: monospace; font-weight: 700; color: #e74c3c; min-width: 60px; }
.error-text { flex: 1; color: var(--text-secondary); }
.error-count { font-weight: 800; color: #e74c3c; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from { opacity: 0; transform: translateY(-12px); }
.slide-down-leave-to { opacity: 0; transform: translateY(-12px); }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
}
</style>