<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-users"></i> {{ id ? 'Editar' : 'Nuevo' }} Cliente
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <!-- ===== BÚSQUEDA POR RUC/CÉDULA ===== -->
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i>
            Si ingresa un RUC o Cédula y presiona "Buscar", los datos se completarán automáticamente.
          </div>

          <div class="row g-3">
            <div class="col-md-8">
              <label class="form-label"><span class="text-danger">*</span> RUC / Cédula</label>
              <input
                type="text"
                class="form-control"
                v-model="form.ruc"
                placeholder="Ingrese RUC o Cédula (10 dígitos)"
                required
              />
              <div v-if="errores.ruc" class="text-danger small">{{ errores.ruc }}</div>
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <button
                type="button"
                class="btn btn-primary w-100"
                @click="buscarPorIdentificacion"
                :disabled="buscando"
              >
                <i class="fas fa-search" :class="{ 'fa-spin': buscando }"></i>
                {{ buscando ? 'Buscando...' : 'Buscar Datos' }}
              </button>
            </div>
          </div>

          <hr />

          <!-- ===== DATOS DEL CLIENTE ===== -->
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Nombre / Razón Social</label>
              <input
                type="text"
                class="form-control"
                v-model="form.nombre"
                required
                @blur="validarNombre"
              />
              <div v-if="errores.nombre" class="text-danger small">{{ errores.nombre }}</div>
            </div>
            <div class="col-md-6">
              <label class="form-label">Tipo</label>
              <select class="form-select" v-model="form.tipo">
                <option value="persona">Persona Natural</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Teléfono</label>
              <input
                type="text"
                class="form-control"
                v-model="form.telefono"
                placeholder="09XXXXXXXX"
                required
                @blur="validarTelefono"
              />
              <div v-if="errores.telefono" class="text-danger small">{{ errores.telefono }}</div>
            </div>
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Email</label>
              <input
                type="email"
                class="form-control"
                v-model="form.email"
                placeholder="correo@ejemplo.com"
                required
                @blur="validarEmail"
              />
              <div v-if="errores.email" class="text-danger small">{{ errores.email }}</div>
            </div>
            <div class="col-md-12">
              <label class="form-label">Dirección</label>
              <input
                type="text"
                class="form-control"
                v-model="form.direccion"
              />
            </div>
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="!formularioValido">
              <i class="fas fa-save"></i> Guardar
            </button>
            <router-link to="/clientes" class="btn btn-secondary">
              Cancelar
            </router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'

const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const buscando = ref(false)

// ===== FORMULARIO =====
const form = ref({
  ruc: '',
  nombre: '',
  tipo: 'persona',
  telefono: '',
  email: '',
  direccion: ''
})

// ===== VALIDACIONES =====
const errores = ref({
  ruc: '',
  nombre: '',
  telefono: '',
  email: ''
})

const validarRuc = () => {
  const ruc = form.value.ruc.trim()
  if (!ruc) {
    errores.value.ruc = 'El RUC/Cédula es obligatorio'
    return false
  }
  if (ruc.length !== 10 || !/^\d+$/.test(ruc)) {
    errores.value.ruc = 'El RUC/Cédula debe tener 10 dígitos numéricos'
    return false
  }
  errores.value.ruc = ''
  return true
}

const validarNombre = () => {
  const nombre = form.value.nombre.trim()
  if (!nombre) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
  // Solo letras, espacios, tildes, ñ y puntos (para abreviaturas)
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/.test(nombre)) {
    errores.value.nombre = 'El nombre solo puede contener letras, espacios y puntos'
    return false
  }
  if (nombre.length < 3) {
    errores.value.nombre = 'El nombre debe tener al menos 3 caracteres'
    return false
  }
  errores.value.nombre = ''
  return true
}

const validarTelefono = () => {
  const telefono = form.value.telefono.trim()
  if (!telefono) {
    errores.value.telefono = 'El teléfono es obligatorio'
    return false
  }
  if (!/^09\d{8}$/.test(telefono)) {
    errores.value.telefono = 'El teléfono debe comenzar con 09 y tener 10 dígitos'
    return false
  }
  errores.value.telefono = ''
  return true
}

const validarEmail = () => {
  const email = form.value.email.trim()
  if (!email) {
    errores.value.email = 'El email es obligatorio'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.(com|es|ec|org|net|edu|info)$/i.test(email)) {
    errores.value.email = 'Email inválido. Debe terminar en .com, .es, .ec, etc.'
    return false
  }
  errores.value.email = ''
  return true
}

const formularioValido = computed(() => {
  return validarRuc() && validarNombre() && validarTelefono() && validarEmail()
})

// ===== CARGAR DATOS SI ES EDICIÓN =====
onMounted(async () => {
  if (id) {
    try {
      const data = await findById('clientes', id)
      form.value = data
    } catch (e) {
      console.error(e)
    }
  }
})

// ===== BUSCAR POR RUC/CÉDULA =====
const buscarPorIdentificacion = async () => {
  if (!validarRuc()) return

  buscando.value = true

  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/consultas/cedula/${form.value.ruc.trim()}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Error al consultar')
    }

    const data = await response.json()
    if (data.nombre) {
      form.value.nombre = data.nombre
    } else {
      alert('No se encontró información para esta cédula')
    }
  } catch (error) {
    console.error('Error en la búsqueda:', error)
    alert('Error al consultar los datos: ' + error.message)
  } finally {
    buscando.value = false
  }
}

// ===== GUARDAR CLIENTE =====
const guardar = async () => {
  if (!formularioValido.value) {
    // Forzar validación de todos los campos
    validarRuc()
    validarNombre()
    validarTelefono()
    validarEmail()
    alert('Corrija los errores antes de guardar')
    return
  }

  try {
    if (id) {
      await updateOne('clientes', id, form.value)
    } else {
      await insertOne('clientes', form.value)
    }
    router.push('/clientes')
  } catch (e) {
    alert('Error al guardar: ' + e.message)
  }
}
</script>