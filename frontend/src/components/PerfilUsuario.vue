<template>
  <div>
    <h4 class="section-title"><i class="fas fa-id-card"></i> Mi Perfil</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <div v-if="cargandoInicial" class="text-center p-4">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p>Cargando datos...</p>
        </div>

        <form v-else @submit.prevent="guardarPerfil">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Nombre</label>
              <input type="text" class="form-control" v-model="form.nombre" required />
            </div>
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Email</label>
              <input type="email" class="form-control" v-model="form.email" required />
            </div>
            <div class="col-md-6">
              <label class="form-label">Teléfono</label>
              <input type="text" class="form-control" v-model="form.telefono" placeholder="09XXXXXXXX" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Rol</label>
              <input type="text" class="form-control" :value="form.rol" disabled />
            </div>

            <div class="col-12">
              <hr />
              <h6>Cambiar contraseña (opcional)</h6>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label">Contraseña actual</label>
                  <input type="password" class="form-control" v-model="passwords.actual" placeholder="••••••••" />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Nueva contraseña</label>
                  <input type="password" class="form-control" v-model="passwords.nueva" placeholder="••••••••" />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Confirmar nueva</label>
                  <input type="password" class="form-control" v-model="passwords.confirmar" placeholder="••••••••" />
                </div>
              </div>
            </div>
          </div>

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>
          <div v-if="mensajeExito" class="alert alert-success mt-3">
            <i class="fas fa-check-circle"></i> {{ mensajeExito }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar cambios' }}
            </button>
            <router-link to="/" class="btn btn-secondary">Volver</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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

// ===== CARGAR DATOS DEL USUARIO DESDE /auth/perfil =====
onMounted(async () => {
  try {
    const usuarioDB = await api.request('/auth/perfil', {
      method: 'GET',
      loaderMessage: 'Cargando perfil...'
    })

    form.value = {
      nombre: usuarioDB.nombre || '',
      email: usuarioDB.email || '',
      telefono: usuarioDB.telefono || '',
      rol: usuarioDB.rol || 'vendedor'
    }
  } catch (e) {
    console.error('Error cargando perfil:', e)
    // Fallback: usar datos del localStorage
    if (user.value) {
      form.value = {
        nombre: user.value.nombre || '',
        email: user.value.email || '',
        telefono: user.value.telefono || '',
        rol: user.value.rol || 'vendedor'
      }
    }
    // No mostramos toast si el fallback funciona
  } finally {
    cargandoInicial.value = false
  }
})

// ===== GUARDAR PERFIL =====
const guardarPerfil = async () => {
  errorGeneral.value = ''
  mensajeExito.value = ''

  // Validar cambio de contraseña
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

    const data = await api.request('/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify(payload),
      loaderMessage: 'Guardando cambios...'
    })

    // Actualizar datos en localStorage
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
  } catch (e) {
    errorGeneral.value = e.message
    toast.error(e.message)
  } finally {
    cargando.value = false
  }
}
</script>