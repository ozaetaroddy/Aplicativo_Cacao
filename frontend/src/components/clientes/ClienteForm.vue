<template>
  <div>
    <h4 class="section-title"><i class="fas fa-edit"></i> {{ id ? 'Editar' : 'Nuevo' }} Cliente</h4>
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
              <label class="form-label">Tipo</label>
              <select class="form-select" v-model="form.tipo">
                <option value="persona">Persona</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
            <div class="col-md-12">
              <label class="form-label">Dirección</label>
              <input type="text" class="form-control" v-model="form.direccion">
            </div>
          </div>
          <div class="mt-4">
            <button type="submit" class="btn btn-cacao-success me-2"><i class="fas fa-save"></i> Guardar</button>
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

const route = useRoute()
const router = useRouter()
const { findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const form = ref({ nombre: '', ruc: '', telefono: '', email: '', direccion: '', tipo: 'persona' })

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

const guardar = async () => {
  try {
    if (id) {
      await updateOne('clientes', id, form.value)
    } else {
      await insertOne('clientes', form.value)
    }
    router.push('/clientes')
  } catch (e) {
    alert('Error: ' + e.message)
  }
}
</script>