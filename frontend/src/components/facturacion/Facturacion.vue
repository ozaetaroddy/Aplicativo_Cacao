<template>
  <div>
    <h4 class="section-title"><i class="fas fa-file-invoice"></i> Emisión de Facturas</h4>
    <div class="row">
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header">Seleccionar Venta</div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label">Buscar Venta por Nº Factura</label>
              <div class="input-group">
                <input type="text" class="form-control" v-model="busquedaFactura" placeholder="Número de factura">
                <button class="btn btn-primary" @click="buscarVenta"><i class="fas fa-search"></i> Buscar</button>
              </div>
            </div>
            <div v-if="ventaSeleccionada" class="mt-3">
              <p><strong>Cliente:</strong> {{ ventaSeleccionada.cliente?.nombre }}</p>
              <p><strong>Fecha:</strong> {{ new Date(ventaSeleccionada.fecha_emision).toLocaleDateString() }}</p>
              <p><strong>Total:</strong> ${{ ventaSeleccionada.total?.toFixed(2) }}</p>
              <button class="btn btn-success" @click="imprimirFactura('A4')"><i class="fas fa-print"></i> Imprimir A4</button>
              <button class="btn btn-info" @click="imprimirFactura('A2')"><i class="fas fa-print"></i> Imprimir A2</button>
              <button class="btn btn-warning" @click="imprimirFactura('Ticket')"><i class="fas fa-receipt"></i> Ticket</button>
            </div>
            <div v-else class="text-muted">Seleccione una venta</div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header">Últimas Ventas</div>
          <div class="card-body table-responsive" style="max-height: 400px;">
            <table class="table table-sm">
              <thead><tr><th>Factura</th><th>Cliente</th><th>Total</th><th>Acción</th></tr></thead>
              <tbody>
                <tr v-for="v in ventasRecientes" :key="v._id">
                  <td>{{ v.numero_factura }}</td>
                  <td>{{ v.cliente?.nombre }}</td>
                  <td>${{ v.total?.toFixed(2) }}</td>
                  <td><button class="btn btn-sm btn-primary" @click="seleccionarVenta(v)"><i class="fas fa-check"></i></button></td>
                </tr>
                <tr v-if="ventasRecientes.length === 0"><td colspan="4" class="text-muted text-center">No hay ventas recientes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Vista previa de la factura (oculta, solo para impresión) -->
    <div id="facturaPreview" style="display: none;">
      <div id="facturaContent" class="factura">
        <div style="text-align: center; border-bottom: 2px solid #1a2a3a; padding-bottom: 10px; margin-bottom: 15px;">
          <h2><i class="fas fa-microchip"></i> System Ozaet's Electronics</h2>
          <p>RUC: 1234567890001 | Tel: 0996434076 | Email: info@ozaet.com</p>
          <p>Dirección: Quito, Ecuador</p>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <div><strong>Factura Nº:</strong> {{ ventaImprimir?.numero_factura }}</div>
          <div><strong>Fecha:</strong> {{ ventaImprimir ? new Date(ventaImprimir.fecha_emision).toLocaleDateString() : '' }}</div>
        </div>
        <div style="margin-bottom: 10px;">
          <p><strong>Cliente:</strong> {{ ventaImprimir?.cliente?.nombre }} - RUC: {{ ventaImprimir?.cliente?.ruc }}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <thead>
            <tr style="background: #2c3e50; color: white;">
              <th style="padding: 8px; text-align: left;">Producto</th>
              <th style="padding: 8px; text-align: right;">Cantidad</th>
              <th style="padding: 8px; text-align: right;">Precio Unit.</th>
              <th style="padding: 8px; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in ventaImprimir?.detalles || []" :key="idx">
              <td style="padding: 6px; border-bottom: 1px solid #ddd;">{{ obtenerNombreProducto(item.productoId) }}</td>
              <td style="padding: 6px; text-align: right; border-bottom: 1px solid #ddd;">{{ item.cantidad }}</td>
              <td style="padding: 6px; text-align: right; border-bottom: 1px solid #ddd;">${{ item.precio_unitario?.toFixed(2) }}</td>
              <td style="padding: 6px; text-align: right; border-bottom: 1px solid #ddd;">${{ (item.cantidad * item.precio_unitario).toFixed(2) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td colspan="3" style="text-align: right; padding-top: 8px;"><strong>Subtotal:</strong></td><td style="text-align: right;">${{ ventaImprimir?.subtotal?.toFixed(2) }}</td></tr>
            <tr><td colspan="3" style="text-align: right;"><strong>IVA (15%):</strong></td><td style="text-align: right;">${{ ventaImprimir?.iva?.toFixed(2) }}</td></tr>
            <tr><td colspan="3" style="text-align: right; font-size: 1.2em;"><strong>Total:</strong></td><td style="text-align: right; font-size: 1.2em;"><strong>${{ ventaImprimir?.total?.toFixed(2) }}</strong></td></tr>
          </tfoot>
        </table>
        <div style="text-align: center; border-top: 2px solid #1a2a3a; padding-top: 10px; font-size: 0.8em;">
          <p>Factura emitida por System Ozaet's Electronics</p>
          <p>Gracias por su compra</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find, findById } = useMongoDB()
const busquedaFactura = ref('')
const ventaSeleccionada = ref(null)
const ventasRecientes = ref([])
const ventaImprimir = ref(null)
const productos = ref([])

const obtenerNombreProducto = (id) => {
  const prod = productos.value.find(p => p._id === id)
  return prod ? prod.nombre : 'Producto'
}

const cargarDatos = async () => {
  try {
    const [ventas, prods] = await Promise.all([
      find('ventas'),
      find('productos')
    ])
    ventasRecientes.value = ventas.sort((a,b) => new Date(b.fecha_emision) - new Date(a.fecha_emision)).slice(0, 10)
    productos.value = prods
  } catch (e) {
    console.error(e)
  }
}

const buscarVenta = async () => {
  if (!busquedaFactura.value.trim()) return
  try {
    const ventas = await find('ventas')
    const encontrada = ventas.find(v => v.numero_factura === busquedaFactura.value.trim())
    if (encontrada) {
      ventaSeleccionada.value = encontrada
      // Cargar detalles del cliente (ya viene poblado)
    } else {
      alert('No se encontró ninguna venta con ese número de factura')
    }
  } catch (e) {
    alert('Error en la búsqueda: ' + e.message)
  }
}

const seleccionarVenta = (venta) => {
  ventaSeleccionada.value = venta
}

const imprimirFactura = (tamaño) => {
  if (!ventaSeleccionada.value) return alert('Seleccione una venta')
  ventaImprimir.value = ventaSeleccionada.value
  
  // Forzar la actualización del contenido
  setTimeout(() => {
    const contenido = document.getElementById('facturaContent')
    if (!contenido) return
    
    let ancho = '210mm'
    let padding = '20mm'
    if (tamaño === 'A2') {
      ancho = '420mm'
      padding = '20mm'
    } else if (tamaño === 'Ticket') {
      ancho = '80mm'
      padding = '10mm'
      // Ajustar fuente para ticket
      contenido.style.fontSize = '10px'
    } else {
      contenido.style.fontSize = '14px'
    }
    
    const ventana = window.open('', '_blank', 'width=800,height=600')
    if (!ventana) return alert('Permita ventanas emergentes para imprimir')
    
    ventana.document.write(`
      <html>
        <head><title>Factura</title>
        <style>
          body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          .factura { width: ${ancho}; padding: ${padding}; margin: 0 auto; background: white; }
          @media print {
            body { margin: 0; padding: 0; }
            .factura { width: 100%; padding: 0; }
          }
        </style>
        </head>
        <body>
          ${contenido.outerHTML}
          <script>
            window.onload = function() { window.print(); }
          <\/script>
        </body>
      </html>
    `)
    ventana.document.close()
  }, 100)
}

onMounted(() => {
  cargarDatos()
})
</script>

<style scoped>
/* Estilos específicos de impresión */
</style>