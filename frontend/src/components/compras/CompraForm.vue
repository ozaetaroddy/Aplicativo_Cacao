<template>
  <div>
    <h4 class="section-title"><i class="fas fa-shopping-cart"></i> Nueva Compra</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <!-- ===== PROVEEDOR ===== -->
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Proveedor</label>
              <select class="form-select" v-model="compra.proveedorId" required>
                <option value="">Seleccionar</option>
                <option v-for="p in proveedores" :key="p._id" :value="p._id">{{ p.nombre }}</option>
              </select>
              <div v-if="errores.proveedor" class="text-danger small">{{ errores.proveedor }}</div>
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <router-link to="/proveedores/nuevo" class="btn btn-outline-primary w-100">
                <i class="fas fa-plus"></i> Nuevo Proveedor
              </router-link>
            </div>
          </div>

          <!-- ===== DATOS DE FACTURA ===== -->
          <div class="row g-3 mt-2">
            <div class="col-md-4">
              <label class="form-label">Nº Factura</label>
              <input type="text" class="form-control" v-model="compra.numero_factura" placeholder="Automático" />
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión</label>
              <input type="date" class="form-control" v-model="compra.fecha_emision" required />
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Tipo de Compra</label>
              <select class="form-select" v-model="compra.tipo_compra" required>
                <option value="inventario">Inventario (Cacao, insumos)</option>
                <option value="gasto">Gasto (Servicios, papelería, honorarios)</option>
              </select>
            </div>
          </div>

          <!-- ===== DETALLES DE COMPRA ===== -->
          <hr />
          <h5>Detalles de compra</h5>
          <div v-for="(item, index) in compra.detalles" :key="index" class="row g-2 align-items-end mb-2">
            <div class="col-md-3">
              <label class="form-label">Producto</label>
              <select class="form-select" v-model="item.productoId" @change="cargarPrecio(item)">
                <option value="">Seleccionar</option>
                <option v-for="prod in productos" :key="prod._id" :value="prod._id">{{ prod.nombre }}</option>
              </select>
              <div v-if="errores.detalles && errores.detalles[index] && errores.detalles[index].producto" class="text-danger small">{{ errores.detalles[index].producto }}</div>
            </div>
            <div class="col-md-2">
              <label class="form-label">Cantidad</label>
              <input type="number" class="form-control" v-model.number="item.cantidad" min="0.01" step="0.01" />
              <div v-if="errores.detalles && errores.detalles[index] && errores.detalles[index].cantidad" class="text-danger small">{{ errores.detalles[index].cantidad }}</div>
            </div>
            <div class="col-md-2">
              <label class="form-label">Costo Unit.</label>
              <input type="number" class="form-control" v-model.number="item.costo_unitario" step="0.01" min="0" />
              <div v-if="errores.detalles && errores.detalles[index] && errores.detalles[index].costo" class="text-danger small">{{ errores.detalles[index].costo }}</div>
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
              <input type="text" class="form-control" :value="formatCurrency((item.cantidad || 0) * (item.costo_unitario || 0))" readonly />
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

          <!-- ===== TOTALES ===== -->
          <hr />
          <div class="row g-3">
            <div class="col-md-3 offset-md-6">
              <label class="form-label">Subtotal</label>
              <input type="text" class="form-control" :value="formatCurrency(subtotal)" readonly />
            </div>
            <div class="col-md-3">
              <label class="form-label">IVA (15%)</label>
              <input type="text" class="form-control" :value="formatCurrency(iva)" readonly />
            </div>
          </div>
          <div class="row g-3">
            <div class="col-md-3 offset-md-6">
              <label class="form-label">Total</label>
              <input type="text" class="form-control" :value="formatCurrency(total)" readonly style="font-weight:700;" />
            </div>
          </div>

          <!-- ===== PAGO Y RETENCIÓN ===== -->
          <hr />
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label">Estado de Pago</label>
              <select class="form-select" v-model="compra.estado_pago">
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Forma de Pago</label>
              <select class="form-select" v-model="compra.forma_pago">
                <option value="">Seleccionar</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia Bancaria</option>
                <option value="cheque">Cheque</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Fecha de Pago</label>
              <input type="date" class="form-control" v-model="compra.fecha_pago" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Valor Retenido ($)</label>
              <input type="number" step="0.01" class="form-control" v-model.number="compra.retencion_valor" min="0" />
            </div>
          </div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Observaciones</label>
              <textarea class="form-control" v-model="compra.observaciones" rows="2" placeholder="Notas adicionales"></textarea>
            </div>
          </div>

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando || !formularioValido">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar Compra' }}
            </button>
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
import { roundTo2, formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'

const toast = useToast()
const router = useRouter()
const { find, insertOne } = useMongoDB()
const proveedores = ref([])
const productos = ref([])
const cargando = ref(false)
const errorGeneral = ref('')

// ===== DATOS DE LA COMPRA (con nuevos campos) =====
const compra = ref({
  proveedorId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  detalles: [],
  subtotal: 0,
  iva: 0,
  total: 0,
  // NUEVOS CAMPOS
  tipo_compra: 'inventario',
  estado_pago: 'pendiente',
  forma_pago: '',
  fecha_pago: '',
  retencion_valor: 0,
  retencion_porcentaje: 0,
  observaciones: ''
})

const errores = ref({
  proveedor: '',
  detalles: []
})

// ===== GENERAR CÓDIGO =====
const generarCodigoCompra = () => {
  const numero = String(Date.now()).slice(-6)
  return `COM-${numero}`
}

// ===== AGREGAR / ELIMINAR DETALLE =====
const agregarDetalle = () => {
  compra.value.detalles.push({ productoId: '', cantidad: 1, costo_unitario: 0, aplica_iva: true })
  errores.value.detalles.push({ producto: '', cantidad: '', costo: '' })
}

const eliminarDetalle = (index) => {
  compra.value.detalles.splice(index, 1)
  errores.value.detalles.splice(index, 1)
}

// ===== CARGAR PRECIO DEL PRODUCTO =====
const cargarPrecio = (item) => {
  const prod = productos.value.find(p => p._id === item.productoId)
  if (prod) {
    item.costo_unitario = roundTo2(prod.precio_compra || 0)
    item.aplica_iva = prod.aplica_iva !== undefined ? prod.aplica_iva : true
  }
}

// ===== CÁLCULOS =====
const subtotal = computed(() => {
  const total = compra.value.detalles.reduce((acc, d) => acc + ((d.cantidad || 0) * (d.costo_unitario || 0)), 0)
  return roundTo2(total)
})

const iva = computed(() => {
  let baseImponible = 0
  compra.value.detalles.forEach(d => {
    const aplicaIVA = d.aplica_iva !== undefined ? d.aplica_iva : true
    if (aplicaIVA) {
      baseImponible += (d.cantidad || 0) * (d.costo_unitario || 0)
    }
  })
  return roundTo2(baseImponible * 0.15)
})

const total = computed(() => {
  return roundTo2(subtotal.value + iva.value)
})

// ===== VALIDACIÓN DEL FORMULARIO =====
const formularioValido = computed(() => {
  // Validar proveedor
  if (!compra.value.proveedorId) {
    errores.value.proveedor = 'Seleccione un proveedor'
    return false
  } else {
    errores.value.proveedor = ''
  }

  // Validar detalles
  let valid = true
  compra.value.detalles.forEach((d, idx) => {
    const err = errores.value.detalles[idx] || { producto: '', cantidad: '', costo: '' }
    if (!d.productoId) {
      err.producto = 'Seleccione un producto'
      valid = false
    } else {
      err.producto = ''
    }
    if (!d.cantidad || d.cantidad <= 0) {
      err.cantidad = 'Cantidad debe ser > 0'
      valid = false
    } else {
      err.cantidad = ''
    }
    if (d.costo_unitario === undefined || d.costo_unitario === null || d.costo_unitario < 0) {
      err.costo = 'Costo unitario debe ser >= 0'
      valid = false
    } else {
      err.costo = ''
    }
    errores.value.detalles[idx] = err
  })

  return valid
})

// ===== MONTAJE =====
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
    toast.error('Error al cargar datos: ' + e.message)
  }
})

