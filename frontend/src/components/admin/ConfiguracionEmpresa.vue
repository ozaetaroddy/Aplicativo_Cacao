<template>
  <div class="config-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon"><i class="fas fa-building"></i></span>
          Configuración de la Empresa
        </h1>
        <p class="page-subtitle">
          Datos del contribuyente y parámetros de facturación electrónica
        </p>
      </div>
      <button
        class="btn-save"
        :disabled="cargando || !formularioValido || !hayCambios"
        @click="guardar"
      >
        <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
        {{ cargando ? 'Guardando...' : 'Guardar cambios' }}
        <span v-if="hayCambios" class="dot-cambios"></span>
      </button>
    </div>

    <!-- ADVERTENCIA CAMBIOS SIN GUARDAR -->
    <transition name="slide-down">
      <div v-if="hayCambios" class="alert alert-warning sticky-warn">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Tienes cambios sin guardar. No cierres la página o los perderás.</span>
      </div>
    </transition>

    <!-- MODO PRODUCCIÓN -->
    <div
      v-if="form.ambiente"
      class="ambiente-banner"
      :class="form.ambiente === '2' ? 'amb-prod' : 'amb-test'"
    >
      <div class="ambiente-icon">
        <i :class="form.ambiente === '2' ? 'fas fa-exclamation-triangle' : 'fas fa-flask'"></i>
      </div>
      <div class="ambiente-info">
        <div class="ambiente-title">
          Modo {{ form.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS' }}
        </div>
        <div class="ambiente-desc">
          {{ form.ambiente === '2'
            ? 'Los documentos electrónicos tendrán validez legal ante el SRI real.'
            : 'Los documentos se enviarán al ambiente de pruebas del SRI. No tienen validez legal.' }}
        </div>
      </div>
      <span class="ambiente-pill" :class="form.ambiente === '2' ? 'pill-prod' : 'pill-test'">
        {{ form.ambiente === '2' ? 'PROD' : 'TEST' }}
      </span>
    </div>

    <!-- LAYOUT -->
    <div class="layout-grid">
      <!-- COLUMNA PRINCIPAL -->
      <div class="main-col">
        <!-- DATOS DEL CONTRIBUYENTE -->
        <div class="card-cacao">
          <div class="card-header">
            <i class="fas fa-id-card me-2"></i>
            Datos del Contribuyente
          </div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label">
                  <span class="required">*</span> RUC
                </label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.ruc }"
                  v-model="form.ruc"
                  maxlength="13"
                  placeholder="13 dígitos"
                  @input="validarRuc"
                />
                <div v-if="errores.ruc" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.ruc }}
                </div>
                <div v-else-if="form.ruc && form.ruc.length === 13" class="field-ok">
                  <i class="fas fa-check-circle"></i> RUC válido
                </div>
              </div>

              <div class="form-field">
                <label class="form-label">
                  <span class="required">*</span> Razón Social
                </label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.razon_social }"
                  v-model="form.razon_social"
                  @input="validarRazonSocial"
                  placeholder="Nombre legal de la empresa"
                />
                <div v-if="errores.razon_social" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.razon_social }}
                </div>
              </div>

              <div class="form-field">
                <label class="form-label">Nombre Comercial</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.nombre_comercial"
                  placeholder="Nombre con el que se conoce al negocio"
                />
              </div>

              <div class="form-field">
                <label class="form-label">Régimen</label>
                <select class="form-control" v-model="form.regimen">
                  <option value="RIMPE">RIMPE - Emprendedor</option>
                  <option value="RIMPE_NEGOCIO">RIMPE - Negocio Popular</option>
                  <option value="GENERAL">Régimen General</option>
                  <option value="ESPECIAL">Régimen Especial</option>
                </select>
              </div>

              <div class="form-field full">
                <label class="form-label">Dirección Matriz</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.direccion_matriz"
                  placeholder="Dirección principal de la empresa"
                />
              </div>

              <div class="form-field full">
                <label class="form-label">Dirección del Establecimiento</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.direccion_establecimiento"
                  placeholder="Si es diferente a la matriz"
                />
              </div>

              <div class="form-field">
                <label class="form-label">Teléfono</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.telefono"
                  placeholder="09XXXXXXXX"
                />
              </div>

              <div class="form-field">
                <label class="form-label">Email</label>
                <input
                  type="email"
                  class="form-control"
                  :class="{ 'is-invalid': errores.email }"
                  v-model="form.email"
                  placeholder="contacto@empresa.com"
                  @input="validarEmail"
                />
                <div v-if="errores.email" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.email }}
                </div>
              </div>

              <div class="form-field">
                <label class="form-label">Contribuyente Especial</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.contribuyente_especial"
                  placeholder="Nº resolución (si aplica)"
                />
              </div>

              <div class="form-field">
                <label class="form-label">Agente de Retención</label>
                <input
                  type="text"
                  class="form-control"
                  v-model="form.agente_retencion"
                  placeholder="Nº resolución (si aplica)"
                />
              </div>

              <div class="form-field full">
                <div class="toggle-row">
                  <label class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" v-model="form.obligado_contabilidad" />
                    <span class="form-check-label">
                      <strong>Obligado a llevar contabilidad</strong>
                      <div class="small text-muted">Afecta la presentación del RIDE y formularios SRI</div>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- COLUMNA LATERAL -->
      <div class="side-col">
        <!-- CONFIGURACIÓN SRI -->
        <div class="card-cacao">
          <div class="card-header">
            <i class="fas fa-cog me-2"></i> Configuración SRI
          </div>
          <div class="card-body">
            <div class="form-field mb-3">
              <label class="form-label">
                <span class="required">*</span> Ambiente
              </label>
              <select class="form-control" v-model="form.ambiente">
                <option value="1">1 - Pruebas</option>
                <option value="2">2 - Producción</option>
              </select>
              <small class="form-hint">
                Pruebas: simulaciones. Producción: validez legal.
              </small>
              <div v-if="form.ambiente === '2' && !certificadoOk" class="field-error mt-2">
                <i class="fas fa-exclamation-triangle"></i>
                No tienes certificado vigente. Cárgalo antes de pasar a producción.
              </div>
            </div>

            <hr />

            <div class="seccion-titulo">
              <i class="fas fa-hashtag"></i> Serie por defecto
            </div>
            <div class="serie-grid">
              <div class="form-field">
                <label class="form-label small">Establecimiento</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.establecimiento }"
                  v-model="form.establecimiento"
                  maxlength="3"
                  placeholder="001"
                  @input="validarEstablecimiento"
                />
                <div v-if="errores.establecimiento" class="field-error small">{{ errores.establecimiento }}</div>
              </div>
              <div class="form-field">
                <label class="form-label small">Punto Emisión</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.punto_emision }"
                  v-model="form.punto_emision"
                  maxlength="3"
                  placeholder="001"
                  @input="validarPuntoEmision"
                />
                <div v-if="errores.punto_emision" class="field-error small">{{ errores.punto_emision }}</div>
              </div>
            </div>

            <div class="serie-preview-box">
              <div class="serie-preview-label">Serie formateada</div>
              <div class="serie-preview-value">{{ serieFormateada }}</div>
            </div>

            <hr />

            <div class="form-field">
              <label class="form-label small">Tipo de emisión</label>
              <select class="form-control" v-model="form.tipo_emision">
                <option value="1">1 - Normal</option>
                <option value="2">2 - Contingencia</option>
              </select>
            </div>
          </div>
        </div>

        <!-- PREVIEW CLAVE -->
        <div class="card-cacao">
          <div class="card-header">
            <i class="fas fa-key me-2"></i> Ejemplo de Clave de Acceso
          </div>
          <div class="card-body">
            <small class="text-muted d-block mb-2">
              Se generará una clave como esta para cada factura:
            </small>
            <div class="clave-preview">{{ ejemploClave }}</div>
            <div class="clave-info">
              <div class="clave-info-item">
                <span>Longitud:</span>
                <strong>49 dígitos</strong>
              </div>
              <div class="clave-info-item">
                <span>DV (módulo 11):</span>
                <strong>{{ ejemploClave.slice(-1) }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- ÚLTIMA ACTUALIZACIÓN -->
        <div v-if="ultimaActualizacion" class="ultima-act">
          <i class="fas fa-history"></i>
          <span>Última actualización: {{ formatFechaHora(ultimaActualizacion) }}</span>
        </div>
      </div>
    </div>

    <!-- INFO CARDS -->
    <div class="info-cards-grid">
      <div class="info-card-modern info-test">
        <div class="info-card-icon"><i class="fas fa-flask"></i></div>
        <div class="info-card-content">
          <div class="info-card-title">Modo Pruebas</div>
          <ul class="info-card-list">
            <li>Documentos enviados al SRI de pruebas</li>
            <li>Sin validez legal ni fiscal</li>
            <li>Perfecto para desarrollo y testeo</li>
            <li>Recomendado antes de producción</li>
          </ul>
        </div>
      </div>

      <div class="info-card-modern info-prod">
        <div class="info-card-icon"><i class="fas fa-check-circle"></i></div>
        <div class="info-card-content">
          <div class="info-card-title">Modo Producción</div>
          <ul class="info-card-list">
            <li>Documentos enviados al SRI real</li>
            <li>Validez legal y fiscal completa</li>
            <li>Requiere certificado vigente</li>
            <li>Los documentos emitidos no se pueden eliminar</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

const form = ref({
  ruc: '',
  razon_social: '',
  nombre_comercial: '',
  direccion_matriz: '',
  direccion_establecimiento: '',
  telefono: '',
  email: '',
  contribuyente_especial: '',
  obligado_contabilidad: false,
  regimen: 'RIMPE',
  agente_retencion: '',
  ambiente: '1',
  tipo_emision: '1',
  establecimiento: '001',
  punto_emision: '001',
  logo_url: ''
})

const formOriginal = ref(null)
const errores = ref({ ruc: '', razon_social: '', email: '', establecimiento: '', punto_emision: '' })
const cargando = ref(false)
const certificadoOk = ref(false)
const ultimaActualizacion = ref(null)

// ===== COMPUTED =====
const hayCambios = computed(() => {
  if (!formOriginal.value) return false
  return JSON.stringify(form.value) !== JSON.stringify(formOriginal.value)
})

const serieFormateada = computed(() => {
  const est = (form.value.establecimiento || '001').padStart(3, '0')
  const pe = (form.value.punto_emision || '001').padStart(3, '0')
  return `${est}-${pe}`
})

const ejemploClave = computed(() => {
  const hoy = new Date()
  const fechaStr = String(hoy.getDate()).padStart(2, '0') +
                   String(hoy.getMonth() + 1).padStart(2, '0') +
                   hoy.getFullYear()
  const tipo = '01'
  const ruc = (form.value.ruc || '0000000000001').padStart(13, '0')
  const ambiente = form.value.ambiente || '1'
  const serie = serieFormateada.value.replace('-', '')
  const secuencial = '000000001'
  const codNum = '12345678'
  const tipoEm = form.value.tipo_emision || '1'
  const base = `${fechaStr}${tipo}${ruc}${ambiente}${serie}${secuencial}${codNum}${tipoEm}`
  const dv = calcularDV(base)
  return `${base}${dv}`
})

const formularioValido = computed(() => {
  return !errores.value.ruc
    && !errores.value.razon_social
    && !errores.value.email
    && !errores.value.establecimiento
    && !errores.value.punto_emision
    && form.value.ruc.length === 13
    && form.value.razon_social.trim().length >= 3
    && /^\d{3}$/.test(form.value.establecimiento)
    && /^\d{3}$/.test(form.value.punto_emision)
})

// ===== VALIDACIONES =====
const calcularDV = (cadena) => {
  const pesos = [2, 3, 4, 5, 6, 7]
  let suma = 0
  for (let i = cadena.length - 1, j = 0; i >= 0; i--, j++) {
    suma += parseInt(cadena[i]) * pesos[j % 6]
  }
  const resto = suma % 11
  let dv = 11 - resto
  if (dv === 11) dv = 0
  if (dv === 10) dv = 1
  return dv
}

// Validación de RUC con módulo 11
const validarRucModulo11 = (ruc) => {
  if (!ruc || ruc.length !== 13) return false
  if (!/^\d+$/.test(ruc)) return false
  if (!ruc.endsWith('001')) return false
  const provincia = parseInt(ruc.substring(0, 2), 10)
  if (provincia < 1 || provincia > 24) return false

  const tercerDigito = parseInt(ruc.charAt(2), 10)
  const base = ruc.substring(0, 10)

  if (tercerDigito < 6) {
    // Persona natural: validar como cédula
    const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    let suma = 0
    for (let i = 0; i < 9; i++) {
      let v = parseInt(base.charAt(i), 10) * coef[i]
      if (v >= 10) v -= 9
      suma += v
    }
    const dv = parseInt(base.charAt(9), 10)
    const dec = Math.ceil(suma / 10) * 10
    return (dec - suma) === dv
  }
  if (tercerDigito === 9) {
    const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2]
    let suma = 0
    for (let i = 0; i < 9; i++) suma += parseInt(base.charAt(i), 10) * coef[i]
    let dv = 11 - (suma % 11)
    if (dv === 11) dv = 0
    if (dv === 10) return false
    return dv === parseInt(base.charAt(9), 10)
  }
  if (tercerDigito === 6) {
    const coef = [3, 2, 7, 6, 5, 4, 3, 2, 9]
    let suma = 0
    for (let i = 0; i < 9; i++) suma += parseInt(base.charAt(i), 10) * coef[i]
    let dv = 11 - (suma % 11)
    if (dv === 11) dv = 0
    if (dv === 10) return false
    return dv === parseInt(base.charAt(9), 10)
  }
  return false
}

