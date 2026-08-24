<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-users"></i> Clientes</h4>
      <router-link to="/clientes/nuevo" class="btn btn-cacao-primary"><i class="fas fa-plus"></i> Nuevo Cliente</router-link>
    </div>
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr><th>Nombre</th><th>RUC</th><th>Teléfono</th><th>Email</th><th>Tipo</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="c in clientes" :key="c._id">
              <td>{{ c.nombre }}</td>
              <td>{{ c.ruc }}</td>
              <td>{{ c.telefono }}</td>
              <td>{{ c.email }}</td>
              <td>{{ c.tipo }}</td>
              <td>
                <router-link :to="`/clientes/editar/${c._id}`" class="btn btn-sm btn-outline-primary me-1"><i class="fas fa-edit"></i></router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(c._id)"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
            <tr v-if="clientes.length === 0"><td colspan="6" class="text-muted text-center">No hay clientes</td></tr>
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
const clientes = ref([])

const cargar = async () => {
  try {
    clientes.value = await find('clientes')
  } catch (e) {
    console.error(e)
  }
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar este cliente?')) {
    try {
      await deleteOne('clientes', id)
      await cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }
}

onMounted(cargar)
</script>