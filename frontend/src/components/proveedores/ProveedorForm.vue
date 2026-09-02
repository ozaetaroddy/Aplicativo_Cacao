<template>
  <div>
    <h4 class="section-title"><i class="fas fa-truck"></i> {{ id ? 'Editar' : 'Nuevo' }} Proveedor</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i>
            Ingrese RUC (13 dígitos, terminado en 001) o Cédula (10 dígitos).
          </div>

          <div class="row g-3">
            <!-- RUC / Cédula -->
            <div class="col-md-8">
              <label class="form-label"><span class="text-danger">*</span> RUC / Cédula</label>
              <input
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errores.ruc }"
                v-model="form.ruc"
                placeholder="10 o 13 dígitos"
                @input="validarRuc"
                @blur="validarRuc"
                required
              />
              <div v-if="errores.ruc" class="invalid-feedback">{{ errores.ruc }}</div>
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <button
                type="button"
                class="btn btn-primary w-100"
                @click="buscarPorIdentificacion"
                :disabled="buscando || !form.ruc || errores.ruc"
              >
                <i class="fas fa-search" :class="{ 'fa-spin': buscando }"></i>
                {{ buscando ? 'Buscando...' : 'Buscar Datos' }}
              </button>
            </div>

            <!-- Nombre -->
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Nombre / Razón Social</label>
              <input
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errores.nombre }"
                v-model="form.nombre"
                @input="validarNombre"
                @blur="validarNombre"
                required
              />
              <div v-if="errores.nombre" class="invalid-feedback">{{ errores.nombre }}</div>
            </div>

            <!-- Teléfono -->
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Teléfono</label>
              <input
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errores.telefono }"
                v-model="form.telefono"
                placeholder="09XXXXXXXX"
                @input="validarTelefono"
                @blur="validarTelefono"
                required
              />
              <div v-if="errores.telefono" class="invalid-feedback">{{ errores.telefono }}</div>
            </div>

            <!-- Email -->
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Email</label>
              <input
                type="email"
                class="form-control"
                :class="{ 'is-invalid': errores.email }"
                v-model="form.email"
                placeholder="correo@ejemplo.com"
                @input="validarEmail"
                @blur="validarEmail"
                required
              />
              <div v-if="errores.email" class="invalid-feedback">{{ errores.email }}</div>
            </div>

            <!-- Dirección -->
            <div class="col-md-6">
              <label class="form-label">Dirección</label>
              <input type="text" class="form-control" v-model="form.direccion" />
            </div>
          </div>

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando || !formularioValido">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar' }}
            </button>
            <router-link to="/proveedores" class="btn btn-secondary">Cancelar</router-link>
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
import { useToast } from 'vue-toastification'

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
  telefono: '',
  email: '',
  direccion: ''
})

const errores = ref({
  ruc: '',
  nombre: '',
  telefono: '',
  email: ''
})

// ===== VALIDACIONES =====
const validarRuc = () => {
  const ruc = form.value.ruc?.trim() || ''
  if (!ruc) {
    errores.value.ruc = 'El RUC/Cédula es obligatorio'
    return false
  }
  if (!/^\d+$/.test(ruc)) {
    errores.value.ruc = 'Solo dígitos numéricos'
    return false
  }
  if (ruc.length === 10) {
    // Cédula: 10 dígitos (sin validación de dígito verificador por simplicidad)
    errores.value.ruc = ''
    return true
  } else if (ruc.length === 13) {
    // RUC: 13 dígitos, debe terminar en 001 (para persona jurídica)
    if (!ruc.endsWith('001')) {
      errores.value.ruc = 'RUC debe terminar en 001'
      return false
    }
    errores.value.ruc = ''
    return true
  } else {
    errores.value.ruc = 'Debe tener 10 (cédula) o 13 (RUC) dígitos'
    return false
  }
}

const validarNombre = () => {
  const nombre = form.value.nombre?.trim() || ''
  if (!nombre) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
  if (nombre.length < 3) {
    errores.value.nombre = 'El nombre debe tener al menos 3 caracteres'
    return false
  }
  if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/.test(nombre)) {
    errores.value.nombre = 'Solo letras, espacios y puntos'
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
    errores.value.telefono = 'Debe comenzar con 09 y tener 10 dígitos'
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
  // Permitir dominios comunes
  if (!/^[^\s@]+@[^\s@]+\.(com|es|ec|org|net|edu|info|gob|mil)$/i.test(email)) {
    errores.value.email = 'Email inválido (ej: usuario@dominio.com)'
    return false
  }
  errores.value.email = ''
  return true
}

// ===== ESTADO DE VALIDEZ =====
const formularioValido = computed(() => {
  return validarRuc() && validarNombre() && validarTelefono() && validarEmail()
})

// ===== CARGAR DATOS SI ES EDICIÓN =====
onMounted(async () => {
  if (id) {
    try {
      const data = await findById('proveedores', id)
      if (data) {
        form.value = data
        // Forzar validación para mostrar errores si los hay
        validarRuc()
        validarNombre()
        validarTelefono()
        validarEmail()
      }
    } catch (e) {
      console.error(e)
      errorGeneral.value = 'Error al cargar los datos'
      toast.error('Error al cargar los datos: ' + e.message)
    }
  }
})

// ===== BUSCAR POR IDENTIFICACIÓN =====
const buscarPorIdentificacion = async () => {
  if (!validarRuc()) {
    toast.warning('Corrija el RUC/Cédula antes de buscar')
    return
  }
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
      toast.info('No se encontró nombre para esta cédula, ingréselo manualmente')
    }
  } catch (e) {
    toast.error('Error al consultar: ' + e.message)
  } finally {
    buscando.value = false
  }
}

// ===== GUARDAR =====
const guardar = async () => {
  // Forzar validación de todos los campos
  const rucOk = validarRuc()
  const nombreOk = validarNombre()
  const telefonoOk = validarTelefono()
  const emailOk = validarEmail()

  if (!rucOk || !nombreOk || !telefonoOk || !emailOk) {
    errorGeneral.value = 'Corrija los errores marcados en rojo'
    toast.warning('Corrija los errores antes de guardar')
    return
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const datos = {
      ruc: form.value.ruc.trim(),
      nombre: form.value.nombre.trim(),
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim(),
      direccion: form.value.direccion?.trim() || ''
    }
    if (id) {
      await updateOne('proveedores', id, datos)
      toast.success('Proveedor actualizado correctamente')
    } else {
      await insertOne('proveedores', datos)
      toast.success('Proveedor creado correctamente')
    }
    router.push('/proveedores')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error al guardar: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>