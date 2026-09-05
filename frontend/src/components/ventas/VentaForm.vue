<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-file-invoice"></i>
      {{ tipoDocumento === 'factura' ? 'Nueva Factura' :
         tipoDocumento === 'guia_remision' ? 'Guía de Remisión' :
         tipoDocumento === 'exportacion' ? 'Factura de Exportación' :
         tipoDocumento === 'reembolso' ? 'Factura de Reembolso' :
         tipoDocumento === 'retencion' ? 'Comprobante de Retención' :
         tipoDocumento === 'liquidacion' ? 'Liquidación de Compra' :
         tipoDocumento === 'nota_credito' ? 'Nota de Crédito' :
         tipoDocumento === 'proforma' ? 'Proforma' :
         'Nuevo Documento' }}
    </h4>

    <div class="card card-cacao">
      <div class="card-body">
        <form @submit.prevent="guardar" novalidate>
          <!-- Tipo, Nº y Fecha -->
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
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Nº Documento</label>
              <input type="text" class="form-control" v-model="venta.numero_factura" placeholder="Automático" />
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión</label>
              <input type="date" class="form-control" v-model="venta.fecha_emision" required />
            </div>
          </div>

          <!-- Guía de Remisión (todos los campos) -->
          <div v-if="venta.tipo_documento === 'guia_remision'">
            <div class="row g-3">
              <div class="col-12"><h6>Datos Generales</h6></div>
              <div class="col-md-4">
                <label class="form-label"><span class="text-danger">*</span> Establecimiento</label>
                <input type="text" class="form-control" v-model="venta.establecimiento" required />
              </div>
              <div class="col-md-4">
                <label class="form-label"><span class="text-danger">*</span> Nombre Comercial</label>
                <input type="text" class="form-control" v-model="venta.nombre_comercial" required />
              </div>
              <div class="col-md-4">
                <label class="form-label"><span class="text-danger">*</span> Punto de Emisión</label>
                <input type="text" class="form-control" v-model="venta.punto_emision" required />
              </div>

              <div class="col-12 mt-3"><h6>Destinatario / Cliente</h6></div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Identificación</label>
                <input type="text" class="form-control" v-model="venta.destinatario_identificacion" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Tipo Identificación</label>
                <select class="form-select" v-model="venta.destinatario_tipo" required>
                  <option value="">Seleccione</option>
                  <option value="RUC">RUC</option>
                  <option value="CI">CI</option>
                  <option value="Pasaporte">Pasaporte</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Razón Social</label>
                <input type="text" class="form-control" v-model="venta.destinatario_razon_social" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Dirección Destino</label>
                <input type="text" class="form-control" v-model="venta.destinatario_direccion" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Ruta</label>
                <input type="text" class="form-control" v-model="venta.ruta" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Motivo</label>
                <input type="text" class="form-control" v-model="venta.motivo" required />
              </div>
              <div class="col-md-3">
                <label class="form-label">Documento Aduanero</label>
                <input type="text" class="form-control" v-model="venta.documento_aduana" />
              </div>

              <div class="col-12 mt-3"><h6>Comprobante Sustento</h6></div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Tipo Emisión</label>
                <select class="form-select" v-model="venta.comprobante_tipo_emision" required>
                  <option value="">Seleccione</option>
                  <option value="Física">Física</option>
                  <option value="Electrónica">Electrónica</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Documento</label>
                <input type="text" class="form-control" v-model="venta.comprobante_documento" required />
              </div>
              <div class="col-md-3">
                <label class="form-label">Buscar por:</label>
                <input type="text" class="form-control" v-model="venta.comprobante_buscar" placeholder="Clave de acceso" />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Clave de Acceso</label>
                <input type="text" class="form-control" v-model="venta.comprobante_clave_acceso" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Número Autorización</label>
                <input type="text" class="form-control" v-model="venta.comprobante_numero_autorizacion" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Fecha Emisión Comprobante</label>
                <input type="date" class="form-control" v-model="venta.comprobante_fecha_emision" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Número Comprobante</label>
                <input type="text" class="form-control" v-model="venta.comprobante_numero" required />
              </div>

              <div class="col-12 mt-3"><h6>Transportista</h6></div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Identificación</label>
                <input type="text" class="form-control" v-model="venta.transportista_identificacion" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Tipo Identificación</label>
                <select class="form-select" v-model="venta.transportista_tipo" required>
                  <option value="">Seleccione</option>
                  <option value="RUC">RUC</option>
                  <option value="CI">CI</option>
                  <option value="Pasaporte">Pasaporte</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Razón Social</label>
                <input type="text" class="form-control" v-model="venta.transportista_razon_social" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Correo Electrónico</label>
                <input type="email" class="form-control" v-model="venta.transportista_correo" required />
              </div>

              <div class="col-12 mt-3"><h6>Traslado</h6></div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Dirección Partida</label>
                <input type="text" class="form-control" v-model="venta.direccion_partida" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Inicio Transporte</label>
                <input type="datetime-local" class="form-control" v-model="venta.inicio_transporte" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Fin Transporte</label>
                <input type="datetime-local" class="form-control" v-model="venta.fin_transporte" required />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Placa</label>
                <input type="text" class="form-control" v-model="venta.placa_transporte" required />
              </div>
            </div>
          </div>

          <!-- Cliente (solo para no guías) -->
          <div class="row g-3" v-if="venta.tipo_documento !== 'guia_remision'">
            <div class="col-md-6">
              <label class="form-label"><span class="text-danger">*</span> Cliente</label>
              <select class="form-select" v-model="venta.clienteId" required>
                <option value="">Seleccionar Cliente</option>
                <option v-for="c in clientes" :key="c._id" :value="c._id">{{ c.nombre }}</option>
              </select>
              <div v-if="errores.cliente" class="text-danger small">{{ errores.cliente }}</div>
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <router-link to="/clientes/nuevo" class="btn btn-outline-primary w-100">
                <i class="fas fa-plus"></i> Nuevo Cliente
              </router-link>
            </div>
          </div>

          <!-- Detalles de productos -->
          <hr />
          <h5>Detalle de Productos</h5>
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> Seleccione el producto y complete cantidad y precio.
          </div>

          <div v-for="(item, index) in venta.detalles" :key="index" class="row g-2 align-items-end mb-2">
            <div class="col-md-3">
              <label class="form-label">Producto</label>
              <select class="form-select" v-model="item.productoId" @change="cargarPrecioVenta(item)">
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
              <label class="form-label">Precio Unit.</label>
              <input type="number" class="form-control" v-model.number="item.precio_unitario" step="0.01" min="0" />
              <div v-if="errores.detalles && errores.detalles[index] && errores.detalles[index].precio" class="text-danger small">{{ errores.detalles[index].precio }}</div>
            </div>
            <div class="col-md-2">
              <label class="form-label">Subtotal</label>
              <input type="text" class="form-control" :value="formatCurrency((item.cantidad || 0) * (item.precio_unitario || 0))" readonly />
            </div>
            <div class="col-md-2">
              <label class="form-label">¿Aplica IVA?</label>
              <select class="form-select" v-model="item.aplica_iva">
                <option :value="true">Sí</option>
                <option :value="false">No</option>
              </select>
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

          <div v-if="errorGeneral" class="alert alert-danger mt-3">
            <i class="fas fa-exclamation-circle"></i> {{ errorGeneral }}
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-success me-2" :disabled="cargando || !formularioValido">
              <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
              {{ cargando ? 'Guardando...' : 'Guardar' }}
            </button>
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
import { roundTo2, formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { find, findById, insertOne } = useMongoDB()
const clientes = ref([])
const productos = ref([])
const cargando = ref(false)
const errorGeneral = ref('')

const tipoInicial = route.query.tipo || 'factura'
const id = route.params.id // Para edición

const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  tipo_documento: tipoInicial,
  detalles: [],
  numero_guia: '',
  transportista: '',
  placa: '',
  numero_exportacion: '',
  pais_destino: '',
  numero_retencion: '',
  porcentaje_retencion: 0,
  establecimiento: '',
  nombre_comercial: '',
  punto_emision: '',
  transportista_identificacion: '',
  transportista_tipo: '',
  transportista_razon_social: '',
  transportista_correo: '',
  direccion_partida: '',
  inicio_transporte: '',
  fin_transporte: '',
  placa_transporte: '',
  destinatario_identificacion: '',
  destinatario_tipo: '',
  destinatario_razon_social: '',
  destinatario_direccion: '',
  ruta: '',
  motivo: '',
  documento_aduana: '',
  comprobante_tipo_emision: '',
  comprobante_documento: '',
  comprobante_buscar: '',
  comprobante_clave_acceso: '',
  comprobante_numero_autorizacion: '',
  comprobante_numero: '',
  comprobante_fecha_emision: ''
})

