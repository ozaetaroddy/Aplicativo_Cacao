<template>
  <div class="perfil-page">
    <!-- Header -->
    <div class="perfil-header">
      <div class="perfil-header-icon" aria-hidden="true">
        <i class="fas fa-user-circle"></i>
      </div>
      <div class="perfil-header-text">
        <h1 class="perfil-header-title">Mi Perfil</h1>
        <p class="perfil-header-subtitle">Datos personales y seguridad de tu cuenta</p>
      </div>
    </div>

    <!-- Loading inicial -->
    <div v-if="cargandoInicial" class="loading-card">
      <i class="fas fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
      <p class="mb-0 mt-2 text-muted">Cargando tu perfil…</p>
    </div>

    <div v-else class="perfil-grid">
      <!-- Tarjeta lateral con info del usuario -->
      <aside class="perfil-sidebar">
        <div class="user-card">
          <div class="user-avatar-large" aria-hidden="true">
            {{ getInitials(form.nombre) }}
          </div>
          <div class="user-name">{{ form.nombre || 'Usuario' }}</div>
          <div class="user-email">{{ form.email }}</div>
          <div class="user-role">
            <span class="badge-rol" :class="`badge-rol-${form.rol}`">
              {{ getRolLabel(form.rol) }}
            </span>
          </div>

          <div class="user-stats">
            <div class="user-stat">
              <div class="stat-value">
                <i class="fas fa-check-circle text-success" aria-hidden="true"></i>
              </div>
              <div class="stat-label">Cuenta activa</div>
            </div>
            <div class="user-stat">
              <div class="stat-value">
                <i class="fas fa-shield-alt text-primary" aria-hidden="true"></i>
              </div>
              <div class="stat-label">Seguridad</div>
            </div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-title">
            <i class="fas fa-lightbulb" aria-hidden="true"></i>
            Consejos de seguridad
          </div>
          <ul class="tips-list">
            <li>Usa una contraseña única y segura</li>
            <li>No compartas tu contraseña con nadie</li>
            <li>Cámbiala cada 3 meses</li>
            <li>Verifica tu email y teléfono</li>
          </ul>
        </div>
      </aside>

      <!-- Formulario principal -->
      <main class="perfil-main">
        <form @submit.prevent="guardarPerfil" novalidate>
          <!-- Datos personales -->
          <div class="card-cacao">
            <div class="card-header">
              <i class="fas fa-id-card" aria-hidden="true"></i>
              <span>Datos Personales</span>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <div class="form-field">
                  <label class="form-label" for="perfil-nombre">
                    <span class="text-danger">*</span> Nombre completo
                  </label>
                  <div class="input-wrapper">
                    <i class="fas fa-user input-icon" aria-hidden="true"></i>
                    <input
                      id="perfil-nombre"
                      type="text"
                      class="form-control"
                      :class="{ 'is-invalid': mostrarError('nombre') }"
                      v-model="form.nombre"
                      placeholder="Tu nombre completo"
                      maxlength="100"
                      autocomplete="name"
                      :disabled="cargando"
                      @blur="touched.nombre = true"
                    />
                  </div>
                  <div v-if="mostrarError('nombre')" class="field-error">
                    <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                    {{ errores.nombre }}
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label" for="perfil-email">
                    <span class="text-danger">*</span> Correo electrónico
                  </label>
                  <div class="input-wrapper">
                    <i class="fas fa-envelope input-icon" aria-hidden="true"></i>
                    <input
                      id="perfil-email"
                      type="email"
                      class="form-control"
                      :class="{ 'is-invalid': mostrarError('email') }"
                      v-model="form.email"
                      placeholder="tu@correo.com"
                      maxlength="200"
                      autocomplete="email"
                      :disabled="cargando"
                      @input="onEmailInput"
                      @blur="touched.email = true"
                    />
                  </div>
                  <div v-if="mostrarError('email')" class="field-error">
                    <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                    {{ errores.email }}
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label" for="perfil-telefono">Teléfono</label>
                  <div class="input-wrapper">
                    <i class="fas fa-phone input-icon" aria-hidden="true"></i>
                    <input
                      id="perfil-telefono"
                      type="text"
                      class="form-control"
                      v-model="form.telefono"
                      placeholder="09XXXXXXXX"
                      maxlength="50"
                      autocomplete="tel"
                      :disabled="cargando"
                    />
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label" for="perfil-rol">Rol</label>
                  <div class="input-wrapper">
                    <i class="fas fa-user-tag input-icon" aria-hidden="true"></i>
                    <input
                      id="perfil-rol"
                      type="text"
                      class="form-control"
                      :value="getRolLabel(form.rol)"
                      disabled
                      aria-readonly="true"
                    />
                  </div>
                  <small class="text-muted">
                    El rol solo puede cambiarlo un administrador.
                  </small>
                </div>
              </div>
            </div>
          </div>

          <!-- Cambio de contraseña -->
          <div class="card-cacao">
            <div class="card-header">
              <i class="fas fa-lock" aria-hidden="true"></i>
              <span>Cambiar Contraseña</span>
              <span class="header-hint">(opcional)</span>
            </div>
            <div class="card-body">
              <div class="alert alert-info small mb-3">
                <i class="fas fa-info-circle" aria-hidden="true"></i>
                Solo completa estos campos si deseas cambiar tu contraseña
              </div>

              <div class="form-grid">
                <div class="form-field form-field-full">
                  <label class="form-label" for="pass-actual">Contraseña actual</label>
                  <div class="input-wrapper">
                    <i class="fas fa-key input-icon" aria-hidden="true"></i>
                    <input
                      id="pass-actual"
                      :type="mostrarPasswords.actual ? 'text' : 'password'"
                      class="form-control"
                      :class="{ 'is-invalid': mostrarError('passwordActual') }"
                      v-model="passwords.actual"
                      placeholder="••••••••"
                      autocomplete="current-password"
                      maxlength="200"
                      :disabled="cargando"
                      @blur="touched.passwordActual = true"
                    />
                    <button
                      type="button"
                      class="toggle-pass"
                      @click="mostrarPasswords.actual = !mostrarPasswords.actual"
                      :aria-label="
                        mostrarPasswords.actual ? 'Ocultar contraseña' : 'Mostrar contraseña'
                      "
                      tabindex="-1"
                    >
                      <i
                        :class="
                          mostrarPasswords.actual ? 'fas fa-eye-slash' : 'fas fa-eye'
                        "
                        aria-hidden="true"
                      ></i>
                    </button>
                  </div>
                  <div v-if="mostrarError('passwordActual')" class="field-error">
                    {{ errores.passwordActual }}
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label" for="pass-nueva">Nueva contraseña</label>
                  <div class="input-wrapper">
                    <i class="fas fa-lock input-icon" aria-hidden="true"></i>
                    <input
                      id="pass-nueva"
                      :type="mostrarPasswords.nueva ? 'text' : 'password'"
                      class="form-control"
                      :class="{ 'is-invalid': mostrarError('passwordNueva') }"
                      v-model="passwords.nueva"
                      placeholder="Mínimo 8 caracteres"
                      autocomplete="new-password"
                      maxlength="200"
                      :disabled="cargando"
                      @blur="touched.passwordNueva = true"
                    />
                    <button
                      type="button"
                      class="toggle-pass"
                      @click="mostrarPasswords.nueva = !mostrarPasswords.nueva"
                      :aria-label="
                        mostrarPasswords.nueva ? 'Ocultar contraseña' : 'Mostrar contraseña'
                      "
                      tabindex="-1"
                    >
                      <i
                        :class="
                          mostrarPasswords.nueva ? 'fas fa-eye-slash' : 'fas fa-eye'
                        "
                        aria-hidden="true"
                      ></i>
                    </button>
                  </div>
                  <div v-if="mostrarError('passwordNueva')" class="field-error">
                    {{ errores.passwordNueva }}
                  </div>
                  <small v-else class="form-hint">
                    Mínimo 8 caracteres, con al menos una letra y un número.
                  </small>
                </div>

                <div class="form-field">
                  <label class="form-label" for="pass-confirmar">Confirmar nueva</label>
                  <div class="input-wrapper">
                    <i class="fas fa-lock input-icon" aria-hidden="true"></i>
                    <input
                      id="pass-confirmar"
                      :type="mostrarPasswords.confirmar ? 'text' : 'password'"
                      class="form-control"
                      :class="{ 'is-invalid': mostrarError('passwordConfirmar') }"
                      v-model="passwords.confirmar"
                      placeholder="Repite la contraseña"
                      autocomplete="new-password"
                      maxlength="200"
                      :disabled="cargando"
                      @blur="touched.passwordConfirmar = true"
                    />
                    <button
                      type="button"
                      class="toggle-pass"
                      @click="mostrarPasswords.confirmar = !mostrarPasswords.confirmar"
                      :aria-label="
                        mostrarPasswords.confirmar ? 'Ocultar contraseña' : 'Mostrar contraseña'
                      "
                      tabindex="-1"
                    >
                      <i
                        :class="
                          mostrarPasswords.confirmar ? 'fas fa-eye-slash' : 'fas fa-eye'
                        "
                        aria-hidden="true"
                      ></i>
                    </button>
                  </div>
                  <div v-if="mostrarError('passwordConfirmar')" class="field-error">
                    {{ errores.passwordConfirmar }}
                  </div>
                </div>

                <!-- Indicador de fortaleza -->
                <div v-if="passwords.nueva" class="form-field form-field-full">
                  <label class="form-label">Fortaleza de la contraseña</label>
                  <div class="password-strength">
                    <div class="strength-bar">
                      <div
                        class="strength-fill"
                        :style="{
                          width: `${passwordStrength}%`,
                          background: passwordColor
                        }"
                      ></div>
                    </div>
                    <div class="strength-text" :style="{ color: passwordColor }">
                      {{ passwordStrengthLabel }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Mensajes -->
          <transition name="fade">
            <div
              v-if="errorGeneral"
              class="alert alert-danger"
              role="alert"
              aria-live="polite"
            >
              <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
              {{ errorGeneral }}
            </div>
          </transition>

          <transition name="fade">
            <div
              v-if="mensajeExito"
              class="alert alert-success"
              role="status"
              aria-live="polite"
            >
              <i class="fas fa-check-circle" aria-hidden="true"></i>
              {{ mensajeExito }}
            </div>
          </transition>

          <!-- Acciones -->
          <div class="perfil-actions">
            <button
              type="submit"
              class="btn-save"
              :disabled="cargando || !hayCambios"
            >
              <i
                class="fas fa-save"
                :class="{ 'fa-spin': cargando }"
                aria-hidden="true"
              ></i>
              <span>{{ cargando ? 'Guardando…' : 'Guardar cambios' }}</span>
            </button>
            <router-link to="/" class="btn-cancel">
              <i class="fas fa-times" aria-hidden="true"></i>
              <span>Volver al inicio</span>
            </router-link>
          </div>
        </form>
      </main>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount
} from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useToast } from 'vue-toastification'
import { api } from '../services/api'
import { useAuth } from '../composables/useAuth'

