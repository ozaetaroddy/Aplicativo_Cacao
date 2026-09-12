<template>
  <div class="login-page">
    <!-- Fondo animado -->
    <div class="login-bg">
      <div class="bg-shape bg-shape-1"></div>
      <div class="bg-shape bg-shape-2"></div>
      <div class="bg-shape bg-shape-3"></div>
    </div>

    <!-- Contenido -->
    <div class="login-content">
      <!-- Info a la izquierda (solo desktop) -->
      <div class="login-info d-none d-lg-flex">
        <div class="info-brand">
          <div class="info-logo">
            <i class="fas fa-calculator"></i>
          </div>
          <div>
            <h1 class="info-title">Sistema Contable</h1>
            <p class="info-subtitle">Facturación electrónica SRI para Ecuador</p>
          </div>
        </div>

        <div class="info-features">
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-file-invoice"></i></div>
            <div>
              <div class="feature-title">Facturación electrónica</div>
              <div class="feature-text">Comprobantes con validez legal ante el SRI</div>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-chart-line"></i></div>
            <div>
              <div class="feature-title">Reportes en tiempo real</div>
              <div class="feature-text">Ventas, compras, IVA, retenciones y más</div>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-shield-alt"></i></div>
            <div>
              <div class="feature-title">Firma electrónica</div>
              <div class="feature-text">Certificado .p12 con XAdES-BES</div>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-chart-pie"></i></div>
            <div>
              <div class="feature-title">Estados financieros</div>
              <div class="feature-text">Balance general y estado de resultados</div>
            </div>
          </div>
        </div>

        <div class="info-footer">
          <i class="fas fa-copyright"></i>
          {{ year }} System Ozaet's Electronics — Ecuador
        </div>
      </div>

      <!-- Formulario a la derecha -->
      <div class="login-form-wrapper">
        <div class="login-card">
          <!-- Logo móvil -->
          <div class="login-logo d-lg-none">
            <i class="fas fa-calculator"></i>
          </div>

          <div class="login-header">
            <h2 class="login-title">Bienvenido</h2>
            <p class="login-subtitle">Ingresa tus credenciales para continuar</p>
          </div>

          <!-- Error -->
          <transition name="fade">
            <div v-if="errorGeneral" class="login-error">
              <i class="fas fa-exclamation-circle"></i>
              <span>{{ errorGeneral }}</span>
            </div>
          </transition>

          <!-- Formulario -->
          <form @submit.prevent="login" class="login-form">
            <div class="form-group">
              <label for="email" class="form-label">Correo electrónico</label>
              <div class="input-wrapper">
                <i class="fas fa-envelope input-icon"></i>
                <input
                  id="email"
                  type="email"
                  class="login-input"
                  v-model="email"
                  placeholder="tu@correo.com"
                  required
                  :disabled="cargando"
                  autocomplete="email"
                  autofocus
                />
              </div>
            </div>

            <div class="form-group">
              <label for="password" class="form-label">Contraseña</label>
              <div class="input-wrapper">
                <i class="fas fa-lock input-icon"></i>
                <input
                  id="password"
                  :type="mostrarPassword ? 'text' : 'password'"
                  class="login-input"
                  v-model="password"
                  placeholder="••••••••"
                  required
                  :disabled="cargando"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="toggle-password"
                  @click="mostrarPassword = !mostrarPassword"
                  :title="mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  tabindex="-1"
                >
                  <i :class="mostrarPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              class="login-button"
              :disabled="cargando || !email || !password"
            >
              <span v-if="!cargando" class="btn-content">
                <i class="fas fa-sign-in-alt"></i>
                Iniciar sesión
              </span>
              <span v-else class="btn-loading">
                <span class="spinner"></span>
                Verificando...
              </span>
            </button>
          </form>

          <div class="login-footer">
            <p class="login-footer-text">
              <i class="fas fa-shield-alt"></i>
              Sistema seguro con cifrado de extremo a extremo
            </p>
          </div>
        </div>

        <!-- Créditos móvil -->
        <div class="login-credits d-lg-none">
          {{ year }} System Ozaet's Electronics
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'vue-toastification'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const router = useRouter()
const route = useRoute()
const toast = useToast()

const email = ref('')
const password = ref('')
const mostrarPassword = ref(false)
const cargando = ref(false)
const errorGeneral = ref('')

const year = computed(() => new Date().getFullYear())

// ===== AL MONTAR: si ya está logueado, redirigir =====
onMounted(() => {
  const token = localStorage.getItem('token')
  if (token) {
    const redirect = route.query.redirect || '/'
    router.replace(redirect)
    return
  }
  // Recordar último email usado
  const savedEmail = localStorage.getItem('last_email')
  if (savedEmail) {
    email.value = savedEmail
    // Enfocar password directamente
    setTimeout(() => {
      const passInput = document.getElementById('password')
      if (passInput) passInput.focus()
    }, 100)
  }
})

// ===== LOGIN =====
const login = async () => {
  if (!email.value || !password.value) {
    errorGeneral.value = 'Complete todos los campos'
    toast.warning('Complete todos los campos')
    return
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim().toLowerCase(),
        password: password.value
      })
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Credenciales inválidas')
    }

    // Guardar auth
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    localStorage.setItem('last_email', data.user.email)

    // Limpiar cache de permisos anterior (por si hay cambio de usuario)
    try {
      const { usePermisos } = await import('../composables/usePermisos')
      usePermisos().limpiarCache()
    } catch (e) { /* ignorar */ }

    toast.success(`Bienvenido ${data.user.nombre}`)

    // Redirigir a la ruta deseada o al dashboard
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (e) {
    errorGeneral.value = e.message
    // No mostrar toast duplicado para errores de credenciales (menos ruido)
    const silencioso = /credenciales|intentos|desactivado/i.test(e.message)
    if (!silencioso) {
      toast.error(e.message)
    }
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
/* ============================================================
   LAYOUT
   ============================================================ */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #0f1626 0%, #1a2332 50%, #2c3e50 100%);
}

