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
              <Field name="ruc" v-slot="{ field, errors }">
                <input
                  type="text"
                  class="form-control"
                  v-bind="field"
                  v-model="form.ruc"
                  placeholder="10 o 13 dígitos"
                  :class="{ 'is-invalid': errors.length > 0 }"
                />
                <div v-if="errors.length > 0" class="text-danger small">
                  {{ errors[0] }}
                </div>
              </Field>
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
              <Field name="nombre" v-slot="{ field, errors }">
                <input
                  type="text"
                  class="form-control"
                  v-bind="field"
                  v-model="form.nombre"
                  :class="{ 'is-invalid': errors.length > 0 }"
                />
                <div v-if="errors.length > 0" class="text-danger small">
                  {{ errors[0] }}
                </div>
              </Field>
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
              <Field name="telefono" v-slot="{ field, errors }">
                <input
                  type="text"
                  class="form-control"
                  v-bind="field"
                  v-model="form.telefono"
                  placeholder="09XXXXXXXX"
                  :class="{ 'is-invalid': errors.length > 0 }"
                />
                <div v-if="errors.length > 0" class="text-danger small">
                  {{ errors[0] }}
                </div>
              </Field>
            </div>
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Email</label>
              <Field name="email" v-slot="{ field, errors }">
                <input
                  type="email"
                  class="form-control"
                  v-bind="field"
                  v-model="form.email"
                  placeholder="correo@ejemplo.com"
                  :class="{ 'is-invalid': errors.length > 0 }"
                />
                <div v-if="errors.length > 0" class="text-danger small">
                  {{ errors[0] }}
                </div>
              </Field>
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { Field, ErrorMessage, useForm } from 'vee-validate'
import * as yup from 'yup'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const buscando = ref(false)
const cargando = ref(false)
const errorGeneral = ref('')

// Esquema de validación con Yup
const validationSchema = yup.object({
  ruc: yup
    .string()
    .required('El RUC/Cédula es obligatorio')
    .matches(/^\d+$/, 'Solo dígitos numéricos')
    .test('len', 'Debe tener 10 (cédula) o 13 (RUC) dígitos', (value) => {
      return value && (value.length === 10 || value.length === 13)
    })
    .test('ruc', 'RUC debe terminar en 001', (value) => {
      if (value && value.length === 13) {
        return value.endsWith('001')
      }
      return true
    }),
  nombre: yup
    .string()
    .required('El nombre es obligatorio')
    .matches(/^[A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+$/, 'Solo letras, espacios y puntos'),
  telefono: yup
    .string()
    .required('El teléfono es obligatorio')
    .matches(/^09\d{8}$/, 'Debe comenzar con 09 y tener 10 dígitos'),
  email: yup
    .string()
    .required('El email es obligatorio')
    .email('Email inválido')
})

const { handleSubmit, errors } = useForm({
  validationSchema,
  initialValues: {
    ruc: '',
    nombre: '',
    telefono: '',
    email: ''
  }
})

const form = ref({
  ruc: '',
  nombre: '',
  tipo: 'persona',
  telefono: '',
  email: '',
  direccion: ''
})

onMounted(async () => {
  if (id) {
    try {
      const data = await findById('clientes', id)
      if (data) {
        form.value = data
        // Sincronizar initialValues de vee-validate
        // (opcional, pero no necesario si usamos v-model en Fields)
      }
    } catch (e) {
      console.error(e)
      errorGeneral.value = 'Error al cargar los datos'
      toast.error('Error al cargar los datos: ' + e.message)
    }
  }
})

const buscarPorIdentificacion = async () => {
  if (!form.value.ruc) {
    toast.warning('Ingrese un RUC/Cédula para buscar')
    return
  }
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

const guardar = handleSubmit(async (values) => {
  cargando.value = true
  errorGeneral.value = ''
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
})
</script>