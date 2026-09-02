<template>
  <div>
    <h4 class="section-title"><i class="fas fa-shopping-cart"></i> Nueva Compra</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <!-- PROVEEDOR -->
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Proveedor</label>
              <select class="form-select" v-model="compra.proveedorId" required>
                <option value="">Seleccionar</option>
                <option v-for="p in proveedores" :key="p._id" :value="p._id">{{ p.nombre }}</option>
              </select>
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <router-link to="/proveedores/nuevo" class="btn btn-outline-primary w-100">
                <i class="fas fa-plus"></i> Nuevo Proveedor
              </router-link>
            </div>
          </div>

          <div class="row g-3 mt-2">
            <div class="col-md-4">
              <label class="form-label">Nº Factura</label>
              <input type="text" class="form-control" v-model="compra.numero_factura" placeholder="Automático">
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión</label>
              <input type="date" class="form-control" v-model="compra.fecha_emision" required>
            </div>
          </div>

          <hr />
          <h5>Detalles de compra</h5>

          <div v-for="(item, index) in compra.detalles" :key="index" class="row g-2 align-items-end mb-2">
            <div class="col-md-3">
              <label class="form-label">Producto</label>
              <select class="form-select" v-model="item.productoId" @change="cargarPrecio(item)">
                <option value="">Seleccionar</option>
                <option v-for="prod in productos" :key="prod._id" :value="prod._id">{{ prod.nombre }}</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label">Cantidad</label>
              <input type="number" class="form-control" v-model.number="item.cantidad" min="0.01" step="0.01">
            </div>
            <div class="col-md-2">
              <label class="form-label">Costo Unit.</label>
              <input type="number" class="form-control" v-model.number="item.costo_unitario" step="0.01">
            </div>
            <div class="col-md-2">
              <label class="form-label">¿Aplica IVA?</label>
              <select class="form-select" v-model="item.aplica_iva">
                <option :value="true">Sí</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label">Subtotal</label>
              <input type="text" class="form-control" :value="(item.cantidad * item.costo_unitario).toFixed(2)" readonly>
            </div>
            <div class="col-md-1">
              <button type="button" class="btn btn-danger btn-sm mt-2" @click="eliminarDetalle(index)">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <div class="d-flex gap-2">
            <button type="button" class="btn btn-outline-primary btn-sm" @click="agregarDetalle">
              <i class="fas fa-plus"></i> Agregar producto
            </button>
            <router-link to="/productos/nuevo" class="btn btn-outline-success btn-sm">
              <i class="fas fa-box"></i> Crear Producto
            </router-link>
          </div>

          <hr />
          <div class="row g-3">
            <div class="col-md-3 offset-md-6">
              <label class="form-label">Subtotal</label>
              <input type="text" class="form-control" :value="subtotal.toFixed(2)" readonly>
            </div>
            <div class="col-md-3">
              <label class="form-label">IVA (15%)</label>
              <input type="text" class="form-control" :value="iva.toFixed(2)" readonly>
            </div>
          </div>
          <div class="row g-3">
            <div class="col-md-3 offset-md-6">
              <label class="form-label">Total</label>
              <input type="text" class="form-control" :value="total.toFixed(2)" readonly style="font-weight:700;">
            </div>
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2"><i class="fas fa-save"></i> Guardar Compra</button>
            <router-link to="/compras" class="btn btn-secondary">Cancelar</router-link>
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

const router = useRouter()
const { find, insertOne } = useMongoDB()
const proveedores = ref([])
const productos = ref([])

const compra = ref({
  proveedorId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  detalles: [],
  subtotal: 0,
  iva: 0,
  total: 0
})

const generarCodigoCompra = () => {
  const numero = String(Date.now()).slice(-6)
  return `COM-${numero}`
}

const agregarDetalle = () => {
  compra.value.detalles.push({ productoId: '', cantidad: 1, costo_unitario: 0, aplica_iva: true })
}

const eliminarDetalle = (index) => {
  compra.value.detalles.splice(index, 1)
}

const cargarPrecio = (item) => {
  const prod = productos.value.find(p => p._id === item.productoId)
  if (prod) {
    item.costo_unitario = prod.precio_compra || 0
    item.aplica_iva = prod.aplica_iva !== undefined ? prod.aplica_iva : true
  }
}

const subtotal = computed(() => {
  const total = compra.value.detalles.reduce((acc, d) => acc + (d.cantidad * d.costo_unitario || 0), 0)
  return Math.round(total * 100) / 100
})

const iva = computed(() => {
  let baseImponible = 0
  compra.value.detalles.forEach(d => {
    const aplicaIVA = d.aplica_iva !== undefined ? d.aplica_iva : true
    if (aplicaIVA) {
      baseImponible += d.cantidad * d.costo_unitario || 0
    }
  })
  return Math.round((baseImponible * 0.15) * 100) / 100
})

const total = computed(() => {
  return Math.round((subtotal.value + iva.value) * 100) / 100
})

onMounted(async () => {
  try {
    const [provs, prods] = await Promise.all([
      find('proveedores'),
      find('productos')
    ])
    proveedores.value = provs
    productos.value = prods
    agregarDetalle()
    compra.value.numero_factura = generarCodigoCompra()
  } catch (e) {
    console.error(e)
  }
})

const guardar = async () => {
  if (!compra.value.proveedorId) {
    alert('Seleccione un proveedor')
    return
  }
  if (compra.value.detalles.length === 0 || !compra.value.detalles[0].productoId) {
    alert('Agregue al menos un producto')
    return
  }

  try {
    const payload = {
      proveedorId: compra.value.proveedorId,
      numero_factura: compra.value.numero_factura,
      fecha_emision: compra.value.fecha_emision,
      detalles: compra.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: Math.round(d.cantidad * 100) / 100,
        costo_unitario: Math.round((d.costo_unitario || 0) * 100) / 100,
        aplica_iva: d.aplica_iva
      })),
      subtotal: Math.round(subtotal.value * 100) / 100,
      iva: Math.round(iva.value * 100) / 100,
      total: Math.round(total.value * 100) / 100
    }
    await insertOne('compras', payload)
    router.push('/compras')
  } catch (e) {
    alert('Error al guardar compra: ' + e.message)
  }
}
</script>