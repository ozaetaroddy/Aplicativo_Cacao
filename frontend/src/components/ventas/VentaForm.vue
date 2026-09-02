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
        <form @submit.prevent="guardar">
          <!-- ===== SELECCIÓN DE TIPO ===== -->
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
              <input type="text" class="form-control" v-model="venta.numero_factura" placeholder="Automático">
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión</label>
              <input type="date" class="form-control" v-model="venta.fecha_emision" required>
            </div>
          </div>

          <!-- ===== GUÍA DE REMISIÓN (COMPLETO Y REORDENADO) ===== -->
          <div v-if="venta.tipo_documento === 'guia_remision'" class="row g-3">
            <!-- 1. Datos Generales -->
            <div class="col-12"><h6>Datos Generales</h6></div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Establecimiento</label>
              <input type="text" class="form-control" v-model="venta.establecimiento" required>
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Nombre Comercial</label>
              <input type="text" class="form-control" v-model="venta.nombre_comercial" required>
            </div>
            <div class="col-md-4">
              <label class="form-label"><span class="text-danger">*</span> Punto de Emisión</label>
              <input type="text" class="form-control" v-model="venta.punto_emision" required>
            </div>

            <!-- 2. Destinatario / Cliente -->
            <div class="col-12 mt-3"><h6>Destinatario / Cliente</h6></div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Identificación</label>
              <input type="text" class="form-control" v-model="venta.destinatario_identificacion" required>
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
              <input type="text" class="form-control" v-model="venta.destinatario_razon_social" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Dirección Destino</label>
              <input type="text" class="form-control" v-model="venta.destinatario_direccion" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Ruta</label>
              <input type="text" class="form-control" v-model="venta.ruta" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Motivo</label>
              <input type="text" class="form-control" v-model="venta.motivo" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Documento Aduanero</label>
              <input type="text" class="form-control" v-model="venta.documento_aduana">
            </div>

            <!-- 3. Comprobante Sustento -->
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
              <input type="text" class="form-control" v-model="venta.comprobante_documento" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Buscar por:</label>
              <input type="text" class="form-control" v-model="venta.comprobante_buscar" placeholder="Clave de acceso">
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Clave de Acceso</label>
              <input type="text" class="form-control" v-model="venta.comprobante_clave_acceso" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Número Autorización</label>
              <input type="text" class="form-control" v-model="venta.comprobante_numero_autorizacion" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Fecha Emisión Comprobante</label>
              <input type="date" class="form-control" v-model="venta.comprobante_fecha_emision" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Número Comprobante</label>
              <input type="text" class="form-control" v-model="venta.comprobante_numero" required>
            </div>

            <!-- 4. Transportista -->
            <div class="col-12 mt-3"><h6>Transportista</h6></div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Identificación</label>
              <input type="text" class="form-control" v-model="venta.transportista_identificacion" required>
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
              <input type="text" class="form-control" v-model="venta.transportista_razon_social" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Correo Electrónico</label>
              <input type="email" class="form-control" v-model="venta.transportista_correo" required>
            </div>

            <!-- 5. Traslado -->
            <div class="col-12 mt-3"><h6>Traslado</h6></div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Dirección Partida</label>
              <input type="text" class="form-control" v-model="venta.direccion_partida" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Inicio Transporte</label>
              <input type="datetime-local" class="form-control" v-model="venta.inicio_transporte" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Fin Transporte</label>
              <input type="datetime-local" class="form-control" v-model="venta.fin_transporte" required>
            </div>
            <div class="col-md-3">
              <label class="form-label"><span class="text-danger">*</span> Placa</label>
              <input type="text" class="form-control" v-model="venta.placa_transporte" required>
            </div>
          </div>

          <!-- ===== CAMPOS ESPECIALES (otros tipos) ===== -->
          <div v-if="venta.tipo_documento === 'exportacion'" class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Nº Exportación</label>
              <input type="text" class="form-control" v-model="venta.numero_exportacion" placeholder="Automático">
            </div>
            <div class="col-md-4">
              <label class="form-label">País Destino</label>
              <input type="text" class="form-control" v-model="venta.pais_destino">
            </div>
          </div>
          <div v-if="venta.tipo_documento === 'retencion'" class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Nº Retención</label>
              <input type="text" class="form-control" v-model="venta.numero_retencion" placeholder="Automático">
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

          <!-- ===== DETALLES DE PRODUCTOS ===== -->
          <hr />
          <h5>Detalle de Productos</h5>
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> Escriba una letra o palabra, después seleccione el producto
          </div>

          <div v-for="(item, index) in venta.detalles" :key="index" class="row g-2 align-items-end mb-2">
            <div class="col-md-3">
              <label class="form-label">Buscar en listado de productos</label>
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

          <!-- ===== TOTALES ===== -->
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
const { find, insertOne } = useMongoDB()
const clientes = ref([])
const productos = ref([])

const tipoInicial = route.query.tipo || 'factura'

const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  tipo_documento: tipoInicial,
  detalles: [],
  // Campos comunes
  numero_guia: '',
  transportista: '',
  placa: '',
  numero_exportacion: '',
  pais_destino: '',
  numero_retencion: '',
  porcentaje_retencion: 0,
  // Campos guía de remisión
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
  // Nuevos campos
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

const agregarDetalle = () => {
  venta.value.detalles.push({ productoId: '', cantidad: 1, precio_unitario: 0, aplica_iva: true })
}

const eliminarDetalle = (index) => {
  venta.value.detalles.splice(index, 1)
}

const cargarPrecioVenta = (item) => {
  const prod = productos.value.find(p => p._id === item.productoId)
  if (prod) {
    item.precio_unitario = prod.precio_venta || 0
    item.aplica_iva = prod.aplica_iva !== undefined ? prod.aplica_iva : true
  }
}

const subtotal = computed(() => {
  const total = venta.value.detalles.reduce((acc, d) => acc + (d.cantidad * d.precio_unitario || 0), 0)
  return Math.round(total * 100) / 100
})

const iva = computed(() => {
  let baseImponible = 0
  venta.value.detalles.forEach(d => {
    const aplicaIVA = d.aplica_iva !== undefined ? d.aplica_iva : true
    if (aplicaIVA) {
      baseImponible += d.cantidad * d.precio_unitario || 0
    }
  })
  return Math.round((baseImponible * 0.15) * 100) / 100
})

const total = computed(() => {
  return Math.round((subtotal.value + iva.value) * 100) / 100
})

onMounted(async () => {
  try {
    const [clis, prods] = await Promise.all([
      find('clientes'),
      find('productos')
    ])
    clientes.value = clis
    productos.value = prods
    if (venta.value.detalles.length === 0) agregarDetalle()
    if (!route.params.id) asignarCodigos()
  } catch (e) {
    console.error(e)
  }
})

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
        cantidad: Math.round(d.cantidad * 100) / 100,
        precio_unitario: Math.round((d.precio_unitario || 0) * 100) / 100,
        aplica_iva: d.aplica_iva
      })),
      subtotal: Math.round(subtotal.value * 100) / 100,
      iva: Math.round(iva.value * 100) / 100,
      total: Math.round(total.value * 100) / 100,
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
    router.push('/ventas')
  } catch (e) {
    alert('Error al guardar: ' + e.message)
  }
}
</script>