const validarRuc = () => {
  const ruc = form.value.ruc?.trim() || ''
  if (!ruc) { errores.value.ruc = 'El RUC es obligatorio'; return false }
  if (ruc.length !== 13) { errores.value.ruc = `Debe tener 13 dígitos (tiene ${ruc.length})`; return false }
  if (!/^\d+$/.test(ruc)) { errores.value.ruc = 'Solo se permiten números'; return false }
  if (!validarRucModulo11(ruc)) {
    errores.value.ruc = 'RUC inválido (verifique el dígito verificador)'
    return false
  }
  errores.value.ruc = ''
  return true
}

const validarRazonSocial = () => {
  const r = form.value.razon_social?.trim() || ''
  if (!r) { errores.value.razon_social = 'La razón social es obligatoria'; return false }
  if (r.length < 3) { errores.value.razon_social = 'Mínimo 3 caracteres'; return false }
  errores.value.razon_social = ''
  return true
}

const validarEmail = () => {
  const e = form.value.email?.trim() || ''
  if (!e) { errores.value.email = ''; return true } // opcional
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(e)) {
    errores.value.email = 'Email inválido'
    return false
  }
  errores.value.email = ''
  return true
}

const validarEstablecimiento = () => {
  const e = form.value.establecimiento || ''
  if (!/^\d{3}$/.test(e)) {
    errores.value.establecimiento = 'Debe tener 3 dígitos'
    return false
  }
  errores.value.establecimiento = ''
  return true
}

