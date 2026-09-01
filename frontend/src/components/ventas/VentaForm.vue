<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-file-invoice"></i>
      {{ tipoDocumento === 'guia_remision' ? 'Guía de Remisión' :
         tipoDocumento === 'exportacion' ? 'Factura de Exportación' :
         tipoDocumento === 'reembolso' ? 'Factura de Reembolso' :
         tipoDocumento === 'retencion' ? 'Comprobante de Retención' :
         tipoDocumento === 'liquidacion' ? 'Liquidación de Compra' :
         id ? 'Editar Documento' : 'Nuevo Documento' }}
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar">
          <!-- ===== SELECCIÓN DE TIPO DE DOCUMENTO ===== -->
          <div class="row g-3 mb-3">
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Tipo de Documento</label>
              <select class="form-select" v-model="venta.tipo_documento" @change="cambiarTipo">
                <option value="factura">Factura</option>
                <option value="guia_remision">Guía de Remisión</option>
                <option value="exportacion">Factura de Exportación</option>
                <option value="reembolso">Factura de Reembolso</option>
                <option value="retencion">Comprobante de Retención</option>
                <option value="liquidacion">Liquidación de Compra</option>
                <option value="nota_credito">Nota de Crédito</option>
                <option value="proforma">Proforma</option>
                <option value="nota_venta">Nota de Venta</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Nº Documento</label>
              <input type="text" class="form-control" v-model="venta.numero_factura" placeholder="Se genera automático">
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión</label>
              <input type="date" class="form-control" v-model="venta.fecha_emision" required>
            </div>
          </div>

          <!-- ===== CAMPOS ESPECIALES SEGÚN TIPO ===== -->
          <div v-if="venta.tipo_documento === 'guia_remision'" class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Nº Guía</label>
              <input type="text" class="form-control" v-model="venta.numero_guia">
            </div>
            <div class="col-md-4">
              <label class="form-label">Transportista</label>
              <input type="text" class="form-control" v-model="venta.transportista">
            </div>
            <div class="col-md-4">
              <label class="form-label">Placa</label>
              <input type="text" class="form-control" v-model="venta.placa">
            </div>
          </div>

          <div v-if="venta.tipo_documento === 'exportacion'" class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Nº Exportación</label>
              <input type="text" class="form-control" v-model="venta.numero_exportacion">
            </div>
            <div class="col-md-4">
              <label class="form-label">País Destino</label>
              <input type="text" class="form-control" v-model="venta.pais_destino">
            </div>
          </div>

          <div v-if="venta.tipo_documento === 'retencion'" class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Nº Retención</label>
              <input type="text" class="form-control" v-model="venta.numero_retencion">
            </div>
            <div class="col-md-4">
              <label class="form-label">Porcentaje Retenido</label>
              <input type="number" class="form-control" v-model.number="venta.porcentaje_retencion" step="0.01">
            </div>
          </div>

          <hr />

          <!-- ===== CLIENTE ===== -->
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Cliente</label>
              <select class="form-select" v-model="venta.clienteId" required>
                <option value="">Seleccionar Cliente</option>
                <option v-for="c in clientes" :key="c._id" :value="c._id">{{ c.nombre }}</option>
              </select>
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <router-link to="/clientes/nuevo" class="btn btn-outline-primary w-100">
                <i class="fas fa-plus"></i> Nuevo Cliente
              </router-link>
            </div>
          </div>

          <hr />
          <h5>Detalles</h5>
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

          <hr />
          <div class="row g-3">
            <div class="col-md-3 offset-md-6"><label class="form-label">Subtotal</label><input type="text" class="form-control" :value="subtotal.toFixed(2)" readonly></div>
            <div class="col-md-3"><label class="form-label">IVA (15%)</label><input type="text" class="form-control" :value="iva.toFixed(2)" readonly></div>
          </div>
          <div class="row g-3">
            <div class="col-md-3 offset-md-6"><label class="form-label">Total</label><input type="text" class="form-control" :value="total.toFixed(2)" readonly style="font-weight:700;"></div>
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2"><i class="fas fa-save"></i> Guardar</button>
            <router-link to="/ventas" class="btn btn-secondary">Cancelar</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'

const route = useRoute()
const router = useRouter()
const { find, findById, insertOne, updateOne } = useMongoDB()
const id = route.params.id
const clientes = ref([])
const productos = ref([])

// Detectar tipo de documento desde la URL
const tipoInicial = route.query.tipo || 'factura'

const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  tipo_documento: tipoInicial,
  detalles: [],
  // Campos especiales
  numero_guia: '',
  transportista: '',
  placa: '',
  numero_exportacion: '',
  pais_destino: '',
  numero_retencion: '',
  porcentaje_retencion: 0
})

// ===== GENERACIÓN DE CÓDIGO =====
const generarCodigo = async (tipo) => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/contadores/siguiente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo })
    })
    if (!response.ok) throw new Error('Error al generar código')
    const data = await response.json()
    venta.value.numero_factura = data.codigo
  } catch (e) {
    console.error('Error generando código:', e)
    // Fallback: código temporal
    venta.value.numero_factura = `${tipo.toUpperCase()}-${Date.now()}`
  }
}

// ===== FUNCIONES DEL FORMULARIO =====
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

const cambiarTipo = () => {
  // Resetear campos especiales
  venta.value.numero_guia = ''
  venta.value.transportista = ''
  venta.value.placa = ''
  venta.value.numero_exportacion = ''
  venta.value.pais_destino = ''
  venta.value.numero_retencion = ''
  venta.value.porcentaje_retencion = 0
  // Generar nuevo código
  generarCodigo(venta.value.tipo_documento)
}

// ===== CARGAR DATOS INICIALES =====
onMounted(async () => {
  try {
    const [clis, prods] = await Promise.all([
      find('clientes'),
      find('productos')
    ])
    clientes.value = clis
    productos.value = prods

    // Si es edición, cargar datos
    if (id) {
      const data = await findById('ventas', id)
      if (data) {
        venta.value = data
      }
    } else {
      // Nuevo: generar código y agregar primer detalle
      await generarCodigo(venta.value.tipo_documento)
      agregarDetalle()
    }
  } catch (e) {
    console.error('Error cargando datos:', e)
    alert('Error al cargar los datos')
  }
})

// ===== GUARDAR =====
const guardar = async () => {
  if (!venta.value.clienteId) {
    alert('Seleccione un cliente')
    return
  }
  if (venta.value.detalles.length === 0 || !venta.value.detalles[0].productoId) {
    alert('Agregue al menos un producto')
    return
  }

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
      total: total.value,
      // Campos especiales
      numero_guia: venta.value.numero_guia,
      transportista: venta.value.transportista,
      placa: venta.value.placa,
      numero_exportacion: venta.value.numero_exportacion,
      pais_destino: venta.value.pais_destino,
      numero_retencion: venta.value.numero_retencion,
      porcentaje_retencion: venta.value.porcentaje_retencion
    }

    let resultado
    if (id) {
      resultado = await updateOne('ventas', id, payload)
    } else {
      resultado = await insertOne('ventas', payload)
    }
    console.log('Guardado exitoso:', resultado)
    router.push('/ventas')
  } catch (e) {
    console.error('Error al guardar:', e)
    alert('Error al guardar: ' + e.message)
  }
}
</script>