<template>
  <div class="entity-form">
    <!-- HEADER -->
    <div class="form-header">
      <div class="header-left">
        <button type="button" class="btn-back" @click="$router.push('/clientes')">
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

    <form @submit.prevent="guardar" novalidate>
      <div class="form-single">
        <!-- SECCIÓN: Identificación -->
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
                <label class="form-label"><span class="required">*</span> RUC / Cédula</label>
                <input
                  type="text"
                  class="form-control form-control-lg"
                  :class="{ 'is-invalid': errores.ruc }"
                  v-model="form.ruc"
                  placeholder="10 o 13 dígitos"
                  maxlength="13"
                  @input="validarRuc"
                  @blur="validarRuc"
                />
                <div v-if="errores.ruc" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.ruc }}
                </div>
                <div v-else-if="form.ruc && !errores.ruc" class="field-success">
                  <i class="fas fa-check-circle"></i> Formato válido
                </div>
              </div>
              <button
                type="button"
                class="btn-lookup"
                @click="buscarPorIdentificacion"
                :disabled="buscando || !form.ruc || !!errores.ruc"
              >
                <i class="fas fa-search" :class="{ 'fa-spin': buscando }"></i>
                <span>{{ buscando ? 'Buscando...' : 'Buscar datos' }}</span>
              </button>
            </div>
            <div class="hint-row">
              <i class="fas fa-info-circle"></i>
              <span>Ingrese RUC (13 dígitos) o Cédula (10 dígitos) válidos según el SRI</span>
            </div>
          </div>
        </section>

        <!-- SECCIÓN: Datos personales -->
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
                <label class="form-label"><span class="required">*</span> Nombre / Razón Social</label>
                <input
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errores.nombre }"
                  v-model="form.nombre"
                  @input="validarNombre"
                  placeholder="Juan Pérez o Empresa S.A."
                />
                <div v-if="errores.nombre" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.nombre }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Tipo</label>
                <select class="form-select" v-model="form.tipo">
                  <option value="persona">Persona Natural</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN: Contacto -->
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
                <label class="form-label"><span class="required">*</span> Teléfono</label>
                <div class="input-with-icon">
                  <i class="fas fa-phone input-icon"></i>
                  <input
                    type="text"
                    class="form-control"
                    :class="{ 'is-invalid': errores.telefono }"
                    v-model="form.telefono"
                    @input="validarTelefono"
                    placeholder="09XXXXXXXX"
                  />
                </div>
                <div v-if="errores.telefono" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.telefono }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label"><span class="required">*</span> Email</label>
                <div class="input-with-icon">
                  <i class="fas fa-envelope input-icon"></i>
                  <input
                    type="email"
                    class="form-control"
                    :class="{ 'is-invalid': errores.email }"
                    v-model="form.email"
                    @input="validarEmail"
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div v-if="errores.email" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.email }}
                </div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label class="form-label">Dirección</label>
                <div class="input-with-icon">
                  <i class="fas fa-map-marker-alt input-icon"></i>
                  <input type="text" class="form-control" v-model="form.direccion" placeholder="Dirección completa" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ERRORES -->
        <transition name="fade">
          <div v-if="errorGeneral" class="error-banner">
            <i class="fas fa-exclamation-circle"></i>
            <span>{{ errorGeneral }}</span>
          </div>
        </transition>

        <!-- ACCIONES -->
        <div class="form-actions-footer">
          <button type="submit" class="btn-save" :disabled="cargando || !formularioValido">
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>{{ cargando ? 'Guardando...' : (id ? 'Guardar cambios' : 'Crear cliente') }}</span>
          </button>
          <router-link to="/clientes" class="btn-cancel">
            <i class="fas fa-times"></i>
            <span>Cancelar</span>
          </router-link>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { validarIdentificacion } from '../../utils/validators'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()

const id = route.params.id
const buscando = ref(false)
const cargando = ref(false)
const errorGeneral = ref('')

const form = ref({
  ruc: '',
  nombre: '',
  tipo: 'persona',
  telefono: '',
  email: '',
  direccion: ''
})

const errores = ref({ ruc: '', nombre: '', telefono: '', email: '' })

const validarRuc = () => {
  const resultado = validarIdentificacion(form.value.ruc)
  errores.value.ruc = resultado.valido ? '' : resultado.mensaje
  return resultado.valido
}

const validarNombre = () => {
  const n = form.value.nombre?.trim() || ''
  if (!n) { errores.value.nombre = 'El nombre es obligatorio'; return false }
  if (n.length < 3) { errores.value.nombre = 'Mínimo 3 caracteres'; return false }
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/.test(n)) { errores.value.nombre = 'Solo letras y puntos'; return false }
  errores.value.nombre = ''
  return true
}

const validarTelefono = () => {
  const t = form.value.telefono?.trim() || ''
  if (!t) { errores.value.telefono = 'El teléfono es obligatorio'; return false }
  if (!/^09\d{8}$/.test(t)) { errores.value.telefono = 'Debe ser 09XXXXXXXX'; return false }
  errores.value.telefono = ''
  return true
}

const validarEmail = () => {
  const e = form.value.email?.trim() || ''
  if (!e) { errores.value.email = 'El email es obligatorio'; return false }
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(e)) { errores.value.email = 'Email inválido'; return false }
  errores.value.email = ''
  return true
}