const validarPuntoEmision = () => {
  const p = form.value.punto_emision || ''
  if (!/^\d{3}$/.test(p)) {
    errores.value.punto_emision = 'Debe tener 3 dígitos'
    return false
  }
  errores.value.punto_emision = ''
  return true
}

// ===== HELPERS =====
const formatFechaHora = (f) => {
  if (!f) return ''
  return new Date(f).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
}

// ===== CARGA =====
const cargar = async () => {
  try {
    const data = await api.request('/configuracion/empresa', { method: 'GET' })
    Object.keys(form.value).forEach(key => {
      if (data[key] !== undefined) form.value[key] = data[key]
    })
    form.value.ambiente = String(form.value.ambiente || '1')
    form.value.tipo_emision = String(form.value.tipo_emision || '1')
    ultimaActualizacion.value = data.updatedAt || data.createdAt

    // Snapshot para detectar cambios
    formOriginal.value = JSON.parse(JSON.stringify(form.value))

    // Validar en limpio
    if (form.value.ruc) validarRuc()
    if (form.value.razon_social) validarRazonSocial()
    if (form.value.email) validarEmail()
    validarEstablecimiento()
    validarPuntoEmision()
  } catch (e) {
    toast.error('Error al cargar configuración: ' + e.message)
  }
}

