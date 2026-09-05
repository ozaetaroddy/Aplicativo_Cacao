<template>
  <div>
    <h4 class="section-title"><i class="fas fa-percent"></i> Nueva Retención</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Proveedor</label>
              <select class="form-select" v-model="retencion.proveedorId" required>
                <option value="">Seleccionar</option>
                <option v-for="p in proveedores" :key="p._id" :value="p._id">{{ p.nombre }}</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label">Nº Factura</label>
              <input type="text" class="form-control" v-model="retencion.numero_factura" />
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión</label>
              <input type="date" class="form-control" v-model="retencion.fecha_emision" required />
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Valor Retenido ($)</label>
              <input type="number" step="0.01" class="form-control" v-model.number="retencion.valor_retenido" required min="0" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Porcentaje (%)</label>
              <input type="number" step="0.01" class="form-control" v-model.number="retencion.porcentaje" min="0" max="100" />
            </div>
          </div>

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar Retención' }}
            </button>
            <router-link to="/retenciones" class="btn btn-secondary">Cancelar</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const router = useRouter()
const { find, insertOne } = useMongoDB()
const proveedores = ref([])
const cargando = ref(false)
const errorGeneral = ref('')

const retencion = ref({
  proveedorId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  valor_retenido: 0,
  porcentaje: 0,
  tipo: 'manual'
})

onMounted(async () => {
  try {
    proveedores.value = await find('proveedores')
  } catch (e) {
    toast.error('Error al cargar proveedores: ' + e.message)
  }
})

const guardar = async () => {
  if (!retencion.value.proveedorId) {
    errorGeneral.value = 'Seleccione un proveedor'
    toast.warning('Seleccione un proveedor')
    return
  }
  if (!retencion.value.valor_retenido || retencion.value.valor_retenido <= 0) {
    errorGeneral.value = 'Ingrese un valor retenido válido'
    toast.warning('Ingrese un valor retenido válido')
    return
  }

  cargando.value = true
  errorGeneral.value = ''

  try {
    await insertOne('retenciones', retencion.value)
    toast.success('Retención guardada exitosamente')
    router.push('/retenciones')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error al guardar: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>