/* ============================================================
   FONDO ANIMADO
   ============================================================ */
.login-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.bg-shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: float 20s ease-in-out infinite;
}

.bg-shape-1 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, #3498db, transparent);
  top: -10%;
  left: -10%;
  animation-delay: 0s;
}

.bg-shape-2 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, #f1c40f, transparent);
  bottom: -10%;
  right: -10%;
  animation-delay: -7s;
  opacity: 0.25;
}

.bg-shape-3 {
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, #8e44ad, transparent);
  top: 40%;
  left: 40%;
  animation-delay: -14s;
  opacity: 0.2;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.05); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}

/* ============================================================
   CONTENIDO
   ============================================================ */
.login-content {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 1200px;
  padding: 20px;
  gap: 60px;
  align-items: center;
}

/* ============================================================
   INFO IZQUIERDA
   ============================================================ */
.login-info {
  flex: 1;
  flex-direction: column;
  gap: 40px;
  color: #fff;
  animation: slideRight 0.6s var(--ease-out, ease-out);
}

.info-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.info-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: #fff;
  box-shadow: 0 12px 32px rgba(52, 152, 219, 0.4);
}

.info-title {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0 0 4px;
  letter-spacing: -0.02em;
  color: #fff;
}

.info-subtitle {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

.info-features {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature-item {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  animation: slideRight 0.6s var(--ease-out, ease-out) backwards;
}
.feature-item:nth-child(1) { animation-delay: 0.1s; }
.feature-item:nth-child(2) { animation-delay: 0.2s; }
.feature-item:nth-child(3) { animation-delay: 0.3s; }
.feature-item:nth-child(4) { animation-delay: 0.4s; }

.feature-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f1c40f;
  font-size: 1.1rem;
  flex-shrink: 0;
  backdrop-filter: blur(10px);
}

.feature-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: #fff;
  margin-bottom: 2px;
}

.feature-text {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.4;
}

.info-footer {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: auto;
}
.info-footer i {
  margin-right: 6px;
  color: #f1c40f;
}

/* ============================================================
   FORMULARIO
   ============================================================ */
.login-form-wrapper {
  width: 100%;
  max-width: 440px;
  animation: slideUp 0.6s var(--ease-out, ease-out);
}

.login-card {
  background: rgba(26, 35, 50, 0.72);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 40px 36px;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;
}

.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #3498db, #f1c40f, #3498db);
  background-size: 200% 100%;
  animation: gradient-slide 4s linear infinite;
}

@keyframes gradient-slide {
  0% { background-position: 0% 0%; }
  100% { background-position: 200% 0%; }
}

.login-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: #fff;
  margin: 0 auto 24px;
  box-shadow: 0 12px 32px rgba(52, 152, 219, 0.4);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #fff;
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}

.login-subtitle {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.login-error {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  color: #ff9585;
  font-size: 0.88rem;
  margin-bottom: 20px;
}

.login-error i {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.2px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.95rem;
  pointer-events: none;
  transition: color 0.25s ease;
}

.login-input {
  width: 100%;
  padding: 14px 16px 14px 46px;
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  font-size: 0.95rem;
  color: #fff;
  font-family: inherit;
  transition: all 0.25s ease;
  outline: none;
}

.login-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.login-input:focus {
  background: rgba(255, 255, 255, 0.06);
  border-color: #3498db;
  box-shadow: 0 0 0 4px rgba(52, 152, 219, 0.15);
}

.login-input:focus + .input-icon,
.input-wrapper:focus-within .input-icon {
  color: #3498db;
}

.login-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-password {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.toggle-password:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

/* ============================================================
   BOTÓN
   ============================================================ */
.login-button {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  font-family: inherit;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 8px 24px rgba(52, 152, 219, 0.35);
  margin-top: 8px;
  position: relative;
  overflow: hidden;
}

.login-button::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #4aa8e8 0%, #3498db 100%);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(52, 152, 219, 0.5);
}
.login-button:hover:not(:disabled)::before {
  opacity: 1;
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-content,
.btn-loading {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ============================================================
   FOOTER
   ============================================================ */
.login-footer {
  margin-top: 28px;
  text-align: center;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.login-footer-text {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.login-footer-text i {
  color: #27ae60;
}

.login-credits {
  text-align: center;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 24px;
}

/* ============================================================
   ANIMACIONES
   ============================================================ */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideRight {
  from { opacity: 0; transform: translateX(-24px); }
  to { opacity: 1; transform: translateX(0); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 992px) {
  .login-content {
    gap: 0;
    padding: 16px;
  }
  .login-form-wrapper {
    max-width: 100%;
  }
  .login-card {
    padding: 32px 24px;
  }
  .login-logo {
    display: flex !important;
  }
}

@media (max-width: 576px) {
  .login-card {
    padding: 28px 20px;
    border-radius: 20px;
  }
  .login-title {
    font-size: 1.5rem;
  }
  .login-input {
    padding: 12px 14px 12px 42px;
    font-size: 0.9rem;
  }
  .login-button {
    padding: 13px 20px;
  }
}

/* ============================================================
   ACCESIBILIDAD
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .bg-shape,
  .login-card::before {
    animation: none;
  }
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>