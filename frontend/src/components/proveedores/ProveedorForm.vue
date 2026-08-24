<template>
  <div>
    <h4 class="section-title"><i class="fas fa-edit"></i> {{ id ? 'Editar' : 'Nuevo' }} Proveedor</h4>
    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Nombre</label>
              <input type="text" class="form-control" v-model="form.nombre" required>
            </div>
            <div class="col-md-6">
              <label class="form-label">RUC</label>
              <input type="text" class="form-control" v-model="form.ruc">
            </div>
            <div class="col-md-4">
              <label class="form-label">Teléfono</label>
              <input type="text" class="form-control" v-model="form.telefono">
            </div>
            <div class="col-md-4">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" v-model="form.email">
            </div>
            <div class="col-md-4">
              <label class="form-label">Dirección</label>
              <input type="text" class="form-control" v-model="form.direccion">
            </div>
          </div>
          <div class="mt-4">
            <button type="submit" class="btn btn-cacao-success me-2"><i class="fas fa-save"></i> Guardar</button>
            <router-link to="/proveedores" class="btn btn-secondary">Cancelar</router-link>
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
const form = ref({ nombre: '', ruc: '', telefono: '', email: '', direccion: '' })

onMounted(async () => {
  if (id) {
    try {
      const data = await findById('proveedores', id)
      form.value = data
    } catch (e) {
      console.error(e)
    }
  }
})

const guardar = async () => {
  try {
    if (id) {
      await updateOne('proveedores', id, form.value)
    } else {
      await insertOne('proveedores', form.value)
    }
    router.push('/proveedores')
  } catch (e) {
    alert('Error: ' + e.message)
  }
}
// ===== BUSCAR POR RUC/CÉDULA USANDO ECUADORLEGAL =====
const buscarPorIdentificacion = async () => {
  if (!form.value.ruc || form.value.ruc.trim().length !== 10) {
    alert('Ingrese un RUC o Cédula válido (10 dígitos)')
    return
  }

  buscando.value = true

  try {
    // Llamar a nuestro backend que hace scraping
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
</script>