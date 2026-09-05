<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-percent"></i> Retenciones</h4>
      <router-link to="/retenciones/nuevo" class="btn btn-success">
        <i class="fas fa-plus"></i> Nueva Retención
      </router-link>
    </div>

    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Nº Factura</th>
              <th>Valor Retenido</th>
              <th>%</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in retenciones" :key="r._id">
              <td>{{ new Date(r.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ r.proveedor?.nombre || 'N/A' }}</td>
              <td>{{ r.numero_factura }}</td>
              <td>${{ r.valor_retenido.toFixed(2) }}</td>
              <td>{{ r.porcentaje }}%</td>
              <td>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(r._id)">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="retenciones.length === 0">
              <td colspan="6" class="text-muted text-center">No hay retenciones registradas</td>
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
import { useToast } from 'vue-toastification'

const toast = useToast()
const { find, deleteOne } = useMongoDB()
const retenciones = ref([])

const cargar = async () => {
  try {
    retenciones.value = await find('retenciones')
  } catch (e) {
    toast.error('Error al cargar retenciones: ' + e.message)
  }
}

const eliminar = async (id) => {
  if (confirm('¿Eliminar esta retención?')) {
    try {
      await deleteOne('retenciones', id)
      await cargar()
      toast.success('Retención eliminada')
    } catch (e) {
      toast.error('Error al eliminar: ' + e.message)
    }
  }
}

onMounted(cargar)
</script>