const errores = ref({
  cliente: '',
  detalles: []
})

// ===== GENERAR CÓDIGO =====
const generarCodigoLocal = (tipo) => {
  const prefijos = {
    'factura': 'FAC',
    'guia_remision': 'GUI',
    'exportacion': 'EXP',
    'reembolso': 'REB',
    'retencion': 'RET',
    'liquidacion': 'LIQ',
    'nota_credito': 'NCR',
    'proforma': 'PRO'
  }
  const prefijo = prefijos[tipo] || 'DOC'
  const numero = String(Date.now()).slice(-6)
  return `${prefijo}-${numero}`
}

const asignarCodigos = () => {
  const tipo = venta.value.tipo_documento
  venta.value.numero_factura = generarCodigoLocal(tipo)
  if (tipo === 'exportacion') venta.value.numero_exportacion = generarCodigoLocal('exportacion')
  else venta.value.numero_exportacion = ''
  if (tipo === 'guia_remision') venta.value.numero_guia = generarCodigoLocal('guia_remision')
  else venta.value.numero_guia = ''
  if (tipo === 'retencion') venta.value.numero_retencion = generarCodigoLocal('retencion')
  else venta.value.numero_retencion = ''
}

const cambiarTipo = () => {
  venta.value.numero_guia = ''
  venta.value.transportista = ''
  venta.value.placa = ''
  venta.value.numero_exportacion = ''
  venta.value.pais_destino = ''
  venta.value.numero_retencion = ''
  venta.value.porcentaje_retencion = 0
  venta.value.establecimiento = ''
  venta.value.nombre_comercial = ''
  venta.value.punto_emision = ''
  venta.value.transportista_identificacion = ''
  venta.value.transportista_tipo = ''
  venta.value.transportista_razon_social = ''
  venta.value.transportista_correo = ''
  venta.value.direccion_partida = ''
  venta.value.inicio_transporte = ''
  venta.value.fin_transporte = ''
  venta.value.placa_transporte = ''
  venta.value.destinatario_identificacion = ''
  venta.value.destinatario_tipo = ''
  venta.value.destinatario_razon_social = ''
  venta.value.destinatario_direccion = ''
  venta.value.ruta = ''
  venta.value.motivo = ''
  venta.value.documento_aduana = ''
  venta.value.comprobante_tipo_emision = ''
  venta.value.comprobante_documento = ''
  venta.value.comprobante_buscar = ''
  venta.value.comprobante_clave_acceso = ''
  venta.value.comprobante_numero_autorizacion = ''
  venta.value.comprobante_numero = ''
  venta.value.comprobante_fecha_emision = ''
  if (venta.value.detalles.length === 0) agregarDetalle()
  asignarCodigos()
}