const toast = useToast()
const { user, updateUser } = useAuth()

// ===== STATE =====
const cargando = ref(false)
const cargandoInicial = ref(true)
const errorGeneral = ref('')
const mensajeExito = ref('')

const form = ref({
  nombre: '',
  email: '',
  telefono: '',
  rol: ''
})

// Snapshot para detectar cambios sin guardar
let snapshotInicial = null

const passwords = ref({
  actual: '',
  nueva: '',
  confirmar: ''
})

const mostrarPasswords = ref({
  actual: false,
  nueva: false,
  confirmar: false
})

const errores = ref({
  nombre: '',
  email: '',
  passwordActual: '',
  passwordNueva: '',
  passwordConfirmar: ''
})

const touched = reactive({
  nombre: false,
  email: false,
  passwordActual: false,
  passwordNueva: false,
  passwordConfirmar: false
})

// ===== GUARDS =====
let unmounted = false
let abortController = null
let timerExito = null

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre || typeof nombre !== 'string') return '?'
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

const getRolLabel = (rol) =>
  ({
    admin: 'Administrador',
    contador: 'Contador',
    vendedor: 'Vendedor',
    bodeguero: 'Bodeguero',
    auditor: 'Auditor'
  }[rol] || rol || 'Sin rol')

const mostrarError = (campo) => Boolean(touched[campo] && errores.value[campo])

