<template>
  <div class="entity-form">
    <!-- HEADER -->
    <div class="form-header">
      <div class="header-left">
        <button
          type="button"
          class="btn-back"
          @click="volver"
          :disabled="cargando"
        >
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon" :class="id ? 'title-icon-edit' : 'title-icon-create'">
              <i :class="id ? 'fas fa-user-edit' : 'fas fa-user-plus'"></i>
            </span>
            {{ id ? 'Editar Cliente' : 'Nuevo Cliente' }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Modifica los datos del cliente' : 'Registra un nuevo cliente en el sistema' }}
          </p>
        </div>
      </div>
      <div class="header-actions">
        <div class="header-status" :class="{ complete: formularioValido }">
          <i :class="formularioValido ? 'fas fa-check-circle' : 'fas fa-circle'"></i>
          <span>{{ formularioValido ? 'Listo para guardar' : 'Complete los campos' }}</span>
        </div>
      </div>
    </div>

    <!-- LOADING INICIAL -->
    <div v-if="cargandoInicial" class="loading-state">
      <div class="spinner-lg"></div>
      <p>Cargando cliente...</p>
    </div>

    <form v-else @submit.prevent="guardar" novalidate>
      <div class="form-single">
        <!-- SECCIÓN 1: Identificación -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">1</div>
            <div class="section-header-content">
              <h2 class="section-title">Identificación</h2>
              <p class="section-desc">RUC o cédula del cliente</p>
            </div>
          </header>
          <div class="section-body">
            <div class="id-row">
              <div class="form-field id-field">
                <label class="form-label" for="cli-ruc">
                  <span class="required">*</span> RUC / Cédula
                </label>
                <input
                  id="cli-ruc"
                  type="text"
                  class="form-control form-control-lg"
                  :class="{ 'is-invalid': mostrarError('ruc') }"
                  v-model="form.ruc"
                  placeholder="10 o 13 dígitos"
                  maxlength="13"
                  inputmode="numeric"
                  :disabled="cargando"
                  @input="onRucInput"
                  @blur="touched.ruc = true"
                />
                <div v-if="mostrarError('ruc')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.ruc }}
                </div>
                <div
                  v-else-if="form.ruc && form.ruc.length >= 10 && !errores.ruc"
                  class="field-success"
                >
                  <i class="fas fa-check-circle"></i>
                  {{ tipoIdentificacion }} válido
                </div>
              </div>
              <button
                type="button"
                class="btn-lookup"
                @click="buscarPorIdentificacion"
                :disabled="buscando || cargando || !puedeConsultar"
                :title="!puedeConsultar ? 'Ingrese una cédula (10 dígitos) válida para consultar' : 'Buscar nombre por cédula'"
              >
                <i class="fas fa-search" :class="{ 'fa-spin': buscando }"></i>
                <span>{{ buscando ? 'Buscando...' : 'Buscar datos' }}</span>
              </button>
            </div>
            <div class="hint-row">
              <i class="fas fa-info-circle"></i>
              <span>
                Ingrese RUC (13 dígitos, termina en 001) o Cédula (10 dígitos)
                válidos según el SRI. La búsqueda de datos solo funciona con cédulas.
              </span>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 2: Datos personales -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">2</div>
            <div class="section-header-content">
              <h2 class="section-title">Datos del cliente</h2>
              <p class="section-desc">Información personal o de la empresa</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-3-1">
              <div class="form-field">
                <label class="form-label" for="cli-nombre">
                  <span class="required">*</span> Nombre / Razón Social
                </label>
                <input
                  id="cli-nombre"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': mostrarError('nombre') }"
                  v-model="form.nombre"
                  placeholder="Juan Pérez o Empresa S.A."
                  maxlength="150"
                  :disabled="cargando"
                  @input="onNombreInput"
                  @blur="touched.nombre = true"
                />
                <div v-if="mostrarError('nombre')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.nombre }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="cli-tipo">Tipo</label>
                <select
                  id="cli-tipo"
                  class="form-select"
                  v-model="form.tipo"
                  :disabled="cargando"
                >
                  <option value="persona">Persona Natural</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 3: Contacto -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">3</div>
            <div class="section-header-content">
              <h2 class="section-title">Información de contacto</h2>
              <p class="section-desc">Cómo contactar al cliente</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label" for="cli-tel">
                  <span class="required">*</span> Teléfono
                </label>
                <div class="input-with-icon">
                  <i class="fas fa-phone input-icon"></i>
                  <input
                    id="cli-tel"
                    type="text"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('telefono') }"
                    v-model="form.telefono"
                    placeholder="09XXXXXXXX"
                    maxlength="10"
                    inputmode="numeric"
                    :disabled="cargando"
                    @input="onTelefonoInput"
                    @blur="touched.telefono = true"
                  />
                </div>
                <div v-if="mostrarError('telefono')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.telefono }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="cli-email">
                  <span class="required">*</span> Email
                </label>
                <div class="input-with-icon">
                  <i class="fas fa-envelope input-icon"></i>
                  <input
                    id="cli-email"
                    type="email"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('email') }"
                    v-model="form.email"
                    placeholder="correo@ejemplo.com"
                    maxlength="200"
                    :disabled="cargando"
                    @input="onEmailInput"
                    @blur="touched.email = true"
                  />
                </div>
                <div v-if="mostrarError('email')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.email }}
                </div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label class="form-label" for="cli-dir">Dirección</label>
                <div class="input-with-icon">
                  <i class="fas fa-map-marker-alt input-icon"></i>
                  <input
                    id="cli-dir"
                    type="text"
                    class="form-control"
                    v-model="form.direccion"
                    placeholder="Dirección completa"
                    maxlength="300"
                    :disabled="cargando"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ERROR -->
        <transition name="fade">
          <div v-if="errorGeneral" class="error-banner">
            <i class="fas fa-exclamation-circle"></i>
            <span>{{ errorGeneral }}</span>
          </div>
        </transition>

        <!-- ACCIONES -->
        <div class="form-actions-footer">
          <button
            type="button"
            class="btn-cancel"
            @click="volver"
            :disabled="cargando"
          >
            <i class="fas fa-times"></i>
            <span>Cancelar</span>
          </button>
          <button
            type="submit"
            class="btn-save"
            :disabled="cargando || !formularioValido"
          >
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>
              {{ cargando ? 'Guardando...' : (id ? 'Guardar cambios' : 'Crear cliente') }}
            </span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { validarIdentificacion, validarTelefono as validarTelefonoUtil } from '../../utils/validators'