const formularioValido = computed(() => {
  return validarRuc() && validarNombre() && validarTelefono() && validarEmail()
})

onMounted(async () => {
  if (id) {
    try {
      const data = await findById('clientes', id)
      if (data) {
        form.value = data
        validarRuc(); validarNombre(); validarTelefono(); validarEmail()
      } else {
        errorGeneral.value = 'No se encontró el cliente'
      }
    } catch (e) {
      errorGeneral.value = 'Error al cargar: ' + e.message
    }
  }
})

const buscarPorIdentificacion = async () => {
  if (!validarRuc()) return
  buscando.value = true
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/consultas/cedula/${form.value.ruc.trim()}`)
    if (!response.ok) throw new Error('No se encontraron datos')
    const data = await response.json()
    if (data.nombre) {
      form.value.nombre = data.nombre
      validarNombre()
      toast.success('Datos encontrados y cargados')
    } else {
      toast.info('No se encontró nombre, ingréselo manualmente')
    }
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    buscando.value = false
  }
}

const guardar = async () => {
  if (!formularioValido.value) {
    errorGeneral.value = 'Corrija los errores marcados'
    toast.warning('Verifica los datos')
    return
  }
  errorGeneral.value = ''
  cargando.value = true

  try {
    const datos = {
      ruc: form.value.ruc.trim(),
      nombre: form.value.nombre.trim(),
      tipo: form.value.tipo,
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim(),
      direccion: form.value.direccion?.trim() || ''
    }
    if (id) {
      await updateOne('clientes', id, datos)
      toast.success('Cliente actualizado correctamente')
    } else {
      await insertOne('clientes', datos)
      toast.success('Cliente creado correctamente')
    }
    router.push('/clientes')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.entity-form { max-width: 900px; margin: 0 auto; padding: 0 0 40px; }

.form-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 20px; margin-bottom: 24px; flex-wrap: wrap;
}
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.btn-back {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; transition: all var(--transition); flex-shrink: 0;
}
.btn-back:hover { border-color: var(--primary-color); color: var(--primary-color); transform: translateX(-3px); }

.form-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800; color: var(--text-primary);
  letter-spacing: -0.03em; display: flex; align-items: center;
  gap: 12px; margin: 0 0 4px;
}
.title-icon {
  width: 42px; height: 42px; border-radius: 12px;
  color: #fff; display: flex; align-items: center; justify-content: center;
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
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.header-status {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: var(--radius-full);
  background: var(--bg-table-stripe); color: var(--text-muted);
  font-size: 0.78rem; font-weight: 600;
  transition: all var(--transition);
}
.header-status i { font-size: 0.65rem; }
.header-status.complete {
  background: var(--success-bg); color: var(--success);
}

.form-single { display: flex; flex-direction: column; gap: 20px; }

.form-section {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); overflow: hidden;
}

.section-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
  border-bottom: 1px solid var(--border-light);
}
.section-number {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.9rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
}
.section-header-content { flex: 1; }
.section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.section-body { padding: 24px; }

.id-row {
  display: flex; gap: 12px; align-items: flex-start;
  margin-bottom: 12px; flex-wrap: wrap;
}
.id-field { flex: 1; min-width: 200px; }

.btn-lookup {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px; background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff; border: none; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.88rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
  height: 46px; flex-shrink: 0;
}
.btn-lookup:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
}
.btn-lookup:disabled { opacity: 0.5; cursor: not-allowed; }

.hint-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--info-bg);
  border-radius: var(--radius-md); font-size: 0.78rem;
  color: var(--text-secondary);
}
.hint-row i { color: var(--info); }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-row.cols-3-1 { grid-template-columns: 3fr 1fr; }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-control, .form-select {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-input);
  color: var(--text-primary); font-size: 0.9rem; font-family: inherit;
  transition: all var(--transition-fast); outline: none;
}
.form-control-lg { padding: 14px 18px; font-size: 1rem; font-weight: 600; }
.form-control:focus, .form-select:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--shadow-focus);
  background: var(--bg-card);
}
.form-control.is-invalid { border-color: var(--danger); }

.input-with-icon { position: relative; }
.input-icon {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); font-size: 0.85rem; pointer-events: none;
}
.input-with-icon .form-control { padding-left: 42px; }

.field-error, .field-success {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.75rem; font-weight: 500;
  margin-top: 2px;
}
.field-error { color: var(--danger); }
.field-success { color: var(--success); }

.error-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: var(--danger-bg);
  border: 1px solid rgba(231, 76, 60, 0.3); border-left: 4px solid var(--danger);
  border-radius: var(--radius-md); color: var(--danger);
  font-weight: 500; font-size: 0.88rem;
}

.form-actions-footer {
  display: flex; gap: 12px; justify-content: flex-end;
  padding: 20px; background: var(--bg-card);
  border: 1px solid var(--border-color); border-radius: var(--radius-lg);
}

.btn-save {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 28px;
  background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff; border: none; border-radius: var(--radius-md);
  font-weight: 700; font-size: 0.92rem; cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3); font-family: inherit;
}
.btn-save:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(39, 174, 96, 0.4); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.btn-cancel {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; background: var(--bg-card);
  border: 1.5px solid var(--border-color); color: var(--text-secondary);
  border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem;
  text-decoration: none; transition: all var(--transition);
}
.btn-cancel:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 576px) {
  .form-row.cols-2, .form-row.cols-3-1 { grid-template-columns: 1fr; }
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