// ===== GUARDAR =====
const guardar = async () => {
  if (!formularioValido.value) {
    errorGeneral.value = 'Corrija los errores antes de guardar'
    toast.warning('Corrija los errores antes de guardar')
    return
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const payload = {
      proveedorId: compra.value.proveedorId,
      numero_factura: compra.value.numero_factura,
      fecha_emision: compra.value.fecha_emision,
      detalles: compra.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        costo_unitario: roundTo2(d.costo_unitario),
        aplica_iva: d.aplica_iva
      })),
      subtotal: roundTo2(subtotal.value),
      iva: roundTo2(iva.value),
      total: roundTo2(total.value),
      // Nuevos campos
      tipo_compra: compra.value.tipo_compra,
      estado_pago: compra.value.estado_pago,
      forma_pago: compra.value.forma_pago,
      fecha_pago: compra.value.fecha_pago || null,
      retencion_valor: compra.value.retencion_valor || 0,
      retencion_porcentaje: compra.value.retencion_porcentaje || 0,
      observaciones: compra.value.observaciones || ''
    }
    await insertOne('compras', payload)
    toast.success('Compra guardada exitosamente')
    router.push('/compras')
  } catch (e) {
    errorGeneral.value = 'Error al guardar compra: ' + e.message
    toast.error('Error al guardar compra: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>