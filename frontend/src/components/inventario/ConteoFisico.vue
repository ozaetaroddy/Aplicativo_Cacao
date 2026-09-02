<template>
  <div>
    <h4 class="section-title"><i class="fas fa-clipboard-check"></i> Conteo Físico</h4>

    <div v-if="error" class="alert alert-danger">
      <i class="fas fa-exclamation-circle"></i> Error: {{ error }}
    </div>

    <div v-if="cargando" class="text-center p-4">
      <i class="fas fa-spinner fa-spin fa-2x"></i>
      <p>Cargando productos...</p>
    </div>

    <div v-else-if="productos.length === 0" class="alert alert-warning">
      <i class="fas fa-info-circle"></i> No hay productos registrados en el sistema.
    </div>

    <div v-else class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              <th>Stock Teórico</th>
              <th>Conteo Físico</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(prod, idx) in productos" :key="prod._id">
              <td>{{ idx + 1 }}</td>
              <td>{{ prod.nombre }}</td>
              <td>{{ prod.stock }}</td>
              <td>
                <input type="number" class="form-control form-control-sm" v-model.number="conteos[prod._id]" min="0" step="1">
              </td>
              <td>
                <span :class="getDiferenciaClass(prod)">
                  {{ getDiferencia(prod) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="mt-3">
          <button class="btn btn-primary" @click="guardarConteo" :disabled="!hayConteos">
            <i class="fas fa-save"></i> Guardar Conteo
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find } = useMongoDB()
const productos = ref([])
const conteos = ref({})
const cargando = ref(false)
const error = ref(null)

const hayConteos = computed(() => {
  return Object.values(conteos.value).some(v => v !== undefined && v !== null && v !== '')
})

const getDiferencia = (prod) => {
  const conteo = conteos.value[prod._id] || 0
  const diff = conteo - prod.stock
  return diff === 0 ? '0' : (diff > 0 ? `+${diff}` : diff)
}

const getDiferenciaClass = (prod) => {
  const diff = (conteos.value[prod._id] || 0) - prod.stock
  if (diff === 0) return 'text-muted'
  return diff > 0 ? 'text-success' : 'text-danger'
}

const guardarConteo = () => {
  alert('Conteo guardado temporalmente. Próximamente se implementará ajuste automático.')
  console.log('Conteos:', conteos.value)
}

onMounted(async () => {
  cargando.value = true
  error.value = null
  try {
    console.log('📡 Cargando productos para conteo físico...')
    const data = await find('productos')
    console.log('✅ Productos recibidos:', data)
    productos.value = data
    // Inicializar conteos con stock actual
    data.forEach(p => {
      conteos.value[p._id] = p.stock
    })
  } catch (e) {
    console.error('❌ Error al cargar productos:', e)
    error.value = e.message || 'Error al cargar los productos'
  } finally {
    cargando.value = false
  }
})
</script>