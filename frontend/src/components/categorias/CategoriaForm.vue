<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-tags"></i> {{ id ? 'Editar' : 'Nueva' }} Categoría
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Nombre</label>
              <input
                type="text"
                class="form-control"
                v-model="form.nombre"
                required
              />
            </div>
            <div class="col-md-6">
              <label class="form-label">Descripción</label>
              <input
                type="text"
                class="form-control"
                v-model="form.descripcion"
              />
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
            <router-link to="/categorias" class="btn btn-secondary">
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
const cargando = ref(false)
const errorGeneral = ref('')

const form = ref({
  nombre: '',
  descripcion: ''
})

onMounted(async () => {
  if (id) {
    try {
      console.log('Cargando categoría con ID:', id)
      const data = await findById('categorias', id)
      console.log('Datos cargados:', data)
      if (data) {
        form.value = data
      } else {
        errorGeneral.value = 'No se encontró la categoría'
      }
    } catch (e) {
      console.error('Error al cargar categoría:', e)
      errorGeneral.value = 'Error al cargar los datos: ' + e.message
    }
  }
})

const guardar = async () => {
  if (!form.value.nombre?.trim()) {
    errorGeneral.value = 'El nombre es obligatorio'
    return
  }
  errorGeneral.value = ''
  cargando.value = true

  try {
    const datos = {
      nombre: form.value.nombre.trim(),
      descripcion: form.value.descripcion?.trim() || ''
    }
    if (id) {
      await updateOne('categorias', id, datos)
    } else {
      await insertOne('categorias', datos)
    }
    router.push('/categorias')
  } catch (e) {
    console.error('Error al guardar:', e)
    errorGeneral.value = 'Error al guardar: ' + e.message
  } finally {
    cargando.value = false
  }
}
</script>