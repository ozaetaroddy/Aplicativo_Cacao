<template>
  <div class="login-container">
    <div class="login-card">
      <div class="text-center mb-4">
        <i class="fas fa-calculator fa-3x" style="color: #3498db;"></i>
        <h2 class="mt-2">Sistema Contable</h2>
        <p class="text-muted">Ingresa tus credenciales</p>
      </div>

      <!-- Mensaje de error general -->
      <div v-if="errorGeneral" class="alert alert-danger alert-dismissible fade show" role="alert">
        <i class="fas fa-exclamation-circle me-2"></i>
        {{ errorGeneral }}
        <button type="button" class="btn-close" @click="errorGeneral = ''"></button>
      </div>

      <form @submit.prevent="login">
        <div class="mb-3">
          <label class="form-label">Email</label>
          <input 
            type="email" 
            class="form-control" 
            v-model="email" 
            required 
            placeholder="correo@ejemplo.com"
            :disabled="cargando"
          />
        </div>
        <div class="mb-3">
          <label class="form-label">Contraseña</label>
          <input 
            type="password" 
            class="form-control" 
            v-model="password" 
            required 
            placeholder="••••••••"
            :disabled="cargando"
          />
        </div>
        <button 
          type="submit" 
          class="btn btn-primary w-100" 
          :disabled="cargando"
        >
          <i class="fas fa-sign-in-alt" :class="{ 'fa-spin': cargando }"></i>
          {{ cargando ? 'Verificando...' : 'Ingresar' }}
        </button>
      </form>

      <div class="text-center mt-3">
        <small class="text-muted">Sistema de Gestión Empresarial</small>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const router = useRouter()
const toast = useToast()

const email = ref('')
const password = ref('')
const cargando = ref(false)
const errorGeneral = ref('')

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
      body: JSON.stringify({ email: email.value, password: password.value })
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Credenciales inválidas')
    }

    // Guardar token y usuario
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))

    toast.success(`Bienvenido ${data.user.nombre}`)
    
    // Redirigir al dashboard sin recargar la página
    router.push('/')
  } catch (e) {
    errorGeneral.value = e.message
    toast.error(e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #f4f6f9 0%, #e9edf2 100%);
}
.login-card {
  background: #fff;
  padding: 40px 30px;
  border-radius: 20px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.08);
  width: 100%;
  max-width: 400px;
  transition: transform 0.2s;
}
.login-card:hover {
  transform: translateY(-2px);
}
</style>