const onEmailInput = () => {
  form.value.email = String(form.value.email || '').toLowerCase().trim()
}

// ===== FORTALEZA =====
const passwordStrength = computed(() => {
  const p = passwords.value.nueva
  if (!p) return 0
  let score = 0
  if (p.length >= 8) score += 25
  if (p.length >= 12) score += 15
  if (/[a-z]/.test(p)) score += 15
  if (/[A-Z]/.test(p)) score += 15
  if (/[0-9]/.test(p)) score += 15
  if (/[^a-zA-Z0-9]/.test(p)) score += 15
  return Math.min(score, 100)
})

const passwordColor = computed(() => {
  const s = passwordStrength.value
  if (s < 40) return '#e74c3c'
  if (s < 70) return '#f39c12'
  return '#27ae60'
})

const passwordStrengthLabel = computed(() => {
  const s = passwordStrength.value
  if (s < 40) return 'Débil'
  if (s < 70) return 'Aceptable'
  return 'Fuerte'
})

// ===== CAMBIOS =====
const hayCambios = computed(() => {
  if (!snapshotInicial) return false
  const formChanged =
    JSON.stringify({
      nombre: form.value.nombre.trim(),
      email: form.value.email.trim().toLowerCase(),
      telefono: (form.value.telefono || '').trim()
    }) !== snapshotInicial

  const passChanged =
    Boolean(passwords.value.actual) ||
    Boolean(passwords.value.nueva) ||
    Boolean(passwords.value.confirmar)

  return formChanged || passChanged
})

