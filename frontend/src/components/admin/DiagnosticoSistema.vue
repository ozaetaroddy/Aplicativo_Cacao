<template>
  <div>
    <h4 class="section-title"><i class="fas fa-stethoscope"></i> Diagnóstico del Sistema</h4>

    <div v-if="loading" class="text-center py-5">
      <i class="fas fa-spinner fa-spin fa-3x text-primary"></i>
      <p class="mt-3 text-muted">Analizando el sistema...</p>
    </div>

    <div v-else-if="diagnostico">
      <!-- Estado general -->
      <div class="card card-cacao mb-4" :style="{ borderLeft: `6px solid ${esListo ? '#27ae60' : '#e74c3c'}` }">
        <div class="card-body d-flex align-items-center gap-3 flex-wrap">
          <div class="estado-icon" :class="esListo ? 'estado-ok' : 'estado-error'">
            <i :class="esListo ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'"></i>
          </div>
          <div class="flex-grow-1">
            <h5 class="mb-1">
              {{ esListo ? 'Sistema listo para facturar electrónicamente' : 'Configuración incompleta' }}
            </h5>
            <p class="mb-0 text-muted small">
              {{ esListo
                ? 'Todos los requisitos están configurados correctamente.'
                : 'Faltan algunos pasos. Revisa las recomendaciones abajo.' }}
            </p>
          </div>
          <button class="btn btn-outline-primary" @click="cargar" :disabled="loading">
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Re-analizar
          </button>
        </div>
      </div>

      <!-- Recomendaciones -->
      <div v-if="diagnostico.recomendaciones.length > 0" class="alert alert-warning mb-4">
        <h6><i class="fas fa-lightbulb me-2"></i>Recomendaciones:</h6>
        <ul class="mb-0">
          <li v-for="(r, i) in diagnostico.recomendaciones" :key="i">{{ r }}</li>
        </ul>
      </div>

      <div class="row g-3">
        <!-- Configuración de Empresa -->
        <div class="col-md-6">
          <div class="card card-cacao h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><i class="fas fa-building me-2"></i>Configuración Empresa</span>
              <span class="badge" :class="diagnostico.configuracion_empresa.ok ? 'bg-success' : 'bg-danger'">
                {{ diagnostico.configuracion_empresa.ok ? 'OK' : 'FALTA' }}
              </span>
            </div>
            <div class="card-body">
              <div class="check-row">
                <span class="check-label">RUC</span>
                <span class="check-value">
                  <code>{{ diagnostico.configuracion_empresa.ruc }}</code>
                  <i :class="diagnostico.configuracion_empresa.ruc_ok ? 'fas fa-check-circle text-success' : 'fas fa-times-circle text-danger'" class="ms-2"></i>
                  <span class="text-muted small ms-1">({{ diagnostico.configuracion_empresa.ruc_longitud }} dígitos)</span>
                </span>
              </div>
              <div class="check-row">
                <span class="check-label">Razón Social</span>
                <span class="check-value">{{ diagnostico.configuracion_empresa.razon_social || '(vacío)' }}</span>
              </div>
              <div class="check-row">
                <span class="check-label">Ambiente</span>
                <span class="check-value">
                  <span class="badge" :class="diagnostico.configuracion_empresa.ambiente === '2' ? 'bg-success' : 'bg-warning text-dark'">
                    {{ diagnostico.configuracion_empresa.ambiente_nombre }}
                  </span>
                </span>
              </div>
              <div class="check-row">
                <span class="check-label">Serie</span>
                <span class="check-value">
                  <code>{{ diagnostico.configuracion_empresa.establecimiento }}-{{ diagnostico.configuracion_empresa.punto_emision }}</code>
                </span>
              </div>
            </div>
            <div class="card-footer">
              <router-link to="/configuracion-empresa" class="btn btn-sm btn-outline-primary">
                <i class="fas fa-cog"></i> Configurar
              </router-link>
            </div>
          </div>
        </div>

        <!-- Certificado de Firma -->
        <div class="col-md-6">
          <div class="card card-cacao h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><i class="fas fa-shield-alt me-2"></i>Certificado Firma</span>
              <span class="badge" :class="diagnostico.certificado.ok ? 'bg-success' : 'bg-danger'">
                {{ diagnostico.certificado.ok ? 'OK' : 'FALTA' }}
              </span>
            </div>
            <div class="card-body">
              <template v-if="diagnostico.certificado.ok">
                <div class="check-row">
                  <span class="check-label">Titular</span>
                  <span class="check-value small">{{ diagnostico.certificado.titular }}</span>
                </div>
                <div class="check-row">
                  <span class="check-label">Vence</span>
                  <span class="check-value">{{ formatFecha(diagnostico.certificado.vence) }}</span>
                </div>
                <div class="check-row">
                  <span class="check-label">Días restantes</span>
                  <span class="check-value">
                    <span class="badge" :class="diagnostico.certificado.dias_restantes > 30 ? 'bg-success' : 'bg-warning text-dark'">
                      {{ diagnostico.certificado.dias_restantes }} días
                    </span>
                  </span>
                </div>
              </template>
              <div v-else class="text-muted text-center py-3">
                <i class="fas fa-shield-virus fa-2x mb-2"></i>
                <p class="mb-0">{{ diagnostico.certificado.mensaje }}</p>
              </div>
            </div>
            <div class="card-footer">
              <router-link to="/certificado-firma" class="btn btn-sm btn-outline-primary">
                <i class="fas fa-upload"></i> {{ diagnostico.certificado.ok ? 'Gestionar' : 'Cargar certificado' }}
              </router-link>
            </div>
          </div>
        </div>

        <!-- Documentos -->
        <div class="col-12">
          <div class="card card-cacao">
            <div class="card-header"><i class="fas fa-file-invoice me-2"></i>Estado de Documentos</div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-3 col-6">
                  <div class="stat-mini">
                    <div class="stat-mini-number">{{ diagnostico.documentos.total_facturas }}</div>
                    <div class="stat-mini-label">Total facturas</div>
                  </div>
                </div>
                <div class="col-md-3 col-6">
                  <div class="stat-mini" :class="{ 'stat-mini-warning': diagnostico.documentos.sin_clave_acceso > 0 }">
                    <div class="stat-mini-number">{{ diagnostico.documentos.sin_clave_acceso }}</div>
                    <div class="stat-mini-label">Sin clave</div>
                  </div>
                </div>
                <div class="col-md-3 col-6">
                  <div class="stat-mini" :class="{ 'stat-mini-info': diagnostico.documentos.sin_firma > 0 }">
                    <div class="stat-mini-number">{{ diagnostico.documentos.sin_firma }}</div>
                    <div class="stat-mini-label">Sin firma</div>
                  </div>
                </div>
                <div class="col-md-3 col-6">
                  <div class="stat-mini" style="background: rgba(39,174,96,0.1);">
                    <div class="stat-mini-number" style="color:#27ae60;">{{ diagnostico.documentos.autorizados }}</div>
                    <div class="stat-mini-label">Autorizados</div>
                  </div>
                </div>
              </div>

              <!-- Botón de migración masiva -->
              <div v-if="diagnostico.documentos.sin_clave_acceso > 0" class="alert alert-warning mt-3 mb-0">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div>
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Hay <strong>{{ diagnostico.documentos.sin_clave_acceso }}</strong> facturas sin clave de acceso.
                    Puedes generarlas automáticamente.
                  </div>
                  <button class="btn btn-warning" @click="migrarClaves" :disabled="migrando">
                    <i class="fas fa-magic" :class="{ 'fa-spin': migrando }"></i>
                    {{ migrando ? 'Migrando...' : 'Generar claves automáticamente' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
const diagnostico = ref(null)

const esListo = computed(() => diagnostico.value?.listo_para_facturar)

const formatFecha = (f) => {
  if (!f) return 'N/A'
  return new Date(f).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const cargar = async () => {
  loading.value = true
  try {
    diagnostico.value = await api.request('/diagnostico', {
      method: 'GET',
      loaderMessage: 'Analizando sistema...'
    })
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    loading.value = false
  }
}

const migrarClaves = async () => {
  if (!confirm(`¿Generar claves de acceso para ${diagnostico.value.documentos.sin_clave_acceso} facturas?\n\nEste proceso puede tardar unos segundos.`)) return

  migrando.value = true
  try {
    const res = await api.request('/ventas/migrar-claves', {
      method: 'POST',
      loaderMessage: 'Migrando claves...'
    })
    toast.success(`✅ ${res.exitosas} facturas migradas correctamente` + (res.errores > 0 ? `, ${res.errores} errores` : ''))
    await cargar()
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    migrando.value = false
  }
}

onMounted(cargar)
</script>

<style scoped>
.estado-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  flex-shrink: 0;
}
.estado-ok {
  background: rgba(39,174,96,0.15);
  color: #27ae60;
}
.estado-error {
  background: rgba(231,76,60,0.15);
  color: #e74c3c;
}

.check-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}
.check-row:last-child { border-bottom: none; }
.check-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 600;
}
.check-value {
  font-weight: 500;
  color: var(--text-primary);
  text-align: right;
}

.stat-mini {
  padding: 12px;
  background: var(--bg-table-stripe);
  border-radius: 10px;
  text-align: center;
}
.stat-mini-warning { background: rgba(243,156,18,0.12); }
.stat-mini-info { background: rgba(52,152,219,0.12); }
.stat-mini-number {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}
.stat-mini-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
  margin-top: 4px;
}
</style>