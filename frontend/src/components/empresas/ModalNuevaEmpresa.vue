<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="modal-empresa-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-empresa-title"
      @click.self="cerrar"
    >
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content modal-empresa-content">
          <div class="modal-header modal-empresa-header">
            <h5 id="modal-empresa-title" class="modal-title">
              <i class="fas fa-building me-2" aria-hidden="true"></i>
              {{ esEdicion ? 'Editar empresa' : 'Nueva empresa' }}
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cerrar"
              :disabled="guardando"
              aria-label="Cerrar"
            ></button>
          </div>

          <div class="modal-body">
            <div v-if="errorGeneral" class="alert alert-danger small mb-3">
              <i class="fas fa-exclamation-circle me-2" aria-hidden="true"></i>
              {{ errorGeneral }}
            </div>

            <form @submit.prevent="guardar" novalidate>
              <div class="row g-3">
                <!-- RUC -->
                <div class="col-md-6">
                  <label class="form-label" for="emp-ruc">
                    <span class="text-danger">*</span> RUC
                  </label>
                  <input
                    id="emp-ruc"
                    type="text"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('ruc') }"
                    v-model="form.ruc"
                    placeholder="13 dígitos"
                    maxlength="13"
                    inputmode="numeric"
                    :disabled="guardando"
                    @input="onRucInput"
                    @blur="touched.ruc = true"
                  />
                  <div v-if="mostrarError('ruc')" class="invalid-feedback">
                    {{ errores.ruc }}
                  </div>
                  <div
                    v-else-if="form.ruc && form.ruc.length === 13 && !errores.ruc"
                    class="text-success small mt-1"
                  >
                    <i class="fas fa-check-circle me-1" aria-hidden="true"></i>
                    RUC válido
                  </div>
                </div>

                <!-- Régimen -->
                <div class="col-md-6">
                  <label class="form-label" for="emp-regimen">Régimen</label>
                  <select
                    id="emp-regimen"
                    class="form-select"
                    v-model="form.regimen"
                    :disabled="guardando"
                  >
                    <option value="RIMPE">RIMPE - Emprendedor</option>
                    <option value="RIMPE_NEGOCIO">RIMPE - Negocio Popular</option>
                    <option value="GENERAL">Régimen General</option>
                    <option value="ESPECIAL">Régimen Especial</option>
                  </select>
                </div>

                <!-- Razón social -->
                <div class="col-md-8">
                  <label class="form-label" for="emp-razon">
                    <span class="text-danger">*</span> Razón Social
                  </label>
                  <input
                    id="emp-razon"
                    type="text"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('razon_social') }"
                    v-model="form.razon_social"
                    placeholder="Nombre legal"
                    maxlength="300"
                    :disabled="guardando"
                    @input="onRazonSocialInput"
                    @blur="touched.razon_social = true"
                  />
                  <div v-if="mostrarError('razon_social')" class="invalid-feedback">
                    {{ errores.razon_social }}
                  </div>
                </div>

                <!-- Nombre comercial -->
                <div class="col-md-4">
                  <label class="form-label" for="emp-nombre-comercial">
                    Nombre comercial
                  </label>
                  <input
                    id="emp-nombre-comercial"
                    type="text"
                    class="form-control"
                    v-model="form.nombre_comercial"
                    placeholder="Cómo se conoce"
                    maxlength="200"
                    :disabled="guardando"
                  />
                </div>

                <!-- Dirección matriz -->
                <div class="col-md-8">
                  <label class="form-label" for="emp-dir-matriz">Dirección Matriz</label>
                  <input
                    id="emp-dir-matriz"
                    type="text"
                    class="form-control"
                    v-model="form.direccion_matriz"
                    placeholder="Dirección principal"
                    maxlength="300"
                    :disabled="guardando"
                  />
                </div>

                <!-- Dirección establecimiento -->
                <div class="col-md-4">
                  <label class="form-label" for="emp-dir-estab">
                    Dirección Sucursal
                  </label>
                  <input
                    id="emp-dir-estab"
                    type="text"
                    class="form-control"
                    v-model="form.direccion_establecimiento"
                    placeholder="Opcional"
                    maxlength="300"
                    :disabled="guardando"
                  />
                </div>

                <!-- Teléfono -->
                <div class="col-md-4">
                  <label class="form-label" for="emp-telefono">Teléfono</label>
                  <input
                    id="emp-telefono"
                    type="text"
                    class="form-control"
                    v-model="form.telefono"
                    placeholder="09XXXXXXXX"
                    maxlength="20"
                    :disabled="guardando"
                  />
                </div>

                <!-- Email -->
                <div class="col-md-4">
                  <label class="form-label" for="emp-email">Email</label>
                  <input
                    id="emp-email"
                    type="email"
                    class="form-control"
                    v-model="form.email"
                    placeholder="contacto@empresa.com"
                    maxlength="200"
                    :disabled="guardando"
                  />
                </div>

                <!-- Ambiente inicial -->
                <div class="col-md-4">
                  <label class="form-label" for="emp-ambiente">Ambiente</label>
                  <select
                    id="emp-ambiente"
                    class="form-select"
                    v-model="form.ambiente"
                    :disabled="guardando"
                  >
                    <option value="1">1 - Pruebas</option>
                    <option value="2">2 - Producción</option>
                  </select>
                </div>
              </div>
            </form>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click="cerrar"
              :disabled="guardando"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="guardar"
              :disabled="guardando || !formularioValido"
            >
              <i
                class="fas fa-save"
                :class="{ 'fa-spin': guardando }"
                aria-hidden="true"
              ></i>
              {{ guardando ? 'Guardando...' : (esEdicion ? 'Guardar cambios' : 'Crear empresa') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useToast } from 'vue-toastification'
import { useEmpresasStore } from '../../stores/empresasStore'
import { validarRUC } from '../../utils/validators'

const props = defineProps({
  empresaAEditar: { type: Object, default: null }
})

const emit = defineEmits(['creada', 'actualizada'])

const toast = useToast()
const empresasStore = useEmpresasStore()

const visible = ref(false)
const guardando = ref(false)
const errorGeneral = ref('')

const form = ref(crearFormVacio())
const errores = ref({ ruc: '', razon_social: '' })
const touched = reactive({ ruc: false, razon_social: false })

let unmounted = false

const esEdicion = computed(() => Boolean(props.empresaAEditar?._id))

const formularioValido = computed(() => {
  return (
    String(form.value.ruc).length === 13 &&
    String(form.value.razon_social).trim().length >= 3 &&
    !errores.value.ruc &&
    !errores.value.razon_social
  )
})

function crearFormVacio() {
  return {
    ruc: '',
    razon_social: '',
    nombre_comercial: '',
    direccion_matriz: '',
    direccion_establecimiento: '',
    telefono: '',
    email: '',
    regimen: 'RIMPE',
    ambiente: '1'
  }
}

const mostrarError = (campo) => Boolean(touched[campo] && errores.value[campo])

// ===== VALIDACIÓN =====
const validarRuc = () => {
  const r = String(form.value.ruc || '').trim()
  if (!r) {
    errores.value.ruc = 'El RUC es obligatorio'
    return false
  }
  if (r.length !== 13) {
    errores.value.ruc = `Debe tener 13 dígitos (tiene ${r.length})`
    return false
  }
  if (!validarRUC(r)) {
    errores.value.ruc = 'RUC inválido (verifique el dígito verificador)'
    return false
  }
  errores.value.ruc = ''
  return true
}

const validarRazonSocial = () => {
  const r = String(form.value.razon_social || '').trim()
  if (!r) {
    errores.value.razon_social = 'La razón social es obligatoria'
    return false
  }
  if (r.length < 3) {
    errores.value.razon_social = 'Mínimo 3 caracteres'
    return false
  }
  errores.value.razon_social = ''
  return true
}

const onRucInput = () => {
  form.value.ruc = String(form.value.ruc || '').replace(/\D/g, '').slice(0, 13)
  if (errores.value.ruc) validarRuc()
}

const onRazonSocialInput = () => {
  if (errores.value.razon_social) validarRazonSocial()
}

// ===== API PÚBLICA =====
const abrir = (empresa = null) => {
  if (empresa && empresa._id) {
    form.value = {
      ruc: empresa.ruc || '',
      razon_social: empresa.razon_social || '',
      nombre_comercial: empresa.nombre_comercial || '',
      direccion_matriz: empresa.direccion_matriz || '',
      direccion_establecimiento: empresa.direccion_establecimiento || '',
      telefono: empresa.telefono || '',
      email: empresa.email || '',
      regimen: empresa.regimen || 'RIMPE',
      ambiente: String(empresa.ambiente || '1')
    }
  } else {
    form.value = crearFormVacio()
  }
  errores.value = { ruc: '', razon_social: '' }
  touched.ruc = false
  touched.razon_social = false
  errorGeneral.value = ''
  visible.value = true
}

const cerrar = () => {
  if (guardando.value) return
  visible.value = false
}

// ===== GUARDAR =====
const guardar = async () => {
  touched.ruc = true
  touched.razon_social = true

  const okRuc = validarRuc()
  const okRazon = validarRazonSocial()

  if (!okRuc || !okRazon) {
    errorGeneral.value = 'Corrige los errores marcados antes de continuar'
    return
  }

  if (guardando.value) return
  guardando.value = true
  errorGeneral.value = ''

  try {
    const payload = {
      ruc: String(form.value.ruc).trim(),
      razon_social: String(form.value.razon_social).trim(),
      nombre_comercial: String(form.value.nombre_comercial || '').trim(),
      direccion_matriz: String(form.value.direccion_matriz || '').trim(),
      direccion_establecimiento: String(form.value.direccion_establecimiento || '').trim(),
      telefono: String(form.value.telefono || '').trim(),
      email: String(form.value.email || '').trim().toLowerCase(),
      regimen: form.value.regimen || 'RIMPE',
      ambiente: String(form.value.ambiente || '1')
    }

    if (esEdicion.value) {
      const res = await empresasStore.actualizarEmpresa(
        props.empresaAEditar._id,
        payload
      )
      if (unmounted) return
      toast.success('Empresa actualizada')
      emit('actualizada', res)
    } else {
      const res = await empresasStore.crearEmpresa(payload)
      if (unmounted) return
      toast.success('Empresa creada')
      emit('creada', res)
    }

    visible.value = false
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'RUC_DUPLICADO') {
      errores.value.ruc = 'Ya existe una empresa con este RUC'
      errorGeneral.value = 'RUC duplicado'
    } else if (codigo === 'VALIDACION') {
      errorGeneral.value = e.message || 'Datos inválidos'
    } else {
      errorGeneral.value = e.message || 'Error al guardar'
    }
    toast.error(errorGeneral.value)
  } finally {
    if (!unmounted) guardando.value = false
  }
}