const toast = useToast()
const route = useRoute()
const router = useRouter()

// ===== STATE =====
const id = route.params.id || null
const cargandoInicial = ref(Boolean(id))
const cargando = ref(false)
const buscando = ref(false)
const errorGeneral = ref('')

const form = ref({
  ruc: '',
  nombre: '',
  tipo: 'persona',
  telefono: '',
  email: '',
  direccion: ''
})
const formOriginal = ref(null)

const errores = ref({ ruc: '', nombre: '', telefono: '', email: '' })
const touched = reactive({
  ruc: false,
  nombre: false,
  telefono: false,
  email: false
})

// Debounce timers
const debounceTimers = {}
let unmounted = false

// ===== COMPUTED =====
const tipoIdentificacion = computed(() => {
  const len = String(form.value.ruc || '').replace(/\D/g, '').length
  if (len === 13) return 'RUC'
  if (len === 10) return 'Cédula'
  return 'Identificación'
})

/** Solo se puede consultar el servicio externo con cédula (10 dígitos). */
const puedeConsultar = computed(() => {
  const limpio = String(form.value.ruc || '').replace(/\D/g, '')
  return limpio.length === 10 && !errores.value.ruc
})

const formularioValido = computed(() => {
  const ruc = String(form.value.ruc || '').trim()
  const nombre = String(form.value.nombre || '').trim()
  const tel = String(form.value.telefono || '').trim()
  const email = String(form.value.email || '').trim()
  return (
    ruc.length >= 10 &&
    nombre.length >= 3 &&
    tel.length >= 10 &&
    email.length > 0 &&
    !errores.value.ruc &&
    !errores.value.nombre &&
    !errores.value.telefono &&
    !errores.value.email
  )
})