// ===== VALIDACIÓN =====
const validarNombre = () => {
  const v = String(form.value.nombre || '').trim()
  if (!v) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
  if (v.length < 3) {
    errores.value.nombre = 'Mínimo 3 caracteres'
    return false
  }
  if (v.length > 100) {
    errores.value.nombre = 'Máximo 100 caracteres'
    return false
  }
  errores.value.nombre = ''
  return true
}

const validarEmail = () => {
  const v = String(form.value.email || '').trim()
  if (!v) {
    errores.value.email = 'El correo es obligatorio'
    return false
  }
  if (v.length > 200) {
    errores.value.email = 'El correo es demasiado largo'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)) {
    errores.value.email = 'Formato de correo inválido'
    return false
  }
  errores.value.email = ''
  return true
}

const validarPasswords = () => {
  errores.value.passwordActual = ''
  errores.value.passwordNueva = ''
  errores.value.passwordConfirmar = ''

  const intentaCambiar =
    Boolean(passwords.value.nueva) ||
    Boolean(passwords.value.confirmar) ||
    Boolean(passwords.value.actual)

  if (!intentaCambiar) return true

  let ok = true

  if (!passwords.value.actual) {
    errores.value.passwordActual = 'Ingresa tu contraseña actual'
    ok = false
  }
  if (!passwords.value.nueva) {
    errores.value.passwordNueva = 'Ingresa la nueva contraseña'
    ok = false
  } else if (passwords.value.nueva.length < 8) {
    errores.value.passwordNueva = 'Mínimo 8 caracteres'
    ok = false
  } else if (!/[A-Za-z]/.test(passwords.value.nueva)) {
    errores.value.passwordNueva = 'Debe incluir al menos una letra'
    ok = false
  } else if (!/\d/.test(passwords.value.nueva)) {
    errores.value.passwordNueva = 'Debe incluir al menos un número'
    ok = false
  } else if (passwords.value.nueva.length > 200) {
    errores.value.passwordNueva = 'Máximo 200 caracteres'
    ok = false
  }
  if (passwords.value.nueva && passwords.value.confirmar !== passwords.value.nueva) {
    errores.value.passwordConfirmar = 'Las contraseñas no coinciden'
    ok = false
  }

  return ok
}