// ===== ESC cierra =====
const onKeydown = (e) => {
  if (e.key === 'Escape' && visible.value) {
    e.preventDefault()
    cerrar()
  }
}

// ===== Watch body scroll =====
watch(visible, (v) => {
  if (typeof document === 'undefined') return
  if (v) {
    document.addEventListener('keydown', onKeydown)
    document.body.classList.add('modal-open-empresa')
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.classList.remove('modal-open-empresa')
  }
})

onBeforeUnmount(() => {
  unmounted = true
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('modal-open-empresa')
})

defineExpose({ abrir, cerrar })
</script>

<style scoped>
.modal-empresa-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 10450;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: empFadeIn 0.15s ease-out;
  overflow-y: auto;
}

@keyframes empFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-empresa-content {
  border-radius: 16px;
  overflow: hidden;
  border: none;
  box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
  animation: empPop 0.2s ease-out;
  width: 100%;
  max-width: 720px;
  background: var(--bg-card);
}

@keyframes empPop {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-empresa-header {
  background: linear-gradient(135deg, #0f1e35 0%, #1e3a5f 100%);
  color: #fff;
  border: none;
  padding: 18px 24px;
}

.modal-empresa-header .modal-title {
  color: #fff;
  font-weight: 700;
  font-size: 1.05rem;
}

:global(body.modal-open-empresa) {
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .modal-empresa-overlay,
  .modal-empresa-content {
    animation: none;
  }
}
</style>