<template>
  <div class="diagnostico-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-stethoscope"></i></span>
          Diagnóstico del Sistema
        </h1>
        <p class="page-subtitle">
          Verifica que todo esté listo para facturar electrónicamente
        </p>
      </div>
      <button class="btn-refresh" @click="cargar" :disabled="loading">
        <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
        <span>{{ loading ? 'Analizando...' : 'Re-analizar' }}</span>
      </button>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="loading-state">
      <div class="spinner-lg"></div>
      <p>Analizando el sistema...</p>
    </div>

    <div v-else-if="diagnostico">
      <!-- ESTADO GENERAL -->
      <div class="card-cacao mb-4" :class="`card-estado estado-${estadoGeneral.nivel}`">
        <div class="estado-layout">
          <div class="estado-icon" :class="`icon-${estadoGeneral.nivel}`">
            <i :class="estadoGeneral.icon"></i>
          </div>
          <div class="estado-info">
            <h4 class="estado-titulo">{{ estadoGeneral.titulo }}</h4>
            <p class="estado-desc">{{ estadoGeneral.descripcion }}</p>
          </div>
          <div v-if="esListo" class="estado-badge-big">
            <i class="fas fa-check-double"></i>
            <span>LISTO</span>
          </div>
        </div>
      </div>

      <!-- RECOMENDACIONES -->
      <div v-if="diagnostico.recomendaciones.length > 0" class="alert-card alert-warning">
        <div class="alert-icon">
          <i class="fas fa-lightbulb"></i>
        </div>
        <div class="alert-body">
          <div class="alert-title">Recomendaciones para completar la configuración</div>
          <ul class="alert-list">
            <li v-for="(r, i) in diagnostico.recomendaciones" :key="i">{{ r }}</li>
          </ul>
        </div>
      </div>

      <!-- GRID DE CHECKS -->
      <div class="checks-grid">
        <!-- CONFIG EMPRESA -->
        <div class="check-card">
          <div class="check-card-header">
            <div class="check-card-icon" :class="diagnostico.configuracion_empresa.ok ? 'ok' : 'fail'">
              <i class="fas fa-building"></i>
            </div>
            <div class="check-card-title">
              <h3>Configuración Empresa</h3>
              <span class="check-card-status" :class="diagnostico.configuracion_empresa.ok ? 'ok' : 'fail'">
                {{ diagnostico.configuracion_empresa.ok ? 'OK' : 'INCOMPLETO' }}
              </span>
            </div>
          </div>
          <div class="check-card-body">
            <div class="check-item">
              <span class="check-label">RUC</span>
              <div class="check-value">
                <code>{{ diagnostico.configuracion_empresa.ruc }}</code>
                <i :class="diagnostico.configuracion_empresa.ruc_ok ? 'fas fa-check-circle text-success' : 'fas fa-times-circle text-danger'"></i>
                <span class="text-muted small">({{ diagnostico.configuracion_empresa.ruc_longitud }} dígitos)</span>
              </div>
            </div>
            <div class="check-item">
              <span class="check-label">Razón Social</span>
              <span class="check-value">{{ diagnostico.configuracion_empresa.razon_social || '(vacío)' }}</span>
            </div>
            <div class="check-item">
              <span class="check-label">Ambiente</span>
              <div class="check-value">
                <span class="badge-ambiente" :class="diagnostico.configuracion_empresa.ambiente === '2' ? 'prod' : 'test'">
                  <i :class="diagnostico.configuracion_empresa.ambiente === '2' ? 'fas fa-check-circle' : 'fas fa-flask'"></i>
                  {{ diagnostico.configuracion_empresa.ambiente_nombre }}
                </span>
              </div>
            </div>
            <div class="check-item">
              <span class="check-label">Serie por defecto</span>
              <div class="check-value">
                <code>{{ diagnostico.configuracion_empresa.establecimiento }}-{{ diagnostico.configuracion_empresa.punto_emision }}</code>
              </div>
            </div>
          </div>
          <div class="check-card-footer">
            <router-link to="/configuracion-empresa" class="btn-card-action">
              <i class="fas fa-cog"></i>
              {{ diagnostico.configuracion_empresa.ok ? 'Revisar' : 'Completar configuración' }}
            </router-link>
          </div>
        </div>

        <!-- CERTIFICADO -->
        <div class="check-card">
          <div class="check-card-header">
            <div class="check-card-icon" :class="diagnostico.certificado.ok ? 'ok' : 'fail'">
              <i class="fas fa-shield-alt"></i>
            </div>
            <div class="check-card-title">
              <h3>Certificado de Firma</h3>
              <span class="check-card-status" :class="diagnostico.certificado.ok ? 'ok' : 'fail'">
                {{ diagnostico.certificado.ok ? 'VIGENTE' : 'FALTA' }}
              </span>
            </div>
          </div>
          <div class="check-card-body">
            <template v-if="diagnostico.certificado.ok">
              <div class="check-item">
                <span class="check-label">Titular</span>
                <span class="check-value small">{{ diagnostico.certificado.titular }}</span>
              </div>
              <div class="check-item">
                <span class="check-label">Vence</span>
                <span class="check-value">{{ formatFecha(diagnostico.certificado.vence) }}</span>
              </div>
              <div class="check-item">
                <span class="check-label">Días restantes</span>
                <div class="check-value">
                  <span
                    class="badge-dias"
                    :class="{
                      ok: diagnostico.certificado.dias_restantes > 60,
                      warn: diagnostico.certificado.dias_restantes > 30 && diagnostico.certificado.dias_restantes <= 60,
                      danger: diagnostico.certificado.dias_restantes <= 30
                    }"
                  >
                    {{ diagnostico.certificado.dias_restantes }} días
                  </span>
                </div>
              </div>
            </template>
            <div v-else class="empty-cert">
              <i class="fas fa-shield-virus"></i>
              <p>{{ diagnostico.certificado.mensaje }}</p>
            </div>
          </div>
          <div class="check-card-footer">
            <router-link to="/certificado-firma" class="btn-card-action">
              <i :class="diagnostico.certificado.ok ? 'fas fa-sync' : 'fas fa-upload'"></i>
              {{ diagnostico.certificado.ok ? 'Gestionar certificado' : 'Subir certificado' }}
            </router-link>
          </div>
        </div>
      </div>

      <!-- ACCIONES DE MANTENIMIENTO -->
      <div class="card-cacao mt-4">
        <div class="card-header">
          <i class="fas fa-tools me-2"></i>
          Acciones de mantenimiento
        </div>
        <div class="card-body">
          <div class="acciones-grid">
            <div class="accion-item">
              <div class="accion-icon azul"><i class="fas fa-cloud"></i></div>
              <div class="accion-info">
                <div class="accion-title">Probar conexión al SRI</div>
                <div class="accion-desc">Verifica que los web services del SRI estén accesibles</div>
              </div>
              <button class="btn-accion" @click="probarSRI" :disabled="probandoSRI">
                <i class="fas fa-satellite-dish" :class="{ 'fa-spin': probandoSRI }"></i>
                {{ probandoSRI ? 'Probando...' : 'Probar' }}
              </button>
            </div>

            <div class="accion-item">
              <div class="accion-icon naranja"><i class="fas fa-calculator"></i></div>
              <div class="accion-info">
                <div class="accion-title">Sincronizar contadores</div>
                <div class="accion-desc">Alinea los secuenciales con los documentos existentes</div>
              </div>
              <button class="btn-accion" @click="sincronizarContadores" :disabled="sincronizando">
                <i class="fas fa-sync" :class="{ 'fa-spin': sincronizando }"></i>
                {{ sincronizando ? 'Sincronizando...' : 'Sincronizar' }}
              </button>
            </div>
          </div>

          <!-- RESULTADO PRUEBA SRI -->
          <transition name="fade">
            <div v-if="resultadoSRI" class="resultado-prueba mt-3" :class="resultadoSRI.ok ? 'ok' : 'fail'">
              <i :class="resultadoSRI.ok ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
              <div>
                <strong>{{ resultadoSRI.ok ? 'Conexión exitosa' : 'Sin conexión' }}</strong>
                <div class="small">
                  Ambiente: {{ resultadoSRI.ambienteNombre }} ·
                  <span v-if="resultadoSRI.ok">Latencia: {{ resultadoSRI.latencia_ms }}ms</span>
                  <span v-else>Error: {{ resultadoSRI.error }}</span>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- DOCUMENTOS -->
      <div class="card-cacao mt-4">
        <div class="card-header">
          <i class="fas fa-file-invoice me-2"></i>
          Estado de Documentos
        </div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-box-icon gris"><i class="fas fa-file-invoice"></i></div>
              <div class="stat-box-value">{{ diagnostico.documentos.total_facturas }}</div>
              <div class="stat-box-label">Total facturas</div>
            </div>
            <div class="stat-box" :class="{ 'stat-warning': diagnostico.documentos.sin_clave_acceso > 0 }">
              <div class="stat-box-icon amarillo"><i class="fas fa-key"></i></div>
              <div class="stat-box-value">{{ diagnostico.documentos.sin_clave_acceso }}</div>
              <div class="stat-box-label">Sin clave</div>
            </div>
            <div class="stat-box" :class="{ 'stat-info': diagnostico.documentos.sin_firma > 0 }">
              <div class="stat-box-icon azul"><i class="fas fa-signature"></i></div>
              <div class="stat-box-value">{{ diagnostico.documentos.sin_firma }}</div>
              <div class="stat-box-label">Sin firma</div>
            </div>
            <div class="stat-box stat-success">
              <div class="stat-box-icon verde"><i class="fas fa-check-double"></i></div>
              <div class="stat-box-value">{{ diagnostico.documentos.autorizados }}</div>
              <div class="stat-box-label">Autorizados SRI</div>
            </div>
          </div>

          <!-- MIGRACIÓN MASIVA -->
          <div v-if="diagnostico.documentos.sin_clave_acceso > 0" class="alert-accion">
            <div class="alert-accion-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="alert-accion-body">
              <strong>{{ diagnostico.documentos.sin_clave_acceso }} facturas sin clave de acceso</strong>
              <div class="small">Puedes generarlas automáticamente con la configuración actual de empresa.</div>
            </div>
            <button class="btn-accion-strong" @click="migrarClaves" :disabled="migrando">
              <i class="fas fa-magic" :class="{ 'fa-spin': migrando }"></i>
              {{ migrando ? 'Migrando...' : 'Generar claves' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ERROR -->
    <div v-else class="alert-card alert-danger">
      <div class="alert-icon"><i class="fas fa-times-circle"></i></div>
      <div class="alert-body">
        <div class="alert-title">No se pudo cargar el diagnóstico</div>
        <div>Revisa la consola o vuelve a intentarlo</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const loading = ref(true)
const migrando = ref(false)
const probandoSRI = ref(false)
const sincronizando = ref(false)
const diagnostico = ref(null)
const resultadoSRI = ref(null)

const esListo = computed(() => diagnostico.value?.listo_para_facturar)

const estadoGeneral = computed(() => {
  if (!diagnostico.value) {
    return { nivel: 'error', icon: 'fas fa-times-circle', titulo: 'Sin datos', descripcion: '' }
  }
  if (esListo.value) {
    return {
      nivel: 'ok',
      icon: 'fas fa-check-circle',
      titulo: 'Sistema listo para facturar electrónicamente',
      descripcion: 'Todos los requisitos están configurados correctamente.'
    }
  }
  const critico = !diagnostico.value.certificado.ok
  return {
    nivel: critico ? 'error' : 'warn',
    icon: critico ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle',
    titulo: 'Configuración incompleta',
    descripcion: 'Revisa las recomendaciones para completar el proceso.'
  }
})

const formatFecha = (f) => {
  if (!f) return 'N/A'
  return new Date(f).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const cargar = async () => {
  loading.value = true
  resultadoSRI.value = null
  try {
    diagnostico.value = await api.request('/diagnostico', {
      method: 'GET',
      loaderMessage: 'Analizando sistema...'
    })
  } catch (e) {
    toast.error('Error: ' + e.message)
    diagnostico.value = null
  } finally {
    loading.value = false
  }
}

const migrarClaves = async () => {
  const total = diagnostico.value?.documentos?.sin_clave_acceso || 0
  if (!confirm(`¿Generar claves de acceso para ${total} facturas?\n\nEste proceso puede tardar unos segundos.`)) return

  migrando.value = true
  try {
    const res = await api.request('/ventas/migrar-claves', {
      method: 'POST',
      loaderMessage: 'Migrando claves...'
    })
    let msg = `✅ ${res.exitosas} facturas migradas`
    if (res.errores > 0) msg += ` · ${res.errores} errores`
    toast.success(msg)
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    migrando.value = false
  }
}

const probarSRI = async () => {
  probandoSRI.value = true
  resultadoSRI.value = null
  try {
    const res = await api.request('/sri/diagnostico', { method: 'GET', skipLoader: true })
    resultadoSRI.value = {
      ok: res.ok,
      ambienteNombre: res.ambienteNombre,
      latencia_ms: res.recepcion?.latencia_ms,
      error: res.recepcion?.error
    }
    if (res.ok) {
      toast.success(`✅ SRI accesible · ${res.recepcion.latencia_ms}ms`)
    } else {
      toast.error('No se pudo conectar al SRI')
    }
  } catch (e) {
    resultadoSRI.value = { ok: false, ambienteNombre: 'desconocido', error: e.message }
    toast.error('Error: ' + e.message)
  } finally {
    probandoSRI.value = false
  }
}

const sincronizarContadores = async () => {
  if (!confirm('¿Sincronizar contadores?\n\nAlinea el valor de los contadores de facturas/compras/etc con el mayor secuencial existente en la BD.\n\nEs seguro ejecutarlo.')) return

  sincronizando.value = true
  try {
    const res = await api.request('/contadores/sincronizar', {
      method: 'POST',
      loaderMessage: 'Sincronizando contadores...'
    })
    const actualizados = Object.values(res.resultados || {}).filter(r => !r.sinCambio).length
    toast.success(`Contadores sincronizados (${actualizados} actualizados)`)
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    sincronizando.value = false
  }
}

onMounted(cargar)
</script>

<style scoped>
.diagnostico-page {
  max-width: 1200px;
  margin: 0 auto;
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
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(52,152,219,0.3);
}
.page-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}
.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-refresh:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateY(-1px);
}
.btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }

