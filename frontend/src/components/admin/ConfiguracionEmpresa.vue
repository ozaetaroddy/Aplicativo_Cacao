<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-building"></i> Configuración de la Empresa</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" @click="guardar" :disabled="cargando || !formularioValido">
          <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
          {{ cargando ? 'Guardando...' : 'Guardar cambios' }}
        </button>
      </div>
    </div>

    <!-- Alert de ambiente -->
    <div
      v-if="form.ambiente"
      class="alert"
      :class="form.ambiente === '2' ? 'alert-danger' : 'alert-warning'"
    >
      <i :class="form.ambiente === '2' ? 'fas fa-exclamation-triangle' : 'fas fa-flask'"></i>
      <strong class="ms-2">
        Modo {{ form.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS' }}
      </strong>
      <div class="small mt-1">
        {{ form.ambiente === '2'
          ? 'Está en modo PRODUCCIÓN. Los documentos electrónicos que genere serán enviados al SRI real y tendrán validez legal.'
          : 'Está en modo PRUEBAS. Los documentos electrónicos serán enviados al ambiente de pruebas del SRI.' }}
      </div>
    </div>

    <div class="row g-3 align-items-start">
      <!-- Datos del contribuyente -->
      <div class="col-lg-8">
        <div class="card card-cacao">
          <div class="card-header">
            <i class="fas fa-id-card me-2"></i> Datos del Contribuyente
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label"><span class="text-danger">*</span> RUC</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.ruc }"
                  v-model="form.ruc"
                  maxlength="13"
                  placeholder="13 dígitos"
                />
                <div v-if="errores.ruc" class="invalid-feedback">{{ errores.ruc }}</div>
              </div>
              <div class="col-md-6">
                <label class="form-label"><span class="text-danger">*</span> Razón Social</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.razon_social }"
                  v-model="form.razon_social"
                />
                <div v-if="errores.razon_social" class="invalid-feedback">{{ errores.razon_social }}</div>
              </div>
              <div class="col-md-6">
                <label class="form-label">Nombre Comercial</label>
                <input type="text" class="form-control" v-model="form.nombre_comercial" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Régimen</label>
                <select class="form-select" v-model="form.regimen">
                  <option value="RIMPE">RIMPE - Emprendedor</option>
                  <option value="RIMPE_NEGOCIO">RIMPE - Negocio Popular</option>
                  <option value="GENERAL">Régimen General</option>
                  <option value="ESPECIAL">Régimen Especial</option>
                </select>
              </div>
              <div class="col-md-12">
                <label class="form-label">Dirección Matriz</label>
                <input type="text" class="form-control" v-model="form.direccion_matriz" />
              </div>
              <div class="col-md-12">
                <label class="form-label">Dirección Establecimiento</label>
                <input type="text" class="form-control" v-model="form.direccion_establecimiento" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Teléfono</label>
                <input type="text" class="form-control" v-model="form.telefono" placeholder="09XXXXXXXX" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Email</label>
                <input type="email" class="form-control" v-model="form.email" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Contribuyente Especial</label>
                <input type="text" class="form-control" v-model="form.contribuyente_especial" placeholder="Nº resolución" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Agente de Retención</label>
                <input type="text" class="form-control" v-model="form.agente_retencion" placeholder="Nº resolución" />
              </div>
              <div class="col-md-6 d-flex align-items-center">
                <div class="form-check form-switch mt-4">
                  <input class="form-check-input" type="checkbox" id="obligadoCont" v-model="form.obligado_contabilidad" />
                  <label class="form-check-label" for="obligadoCont">
                    Obligado a llevar contabilidad
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuración SRI -->
      <div class="col-lg-4">
        <div class="card card-cacao mb-3">
          <div class="card-header">
            <i class="fas fa-cog me-2"></i> Configuración SRI
          </div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label"><span class="text-danger">*</span> Ambiente</label>
              <select class="form-select" v-model="form.ambiente">
                <option value="1">1 - Pruebas</option>
                <option value="2">2 - Producción</option>
              </select>
              <small class="text-muted">
                Pruebas: SRI simula autorizaciones. Producción: emite documentos con validez legal.
              </small>
            </div>

            <hr />

            <h6 class="mb-3">Serie por defecto</h6>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small">Establecimiento</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.establecimiento }"
                  v-model="form.establecimiento"
                  maxlength="3"
                  placeholder="001"
                />
                <div v-if="errores.establecimiento" class="invalid-feedback">{{ errores.establecimiento }}</div>
              </div>
              <div class="col-6">
                <label class="form-label small">Punto Emisión</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.punto_emision }"
                  v-model="form.punto_emision"
                  maxlength="3"
                  placeholder="001"
                />
                <div v-if="errores.punto_emision" class="invalid-feedback">{{ errores.punto_emision }}</div>
              </div>
            </div>

            <div class="mt-3">
              <label class="form-label small">Serie formateada</label>
              <div class="serie-preview">{{ serieFormateada }}</div>
            </div>

            <hr />

            <div class="mt-3">
              <label class="form-label small">Tipo de emisión</label>
              <select class="form-select" v-model="form.tipo_emision">
                <option value="1">1 - Normal</option>
                <option value="2">2 - Contingencia</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Preview de clave -->
        <div class="card card-cacao">
          <div class="card-header">
            <i class="fas fa-key me-2"></i> Ejemplo de Clave de Acceso
          </div>
          <div class="card-body">
            <small class="text-muted d-block mb-2">Según tu configuración actual:</small>
            <div class="clave-preview">{{ ejemploClave }}</div>
            <hr />
            <small class="text-muted">
              <strong>Total:</strong> 49 dígitos.<br />
              <strong>DV:</strong> {{ ejemploClave.slice(-1) }} (módulo 11).
            </small>
          </div>
        </div>
      </div>
    </div>

    <!-- Info adicional -->
    <div class="card card-cacao mt-3 info-card">
      <div class="card-header"><i class="fas fa-info-circle me-2"></i> Información</div>
      <div class="card-body">
        <div class="row g-3 small">
          <div class="col-md-6">
            <strong>Modo Pruebas:</strong>
            <ul class="mb-0 mt-1">
              <li>Los documentos se envían al SRI de pruebas</li>
              <li>No tienen validez legal</li>
              <li>Útil para desarrollo y testeo</li>
            </ul>
          </div>
          <div class="col-md-6">
            <strong>Modo Producción:</strong>
            <ul class="mb-0 mt-1">
              <li>Los documentos se envían al SRI real</li>
              <li>Tienen validez legal y fiscal</li>
              <li>Requiere certificado de firma electrónica vigente</li>
            </ul>
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

