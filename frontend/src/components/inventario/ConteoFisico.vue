<template>
  <div>
    <h4 class="section-title"><i class="fas fa-clipboard-check"></i> Conteo Físico</h4>

    <div class="alert alert-info">
      <i class="fas fa-info-circle"></i> Realice el conteo físico de los productos y registre las cantidades. El sistema calculará la diferencia con el stock teórico.
    </div>

    <div class="card card-cacao">
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
            <tr v-if="productos.length === 0">
              <td colspan="5" class="text-center text-muted">No hay productos registrados</td>
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
  // Aquí se podría guardar en una colección "conteos" o generar un ajuste
  alert('Conteo guardado temporalmente. Próximamente se implementará ajuste automático.')
  console.log('Conteos:', conteos.value)
}

onMounted(async () => {
  try {
    productos.value = await find('productos')
    // Inicializar conteos con stock actual
    productos.value.forEach(p => {
      conteos.value[p._id] = p.stock
    })
  } catch (e) {
    console.error(e)
  }
})
</script>