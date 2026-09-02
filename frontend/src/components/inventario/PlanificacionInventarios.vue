<template>
  <div>
    <h4 class="section-title"><i class="fas fa-calendar-alt"></i> Planificación de Inventarios</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i> Esta sección permite planificar pedidos basados en el stock mínimo y las ventas proyectadas.
        </div>

        <div class="row g-3 mt-3">
          <div class="col-md-4">
            <label class="form-label">Producto</label>
            <select class="form-select" v-model="productoSeleccionado">
              <option value="">Seleccionar</option>
              <option v-for="p in productos" :key="p._id" :value="p._id">{{ p.nombre }}</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Stock Actual</label>
            <input type="text" class="form-control" :value="stockActual" readonly>
          </div>
          <div class="col-md-2">
            <label class="form-label">Stock Mínimo</label>
            <input type="text" class="form-control" :value="stockMinimo" readonly>
          </div>
          <div class="col-md-2">
            <label class="form-label">Cantidad a Pedir</label>
            <input type="number" class="form-control" v-model="cantidadPedir">
          </div>
          <div class="col-md-2 d-flex align-items-end">
            <button class="btn btn-primary w-100" @click="sugerirPedido"><i class="fas fa-lightbulb"></i> Sugerir</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { find } = useMongoDB()
const productos = ref([])
const productoSeleccionado = ref('')
const cantidadPedir = ref(0)

const productoActual = computed(() => {
  return productos.value.find(p => p._id === productoSeleccionado.value)
})

const stockActual = computed(() => {
  return productoActual.value?.stock || 0
})

const stockMinimo = computed(() => {
  return productoActual.value?.stock_minimo || 0
})

const sugerirPedido = () => {
  if (!productoActual.value) {
    toast.warning('Seleccione un producto')
    return
  }
  const sugerencia = Math.max(0, productoActual.value.stock_minimo - productoActual.value.stock)
  cantidadPedir.value = sugerencia > 0 ? sugerencia : 0
  if (sugerencia === 0) {
    toast.info('El stock actual es suficiente. No es necesario pedir.')
  } else {
    toast.success(`Se sugiere pedir ${sugerencia} unidades de ${productoActual.value.nombre}`)
  }
}

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error(e)
    toast.error('Error al cargar productos: ' + e.message)
  }
})
</script>