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
                @blur="validarRuc"
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
                @blur="validarNombre"
                required
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
                @blur="validarTelefono"
                required
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
                @blur="validarEmail"
                required
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

          <!-- ===== MOSTRAR ERRORES GENERALES ===== -->
          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar' }}
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'

const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const buscando = ref(false)
const cargando = ref(false)
const errorGeneral = ref('')

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

// ===== VALIDAR RUC/CÉDULA =====
const validarRuc = () => {
  const ruc = form.value.ruc?.trim() || ''
  if (!ruc) {
    errores.value.ruc = 'El RUC/Cédula es obligatorio'
    return false
  }
  
  // Validar RUC (13 dígitos terminados en 001) o Cédula (10 dígitos)
  const esRuc = /^\d{13}$/.test(ruc) && ruc.endsWith('001')
  const esCedula = /^\d{10}$/.test(ruc)
  
  if (!esRuc && !esCedula) {
    errores.value.ruc = 'Ingrese un RUC válido (13 dígitos terminado en 001) o Cédula (10 dígitos)'
    return false
  }
  
  errores.value.ruc = ''
  return true
}

const validarNombre = () => {
  const nombre = form.value.nombre?.trim() || ''
  if (!nombre) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
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
  const telefono = form.value.telefono?.trim() || ''
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
  const email = form.value.email?.trim() || ''
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

const validarFormulario = () => {
  const rucOk = validarRuc()
  const nombreOk = validarNombre()
  const telefonoOk = validarTelefono()
  const emailOk = validarEmail()
  return rucOk && nombreOk && telefonoOk && emailOk
}

// ===== CARGAR DATOS SI ES EDICIÓN =====
onMounted(async () => {
  if (id) {
    try {
      console.log('Cargando cliente con ID:', id)
      const data = await findById('clientes', id)
      console.log('Datos cargados:', data)
      if (data) {
        form.value = data
      } else {
        errorGeneral.value = 'No se encontró el cliente'
      }
    } catch (e) {
      console.error('Error al cargar cliente:', e)
      errorGeneral.value = 'Error al cargar los datos: ' + e.message
    }
  }
})

// ===== BUSCAR POR RUC/CÉDULA (scraping) =====
const buscarPorIdentificacion = async () => {
  if (!validarRuc()) return
  buscando.value = true
  errorGeneral.value = ''
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
  console.log('Intentando guardar...')
  errorGeneral.value = ''

  // Validar todo
  if (!validarFormulario()) {
    // Forzar validación de todos los campos para mostrar errores
    validarRuc()
    validarNombre()
    validarTelefono()
    validarEmail()
    errorGeneral.value = 'Por favor, corrija los errores marcados en rojo'
    console.log('❌ Formulario inválido')
    return
  }

  // Preparar datos
  const datos = {
    ruc: form.value.ruc.trim(),
    nombre: form.value.nombre.trim(),
    tipo: form.value.tipo,
    telefono: form.value.telefono.trim(),
    email: form.value.email.trim(),
    direccion: form.value.direccion?.trim() || ''
  }

  console.log('📦 Datos a guardar:', datos)
  cargando.value = true

  try {
    let resultado
    if (id) {
      console.log('🔄 Actualizando cliente existente...')
      resultado = await updateOne('clientes', id, datos)
    } else {
      console.log('➕ Creando nuevo cliente...')
      resultado = await insertOne('clientes', datos)
    }
    console.log('✅ Resultado:', resultado)
    router.push('/clientes')
  } catch (e) {
    console.error('❌ Error al guardar:', e)
    errorGeneral.value = 'Error al guardar: ' + e.message
  } finally {
    cargando.value = false
  }
}
</script>