const validarTodo = () => {
  const okNombre = validarNombre()
  const okEmail = validarEmail()
  const okPass = validarPasswords()
  return okNombre && okEmail && okPass
}

// ===== CARGA INICIAL =====
const cargarPerfil = async () => {
  cargandoInicial.value = true

  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
  }
  abortController = new AbortController()

  try {
    const usuarioDB = await api.request('/auth/perfil', {
      method: 'GET',
      signal: abortController.signal
    })
    if (unmounted) return

    form.value = {
      nombre: usuarioDB?.nombre || '',
      email: (usuarioDB?.email || '').toLowerCase(),
      telefono: usuarioDB?.telefono || '',
      rol: usuarioDB?.rol || 'vendedor'
    }

    // Snapshot inicial
    snapshotInicial = JSON.stringify({
      nombre: form.value.nombre.trim(),
      email: form.value.email.trim().toLowerCase(),
      telefono: form.value.telefono.trim()
    })
  } catch (e) {
    const esAbort = e?.name === 'AbortError'
    if (unmounted || esAbort) return

    console.error('Error cargando perfil:', e)

    // Fallback al usuario en localStorage
    if (user.value) {
      form.value = {
        nombre: user.value.nombre || '',
        email: (user.value.email || '').toLowerCase(),
        telefono: user.value.telefono || '',
        rol: user.value.rol || 'vendedor'
      }
      snapshotInicial = JSON.stringify({
        nombre: form.value.nombre.trim(),
        email: form.value.email.trim().toLowerCase(),
        telefono: form.value.telefono.trim()
      })
    } else {
      errorGeneral.value = 'No se pudo cargar tu perfil. Intenta recargar la página.'
    }
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
}

// ===== GUARDAR =====
const guardarPerfil = async () => {
  if (cargando.value) return

  // Marcar todo como tocado
  for (const k of Object.keys(touched)) touched[k] = true

  if (!validarTodo()) {
    errorGeneral.value = 'Corrige los errores marcados en rojo'
    toast.warning('Corrige los errores antes de guardar')
    return
  }

  errorGeneral.value = ''
  mensajeExito.value = ''
  cargando.value = true

  try {
    const payload = {
      nombre: String(form.value.nombre || '').trim(),
      email: String(form.value.email || '').trim().toLowerCase(),
      telefono: String(form.value.telefono || '').trim()
    }

    if (passwords.value.nueva) {
      payload.password = passwords.value.nueva
      payload.passwordActual = passwords.value.actual
    }

    const res = await api.request('/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify(payload),
      loaderMessage: 'Guardando cambios…'
    })

    if (unmounted) return

    // Actualizar localStorage + composable
    const userData = {
      id: user.value?.id,
      nombre: form.value.nombre.trim(),
      email: form.value.email.trim().toLowerCase(),
      telefono: form.value.telefono.trim(),
      rol: form.value.rol
    }
    try {
      localStorage.setItem('user', JSON.stringify(userData))
    } catch { /* noop */ }
    updateUser(userData)

    // Actualizar snapshot
    snapshotInicial = JSON.stringify({
      nombre: userData.nombre,
      email: userData.email,
      telefono: userData.telefono
    })

    // Limpiar passwords
    passwords.value = { actual: '', nueva: '', confirmar: '' }
    for (const k of Object.keys(touched)) touched[k] = false

    // ¿Requiere re-login por cambio de contraseña?
    if (res?.requiereRelogin) {
      mensajeExito.value = 'Contraseña cambiada. Redirigiendo al login…'
      toast.success('Contraseña cambiada correctamente')
      setTimeout(() => {
        if (!unmounted) window.location.href = '/login'
      }, 2000)
      return
    }

    mensajeExito.value = 'Perfil actualizado correctamente'
    toast.success('Perfil actualizado')

    // Auto-cleanup del mensaje
    if (timerExito) clearTimeout(timerExito)
    timerExito = setTimeout(() => {
      if (!unmounted) mensajeExito.value = ''
      timerExito = null
    }, 4000)
  } catch (e) {
    if (unmounted) return
    const msg = e?.message || 'Error al guardar'
    errorGeneral.value = msg
    toast.error(msg)
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== GUARDS DE NAVEGACIÓN =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave(() => {
  if (!hayCambios.value || cargando.value) return true
  return window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')
})

// ===== LIFECYCLE =====
onMounted(() => {
  cargarPerfil()
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  unmounted = true

  if (abortController) {
    try { abortController.abort() } catch { /* noop */ }
    abortController = null
  }
  if (timerExito) {
    clearTimeout(timerExito)
    timerExito = null
  }

  window.removeEventListener('beforeunload', beforeUnloadHandler)

  // Limpiar datos sensibles
  passwords.value = { actual: '', nueva: '', confirmar: '' }
})
</script>

<style scoped>
.perfil-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* ===== HEADER ===== */
.perfil-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: var(--space-6, 24px);
}