const hayCambios = computed(() => {
  if (!formOriginal.value) return false
  return JSON.stringify(form.value) !== JSON.stringify(formOriginal.value)
})

// ===== HELPERS =====
const mostrarError = (campo) => Boolean(touched[campo] && errores.value[campo])

const debounce = (key, fn, ms = 300) => {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key]
    fn()
  }, ms)
}

// ===== VALIDACIONES =====
const validarRuc = () => {
  const r = String(form.value.ruc || '').trim()
  if (!r) {
    errores.value.ruc = 'El RUC/Cédula es obligatorio'
    return false
  }
  const resultado = validarIdentificacion(r)
  errores.value.ruc = resultado.valido ? '' : (resultado.mensaje || 'Identificación inválida')
  return resultado.valido
}

const validarNombre = () => {
  const n = String(form.value.nombre || '').trim()
  if (!n) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
  if (n.length < 3) {
    errores.value.nombre = 'Mínimo 3 caracteres'
    return false
  }
  if (n.length > 150) {
    errores.value.nombre = 'Máximo 150 caracteres'
    return false
  }
  // Acepta letras (con acentos), números, espacios y puntuación común
  const regex = /^[\p{L}\p{N}\s.,'&()#°/+-]{3,150}$/u
  if (!regex.test(n)) {
    errores.value.nombre = 'Contiene caracteres no permitidos'
    return false
  }
  errores.value.nombre = ''
  return true
}

const validarTelefono = () => {
  const t = String(form.value.telefono || '').trim()
  if (!t) {
    errores.value.telefono = 'El teléfono es obligatorio'
    return false
  }
  const r = validarTelefonoUtil(t)
  errores.value.telefono = r.valido ? '' : (r.mensaje || 'Teléfono inválido (09XXXXXXXX o 0XXXXXXXXX)')
  return r.valido
}

const validarEmail = () => {
  const e = String(form.value.email || '').trim()
  if (!e) {
    errores.value.email = 'El email es obligatorio'
    return false
  }
  if (e.length > 200) {
    errores.value.email = 'Email demasiado largo'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(e)) {
    errores.value.email = 'Email inválido'
    return false
  }
  errores.value.email = ''
  return true
}

// ===== INPUT HANDLERS =====
const onRucInput = () => {
  form.value.ruc = String(form.value.ruc || '').replace(/\D/g, '').slice(0, 13)
  debounce('ruc', validarRuc, 400)
}
const onNombreInput = () => debounce('nombre', validarNombre, 400)
const onTelefonoInput = () => {
  form.value.telefono = String(form.value.telefono || '').replace(/\D/g, '').slice(0, 10)
  debounce('telefono', validarTelefono, 400)
}
const onEmailInput = () => {
  form.value.email = String(form.value.email || '').trim().toLowerCase()
  debounce('email', validarEmail, 400)
}

// ===== NAVEGACIÓN =====
const volver = () => {
  if (cargando.value) return
  if (hayCambios.value) {
    if (!window.confirm('Hay cambios sin guardar. ¿Salir de todas formas?')) return
  }
  router.push('/clientes')
}

// ===== CARGA INICIAL =====
const cargarCliente = async () => {
  if (!id) {
    formOriginal.value = JSON.parse(JSON.stringify(form.value))
    return
  }
  cargandoInicial.value = true
  try {
    const data = await api.request(`/clientes/${id}`, {
      method: 'GET',
      loaderMessage: 'Cargando cliente...'
    })
    if (unmounted) return

    if (!data || !data._id) {
      errorGeneral.value = 'Cliente no encontrado'
      return
    }

    form.value = {
      ruc: data.ruc || '',
      nombre: data.nombre || '',
      tipo: data.tipo || 'persona',
      telefono: data.telefono || '',
      email: data.email || '',
      direccion: data.direccion || ''
    }
    formOriginal.value = JSON.parse(JSON.stringify(form.value))

    // Validar en limpio (sin marcar como tocados)
    validarRuc()
    validarNombre()
    validarTelefono()
    validarEmail()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'CLIENTE_NOT_FOUND' || codigo === 'ID_INVALIDO') {
      errorGeneral.value = 'Cliente no encontrado'
    } else {
      errorGeneral.value = 'Error al cargar: ' + e.message
      toast.error('Error al cargar el cliente')
    }
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
}

// ===== CONSULTA EXTERNA =====
const buscarPorIdentificacion = async () => {
  if (!puedeConsultar.value) return
  if (!validarRuc()) return

  buscando.value = true
  try {
    const data = await api.request(
      `/consultas/cedula/${form.value.ruc.trim()}`,
      { method: 'GET', skipLoader: true }
    )
    if (unmounted) return

    if (data?.nombre) {
      form.value.nombre = data.nombre
      validarNombre()
      toast.success('Datos encontrados y cargados')
    } else {
      toast.info('No se encontró el nombre. Ingréselo manualmente.')
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'CIRCUIT_OPEN' || /circuit/i.test(e.message || '')) {
      toast.warning('Servicio de consultas temporalmente no disponible')
    } else if (codigo === 'SIN_RESULTADO' || /no se encontró/i.test(e.message || '')) {
      toast.info('No se encontró información para esta cédula')
    } else if (codigo === 'CEDULA_INVALIDA' || codigo === 'CEDULA_FORMATO') {
      toast.error('Cédula inválida')
    } else if (codigo === 'RATE_LIMIT') {
      toast.warning('Demasiadas consultas. Espere un momento.')
    } else if (codigo === 'TIMEOUT_EXTERNO') {
      toast.error('El servicio externo tardó demasiado en responder')
    } else {
      toast.error('Error al consultar: ' + e.message)
    }
  } finally {
    if (!unmounted) buscando.value = false
  }
}

// ===== GUARDAR =====
const guardar = async () => {
  // Marcar todos los campos como tocados para mostrar errores
  touched.ruc = true
  touched.nombre = true
  touched.telefono = true
  touched.email = true

  const okRuc = validarRuc()
  const okNombre = validarNombre()
  const okTelefono = validarTelefono()
  const okEmail = validarEmail()

  if (!okRuc || !okNombre || !okTelefono || !okEmail) {
    errorGeneral.value = 'Corrige los errores marcados antes de guardar'
    toast.warning('Verifica los datos del formulario')
    return
  }
  if (cargando.value) return

  errorGeneral.value = ''
  cargando.value = true

  try {
    const datos = {
      ruc: String(form.value.ruc || '').trim(),
      nombre: String(form.value.nombre || '').trim(),
      tipo: form.value.tipo || 'persona',
      telefono: String(form.value.telefono || '').trim(),
      email: String(form.value.email || '').trim().toLowerCase(),
      direccion: String(form.value.direccion || '').trim()
    }

    if (id) {
      await api.request(`/clientes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(datos),
        loaderMessage: 'Guardando cambios...'
      })
      if (unmounted) return
      toast.success('Cliente actualizado correctamente')
    } else {
      await api.request('/clientes', {
        method: 'POST',
        body: JSON.stringify(datos),
        loaderMessage: 'Creando cliente...'
      })
      if (unmounted) return
      toast.success('Cliente creado correctamente')
    }

    formOriginal.value = JSON.parse(JSON.stringify(form.value))
    router.push('/clientes')
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'CLIENTE_DUPLICADO' || codigo === 'DUPLICADO') {
      errores.value.ruc = 'Ya existe un cliente con ese RUC'
      errorGeneral.value = e.message || 'Cliente duplicado'
      toast.error('Ya existe un cliente con ese RUC')
    } else if (codigo === 'CLIENTE_NOT_FOUND') {
      errorGeneral.value = 'Cliente no encontrado'
      toast.error('El cliente ya no existe')
    } else if (codigo === 'VALIDACION') {
      errorGeneral.value = e.message || 'Datos inválidos'
      toast.error(e.message || 'Datos inválidos')
    } else {
      errorGeneral.value = 'Error al guardar: ' + e.message
      toast.error('Error: ' + e.message)
    }
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== PREVENIR SALIDA =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// ===== LIFECYCLE =====
onMounted(async () => {
  await cargarCliente()
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  unmounted = true
  window.removeEventListener('beforeunload', beforeUnloadHandler)

  // Limpiar todos los timers de debounce
  for (const k of Object.keys(debounceTimers)) {
    clearTimeout(debounceTimers[k])
    delete debounceTimers[k]
  }
})
</script>

<style scoped>
.entity-form {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 0 40px;
}

/* HEADER */
.form-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}
.btn-back {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: all var(--transition);
  flex-shrink: 0;
}
.btn-back:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateX(-3px);
}
.btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

.form-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 4px;
}
.title-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}
.title-icon-create {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  box-shadow: 0 6px 16px rgba(39, 174, 96, 0.3);
}
.title-icon-edit {
  background: linear-gradient(135deg, #3498db, #2980b9);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
}
.form-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}

.header-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  transition: all var(--transition);
}
.header-status i { font-size: 0.65rem; }
.header-status.complete { background: var(--success-bg); color: var(--success); }

/* LOADING */
.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.spinner-lg {
  width: 44px;
  height: 44px;
  margin: 0 auto 14px;
  border: 4px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* FORM */
.form-single { display: flex; flex-direction: column; gap: 20px; }

.form-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
  border-bottom: 1px solid var(--border-light);
}
.section-number {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
}
.section-header-content { flex: 1; }
.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px;
}
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.section-body { padding: 24px; }

.id-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.id-field { flex: 1; min-width: 200px; }

.btn-lookup {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
  height: 46px;
  flex-shrink: 0;
}
.btn-lookup:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
}
.btn-lookup:disabled { opacity: 0.5; cursor: not-allowed; }

.hint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--info-bg);
  border-radius: var(--radius-md);
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.hint-row i { color: var(--info); flex-shrink: 0; }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-row.cols-3-1 { grid-template-columns: 3fr 1fr; }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-control,
.form-select {
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  transition: all var(--transition-fast);
  outline: none;
}
.form-control-lg { padding: 14px 18px; font-size: 1rem; font-weight: 600; }
.form-control:focus,
.form-select:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--shadow-focus);
  background: var(--bg-card);
}
.form-control.is-invalid { border-color: var(--danger); }
.form-control:disabled,
.form-select:disabled { opacity: 0.6; cursor: not-allowed; }

.input-with-icon { position: relative; }
.input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
}
.input-with-icon .form-control { padding-left: 42px; }

.field-error,
.field-success {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  margin-top: 2px;
}
.field-error { color: var(--danger); }
.field-success { color: var(--success); }

.error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--danger-bg);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-left: 4px solid var(--danger);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-weight: 500;
  font-size: 0.88rem;
}

.form-actions-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 28px;
  background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
  font-family: inherit;
}
.btn-save:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(39, 174, 96, 0.4);
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-cancel {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  text-decoration: none;
  transition: all var(--transition);
  cursor: pointer;
  font-family: inherit;
}
.btn-cancel:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg);
}
.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@media (max-width: 576px) {
  .form-row.cols-2,
  .form-row.cols-3-1 { grid-template-columns: 1fr; }
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
  .id-row { flex-direction: column; }
  .btn-lookup { width: 100%; justify-content: center; }
  .form-actions-footer { flex-direction: column-reverse; }
  .btn-save, .btn-cancel { width: 100%; justify-content: center; }
}
</style>