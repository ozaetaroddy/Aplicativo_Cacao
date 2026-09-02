<template>
  <div>
    <h4 class="section-title"><i class="fas fa-users"></i> {{ id ? 'Editar' : 'Nuevo' }} Cliente</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i>
            Ingrese RUC (13 dígitos) o Cédula (10 dígitos). Si es RUC, debe terminar en 001.
          </div>

          <div class="row g-3">
            <div class="col-md-8">
              <label class="form-label"><span class="text-danger">*</span> RUC / Cédula</label>
              <input
                type="text"
                class="form-control"
                v-model="form.ruc"
                placeholder="10 o 13 dígitos"
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

          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Nombre / Razón Social</label>
              <input type="text" class="form-control" v-model="form.nombre" required @blur="validarNombre" />
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
              <input type="text" class="form-control" v-model="form.direccion" />
            </div>
          </div>

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar' }}
            </button>
            <router-link to="/clientes" class="btn btn-secondary">Cancelar</router-link>
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
  tipo: 'persona',
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
    errores.value.ruc = ''
    return true
  } else if (ruc.length === 13) {
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
  if (!/^[^\s@]+@[^\s@]+\.(com|es|ec|org|net|edu|info)$/i.test(email)) {
    errores.value.email = 'Email inválido'
    return false
  }
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
      if (data) form.value = data
    } catch (e) {
      console.error(e)
      errorGeneral.value = 'Error al cargar los datos'
      toast.error('Error al cargar los datos: ' + e.message)
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
    if (data.nombre) form.value.nombre = data.nombre
  } catch (e) {
    toast.error('Error al consultar: ' + e.message)
  } finally {
    buscando.value = false
  }
}

const guardar = async () => {
  if (!formularioValido.value) {
    validarRuc()
    validarNombre()
    validarTelefono()
    validarEmail()
    errorGeneral.value = 'Corrija los errores marcados en rojo'
    toast.warning('Corrija los errores marcados en rojo')
    return
  }
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
    toast.error('Error al guardar: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>