const errores = ref({
  ruc: '',
  razon_social: '',
  establecimiento: '',
  punto_emision: ''
})

const cargando = ref(false)

const serieFormateada = computed(() => {
  const est = (form.value.establecimiento || '001').padStart(3, '0');
  const pe = (form.value.punto_emision || '001').padStart(3, '0');
  return `${est}${pe}`;
})

const ejemploClave = computed(() => {
  const hoy = new Date();
  const fechaStr = String(hoy.getDate()).padStart(2, '0') +
                   String(hoy.getMonth() + 1).padStart(2, '0') +
                   hoy.getFullYear();
  const tipo = '01';
  const ruc = (form.value.ruc || '0000000000001').padStart(13, '0');
  const ambiente = form.value.ambiente || '1';
  const serie = serieFormateada.value;
  const secuencial = '000000001';
  const codNum = '12345678';
  const tipoEm = form.value.tipo_emision || '1';
  const base = `${fechaStr}${tipo}${ruc}${ambiente}${serie}${secuencial}${codNum}${tipoEm}`;
  const dv = calcularDV(base);
  return `${base}${dv}`;
})

function calcularDV(cadena) {
  const pesos = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  for (let i = cadena.length - 1, j = 0; i >= 0; i--, j++) {
    suma += parseInt(cadena[i]) * pesos[j % 6];
  }
  const resto = suma % 11;
  let dv = 11 - resto;
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 1;
  return dv;
}

const formularioValido = computed(() => {
  const rucOk = /^\d{13}$/.test(form.value.ruc);
  const razonOk = form.value.razon_social && form.value.razon_social.trim().length >= 3;
  const estOk = /^\d{3}$/.test(form.value.establecimiento);
  const peOk = /^\d{3}$/.test(form.value.punto_emision);
  return rucOk && razonOk && estOk && peOk;
})

const cargar = async () => {
  try {
    const data = await api.request('/configuracion/empresa', { method: 'GET' })
    Object.keys(form.value).forEach(key => {
      if (data[key] !== undefined) form.value[key] = data[key]
    })
    form.value.ambiente = String(form.value.ambiente || '1')
    form.value.tipo_emision = String(form.value.tipo_emision || '1')
  } catch (e) {
    toast.error('Error al cargar configuración: ' + e.message)
  }
}

const guardar = async () => {
  errores.value = { ruc: '', razon_social: '', establecimiento: '', punto_emision: '' }

  if (!/^\d{13}$/.test(form.value.ruc)) {
    errores.value.ruc = 'RUC debe tener 13 dígitos numéricos'
  }
  if (!form.value.razon_social || form.value.razon_social.trim().length < 3) {
    errores.value.razon_social = 'Razón social requerida (mínimo 3 caracteres)'
  }
  if (!/^\d{3}$/.test(form.value.establecimiento)) {
    errores.value.establecimiento = 'Debe tener 3 dígitos'
  }
  if (!/^\d{3}$/.test(form.value.punto_emision)) {
    errores.value.punto_emision = 'Debe tener 3 dígitos'
  }

  if (!formularioValido.value) {
    toast.warning('Corrija los errores antes de guardar')
    return
  }

  if (form.value.ambiente === '2') {
    const confirmar = confirm(
      '¿Está seguro de activar el modo PRODUCCIÓN?\n\n' +
      'Los documentos electrónicos que genere tendrán validez legal ante el SRI y serán enviados al ambiente real. Esta acción no se puede deshacer.'
    )
    if (!confirmar) return
  }

  cargando.value = true
  try {
    await api.request('/configuracion/empresa', {
      method: 'PUT',
      body: JSON.stringify(form.value),
      loaderMessage: 'Guardando configuración...'
    })
    toast.success('Configuración actualizada correctamente')
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
</script>

<style scoped>
.serie-preview {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.2rem;
  font-weight: 700;
  padding: 10px;
  background: var(--bg-table-stripe);
  border-radius: 8px;
  text-align: center;
  color: var(--primary-color);
  letter-spacing: 3px;
}

.clave-preview {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  word-break: break-all;
  padding: 10px;
  background: var(--bg-table-stripe);
  border-radius: 8px;
  color: var(--text-primary);
  line-height: 1.5;
  letter-spacing: 0.5px;
}

/* ===== FIX: evitar que ciertas tarjetas se estiren ===== */
.info-card {
  height: auto !important;
  min-height: auto !important;
}

/* Las tarjetas dentro de las columnas del grid no deben estirarse a 100% */
.row > [class*="col-"] > .card-cacao {
  height: auto;
}
</style>