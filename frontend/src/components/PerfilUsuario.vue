<template>
  <div class="perfil-page">
    <!-- Header -->
    <div class="perfil-header">
      <h1 class="section-title">
        <i class="fas fa-user-circle"></i>
        Mi Perfil
      </h1>
    </div>

    <div class="perfil-grid">
      <!-- Tarjeta lateral con info del usuario -->
      <aside class="perfil-sidebar">
        <div class="user-card">
          <div class="user-avatar-large">
            {{ getInitials(form.nombre) }}
          </div>
          <div class="user-name">{{ form.nombre || 'Usuario' }}</div>
          <div class="user-email">{{ form.email }}</div>
          <div class="user-role">
            <span class="badge-rol" :class="`badge-rol-${form.rol}`">
              {{ form.rol || 'Sin rol' }}
            </span>
          </div>

          <div class="user-stats">
            <div class="user-stat">
              <div class="stat-value"><i class="fas fa-check-circle text-success"></i></div>
              <div class="stat-label">Cuenta activa</div>
            </div>
            <div class="user-stat">
              <div class="stat-value"><i class="fas fa-shield-alt text-primary"></i></div>
              <div class="stat-label">2FA disponible</div>
            </div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-title">
            <i class="fas fa-lightbulb"></i>
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
        <!-- Datos personales -->
        <div class="card-cacao">
          <div class="card-header">
            <i class="fas fa-id-card"></i>
            <span>Datos Personales</span>
          </div>
          <div class="card-body">
            <form @submit.prevent="guardarPerfil">
              <div class="form-grid">
                <div class="form-field">
                  <label class="form-label">
                    <span class="text-danger">*</span> Nombre completo
                  </label>
                  <div class="input-wrapper">
                    <i class="fas fa-user input-icon"></i>
                    <input
                      type="text"
                      class="form-control"
                      v-model="form.nombre"
                      placeholder="Tu nombre completo"
                    />
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">
                    <span class="text-danger">*</span> Correo electrónico
                  </label>
                  <div class="input-wrapper">
                    <i class="fas fa-envelope input-icon"></i>
                    <input
                      type="email"
                      class="form-control"
                      v-model="form.email"
                      placeholder="tu@correo.com"
                    />
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">Teléfono</label>
                  <div class="input-wrapper">
                    <i class="fas fa-phone input-icon"></i>
                    <input
                      type="text"
                      class="form-control"
                      v-model="form.telefono"
                      placeholder="09XXXXXXXX"
                    />
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">Rol</label>
                  <div class="input-wrapper">
                    <i class="fas fa-user-tag input-icon"></i>
                    <input
                      type="text"
                      class="form-control"
                      :value="form.rol"
                      disabled
                    />
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Cambio de contraseña -->
        <div class="card-cacao">
          <div class="card-header">
            <i class="fas fa-lock"></i>
            <span>Cambiar Contraseña</span>
            <span class="header-hint">(opcional)</span>
          </div>
          <div class="card-body">
            <div class="alert alert-info small mb-3">
              <i class="fas fa-info-circle"></i>
              Solo completa estos campos si deseas cambiar tu contraseña
            </div>

            <form @submit.prevent="guardarPerfil">
              <div class="form-grid">
                <div class="form-field form-field-full">
                  <label class="form-label">Contraseña actual</label>
                  <div class="input-wrapper">
                    <i class="fas fa-key input-icon"></i>
                    <input
                      :type="mostrarPasswords.actual ? 'text' : 'password'"
                      class="form-control"
                      v-model="passwords.actual"
                      placeholder="••••••••"
                      autocomplete="current-password"
                    />
                    <button type="button" class="toggle-pass" @click="mostrarPasswords.actual = !mostrarPasswords.actual">
                      <i :class="mostrarPasswords.actual ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">Nueva contraseña</label>
                  <div class="input-wrapper">
                    <i class="fas fa-lock input-icon"></i>
                    <input
                      :type="mostrarPasswords.nueva ? 'text' : 'password'"
                      class="form-control"
                      v-model="passwords.nueva"
                      placeholder="Mínimo 6 caracteres"
                      autocomplete="new-password"
                    />
                    <button type="button" class="toggle-pass" @click="mostrarPasswords.nueva = !mostrarPasswords.nueva">
                      <i :class="mostrarPasswords.nueva ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">Confirmar nueva</label>
                  <div class="input-wrapper">
                    <i class="fas fa-lock input-icon"></i>
                    <input
                      :type="mostrarPasswords.confirmar ? 'text' : 'password'"
                      class="form-control"
                      v-model="passwords.confirmar"
                      placeholder="Repite la contraseña"
                      autocomplete="new-password"
                    />
                    <button type="button" class="toggle-pass" @click="mostrarPasswords.confirmar = !mostrarPasswords.confirmar">
                      <i :class="mostrarPasswords.confirmar ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                  </div>
                </div>

                <!-- Indicador de fortaleza -->
                <div v-if="passwords.nueva" class="form-field form-field-full">
                  <label class="form-label">Fortaleza de la contraseña</label>
                  <div class="password-strength">
                    <div class="strength-bar">
                      <div class="strength-fill" :style="{ width: `${passwordStrength}%`, background: passwordColor }"></div>
                    </div>
                    <div class="strength-text" :style="{ color: passwordColor }">
                      {{ passwordStrengthLabel }}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Mensajes de error/éxito -->
        <transition name="fade">
          <div v-if="errorGeneral" class="alert alert-danger">
            <i class="fas fa-exclamation-circle"></i>
            {{ errorGeneral }}
          </div>
        </transition>

        <transition name="fade">
          <div v-if="mensajeExito" class="alert alert-success">
            <i class="fas fa-check-circle"></i>
            {{ mensajeExito }}
          </div>
        </transition>

        <!-- Botones de acción -->
        <div class="perfil-actions">
          <button class="btn-save" @click="guardarPerfil" :disabled="cargando">
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>{{ cargando ? 'Guardando...' : 'Guardar cambios' }}</span>
          </button>
          <router-link to="/" class="btn-cancel">
            <i class="fas fa-times"></i>
            <span>Volver al inicio</span>
          </router-link>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { api } from '../services/api'