// ===== AGREGAR / ELIMINAR DETALLE =====
const agregarDetalle = () => {
  venta.value.detalles.push({ productoId: '', cantidad: 1, precio_unitario: 0, aplica_iva: true })
  errores.value.detalles.push({ producto: '', cantidad: '', precio: '' })
}

const eliminarDetalle = (index) => {
  venta.value.detalles.splice(index, 1)
  errores.value.detalles.splice(index, 1)
}

// ===== CARGAR PRECIO =====
const cargarPrecioVenta = (item) => {
  const prod = productos.value.find(p => p._id === item.productoId)
  if (prod) {
    item.precio_unitario = roundTo2(prod.precio_venta || 0)
    item.aplica_iva = prod.aplica_iva !== undefined ? prod.aplica_iva : true
  }
}

// ===== CÁLCULOS =====
const subtotal = computed(() => {
  const total = venta.value.detalles.reduce((acc, d) => acc + ((d.cantidad || 0) * (d.precio_unitario || 0)), 0)
  return roundTo2(total)
})

const iva = computed(() => {
  let baseImponible = 0
  venta.value.detalles.forEach(d => {
    const aplicaIVA = d.aplica_iva !== undefined ? d.aplica_iva : true
    if (aplicaIVA) {
      baseImponible += (d.cantidad || 0) * (d.precio_unitario || 0)
    }
  })
  return roundTo2(baseImponible * 0.15)
})

const total = computed(() => {
  return roundTo2(subtotal.value + iva.value)
})

