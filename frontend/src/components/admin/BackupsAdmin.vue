<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-database"></i> Backups del Sistema</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-success" @click="descargarAhora" :disabled="descargando">
          <i class="fas fa-download" :class="{ 'fa-spin': descargando }"></i>
          {{ descargando ? 'Generando...' : 'Descargar backup ahora' }}
        </button>
        <button class="btn btn-primary" @click="crearBackup" :disabled="creando">
          <i class="fas fa-save" :class="{ 'fa-spin': creando }"></i>
          {{ creando ? 'Guardando...' : 'Guardar en servidor' }}
        </button>
      </div>
    </div>

    <!-- Configuración de backups automáticos -->
    <div class="card card-cacao mb-4">
      <div class="card-header">
        <i class="fas fa-clock me-2"></i> Backups automáticos
      </div>
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-md-3">
            <label class="form-label">Estado</label>
            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                id="autoSwitch"
                v-model="config.automatico_habilitado"
                @change="guardarConfig"
              />
              <label class="form-check-label" for="autoSwitch">
                {{ config.automatico_habilitado ? 'Activado' : 'Desactivado' }}
              </label>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">Frecuencia</label>
            <select class="form-select" v-model="config.cron" @change="guardarConfig">
              <option value="0 3 * * *">Diario a las 3:00 AM</option>
              <option value="0 3 * * 1">Semanal (lunes 3:00 AM)</option>
              <option value="0 3 1 * *">Mensual (día 1 a las 3:00 AM)</option>
              <option value="0 */6 * * *">Cada 6 horas</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Retención</label>
            <input
              type="number"
              class="form-control"
              v-model.number="config.retencion"
              min="5"
              max="100"
              @change="guardarConfig"
            />
            <small class="text-muted">Backups automáticos a conservar</small>
          </div>
          <div class="col-md-3">
            <label class="form-label">Última ejecución</label>
            <div class="form-control-plaintext text-muted small">
              {{ config.ultima_ejecucion ? new Date(config.ultima_ejecucion).toLocaleString('es-EC') : 'Nunca' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Alertas -->
    <div class="alert alert-warning">
      <i class="fas fa-exclamation-triangle me-2"></i>
      <strong>Importante:</strong> Los backups guardados en el servidor son de máximo <strong>15 MB</strong>.
      Si tu base de datos crece más, usa la <strong>descarga directa</strong> que no tiene límite.
    </div>

    <!-- Tabla de backups -->
    <div class="card card-cacao">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="fas fa-list me-2"></i> Backups guardados ({{ backups.length }})</span>
        <button class="btn btn-sm btn-outline-primary" @click="cargar" :disabled="loading">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Actualizar
        </button>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th>Nombre</th>
                <th style="width:110px;">Tipo</th>
                <th style="width:150px;">Fecha</th>
                <th style="width:110px;">Tamaño</th>
                <th style="width:140px;">Usuario</th>
                <th>Colecciones</th>
                <th style="width:220px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="7" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="backups.length === 0">
                <td colspan="7" class="text-center text-muted py-4">
                  No hay backups guardados
                </td>
              </tr>
              <tr v-else v-for="b in backups" :key="b._id">
                <td>
                  <div class="fw-bold small">{{ b.nombre }}</div>
                  <div v-if="b.descripcion" class="text-muted small">{{ b.descripcion }}</div>
                </td>
                <td>
                  <span class="badge-tipo" :class="`tipo-${b.tipo}`">
                    <i :class="b.tipo === 'automatico' ? 'fas fa-clock' : 'fas fa-hand-pointer'"></i>
                    {{ b.tipo }}
                  </span>
                </td>
                <td class="small">{{ new Date(b.fecha).toLocaleString('es-EC') }}</td>
                <td class="small">
                  {{ formatBytes(b.tamano_comprimido) }}
                  <div class="text-muted" style="font-size:0.7rem;">
                    (sin comprimir: {{ formatBytes(b.tamano_sin_comprimir) }})
                  </div>
                </td>
                <td class="small">{{ b.usuario_email || 'sistema' }}</td>
                <td>
                  <div class="collections-badges">
                    <span
                      v-for="c in (b.colecciones || []).slice(0, 5)"
                      :key="c.nombre"
                      class="badge-coll"
                      :title="`${c.cantidad} documentos`"
                    >
                      {{ c.nombre }}: {{ c.cantidad }}
                    </span>
                    <span v-if="(b.colecciones || []).length > 5" class="badge-coll">
                      +{{ b.colecciones.length - 5 }} más
                    </span>
                  </div>
                </td>
                <td>
                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    @click="descargar(b)"
                    title="Descargar"
                  >
                    <i class="fas fa-download"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-warning me-1"
                    @click="confirmarRestaurar(b)"
                    title="Restaurar"
                  >
                    <i class="fas fa-undo"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    @click="eliminar(b)"
                    title="Eliminar"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const backups = ref([])
const loading = ref(false)
const descargando = ref(false)
const creando = ref(false)

const config = ref({
  automatico_habilitado: true,
  cron: '0 3 * * *',
  retencion: 30,
  ultima_ejecucion: null
})

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
    config.value = await api.request('/backups/config', { method: 'GET' })
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
      })
    })
    toast.success('Configuración guardada')
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const descargarAhora = async () => {
  descargando.value = true
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const response = await fetch(`${baseUrl}/backups/download-now`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Error al generar backup')

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.download = `backup_${fecha}.json.gz`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)

    toast.success('Backup descargado correctamente')
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    descargando.value = false
  }
}