import { useAuth } from '../composables/useAuth'

const toast = useToast()
const { user, updateUser } = useAuth()

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

const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ===== FORTALEZA DE CONTRASEÑA =====
const passwordStrength = computed(() => {
  const p = passwords.value.nueva
  if (!p) return 0
  let score = 0
  if (p.length >= 6) score += 25
  if (p.length >= 10) score += 15
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

// ===== CARGAR PERFIL =====
onMounted(async () => {
  try {
    const usuarioDB = await api.request('/auth/perfil', { method: 'GET' })
    form.value = {
      nombre: usuarioDB.nombre || '',
      email: usuarioDB.email || '',
      telefono: usuarioDB.telefono || '',
      rol: usuarioDB.rol || 'vendedor'
    }
  } catch (e) {
    console.error('Error cargando perfil:', e)
    if (user.value) {
      form.value = {
        nombre: user.value.nombre || '',
        email: user.value.email || '',
        telefono: user.value.telefono || '',
        rol: user.value.rol || 'vendedor'
      }
    }
  } finally {
    cargandoInicial.value = false
  }
})

// ===== GUARDAR =====
const guardarPerfil = async () => {
  errorGeneral.value = ''
  mensajeExito.value = ''

  // Validaciones
  if (passwords.value.nueva || passwords.value.confirmar || passwords.value.actual) {
    if (!passwords.value.actual) {
      errorGeneral.value = 'Debe ingresar la contraseña actual para cambiarla'
      toast.warning(errorGeneral.value)
      return
    }
    if (passwords.value.nueva !== passwords.value.confirmar) {
      errorGeneral.value = 'Las contraseñas nuevas no coinciden'
      toast.warning(errorGeneral.value)
      return
    }
    if (passwords.value.nueva.length < 6) {
      errorGeneral.value = 'La nueva contraseña debe tener al menos 6 caracteres'
      toast.warning(errorGeneral.value)
      return
    }
  }

  cargando.value = true

  try {
    const payload = {
      nombre: form.value.nombre,
      email: form.value.email,
      telefono: form.value.telefono || ''
    }

    if (passwords.value.nueva) {
      payload.password = passwords.value.nueva
      payload.passwordActual = passwords.value.actual
    }

    await api.request('/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify(payload),
      loaderMessage: 'Guardando cambios...'
    })

    const userData = {
      id: user.value?.id,
      nombre: form.value.nombre,
      email: form.value.email,
      telefono: form.value.telefono || '',
      rol: form.value.rol
    }
    localStorage.setItem('user', JSON.stringify(userData))
    updateUser(userData)

    mensajeExito.value = 'Perfil actualizado correctamente'
    toast.success('Perfil actualizado correctamente')

    passwords.value = { actual: '', nueva: '', confirmar: '' }

    setTimeout(() => {
      mensajeExito.value = ''
    }, 4000)
  } catch (e) {
    errorGeneral.value = e.message
    toast.error(e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.perfil-page {
  max-width: 1200px;
  margin: 0 auto;
}

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
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px 20px;
  text-align: center;
  box-shadow: var(--shadow-sm);
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
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
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
  border: 4px solid var(--bg-card);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 1;
}

.user-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.user-email {
  font-size: 0.82rem;
  color: var(--text-muted);
  word-break: break-all;
  margin-bottom: 12px;
}
.user-role {
  margin-bottom: 20px;
}
.badge-rol {
  display: inline-block;
  padding: 5px 14px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-rol-admin { background: rgba(231,76,60,0.15); color: #e74c3c; }
.badge-rol-contador { background: rgba(52,152,219,0.15); color: #3498db; }
.badge-rol-vendedor { background: rgba(39,174,96,0.15); color: #27ae60; }
.badge-rol-bodeguero { background: rgba(243,156,18,0.15); color: #d68910; }
.badge-rol-auditor { background: rgba(155,89,182,0.15); color: #8e44ad; }

.user-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}
.user-stat {
  text-align: center;
}
.stat-value {
  font-size: 1.3rem;
  margin-bottom: 4px;
}
.stat-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
}

/* ===== INFO CARD ===== */
.info-card {
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.05), rgba(241, 196, 15, 0.03));
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--radius-lg);
  padding: 18px;
}
.info-card-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.info-card-title i {
  color: var(--warning);
}
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
  color: var(--text-muted);
  padding-left: 18px;
  position: relative;
  line-height: 1.4;
}
.tips-list li::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: var(--primary-color);
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
  color: var(--text-muted);
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
}
.form-field-full {
  grid-column: 1 / -1;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 14px;
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
  transition: color var(--transition-fast);
}
.input-wrapper:focus-within .input-icon {
  color: var(--primary-color);
}
.input-wrapper .form-control {
  padding-left: 42px;
}
.toggle-pass {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px;
  border-radius: var(--radius-xs);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}
.toggle-pass:hover {
  color: var(--primary-color);
  background: var(--bg-table-stripe);
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
  background: var(--border-light);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.strength-fill {
  height: 100%;
  border-radius: inherit;
  transition: all 0.3s var(--ease-out);
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
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--transition);
  border: none;
  font-family: inherit;
}

.btn-save {
  background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff;
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
}
.btn-save:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(39, 174, 96, 0.4);
}
.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-cancel {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-cancel:hover {
  background: var(--bg-table-stripe);
  color: var(--text-primary);
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
</style>