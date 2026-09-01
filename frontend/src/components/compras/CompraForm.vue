<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-shopping-cart"></i> Nueva Compra
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <!-- ===== BÚSQUEDA POR RUC/CÉDULA ===== -->
          <div class="row g-3 mb-3">
            <div class="col-md-8">
              <label class="form-label">Buscar Proveedor por RUC/Cédula</label>
              <div class="input-group">
                <input 
                  type="text" 
                  class="form-control" 
                  v-model="rucBusqueda" 
                  placeholder="Ingrese RUC (13 dígitos) o Cédula (10 dígitos)"
                >
                <button class="btn btn-outline-primary" type="button" @click="buscarProveedorPorRuc">
                  <i class="fas fa-search"></i> Buscar
                </button>
              </div>
              <small class="text-muted">Permite RUC (terminado en 001) o Cédula (10 dígitos)</small>
            </div>
          </div>

          <hr>

          <!-- ===== DATOS DE LA COMPRA ===== -->
          <div class="row g-3">
            <div class="col-md-5">
              <label class="form-label"><span class="text-danger">*</span> Proveedor</label>
              <div class="d-flex gap-2">
                <select class="form-select" v-model="compra.proveedorId" required>
                  <option value="">Seleccionar Proveedor</option>
                  <option v-for="p in proveedores" :key="p._id" :value="p._id">{{ p.nombre }}</option>
                </select>
                <router-link to="/proveedores/nuevo" class="btn btn-outline-primary" style="white-space: nowrap;">
                  <i class="fas fa-plus"></i> Nuevo
                </router-link>
              </div>
            </div>
            <div class="col-md-3">
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
            <div class="col-md-4">
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
              <label class="form-label">Subtotal</label>
              <input type="text" class="form-control" :value="(item.cantidad * item.costo_unitario).toFixed(2)" readonly>
            </div>
            <div class="col-md-2">
              <button type="button" class="btn btn-danger btn-sm mt-2" @click="eliminarDetalle(index)"><i class="fas fa-times"></i></button>
            </div>
          </div>
          
          <div class="d-flex gap-2 mt-2">
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
const rucBusqueda = ref('')
const buscandoProveedor = ref(false)

const compra = ref({
  proveedorId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  detalles: [],
  subtotal: 0,
  iva: 0,
  total: 0
})

// ===== GENERAR CÓDIGO LOCAL =====
const generarCodigoCompra = () => {
  const numero = String(Date.now()).slice(-6)
  return `COM-${numero}`
}

// ===== BUSCAR PROVEEDOR POR RUC/CÉDULA =====
const buscarProveedorPorRuc = async () => {
  if (!rucBusqueda.value.trim()) {
    alert('Ingrese un RUC o Cédula para buscar')
    return
  }

  const busqueda = rucBusqueda.value.trim()
  // Validar RUC (13 dígitos terminados en 001) o Cédula (10 dígitos)
  const esRuc = /^\d{13}$/.test(busqueda) && busqueda.endsWith('001')
  const esCedula = /^\d{10}$/.test(busqueda)
  
  if (!esRuc && !esCedula) {
    alert('Formato inválido. Use RUC (13 dígitos terminado en 001) o Cédula (10 dígitos)')
    return
  }

  buscandoProveedor.value = true
  try {
    const todos = await find('proveedores')
    const encontrado = todos.find(p => p.ruc === busqueda)
    if (encontrado) {
      compra.value.proveedorId = encontrado._id
      alert(`Proveedor encontrado: ${encontrado.nombre}`)
    } else {
      const tipo = esRuc ? 'RUC' : 'Cédula'
      alert(`No se encontró ningún proveedor con ese ${tipo}. Puede crearlo usando el botón "Nuevo"`)
    }
  } catch (e) {
    console.error('Error buscando proveedor:', e)
    alert('Error al buscar proveedor')
  } finally {
    buscandoProveedor.value = false
  }
}

// ===== DETALLES =====
const agregarDetalle = () => {
  compra.value.detalles.push({ productoId: '', cantidad: 1, costo_unitario: 0 })
}

const eliminarDetalle = (index) => {
  compra.value.detalles.splice(index, 1)
}

const cargarPrecio = (item) => {
  const prod = productos.value.find(p => p._id === item.productoId)
  if (prod) item.costo_unitario = prod.precio_compra
}

const subtotal = computed(() => {
  return compra.value.detalles.reduce((acc, d) => acc + (d.cantidad * d.costo_unitario || 0), 0)
})

const iva = computed(() => subtotal.value * 0.15)
const total = computed(() => subtotal.value + iva.value)

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
        cantidad: d.cantidad,
        costo_unitario: d.costo_unitario
      })),
      subtotal: subtotal.value,
      iva: iva.value,
      total: total.value
    }
    await insertOne('compras', payload)
    router.push('/compras')
  } catch (e) {
    alert('Error al guardar compra: ' + e.message)
  }
}
</script>