.perfil-header-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md, 12px);
  background: linear-gradient(135deg, var(--primary-color, #2563eb), var(--primary-hover, #1d4ed8));
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  flex-shrink: 0;
  box-shadow: var(--shadow-glow-primary, 0 8px 24px rgba(37, 99, 235, 0.25));
}

.perfil-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.perfil-header-title {
  font-size: clamp(1.25rem, 2.2vw, 1.6rem);
  font-weight: var(--fw-extrabold, 800);
  letter-spacing: var(--ls-tighter, -0.03em);
  color: var(--text-primary, #0f172a);
  line-height: 1.15;
  margin: 0;
}

.perfil-header-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted, #94a3b8);
  font-weight: var(--fw-regular, 400);
  line-height: 1.35;
  margin: 0;
}

/* ===== LOADING ===== */
.loading-card {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-lg, 16px);
  color: var(--text-muted, #94a3b8);
}

/* ===== GRID ===== */
.perfil-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 24px;
  align-items: start;
}

/* ===== SIDEBAR ===== */
.perfil-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 90px;
}

.user-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-lg, 16px);
  padding: 28px 20px;
  text-align: center;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06));
  position: relative;
  overflow: hidden;
}

.user-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(135deg, var(--primary-color, #2563eb), var(--primary-dark, #1e3a8a));
}

.user-avatar-large {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f1c40f, #e67e22);
  color: #fff;
  font-weight: 800;
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  border: 4px solid var(--bg-card, #fff);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 1;
}

.user-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  margin-bottom: 4px;
  overflow-wrap: break-word;
  text-decoration: none;
}

.user-email {
  font-size: 0.82rem;
  color: var(--text-muted, #94a3b8);
  word-break: break-all;
  margin-bottom: 12px;
  text-decoration: none;
}

.user-role {
  margin-bottom: 20px;
  text-decoration: none;
}

.badge-rol {
  display: inline-block;
  padding: 5px 14px;
  border-radius: var(--radius-full, 9999px);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  /* Neutralizar line-through heredado de ancestros o extensiones */
  text-decoration: none !important;
  text-decoration-line: none !important;
}

.badge-rol-admin { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
.badge-rol-contador { background: rgba(52, 152, 219, 0.15); color: #3498db; }
.badge-rol-vendedor { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
.badge-rol-bodeguero { background: rgba(243, 156, 18, 0.15); color: #d68910; }
.badge-rol-auditor { background: rgba(155, 89, 182, 0.15); color: #8e44ad; }

.user-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light, #eef2f7);
}
.user-stat { text-align: center; }
.stat-value { font-size: 1.3rem; margin-bottom: 4px; }
.stat-label {
  font-size: 0.68rem;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

.info-card {
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.05), rgba(241, 196, 15, 0.03));
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--radius-lg, 16px);
  padding: 18px;
}
.info-card-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-primary, #0f172a);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.info-card-title i { color: var(--warning, #f59e0b); }
.tips-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tips-list li {
  font-size: 0.78rem;
  color: var(--text-muted, #94a3b8);
  padding-left: 18px;
  position: relative;
  line-height: 1.4;
}
.tips-list li::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: var(--primary-color, #2563eb);
  font-weight: 700;
}

/* ===== FORMULARIO ===== */
.perfil-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #94a3b8);
  font-weight: 400;
  margin-left: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.form-field-full {
  grid-column: 1 / -1;
}

.form-control {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-md, 12px);
  background: var(--bg-input, #fff);
  color: var(--text-primary, #0f172a);
  font-size: 0.9rem;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms);
  outline: none;
}
.form-control:focus {
  border-color: var(--primary-color, #2563eb);
  box-shadow: 0 0 0 4px var(--shadow-focus, rgba(37, 99, 235, 0.18));
  background: var(--bg-card, #fff);
}
.form-control.is-invalid {
  border-color: #e74c3c;
}
.form-control.is-invalid:focus {
  box-shadow: 0 0 0 4px rgba(231, 76, 60, 0.15);
}
.form-control:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 14px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.85rem;
  pointer-events: none;
  transition: color var(--transition-fast, 150ms);
}
.input-wrapper:focus-within .input-icon {
  color: var(--primary-color, #2563eb);
}
.input-wrapper .form-control {
  padding-left: 42px;
}
.toggle-pass {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all var(--transition-fast, 150ms);
  display: flex;
  align-items: center;
  justify-content: center;
}
.toggle-pass:hover {
  color: var(--primary-color, #2563eb);
  background: var(--bg-table-stripe, #f8fafc);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #e74c3c;
  font-weight: 500;
  margin-top: 2px;
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #94a3b8);
  margin-top: 4px;
  line-height: 1.4;
}

/* ===== FORTALEZA ===== */
.password-strength {
  display: flex;
  align-items: center;
  gap: 12px;
}
.strength-bar {
  flex: 1;
  height: 6px;
  background: var(--border-light, #eef2f7);
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
}
.strength-fill {
  height: 100%;
  border-radius: inherit;
  transition: all 0.3s ease;
}
.strength-text {
  font-size: 0.75rem;
  font-weight: 700;
  min-width: 70px;
  text-align: right;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* ===== BOTONES ===== */
.perfil-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 8px;
}

.btn-save,
.btn-cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: var(--radius-md, 12px);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--transition, 250ms);
  border: none;
  font-family: inherit;
}

.btn-save {
  background: linear-gradient(135deg, var(--success, #10b981), #1e8449);
  color: #fff;
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
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
  background: var(--bg-card, #fff);
  border: 1.5px solid var(--border-color, #e2e8f0);
  color: var(--text-secondary, #475569);
}
.btn-cancel:hover {
  background: var(--bg-table-stripe, #f8fafc);
  color: var(--text-primary, #0f172a);
}

/* ===== TRANSICIONES ===== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 992px) {
  .perfil-grid {
    grid-template-columns: 1fr;
  }
  .perfil-sidebar {
    position: static;
  }
}

@media (max-width: 576px) {
  .perfil-header-icon {
    width: 44px;
    height: 44px;
    font-size: 1.15rem;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .user-avatar-large {
    width: 72px;
    height: 72px;
    font-size: 1.5rem;
  }
  .btn-save,
  .btn-cancel {
    width: 100%;
  }
  .perfil-actions {
    flex-direction: column;
  }
}

/* ===== ACCESIBILIDAD ===== */
@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
  }
}
</style>