// ===== VALIDACIÓN =====
const formularioValido = computed(() => {
  if (venta.value.tipo_documento !== 'guia_remision' && !venta.value.clienteId) {
    errores.value.cliente = 'Seleccione un cliente'
    return false
  } else {
    errores.value.cliente = ''
  }
  let valid = true
  venta.value.detalles.forEach((d, idx) => {
    const err = errores.value.detalles[idx] || { producto: '', cantidad: '', precio: '' }
    if (!d.productoId) {
      err.producto = 'Seleccione un producto'
      valid = false
    } else {
      err.producto = ''
    }
    if (!d.cantidad || d.cantidad <= 0) {
      err.cantidad = 'Cantidad > 0'
      valid = false
    } else {
      err.cantidad = ''
    }
    if (d.precio_unitario === undefined || d.precio_unitario === null || d.precio_unitario < 0) {
      err.precio = 'Precio >= 0'
      valid = false
    } else {
      err.precio = ''
    }
    errores.value.detalles[idx] = err
  })
  return valid
})

// ===== CARGAR DATOS SI ES EDICIÓN =====
onMounted(async () => {
  try {
    const [clis, prods] = await Promise.all([
      find('clientes'),
      find('productos')
    ])
    clientes.value = clis
    productos.value = prods

    if (id) {
      console.log('🔍 Cargando venta con ID:', id)
      const data = await findById('ventas', id)
      console.log('📦 Datos recibidos:', data)
      if (data) {
        venta.value = data
        // Asegurar que los detalles tengan aplica_iva
        if (venta.value.detalles.length === 0) agregarDetalle()
        // Asignar códigos si no tienen
        if (!venta.value.numero_factura) asignarCodigos()
      } else {
        errorGeneral.value = 'No se encontró la venta'
        toast.warning('No se encontró la venta')
      }
    } else {
      if (venta.value.detalles.length === 0) agregarDetalle()
      if (!route.params.id) asignarCodigos()
    }
  } catch (e) {
    console.error('Error al cargar venta:', e)
    errorGeneral.value = 'Error al cargar los datos: ' + e.message
    toast.error('Error al cargar los datos: ' + e.message)
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
      clienteId: venta.value.clienteId || '',
      numero_factura: venta.value.numero_factura,
      fecha_emision: venta.value.fecha_emision,
      tipo_documento: venta.value.tipo_documento,
      detalles: venta.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        precio_unitario: roundTo2(d.precio_unitario),
        aplica_iva: d.aplica_iva
      })),
      subtotal: roundTo2(subtotal.value),
      iva: roundTo2(iva.value),
      total: roundTo2(total.value),
      numero_guia: venta.value.numero_guia,
      transportista: venta.value.transportista,
      placa: venta.value.placa,
      numero_exportacion: venta.value.numero_exportacion,
      pais_destino: venta.value.pais_destino,
      numero_retencion: venta.value.numero_retencion,
      porcentaje_retencion: venta.value.porcentaje_retencion,
      establecimiento: venta.value.establecimiento,
      nombre_comercial: venta.value.nombre_comercial,
      punto_emision: venta.value.punto_emision,
      transportista_identificacion: venta.value.transportista_identificacion,
      transportista_tipo: venta.value.transportista_tipo,
      transportista_razon_social: venta.value.transportista_razon_social,
      transportista_correo: venta.value.transportista_correo,
      direccion_partida: venta.value.direccion_partida,
      inicio_transporte: venta.value.inicio_transporte,
      fin_transporte: venta.value.fin_transporte,
      placa_transporte: venta.value.placa_transporte,
      destinatario_identificacion: venta.value.destinatario_identificacion,
      destinatario_tipo: venta.value.destinatario_tipo,
      destinatario_razon_social: venta.value.destinatario_razon_social,
      destinatario_direccion: venta.value.destinatario_direccion,
      ruta: venta.value.ruta,
      motivo: venta.value.motivo,
      documento_aduana: venta.value.documento_aduana,
      comprobante_tipo_emision: venta.value.comprobante_tipo_emision,
      comprobante_documento: venta.value.comprobante_documento,
      comprobante_buscar: venta.value.comprobante_buscar,
      comprobante_clave_acceso: venta.value.comprobante_clave_acceso,
      comprobante_numero_autorizacion: venta.value.comprobante_numero_autorizacion,
      comprobante_numero: venta.value.comprobante_numero,
      comprobante_fecha_emision: venta.value.comprobante_fecha_emision
    }
    await insertOne('ventas', payload)
    toast.success('Documento guardado exitosamente')
    router.push('/ventas')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error al guardar: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>