<template>
  <div>
    <h4 class="section-title"><i class="fas fa-clipboard-list"></i> Kardex</h4>
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Tipo de Filtro</label>
        <select class="form-select" v-model="tipoFiltro">
          <option value="producto">Producto</option>
          <option value="cliente">Cliente</option>
          <option value="proveedor">Proveedor</option>
        </select>
      </div>
      <div class="col-md-3">
        <label class="form-label">Seleccionar</label>
        <select class="form-select" v-model="entidadSeleccionada" v-if="tipoFiltro === 'producto'">
          <option value="">Seleccionar Producto</option>
          <option v-for="p in productos" :key="p._id" :value="p._id">{{ p.nombre }}</option>
        </select>
        <select class="form-select" v-model="entidadSeleccionada" v-else-if="tipoFiltro === 'cliente'">
          <option value="">Seleccionar Cliente</option>
          <option v-for="c in clientes" :key="c._id" :value="c._id">{{ c.nombre }}</option>
        </select>
        <select class="form-select" v-model="entidadSeleccionada" v-else>
          <option value="">Seleccionar Proveedor</option>
          <option v-for="p in proveedores" :key="p._id" :value="p._id">{{ p.nombre }}</option>
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label">Desde</label>
        <input type="date" class="form-control" v-model="fechaDesde">
      </div>
      <div class="col-md-2">
        <label class="form-label">Hasta</label>
        <input type="date" class="form-control" v-model="fechaHasta">
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary" @click="consultar" :disabled="!entidadSeleccionada"><i class="fas fa-search"></i> Consultar</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead><tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Costo Unit.</th>
            <th>Saldo</th>
            <th>Ref.</th>
          </tr></thead>
          <tbody>
            <tr v-for="mov in movimientos" :key="mov._id">
              <td>{{ new Date(mov.fecha).toLocaleDateString() }}</td>
              <td>{{ obtenerNombreProducto(mov.productoId) }}</td>
              <td><span class="badge" :class="mov.tipo_movimiento === 'compra' ? 'bg-success' : 'bg-primary'">{{ mov.tipo_movimiento }}</span></td>
              <td>{{ mov.cantidad }}</td>
              <td>${{ mov.costo_unitario?.toFixed(2) || '0.00' }}</td>
              <td>{{ mov.saldo }}</td>
              <td>{{ mov.referencia_tipo }}</td>
            </tr>
            <tr v-if="movimientos.length === 0 && !loading && !error">
              <td colspan="7" class="text-muted text-center">Seleccione una entidad y consulte</td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td>
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

const { find, getKardexByProducto, getKardexByCliente, getKardexByProveedor } = useMongoDB()
const productos = ref([])
const clientes = ref([])
const proveedores = ref([])
const tipoFiltro = ref('producto')
const entidadSeleccionada = ref('')
const fechaDesde = ref('')
const fechaHasta = ref('')
const movimientos = ref([])
const loading = ref(false)
const error = ref(null)

// Mapa para obtener nombres de productos
const productosMap = ref({})

const obtenerNombreProducto = (id) => {
  if (!id) return 'N/A'
  const prod = productosMap.value[id]
  return prod ? prod.nombre : 'Producto eliminado'
}

onMounted(async () => {
  try {
    const [prods, clis, provs] = await Promise.all([
      find('productos'),
      find('clientes'),
      find('proveedores')
    ])
    productos.value = prods
    clientes.value = clis
    proveedores.value = provs
    // Crear mapa de productos
    prods.forEach(p => productosMap.value[p._id] = p)
  } catch (e) {
    console.error(e)
  }
})

const consultar = async () => {
  if (!entidadSeleccionada.value) {
    alert('Seleccione una entidad')
    return
  }
  loading.value = true
  error.value = null
  try {
    let data = []
    if (tipoFiltro.value === 'producto') {
      data = await getKardexByProducto(entidadSeleccionada.value, fechaDesde.value, fechaHasta.value)
    } else if (tipoFiltro.value === 'cliente') {
      data = await getKardexByCliente(entidadSeleccionada.value, fechaDesde.value, fechaHasta.value)
    } else {
      data = await getKardexByProveedor(entidadSeleccionada.value, fechaDesde.value, fechaHasta.value)
    }
    movimientos.value = data
  } catch (e) {
    error.value = e.message || 'Error al consultar'
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>