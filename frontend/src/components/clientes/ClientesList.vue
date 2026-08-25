<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-users"></i> Clientes</h4>
      <router-link to="/clientes/nuevo" class="btn btn-primary">
        <i class="fas fa-plus"></i> Nuevo Cliente
      </router-link>
    </div>

    <div v-if="cargando" class="text-center py-4">
      <i class="fas fa-spinner fa-spin fa-2x"></i> Cargando clientes...
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="card card-cacao" v-if="!cargando">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>RUC/Cédula</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in clientes" :key="c._id">
              <td>{{ c.ruc }}</td>
              <td>{{ c.nombre }}</td>
              <td>{{ c.telefono }}</td>
              <td>{{ c.email }}</td>
              <td>
                <router-link :to="`/clientes/editar/${c._id}`" class="btn btn-sm btn-outline-primary me-1">
                  <i class="fas fa-edit"></i>
                </router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(c._id)">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="clientes.length === 0">
              <td colspan="5" class="text-center text-muted">No hay clientes registrados</td>
            </tr>
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
const cargando = ref(true)
const error = ref(null)

const cargarClientes = async () => {
  cargando.value = true
  error.value = null
  try {
    const data = await find('clientes')
    clientes.value = data
  } catch (e) {
    error.value = e.message || 'Error al cargar clientes'
    console.error(e)
  } finally {
    cargando.value = false
  }
}

const eliminar = async (id) => {
  if (!confirm('¿Eliminar este cliente?')) return
  try {
    await deleteOne('clientes', id)
    await cargarClientes()
  } catch (e) {
    alert('Error al eliminar: ' + e.message)
  }
}

onMounted(cargarClientes)
</script>