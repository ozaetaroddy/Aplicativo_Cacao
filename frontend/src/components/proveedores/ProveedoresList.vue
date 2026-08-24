<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-truck"></i> Proveedores</h4>
      <router-link to="/proveedores/nuevo" class="btn btn-cacao-primary"><i class="fas fa-plus"></i> Nuevo Proveedor</router-link>
    </div>
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr><th>Nombre</th><th>RUC</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="p in proveedores" :key="p._id">
              <td>{{ p.nombre }}</td>
              <td>{{ p.ruc }}</td>
              <td>{{ p.telefono }}</td>
              <td>{{ p.email }}</td>
              <td>{{ p.direccion }}</td>
              <td>
                <router-link :to="`/proveedores/editar/${p._id}`" class="btn btn-sm btn-outline-primary me-1"><i class="fas fa-edit"></i></router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(p._id)"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
            <tr v-if="proveedores.length === 0"><td colspan="6" class="text-muted text-center">No hay proveedores</td></tr>
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
const proveedores = ref([])

const cargar = async () => {
  try {
    proveedores.value = await find('proveedores')
  } catch (e) {
    console.error(e)
  }
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar este proveedor?')) {
    try {
      await deleteOne('proveedores', id)
      await cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }
}

onMounted(cargar)
</script>