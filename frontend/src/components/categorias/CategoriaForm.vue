<template>
  <div>
    <h4 class="section-title"><i class="fas fa-edit"></i> {{ id ? 'Editar' : 'Nueva' }} Categoría</h4>
    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Nombre</label>
              <input type="text" class="form-control" v-model="form.nombre" required>
            </div>
            <div class="col-md-6">
              <label class="form-label">Descripción</label>
              <input type="text" class="form-control" v-model="form.descripcion">
            </div>
          </div>
          <div class="mt-4">
            <button type="submit" class="btn btn-cacao-success me-2"><i class="fas fa-save"></i> Guardar</button>
            <router-link to="/categorias" class="btn btn-secondary">Cancelar</router-link>
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

const form = ref({ nombre: '', descripcion: '' })

onMounted(async () => {
  if (id) {
    try {
      const data = await findById('categorias', id)
      form.value = data
    } catch (e) {
      console.error(e)
    }
  }
})

const guardar = async () => {
  try {
    if (id) {
      await updateOne('categorias', id, form.value)
    } else {
      await insertOne('categorias', form.value)
    }
    router.push('/categorias')
  } catch (e) {
    alert('Error: ' + e.message)
  }
}
</script>