/* LOADING */
.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.spinner-lg {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  border: 4px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ESTADO GENERAL */
.card-estado {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
  border-left-width: 6px;
  border-left-style: solid;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition);
}
.card-estado.estado-ok { border-left-color: #27ae60; }
.card-estado.estado-warn { border-left-color: #f39c12; }
.card-estado.estado-error { border-left-color: #e74c3c; }

.estado-layout {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.estado-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  flex-shrink: 0;
}
.icon-ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.icon-warn { background: rgba(243,156,18,0.15); color: #f39c12; }
.icon-error { background: rgba(231,76,60,0.15); color: #e74c3c; }

.estado-info { flex: 1; min-width: 0; }
.estado-titulo { font-size: 1.1rem; font-weight: 700; margin: 0 0 4px; color: var(--text-primary); }
.estado-desc { font-size: 0.85rem; color: var(--text-muted); margin: 0; }

.estado-badge-big {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(39,174,96,0.12);
  border: 2px solid rgba(39,174,96,0.3);
  border-radius: var(--radius-full);
  color: #27ae60;
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: 1px;
}

/* ALERT CARDS */
.alert-card {
  display: flex;
  gap: 16px;
  padding: 18px 20px;
  border-radius: var(--radius-lg);
  border: 1px solid;
}
.alert-warning { background: rgba(243,156,18,0.08); border-color: rgba(243,156,18,0.3); }
.alert-danger { background: rgba(231,76,60,0.08); border-color: rgba(231,76,60,0.3); }
.alert-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.alert-warning .alert-icon { background: rgba(243,156,18,0.15); color: #f39c12; }
.alert-danger .alert-icon { background: rgba(231,76,60,0.15); color: #e74c3c; }
.alert-body { flex: 1; }
.alert-title { font-weight: 700; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 8px; }
.alert-list { margin: 0; padding-left: 20px; color: var(--text-secondary); font-size: 0.85rem; }
.alert-list li { margin-bottom: 4px; }

/* CHECKS GRID */
.checks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}
.check-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all var(--transition);
}
.check-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }

.check-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--bg-table-stripe);
  border-bottom: 1px solid var(--border-color);
}
.check-card-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}
.check-card-icon.ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.check-card-icon.fail { background: rgba(231,76,60,0.15); color: #e74c3c; }
.check-card-title { flex: 1; display: flex; justify-content: space-between; align-items: center; }
.check-card-title h3 { font-size: 0.95rem; font-weight: 700; margin: 0; color: var(--text-primary); }
.check-card-status {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  letter-spacing: 0.5px;
}
.check-card-status.ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.check-card-status.fail { background: rgba(231,76,60,0.15); color: #e74c3c; }

.check-card-body { padding: 16px 20px; flex: 1; }

.check-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border-light);
  gap: 12px;
}
.check-item:last-child { border-bottom: none; }
.check-label { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
.check-value {
  font-weight: 500;
  color: var(--text-primary);
  text-align: right;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.check-value code {
  background: var(--bg-table-stripe);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: var(--font-mono, monospace);
}

.badge-ambiente {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.badge-ambiente.prod { background: rgba(39,174,96,0.15); color: #27ae60; }
.badge-ambiente.test { background: rgba(243,156,18,0.15); color: #d68910; }

.badge-dias {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-weight: 700;
  font-size: 0.75rem;
}
.badge-dias.ok { background: rgba(39,174,96,0.15); color: #27ae60; }
.badge-dias.warn { background: rgba(243,156,18,0.15); color: #d68910; }
.badge-dias.danger { background: rgba(231,76,60,0.15); color: #e74c3c; }

.empty-cert {
  text-align: center;
  padding: 20px 10px;
  color: var(--text-muted);
}
.empty-cert i { font-size: 2rem; margin-bottom: 8px; opacity: 0.5; }
.empty-cert p { margin: 0; font-size: 0.85rem; }

.check-card-footer {
  padding: 12px 20px;
  background: var(--bg-table-stripe);
  border-top: 1px solid var(--border-color);
}
.btn-card-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--primary-color);
  font-weight: 600;
  font-size: 0.85rem;
  text-decoration: none;
  transition: gap var(--transition-fast);
}
.btn-card-action:hover { gap: 12px; }

/* ACCIONES MANTENIMIENTO */
.acciones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}
.accion-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: all var(--transition);
}
.accion-item:hover { border-color: var(--primary-color); background: var(--bg-card); }

.accion-icon {
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.05rem;
  flex-shrink: 0;
}
.accion-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.accion-icon.naranja { background: rgba(230,126,34,0.12); color: #e67e22; }

.accion-info { flex: 1; min-width: 0; }
.accion-title { font-weight: 700; font-size: 0.88rem; color: var(--text-primary); margin-bottom: 2px; }
.accion-desc { font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; }

.btn-accion {
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
  flex-shrink: 0;
}
.btn-accion:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--info-bg);
}
.btn-accion:disabled { opacity: 0.6; cursor: not-allowed; }

.resultado-prueba {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
}
.resultado-prueba.ok { background: rgba(39,174,96,0.08); border: 1px solid rgba(39,174,96,0.3); color: #1e8449; }
.resultado-prueba.fail { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.3); color: #c0392b; }
.resultado-prueba i { font-size: 1.3rem; }

/* DOCUMENTOS */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.stat-box {
  padding: 18px 14px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-md);
  text-align: center;
  border: 1px solid transparent;
  transition: all var(--transition);
}
.stat-box:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.stat-warning { background: rgba(243,156,18,0.08); border-color: rgba(243,156,18,0.2); }
.stat-info { background: rgba(52,152,219,0.08); border-color: rgba(52,152,219,0.2); }
.stat-success { background: rgba(39,174,96,0.08); border-color: rgba(39,174,96,0.2); }

.stat-box-icon {
  width: 38px; height: 38px;
  margin: 0 auto 10px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
}
.stat-box-icon.gris { background: var(--bg-card); color: var(--text-muted); }
.stat-box-icon.amarillo { background: rgba(243,156,18,0.15); color: #f39c12; }
.stat-box-icon.azul { background: rgba(52,152,219,0.15); color: #3498db; }
.stat-box-icon.verde { background: rgba(39,174,96,0.15); color: #27ae60; }

.stat-box-value { font-size: 1.8rem; font-weight: 800; color: var(--text-primary); line-height: 1; }
.stat-box-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
  margin-top: 6px;
}

.alert-accion {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  margin-top: 16px;
  background: rgba(243,156,18,0.08);
  border: 1px solid rgba(243,156,18,0.3);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}
.alert-accion-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: rgba(243,156,18,0.15);
  color: #f39c12;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.alert-accion-body { flex: 1; min-width: 200px; color: var(--text-secondary); font-size: 0.85rem; }
.alert-accion-body strong { color: var(--text-primary); display: block; margin-bottom: 2px; }

.btn-accion-strong {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(243,156,18,0.3);
  transition: all var(--transition);
  font-family: inherit;
}
.btn-accion-strong:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(243,156,18,0.4); }
.btn-accion-strong:disabled { opacity: 0.6; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .estado-badge-big { display: none; }
  .estado-layout { gap: 12px; }
  .estado-icon { width: 50px; height: 50px; font-size: 1.5rem; }
}
</style>