const crearBackup = async () => {
  const nombre = prompt('Nombre del backup:', `Backup manual del ${new Date().toLocaleString('es-EC')}`)
  if (!nombre) return

  creando.value = true
  try {
    await api.request('/backups', {
      method: 'POST',
      body: JSON.stringify({ nombre, tipo: 'manual', descripcion: '' })
    })
    toast.success('Backup guardado en el servidor')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    creando.value = false
  }
}

const descargar = async (b) => {
  try {
    const token = localStorage.getItem('token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const response = await fetch(`${baseUrl}/backups/${b._id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Error al descargar backup')

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${b.nombre.replace(/[^a-z0-9]/gi, '_')}.json.gz`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
    toast.success('Descarga iniciada')
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const confirmarRestaurar = async (b) => {
  const primera = confirm(
    `⚠️ ADVERTENCIA ⚠️\n\n` +
    `Vas a restaurar el backup:\n"${b.nombre}"\n\n` +
    `Esto ELIMINARÁ y REEMPLAZARÁ los datos actuales de:\n` +
    `usuarios, clientes, proveedores, productos, ventas, compras, etc.\n\n` +
    `¿Deseas continuar?`
  )
  if (!primera) return

  const confirmacion = prompt(
    'Para confirmar, escribe exactamente:\n\nCONFIRMAR RESTAURACION'
  )
  if (confirmacion !== 'CONFIRMAR RESTAURACION') {
    toast.warning('Restauración cancelada')
    return
  }

  try {
    await api.request(`/backups/${b._id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirmacion: 'CONFIRMAR RESTAURACION' }),
      loaderMessage: 'Restaurando backup...'
    })
    toast.success('Backup restaurado correctamente. Recarga la página.')
    setTimeout(() => window.location.reload(), 1500)
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const eliminar = async (b) => {
  if (!confirm(`¿Eliminar el backup "${b.nombre}"?`)) return
  try {
    await api.request(`/backups/${b._id}`, { method: 'DELETE' })
    toast.success('Backup eliminado')
    cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  }
}

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

onMounted(() => {
  cargar()
  cargarConfig()
})
</script>

<style scoped>
.badge-tipo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
.tipo-manual {
  background: rgba(52,152,219,0.15);
  color: #3498db;
}
.tipo-automatico {
  background: rgba(46,204,113,0.15);
  color: #27ae60;
}

.collections-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.badge-coll {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
}
</style>