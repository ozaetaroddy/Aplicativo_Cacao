<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-users"></i> {{ id ? 'Editar' : 'Nuevo' }} Cliente
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <!-- ===== BÚSQUEDA POR RUC/CÉDULA ===== -->
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i>
            Si ingresa un RUC o Cédula y presiona "Buscar", los datos se completarán automáticamente.
          </div>

          <div class="row g-3">
            <div class="col-md-8">
              <label class="form-label">RUC / Cédula</label>
              <input
                type="text"
                class="form-control"
                v-model="form.ruc"
                placeholder="Ingrese RUC o Cédula"
              />
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
              <label class="form-label">Nombre / Razón Social</label>
              <input
                type="text"
                class="form-control"
                v-model="form.nombre"
                required
              />
            </div>
            <div class="col-md-6">
              <label class="form-label">Tipo</label>
              <select class="form-select" v-model="form.tipo">
                <option value="persona">Persona Natural</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label">Teléfono</label>
              <input
                type="text"
                class="form-control"
                v-model="form.telefono"
              />
            </div>
            <div class="col-md-6">
              <label class="form-label">Email</label>
              <input
                type="email"
                class="form-control"
                v-model="form.email"
              />
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
            <button type="submit" class="btn btn-success me-2">
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
import { ref, onMounted } from 'vue'
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

// ===== BUSCAR POR RUC/CÉDULA USANDO ECUADORLEGAL =====
const buscarPorIdentificacion = async () => {
  if (!form.value.ruc || form.value.ruc.trim().length !== 10) {
    alert('Ingrese un RUC o Cédula válido (10 dígitos)')
    return
  }

  buscando.value = true

  try {
    // Llamar a nuestro backend que hace scraping a EcuadorLegal
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/consultas/cedula/${form.value.ruc.trim()}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Error al consultar')
    }

    const data = await response.json()
    console.log('Datos obtenidos:', data) // Para depuración

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
  if (!form.value.nombre || !form.value.ruc) {
    alert('El nombre y RUC son obligatorios')
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

<style scoped>
/* Estilos adicionales si los necesitas */
</style>