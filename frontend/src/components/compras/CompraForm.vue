<template>
  <div class="row g-3">
  <div class="col-md-6">
    <label class="form-label">Buscar Proveedor por RUC/Cédula</label>
    <div class="input-group">
      <input type="text" class="form-control" v-model="rucBusqueda" placeholder="Ingrese RUC o Cédula">
      <button class="btn btn-outline-primary" @click="buscarProveedorPorRuc"><i class="fas fa-search"></i> Buscar</button>
    </div>
  </div>
</div>
<div class="col-md-4">
  <label class="form-label">Nº Documento</label>
  <input type="text" class="form-control" v-model="compra.numero_factura" placeholder="Se generará automáticamente">
</div>
  <div>
    <h4 class="section-title"><i class="fas fa-shopping-cart"></i> Nueva Compra</h4>
    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Proveedor</label>
              <select class="form-select" v-model="compra.proveedorId" required>
                <option value="">Seleccionar</option>
                <option v-for="p in proveedores" :key="p._id" :value="p._id">{{ p.nombre }}</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Nº Factura</label>
              <input type="text" class="form-control" v-model="compra.numero_factura">
            </div>
            <div class="col-md-3">
              <label class="form-label">Fecha Emisión</label>
              <input type="date" class="form-control" v-model="compra.fecha_emision" required>
            </div>
          </div>

          <hr>
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
            <button type="submit" class="btn btn-cacao-success me-2"><i class="fas fa-save"></i> Guardar Compra</button>
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
const rucBusqueda = ref('')

const buscarProveedorPorRuc = async () => {
  if (!rucBusqueda.value.trim()) return
  try {
    const proveedores = await find('proveedores')
    const encontrado = proveedores.find(p => p.ruc === rucBusqueda.value.trim())
    if (encontrado) {
      compra.value.proveedorId = encontrado._id
      // Si quieres mostrar un mensaje de éxito
      alert('Proveedor encontrado: ' + encontrado.nombre)
    } else {
      alert('No se encontró ningún proveedor con ese RUC/Cédula. Puede crear uno nuevo en la sección de Proveedores.')
    }
  } catch (e) {
    alert('Error en la búsqueda: ' + e.message)
  }
}

const router = useRouter()
const { find, insertOne } = useMongoDB()
const proveedores = ref([])
const productos = ref([])

const generarCodigo = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/contadores/siguiente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: compra.value.tipo_documento || 'factura' })
    });
    const data = await response.json();
    if (data.codigo) {
      compra.value.numero_factura = data.codigo;
    }
  } catch (e) {
    console.error('Error generando código:', e);
  }
};

// Llamar a generarCodigo al montar si es nuevo
onMounted(async () => {
  if (!route.params.id) {
    await generarCodigo();
  }
  // ... resto
});

const cambiarTipo = () => {
  // ... resetear campos ...
  generarCodigo(); // nuevo código para el nuevo tipo
};

const compra = ref({
  proveedorId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  detalles: [],
  subtotal: 0,
  iva: 0,
  total: 0
})

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
  } catch (e) {
    console.error(e)
  }
})

const guardar = async () => {
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