const cargarEstadoCertificado = async () => {
  try {
    const info = await api.request('/certificado/info', { method: 'GET', skipLoader: true })
    certificadoOk.value = !!(info.cargado && !info.vencido)
  } catch (e) {
    certificadoOk.value = false
  }
}

// ===== GUARDAR =====
const guardar = async () => {
  // Validar todo antes de guardar
  const okRuc = validarRuc()
  const okRazon = validarRazonSocial()
  const okEmail = validarEmail()
  const okEst = validarEstablecimiento()
  const okPe = validarPuntoEmision()

  if (!okRuc || !okRazon || !okEmail || !okEst || !okPe) {
    toast.warning('Corrige los errores antes de guardar')
    return
  }

  // Confirmación si cambia a producción
  if (form.value.ambiente === '2' && formOriginal.value.ambiente !== '2') {
    if (!certificadoOk.value) {
      toast.error('No puedes pasar a Producción sin un certificado vigente')
      return
    }
    const confirmar = confirm(
      '¿Confirmas el cambio a modo PRODUCCIÓN?\n\n' +
      'A partir de ahora, los documentos electrónicos:\n' +
      '• Serán enviados al SRI real\n' +
      '• Tendrán validez legal y fiscal\n' +
      '• No podrán eliminarse (solo anularse con Nota de Crédito)\n\n' +
      'Esta acción queda registrada en auditoría.'
    )
    if (!confirmar) return
  }

  cargando.value = true
  try {
    const res = await api.request('/configuracion/empresa', {
      method: 'PUT',
      body: JSON.stringify(form.value),
      loaderMessage: 'Guardando configuración...'
    })

    // Actualizar snapshot
    formOriginal.value = JSON.parse(JSON.stringify(form.value))
    ultimaActualizacion.value = res.updatedAt || new Date()

    toast.success('Configuración guardada correctamente')

    // Aviso del backend si existe
    if (res._advertencia) {
      toast.warning(res._advertencia, { timeout: 8000 })
    }
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}

// ===== PREVENIR SALIDA CON CAMBIOS =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(async () => {
  await cargar()
  await cargarEstadoCertificado()
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler)
})
</script>

