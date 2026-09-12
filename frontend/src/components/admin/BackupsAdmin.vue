<template>
  <div class="backups-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-database"></i></span>
          Backups del Sistema
        </h1>
        <p class="page-subtitle">Respalda y restaura la información de tu empresa</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="descargarAhora" :disabled="descargando">
          <i class="fas fa-download" :class="{ 'fa-spin': descargando }"></i>
          {{ descargando ? 'Generando...' : 'Descargar ahora' }}
        </button>
        <button class="btn-primary" @click="abrirModalCrear" :disabled="creando">
          <i class="fas fa-save"></i>
          Guardar en servidor
        </button>
      </div>
    </div>

    <!-- ESTADO DEL BACKUP AUTOMÁTICO -->
    <div v-if="config" class="estado-auto-card" :class="`estado-${estadoAuto.nivel}`">
      <div class="estado-auto-icon" :class="`icon-${estadoAuto.nivel}`">
        <i :class="estadoAuto.icon"></i>
      </div>
      <div class="estado-auto-info">
        <div class="estado-auto-title">{{ estadoAuto.titulo }}</div>
        <div class="estado-auto-desc">{{ estadoAuto.descripcion }}</div>
      </div>
      <div class="estado-auto-toggle">
        <label class="switch">
          <input
            type="checkbox"
            v-model="config.automatico_habilitado"
            @change="guardarConfig"
          />
          <span class="slider"></span>
        </label>
        <span class="switch-label">{{ config.automatico_habilitado ? 'Activado' : 'Desactivado' }}</span>
      </div>
    </div>

    <!-- CONFIG AUTOMÁTICOS -->
    <div class="card-cacao" v-if="config">
      <div class="card-header">
        <i class="fas fa-clock me-2"></i> Configuración de backups automáticos
      </div>
      <div class="card-body">
        <div class="config-grid">
          <div class="config-field">
            <label class="config-label">Frecuencia</label>
            <select class="form-control" v-model="config.cron" @change="guardarConfig">
              <option value="0 3 * * *">Diario a las 3:00 AM</option>
              <option value="0 3 * * 1">Semanal (lunes 3:00 AM)</option>
              <option value="0 3 1 * *">Mensual (día 1 a las 3:00 AM)</option>
              <option value="0 */6 * * *">Cada 6 horas</option>
              <option value="0 */12 * * *">Cada 12 horas</option>
            </select>
          </div>
          <div class="config-field">
            <label class="config-label">Retención</label>
            <input
              type="number"
              class="form-control"
              v-model.number="config.retencion"
              min="5" max="100"
              @change="guardarConfig"
            />
            <small class="config-hint">Backups automáticos a conservar</small>
          </div>
          <div class="config-field">
            <label class="config-label">Última ejecución</label>
            <div class="config-value">
              {{ config.ultima_ejecucion ? formatFechaHora(config.ultima_ejecucion) : 'Nunca' }}
            </div>
          </div>
          <div class="config-field">
            <label class="config-label">Estado</label>
            <div class="config-value">
              <span v-if="config.ultimo_estado === 'ok'" class="badge bg-success">
                <i class="fas fa-check"></i> OK
              </span>
              <span v-else-if="config.ultimo_estado === 'error'" class="badge bg-danger">
                <i class="fas fa-times"></i> Error
              </span>
              <span v-else-if="config.ultimo_estado === 'omitido_por_tamano'" class="badge bg-warning text-dark">
                <i class="fas fa-exclamation-triangle"></i> Omitido
              </span>
              <span v-else class="text-muted">—</span>
            </div>
          </div>
        </div>
        <div v-if="config.ultimo_error" class="config-error">
          <i class="fas fa-exclamation-circle"></i>
          Último error: {{ config.ultimo_error }}
        </div>
      </div>
    </div>

    <!-- INFO LÍMITE -->
    <div class="info-card-warn">
      <i class="fas fa-info-circle"></i>
      <div>
        <strong>Límite del servidor: 15 MB por backup</strong>
        <div class="small">
          Si tu base de datos supera ese tamaño, usa <strong>Descargar ahora</strong> (sin límite).
          Ejecuta los backups guardados desde el menú de cada uno.
        </div>
      </div>
    </div>

    <!-- FILTROS Y TABLA -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Backups guardados ({{ backupsFiltrados.length }})
        </div>
        <div class="header-tools">
          <select class="select-sm" v-model="filtroTipo">
            <option value="">Todos los tipos</option>
            <option value="manual">Solo manuales</option>
            <option value="automatico">Solo automáticos</option>
          </select>
          <button class="btn-icon" @click="cargar" :disabled="loading" title="Actualizar">
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Nombre</th>
                <th style="width:110px;">Tipo</th>
                <th style="width:160px;">Fecha</th>
                <th style="width:140px;">Tamaño</th>
                <th style="width:140px;">Usuario</th>
                <th>Colecciones</th>
                <th style="width:180px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="backupsFiltrados.length === 0">
                <td colspan="7" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-database"></i>
                    <div class="empty-title">No hay backups guardados</div>
                    <div class="empty-text">Crea tu primer backup manual o activa los automáticos</div>
                  </div>
                </td>
              </tr>
              <tr v-else v-for="b in backupsFiltrados" :key="b._id">
                <td>
                  <div class="backup-nombre">{{ b.nombre }}</div>
                  <div v-if="b.descripcion" class="backup-desc">{{ b.descripcion }}</div>
                </td>
                <td>
                  <span class="badge-tipo" :class="`tipo-${b.tipo}`">
                    <i :class="b.tipo === 'automatico' ? 'fas fa-clock' : 'fas fa-hand-pointer'"></i>
                    {{ b.tipo }}
                  </span>
                </td>
                <td class="small">{{ formatFechaHora(b.fecha) }}</td>
                <td class="small">
                  <div class="tamano-valor" :class="tamanoClase(b.tamano_comprimido)">
                    {{ formatBytes(b.tamano_comprimido) }}
                  </div>
                  <div class="tamano-hint">
                    sin comprimir: {{ formatBytes(b.tamano_sin_comprimir) }}
                  </div>
                </td>
                <td class="small">{{ b.usuario_email || 'sistema' }}</td>
                <td>
                  <div class="collections-badges">
                    <span
                      v-for="c in (b.colecciones || []).slice(0, 3)"
                      :key="c.nombre"
                      class="badge-coll"
                      :title="`${c.cantidad} documentos`"
                    >
                      {{ abrevCol(c.nombre) }}: {{ c.cantidad }}
                    </span>
                    <span v-if="(b.colecciones || []).length > 3" class="badge-coll badge-more">
                      +{{ b.colecciones.length - 3 }}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="actions-cell">
                    <button class="btn-icon btn-download" @click="descargar(b)" title="Descargar">
                      <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon btn-restore" @click="abrirModalRestaurar(b)" title="Restaurar">
                      <i class="fas fa-undo"></i>
                    </button>
                    <button class="btn-icon btn-delete" @click="eliminar(b)" title="Eliminar">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL CREAR BACKUP -->
    <div class="modal fade" id="modalCrearBackup" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="fas fa-save me-2"></i> Guardar Backup en Servidor</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="form-group mb-3">
              <label class="form-label"><span class="text-danger">*</span> Nombre del backup</label>
              <input
                type="text"
                class="form-control"
                v-model="formCrear.nombre"
                placeholder="Ej: Backup antes de importar compras"
              />
            </div>
            <div class="form-group mb-3">
              <label class="form-label">Descripción</label>
              <textarea
                class="form-control"
                v-model="formCrear.descripcion"
                rows="2"
                placeholder="Describe brevemente el motivo del backup..."
              ></textarea>
            </div>
            <div class="alert alert-info small mb-0">
              <i class="fas fa-info-circle me-1"></i>
              Se guardará el estado actual de usuarios, clientes, productos, ventas, compras y demás colecciones.
              El backup quedará en el servidor para restaurarlo luego si es necesario.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button
              type="button"
              class="btn btn-primary"
              @click="crearBackup"
              :disabled="!formCrear.nombre || creando"
            >
              <i class="fas fa-save" :class="{ 'fa-spin': creando }"></i>
              {{ creando ? 'Guardando...' : 'Guardar backup' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMAR RESTAURACIÓN -->
    <div class="modal fade" id="modalRestaurar" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-warning">
            <h5 class="modal-title text-dark">
              <i class="fas fa-exclamation-triangle me-2"></i>
              Restaurar Backup
            </h5>
            <button type="button" class="btn-close" @click="cerrarModalRestaurar"></button>
          </div>
          <div class="modal-body">
            <div class="restore-warning">
              <i class="fas fa-exclamation-triangle"></i>
              <div>
                <strong>Esta acción es destructiva e irreversible</strong>
                <ul class="mb-0 mt-2">
                  <li>Se <strong>eliminarán</strong> todos los datos actuales de:</li>
                  <li class="list-item">usuarios, clientes, proveedores, productos</li>
                  <li class="list-item">ventas, compras, kardex, retenciones</li>
                  <li>Se <strong>reemplazarán</strong> con los del backup seleccionado</li>
                  <li>Se cerrarán todas las sesiones activas</li>
                </ul>
              </div>
            </div>

            <div class="backup-a-restaurar">
              <div class="backup-header">
                <i class="fas fa-database"></i>
                <strong>{{ backupSeleccionado?.nombre }}</strong>
              </div>
              <div class="backup-meta">
                <div>Fecha: {{ formatFechaHora(backupSeleccionado?.fecha) }}</div>
                <div>Tamaño: {{ formatBytes(backupSeleccionado?.tamano_comprimido) }}</div>
                <div>Usuario: {{ backupSeleccionado?.usuario_email || 'sistema' }}</div>
              </div>
            </div>

            <div class="form-group mt-3">
              <label class="form-label">
                Escribe <code>CONFIRMAR RESTAURACION</code> para continuar:
              </label>
              <input
  type="text"
  class="form-control"
  :class="{
    'is-invalid': confirmacion && confirmacion !== 'CONFIRMAR RESTAURACION',
    'is-valid': confirmacion === 'CONFIRMAR RESTAURACION'
  }"
  v-model="confirmacion"
  placeholder="CONFIRMAR RESTAURACION"
  autocomplete="off"
/>
              <div v-if="confirmacion && confirmacion !== 'CONFIRMAR RESTAURACION'" class="invalid-feedback">
                El texto no coincide exactamente
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cerrarModalRestaurar">Cancelar</button>
            <button
              type="button"
              class="btn btn-danger"
              @click="restaurar"
              :disabled="confirmacion !== 'CONFIRMAR RESTAURACION' || restaurando"
            >
              <i class="fas fa-undo" :class="{ 'fa-spin': restaurando }"></i>
              {{ restaurando ? 'Restaurando...' : 'Restaurar ahora' }}
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

const backups = ref([])
const loading = ref(false)
const descargando = ref(false)
const creando = ref(false)
const restaurando = ref(false)
const filtroTipo = ref('')

const config = ref({
  automatico_habilitado: true,
  cron: '0 3 * * *',
  retencion: 30,
  ultima_ejecucion: null,
  ultimo_estado: null,
  ultimo_error: null
})

const formCrear = ref({ nombre: '', descripcion: '' })
const backupSeleccionado = ref(null)
const confirmacion = ref('')

let modalCrear = null
let modalRestaurar = null

// ===== COMPUTED =====
const backupsFiltrados = computed(() => {
  if (!filtroTipo.value) return backups.value
  return backups.value.filter(b => b.tipo === filtroTipo.value)
})

const estadoAuto = computed(() => {
  if (!config.value.automatico_habilitado) {
    return {
      nivel: 'inactivo',
      icon: 'fas fa-pause-circle',
      titulo: 'Backups automáticos desactivados',
      descripcion: 'Actívalos para proteger tu información automáticamente'
    }
  }
  const estado = config.value.ultimo_estado
  if (estado === 'error') {
    return {
      nivel: 'error',
      icon: 'fas fa-times-circle',
      titulo: 'Último backup falló',
      descripcion: config.value.ultimo_error || 'Revisa los logs del servidor'
    }
  }
  if (estado === 'omitido_por_tamano') {
    return {
      nivel: 'warn',
      icon: 'fas fa-exclamation-triangle',
      titulo: 'Último backup omitido por tamaño',
      descripcion: 'La BD supera 15MB. Usa "Descargar ahora" para respaldos completos'
    }
  }
  if (estado === 'ok') {
    return {
      nivel: 'ok',
      icon: 'fas fa-check-circle',
      titulo: 'Backups automáticos funcionando',
      descripcion: `Último: ${formatFechaHora(config.value.ultima_ejecucion)}`
    }
  }
  return {
    nivel: 'ok',
    icon: 'fas fa-clock',
    titulo: 'Backups automáticos activados',
    descripcion: 'Próxima ejecución según la programación'
  }
})

// ===== HELPERS =====
const formatFechaHora = (f) => {
  if (!f) return '—'
  return new Date(f).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
}

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const tamanoClase = (bytes) => {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  if (mb > 12) return 'tamano-danger'
  if (mb > 8) return 'tamano-warn'
  return 'tamano-ok'
}

const abrevCol = (nombre) => {
  const map = {
    usuarios: 'usuarios',
    clientes: 'clientes',
    proveedores: 'proveed',
    productos: 'prods',
    categorias: 'categ',
    ventas_v2: 'ventas',
    compras_v2: 'compras',
    kardex: 'kardex',
    retenciones: 'retenc',
    periodos_cerrados: 'periodos',
    configuracion: 'config',
    certificados: 'cert'
  }
  return map[nombre] || nombre.slice(0, 8)
}

// ===== CARGA =====
const cargar = async () => {
  loading.value = true
  try {
    backups.value = await api.request('/backups', { method: 'GET' })
  } catch (e) {
    toast.error('Error al cargar backups: ' + e.message)
  } finally {
    loading.value = false
  }
}

const cargarConfig = async () => {
  try {
    config.value = { ...config.value, ...(await api.request('/backups/config', { method: 'GET' })) }
  } catch (e) {
    console.warn('Error al cargar config:', e)
  }
}

const guardarConfig = async () => {
  try {
    await api.request('/backups/config', {
      method: 'PUT',
      body: JSON.stringify({
        automatico_habilitado: config.value.automatico_habilitado,
        cron: config.value.cron,
        retencion: config.value.retencion
      }),
      skipLoader: true
    })
    toast.success('Configuración guardada')
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== DESCARGA DIRECTA =====
const descargarAhora = async () => {
  descargando.value = true
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const response = await fetch(`${baseUrl}/backups/download-now`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Error al generar backup')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.download = `backup_${fecha}.json.gz`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    toast.success('Backup descargado correctamente')
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    descargando.value = false
  }
}

// ===== CREAR BACKUP =====
const abrirModalCrear = () => {
  formCrear.value = {
    nombre: `Backup manual del ${new Date().toLocaleString('es-EC')}`,
    descripcion: ''
  }
  if (!modalCrear) {
    modalCrear = new Modal(document.getElementById('modalCrearBackup'))
  }
  modalCrear.show()
}

const crearBackup = async () => {
  if (!formCrear.value.nombre) return
  creando.value = true
  try {
    await api.request('/backups', {
      method: 'POST',
      body: JSON.stringify({
        nombre: formCrear.value.nombre,
        tipo: 'manual',
        descripcion: formCrear.value.descripcion
      }),
      loaderMessage: 'Generando backup...'
    })
    toast.success('Backup guardado en el servidor')
    modalCrear.hide()
    await cargar()
    await cargarConfig()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    creando.value = false
  }
}

// ===== DESCARGAR UNO =====
const descargar = async (b) => {
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const response = await fetch(`${baseUrl}/backups/${b._id}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Error al descargar')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${b.nombre.replace(/[^a-z0-9]/gi, '_')}.json.gz`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('Descarga iniciada')
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

// ===== RESTAURAR =====
const abrirModalRestaurar = (b) => {
  backupSeleccionado.value = b
  confirmacion.value = ''
  if (!modalRestaurar) {
    modalRestaurar = new Modal(document.getElementById('modalRestaurar'), { backdrop: 'static' })
  }
  modalRestaurar.show()
}

const cerrarModalRestaurar = () => {
  if (modalRestaurar) modalRestaurar.hide()
}

const restaurar = async () => {
  if (confirmacion.value !== 'CONFIRMAR RESTAURACION') return
  restaurando.value = true
  try {
    await api.request(`/backups/${backupSeleccionado.value._id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirmacion: 'CONFIRMAR RESTAURACION' }),
      loaderMessage: 'Restaurando backup...'
    })
    toast.success('Backup restaurado. Recargando...')
    modalRestaurar.hide()
    setTimeout(() => window.location.reload(), 1500)
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    restaurando.value = false
  }
}

// ===== ELIMINAR =====
const eliminar = async (b) => {
  if (!confirm(`¿Eliminar el backup "${b.nombre}"?\n\nEsta acción no se puede deshacer.`)) return
  try {
    await api.request(`/backups/${b._id}`, { method: 'DELETE', loaderMessage: 'Eliminando...' })
    toast.success('Backup eliminado')
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

onMounted(() => {
  cargar()
  cargarConfig()
})
</script>

<style scoped>
.backups-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #9b59b6, #8e44ad); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; box-shadow: 0 6px 16px rgba(155,89,182,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-primary, .btn-secondary { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: var(--radius-md); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all var(--transition); font-family: inherit; border: none; }
.btn-primary { background: linear-gradient(135deg, #9b59b6, #8e44ad); color: #fff; box-shadow: 0 4px 12px rgba(155,89,182,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(155,89,182,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #9b59b6; color: #9b59b6; }
.btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

/* ESTADO AUTO CARD */
.estado-auto-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: var(--radius-lg);
  border-left: 4px solid;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}
.estado-ok { border-left-color: #27ae60; }
.estado-warn { border-left-color: #f39c12; }
.estado-error { border-left-color: #e74c3c; }
.estado-inactivo { border-left-color: #95a5a6; }

.estado-auto-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }
.estado-auto-icon.icon-ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.estado-auto-icon.icon-warn { background: rgba(243,156,18,0.15); color: #f39c12; }
.estado-auto-icon.icon-error { background: rgba(231,76,60,0.15); color: #e74c3c; }
.estado-auto-icon.icon-inactivo { background: rgba(149,165,166,0.15); color: #95a5a6; }

.estado-auto-info { flex: 1; min-width: 200px; }
.estado-auto-title { font-weight: 700; font-size: 0.92rem; color: var(--text-primary); margin-bottom: 2px; }
.estado-auto-desc { font-size: 0.78rem; color: var(--text-muted); }

.estado-auto-toggle { display: flex; align-items: center; gap: 10px; }
.switch { position: relative; display: inline-block; width: 46px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background-color: var(--border-color); border-radius: 24px; transition: 0.3s; }
.slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
.switch input:checked + .slider { background: #27ae60; }
.switch input:checked + .slider::before { transform: translateX(22px); }
.switch-label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }

/* CONFIG GRID */
.config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.config-field { display: flex; flex-direction: column; gap: 6px; }
.config-label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }
.config-value { font-size: 0.88rem; color: var(--text-primary); font-weight: 500; padding: 9px 0; }
.config-hint { font-size: 0.72rem; color: var(--text-muted); }
.config-error {
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(231,76,60,0.08);
  border-left: 3px solid #e74c3c;
  border-radius: 6px;
  color: #e74c3c;
  font-size: 0.8rem;
}

/* INFO CARD */
.info-card-warn {
  display: flex;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(243,156,18,0.08);
  border: 1px solid rgba(243,156,18,0.3);
  border-left: 4px solid #f39c12;
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.info-card-warn > i { color: #f39c12; font-size: 1.2rem; flex-shrink: 0; margin-top: 2px; }
.info-card-warn strong { color: var(--text-primary); display: block; margin-bottom: 4px; }

/* CARD HEADER FLEX */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-tools { display: flex; align-items: center; gap: 8px; }
.select-sm { padding: 6px 12px; border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-primary); font-size: 0.8rem; font-family: inherit; cursor: pointer; }
.btn-icon { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all var(--transition-fast); }
.btn-icon:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.btn-icon:disabled { opacity: 0.5; cursor: not-allowed; }

/* TABLA */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 14px 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.backup-nombre { font-weight: 700; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 2px; }
.backup-desc { font-size: 0.75rem; color: var(--text-muted); }

.badge-tipo { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: var(--radius-full); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
.tipo-manual { background: rgba(52,152,219,0.15); color: #3498db; }
.tipo-automatico { background: rgba(46,204,113,0.15); color: #27ae60; }

.tamano-valor { font-weight: 700; font-size: 0.85rem; }
.tamano-ok { color: #27ae60; }
.tamano-warn { color: #f39c12; }
.tamano-danger { color: #e74c3c; }
.tamano-hint { font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; }

.collections-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.badge-coll { font-size: 0.65rem; padding: 2px 7px; border-radius: 8px; background: var(--bg-table-stripe); color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.badge-more { background: rgba(52,152,219,0.15); color: #3498db; }

.actions-cell { display: flex; gap: 4px; justify-content: center; }
.btn-download:hover { border-color: #3498db !important; color: #3498db !important; background: rgba(52,152,219,0.1) !important; }
.btn-restore:hover { border-color: #f39c12 !important; color: #f39c12 !important; background: rgba(243,156,18,0.1) !important; }
.btn-delete:hover { border-color: #e74c3c !important; color: #e74c3c !important; background: rgba(231,76,60,0.1) !important; }

.empty-cell { padding: 0 !important; }
.empty-state { text-align: center; padding: 50px 20px; color: var(--text-muted); }
.empty-state i { font-size: 3rem; opacity: 0.4; margin-bottom: 12px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; }

/* MODAL RESTAURAR */
.restore-warning {
  display: flex;
  gap: 14px;
  padding: 16px;
  background: rgba(231,76,60,0.08);
  border: 2px solid rgba(231,76,60,0.3);
  border-radius: 12px;
  color: #c0392b;
  font-size: 0.85rem;
}
.restore-warning > i { font-size: 1.5rem; flex-shrink: 0; }
.restore-warning ul { padding-left: 18px; color: var(--text-secondary); }
.restore-warning .list-item { margin-left: 12px; }

.backup-a-restaurar {
  margin-top: 16px;
  padding: 14px 16px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
.backup-header { display: flex; align-items: center; gap: 8px; color: var(--primary-color); margin-bottom: 8px; font-size: 0.9rem; }
.backup-meta { font-size: 0.78rem; color: var(--text-muted); line-height: 1.6; }

code { background: rgba(231,76,60,0.1); padding: 2px 6px; border-radius: 4px; color: #e74c3c; font-weight: 700; font-size: 0.85em; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .estado-auto-card { flex-direction: column; align-items: stretch; }
  .config-grid { grid-template-columns: 1fr; }
}
</style>