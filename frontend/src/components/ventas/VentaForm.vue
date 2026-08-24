<template>
  <!-- Dentro del <template>, justo antes del select de cliente -->
<div class="row g-3">
  <div class="col-md-6">
    <label class="form-label">Buscar Cliente por RUC/Cédula</label>
    <div class="input-group">
      <input type="text" class="form-control" v-model="rucBusqueda" placeholder="Ingrese RUC o Cédula">
      <button class="btn btn-outline-primary" @click="buscarClientePorRuc"><i class="fas fa-search"></i> Buscar</button>
    </div>
  </div>
</div>
<!-- Luego el select de cliente ya existente -->
  <div>
    <h4 class="section-title"><i class="fas fa-hand-holding-usd"></i> Nueva Venta</h4>
    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label">Cliente</label>
              <select class="form-select" v-model="venta.clienteId" required>
                <option value="">Seleccionar</option>
                <option v-for="c in clientes" :key="c._id" :value="c._id">{{ c.nombre }}</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label">Nº Factura</label>
              <input type="text" class="form-control" v-model="venta.numero_factura">
            </div>
            <div class="col-md-2">
              <label class="form-label">Fecha Emisión</label>
              <input type="date" class="form-control" v-model="venta.fecha_emision" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Tipo Documento</label>
              <select class="form-select" v-model="venta.tipo_documento">
                <option value="factura">Factura</option>
                <option value="nota_credito">Nota de Crédito</option>
                <option value="proforma">Proforma</option>
                <option value="nota_venta">Nota de Venta</option>
              </select>
            </div>
          </div>

          <hr>
          <h5>Detalles de venta</h5>
          <div v-for="(item, index) in venta.detalles" :key="index" class="row g-2 align-items-end mb-2">
            <div class="col-md-4">
              <label class="form-label">Producto</label>
              <select class="form-select" v-model="item.productoId" @change="cargarPrecioVenta(item)">
                <option value="">Seleccionar</option>
                <option v-for="prod in productos" :key="prod._id" :value="prod._id">{{ prod.nombre }}</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label">Cantidad</label>
              <input type="number" class="form-control" v-model.number="item.cantidad" min="0.01" step="0.01">
            </div>
            <div class="col-md-2">
              <label class="form-label">Precio Unit.</label>
              <input type="number" class="form-control" v-model.number="item.precio_unitario" step="0.01">
            </div>
            <div class="col-md-2">
              <label class="form-label">Subtotal</label>
              <input type="text" class="form-control" :value="(item.cantidad * item.precio_unitario).toFixed(2)" readonly>
            </div>
            <div class="col-md-2">
              <button type="button" class="btn btn-danger btn-sm mt-2" @click="eliminarDetalle(index)"><i class="fas fa-times"></i></button>
            </div>
          </div>
          <button type="button" class="btn btn-outline-primary btn-sm" @click="agregarDetalle"><i class="fas fa-plus"></i> Agregar producto</button>

          <hr>
          <div class="row g-3">
            <div class="col-md-3 offset-md-6"><label class="form-label">Subtotal</label><input type="text" class="form-control" :value="subtotal" readonly></div>
            <div class="col-md-3"><label class="form-label">IVA (12%)</label><input type="text" class="form-control" :value="iva" readonly></div>
          </div>
          <div class="row g-3">
            <div class="col-md-3 offset-md-6"><label class="form-label">Total</label><input type="text" class="form-control" :value="total" readonly style="font-weight:700;"></div>
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-cacao-primary me-2"><i class="fas fa-save"></i> Guardar Venta</button>
            <router-link to="/ventas" class="btn btn-secondary">Cancelar</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'

const rucBusqueda = ref('')

const buscarClientePorRuc = async () => {
  if (!rucBusqueda.value.trim()) return
  try {
    const clientes = await find('clientes')
    const encontrado = clientes.find(c => c.ruc === rucBusqueda.value.trim())
    if (encontrado) {
      venta.value.clienteId = encontrado._id
      alert('Cliente encontrado: ' + encontrado.nombre)
    } else {
      alert('No se encontró ningún cliente con ese RUC/Cédula. Puede crear uno nuevo en la sección de Clientes.')
    }
  } catch (e) {
    alert('Error en la búsqueda: ' + e.message)
  }
}

const router = useRouter()
const { find, insertOne } = useMongoDB()
const clientes = ref([])
const productos = ref([])

const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  tipo_documento: 'factura',
  detalles: [],
  subtotal: 0,
  iva: 0,
  total: 0
})

const agregarDetalle = () => {
  venta.value.detalles.push({ productoId: '', cantidad: 1, precio_unitario: 0 })
}

const eliminarDetalle = (index) => {
  venta.value.detalles.splice(index, 1)
}

const cargarPrecioVenta = (item) => {
  const prod = productos.value.find(p => p._id === item.productoId)
  if (prod) item.precio_unitario = prod.precio_venta
}

const subtotal = computed(() => {
  return venta.value.detalles.reduce((acc, d) => acc + (d.cantidad * d.precio_unitario || 0), 0)
})

const iva = computed(() => subtotal.value * 0.15)
const total = computed(() => subtotal.value + iva.value)

onMounted(async () => {
  try {
    const [clis, prods] = await Promise.all([
      find('clientes'),
      find('productos')
    ])
    clientes.value = clis
    productos.value = prods
    agregarDetalle()
  } catch (e) {
    console.error(e)
  }
})

const guardar = async () => {
  try {
    const payload = {
      clienteId: venta.value.clienteId,
      numero_factura: venta.value.numero_factura,
      fecha_emision: venta.value.fecha_emision,
      tipo_documento: venta.value.tipo_documento,
      detalles: venta.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario
      })),
      subtotal: subtotal.value,
      iva: iva.value,
      total: total.value
    }
    await insertOne('ventas', payload)
    router.push('/ventas')
  } catch (e) {
    alert('Error al guardar venta: ' + e.message)
  }
}
</script>