<style scoped>
.config-page { max-width: 1300px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #e67e22, #d35400); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; box-shadow: 0 6px 16px rgba(230,126,34,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.btn-save {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #27ae60, #1e8449);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(39,174,96,0.3);
}
.btn-save:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(39,174,96,0.4); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.dot-cambios {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f39c12;
  box-shadow: 0 0 0 3px rgba(243,156,18,0.3);
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(243,156,18,0.3); }
  50% { box-shadow: 0 0 0 6px rgba(243,156,18,0); }
}

/* ALERT STICKY */
.sticky-warn { position: sticky; top: 80px; z-index: 100; margin: 0; }

/* AMBIENTE BANNER */
.ambiente-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: var(--radius-lg);
  border-left: 4px solid;
  flex-wrap: wrap;
}
.amb-prod { background: rgba(231,76,60,0.08); border-left-color: #e74c3c; }
.amb-test { background: rgba(243,156,18,0.08); border-left-color: #f39c12; }
.ambiente-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }
.amb-prod .ambiente-icon { background: rgba(231,76,60,0.15); color: #e74c3c; }
.amb-test .ambiente-icon { background: rgba(243,156,18,0.15); color: #f39c12; }
.ambiente-info { flex: 1; min-width: 200px; }
.ambiente-title { font-size: 0.95rem; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 2px; }
.amb-prod .ambiente-title { color: #c0392b; }
.amb-test .ambiente-title { color: #d68910; }
.ambiente-desc { font-size: 0.8rem; color: var(--text-secondary); }
.ambiente-pill {
  padding: 6px 14px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 1px;
}
.pill-prod { background: #e74c3c; color: #fff; }
.pill-test { background: #f39c12; color: #fff; }

/* LAYOUT */
.layout-grid { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }
.main-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.side-col { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 90px; }

@media (max-width: 1100px) {
  .layout-grid { grid-template-columns: 1fr; }
  .side-col { position: static; }
}

/* FORM */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-field.full { grid-column: 1 / -1; }
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label.small { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; font-weight: 700; }
.required { color: #e74c3c; margin-right: 4px; }

.form-control {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  transition: all var(--transition-fast);
  outline: none;
}
.form-control:focus { border-color: #e67e22; box-shadow: 0 0 0 4px rgba(230,126,34,0.15); background: var(--bg-card); }
.form-control.is-invalid { border-color: #e74c3c; }
.form-control.is-invalid:focus { box-shadow: 0 0 0 4px rgba(231,76,60,0.15); }

.field-error { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #e74c3c; font-weight: 500; margin-top: 2px; }
.field-error.small { font-size: 0.7rem; }
.field-ok { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #27ae60; font-weight: 500; margin-top: 2px; }

.form-hint { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; }

.toggle-row { padding: 14px; background: var(--bg-table-stripe); border-radius: var(--radius-md); border: 1px solid var(--border-color); }
.form-check.form-switch { display: flex; align-items: center; gap: 12px; margin: 0; }
.form-check-input { margin: 0; cursor: pointer; }
.form-check-label { font-size: 0.88rem; cursor: pointer; }
.form-check-label .small { font-size: 0.75rem; margin-top: 2px; }

.seccion-titulo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}
.seccion-titulo i { color: #e67e22; }

.serie-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }

.serie-preview-box {
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(230,126,34,0.08), rgba(52,152,219,0.04));
  border: 1px dashed rgba(230,126,34,0.3);
  border-radius: var(--radius-md);
  text-align: center;
}
.serie-preview-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px; }
.serie-preview-value { font-family: 'JetBrains Mono', monospace; font-size: 1.3rem; font-weight: 800; color: #e67e22; letter-spacing: 3px; }

.clave-preview {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  word-break: break-all;
  padding: 12px;
  background: var(--bg-table-stripe);
  border-radius: 8px;
  color: var(--text-primary);
  line-height: 1.6;
  letter-spacing: 0.3px;
  border: 1px solid var(--border-color);
}
.clave-info { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color); }
.clave-info-item { display: flex; flex-direction: column; gap: 2px; }
.clave-info-item span { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; }
.clave-info-item strong { font-size: 0.9rem; color: var(--primary-color); }

.ultima-act {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--text-muted);
}
.ultima-act i { color: var(--primary-color); }

/* INFO CARDS */
.info-cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.info-card-modern {
  display: flex;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid;
}
.info-test { background: rgba(243,156,18,0.05); border-color: rgba(243,156,18,0.25); }
.info-prod { background: rgba(39,174,96,0.05); border-color: rgba(39,174,96,0.25); }
.info-card-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }
.info-test .info-card-icon { background: rgba(243,156,18,0.15); color: #f39c12; }
.info-prod .info-card-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.info-card-content { flex: 1; }
.info-card-title { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.info-card-list { margin: 0; padding-left: 18px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.7; }

/* TRANSICIONES */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-12px); }

@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
  .info-cards-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .page-subtitle { padding-left: 0; }
  .serie-grid { grid-template-columns: 1fr; }
}
</style>