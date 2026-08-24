<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-tags"></i> Categorías</h4>
      <router-link to="/categorias/nuevo" class="btn btn-cacao-primary"><i class="fas fa-plus"></i> Nueva Categoría</router-link>
    </div>
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr><th>Nombre</th><th>Descripción</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="c in categorias" :key="c._id">
              <td>{{ c.nombre }}</td>
              <td>{{ c.descripcion }}</td>
              <td>
                <router-link :to="`/categorias/editar/${c._id}`" class="btn btn-sm btn-outline-primary me-1"><i class="fas fa-edit"></i></router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(c._id)"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
            <tr v-if="categorias.length === 0"><td colspan="3" class="text-muted text-center">No hay categorías</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find, deleteOne } = useMongoDB()
const categorias = ref([])

const cargar = async () => {
  try {
    categorias.value = await find('categorias')
  } catch (e) {
    console.error(e)
  }
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar esta categoría?')) {
    try {
      await deleteOne('categorias', id)
      await cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }
}

onMounted(cargar)
</script>