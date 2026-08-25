<template>
  <div>
    <h4 class="section-title">
      <i class="fas fa-search"></i> Consultar Documentos
    </h4>

    <!-- Filtros -->
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Tipo de Documento</label>
        <select class="form-select" v-model="tipoSeleccionado">
          <option value="todos">Todos</option>
          <option value="factura">Factura</option>
          <option value="guia_remision">Guía de Remisión</option>
          <option value="exportacion">Factura Exportación</option>
          <option value="reembolso">Factura Reembolso</option>
          <option value="retencion">Comprobante Retención</option>
          <option value="liquidacion">Liquidación Compra</option>
          <option value="nota_credito">Nota de Crédito</option>
          <option value="proforma">Proforma</option>
          <option value="nota_venta">Nota de Venta</option>
        </select>
      </div>
      <div class="col-md-3">
        <label class="form-label">Desde</label>
        <input type="date" class="form-control" v-model="fechaDesde">
      </div>
      <div class="col-md-3">
        <label class="form-label">Hasta</label>
        <input type="date" class="form-control" v-model="fechaHasta">
      </div>
      <div class="col-md-3 d-flex align-items-end">
        <button class="btn btn-primary w-100" @click="consultar">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
    </div>

    <!-- Tabla de resultados -->
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao" id="tablaDocumentos">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nº Documento</th>
              <th>Tipo</th>
              <th>Cliente/Proveedor</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in documentosFiltrados" :key="doc._id">
              <td>{{ new Date(doc.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ doc.numero_factura || 'N/A' }}</td>
              <td>
                <span class="badge bg-primary">{{ doc.tipo_documento || 'Factura' }}</span>
              </td>
              <td>{{ doc.cliente?.nombre || doc.proveedor?.nombre || 'N/A' }}</td>
              <td>${{ (doc.total || 0).toFixed(2) }}</td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-1" @click="imprimirDocumento(doc, 'A4')">
                  <i class="fas fa-print"></i> A4
                </button>
                <button class="btn btn-sm btn-outline-secondary me-1" @click="imprimirDocumento(doc, 'A2')">
                  A2
                </button>
                <button class="btn btn-sm btn-outline-info" @click="imprimirDocumento(doc, 'Ticket')">
                  Ticket
                </button>
              </td>
            </tr>
            <tr v-if="documentosFiltrados.length === 0 && !cargando">
              <td colspan="6" class="text-muted text-center">
                No hay documentos para mostrar. Seleccione filtros y busque.
              </td>
            </tr>
            <tr v-if="cargando">
              <td colspan="6" class="text-center">
                <i class="fas fa-spinner fa-spin"></i> Cargando...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'

const { find } = useMongoDB()
const documentos = ref([])
const tipoSeleccionado = ref('todos')
const fechaDesde = ref('')
const fechaHasta = ref('')
const cargando = ref(false)

// Cargar todos los documentos al montar
onMounted(() => {
  consultar()
})

// Filtrar documentos según tipo y fechas
const documentosFiltrados = computed(() => {
  let docs = documentos.value

  if (tipoSeleccionado.value !== 'todos') {
    docs = docs.filter(doc => doc.tipo_documento === tipoSeleccionado.value)
  }

  if (fechaDesde.value) {
    const desde = new Date(fechaDesde.value)
    docs = docs.filter(doc => new Date(doc.fecha_emision) >= desde)
  }
  if (fechaHasta.value) {
    const hasta = new Date(fechaHasta.value)
    hasta.setHours(23, 59, 59, 999)
    docs = docs.filter(doc => new Date(doc.fecha_emision) <= hasta)
  }

  return docs
})

const consultar = async () => {
  cargando.value = true
  try {
    // Obtener ventas y compras
    const [ventas, compras] = await Promise.all([
      find('ventas'),
      find('compras')
    ])

    // Combinar y agregar información de cliente/proveedor
    const docs = [
      ...ventas.map(v => ({
        ...v,
        cliente: v.cliente || { nombre: 'Cliente eliminado' },
        proveedor: null
      })),
      ...compras.map(c => ({
        ...c,
        proveedor: c.proveedor || { nombre: 'Proveedor eliminado' },
        cliente: null
      }))
    ]

    // Ordenar por fecha descendente
    docs.sort((a, b) => new Date(b.fecha_emision) - new Date(a.fecha_emision))
    documentos.value = docs
  } catch (e) {
    console.error('Error al consultar documentos:', e)
    alert('Error al cargar documentos: ' + e.message)
  } finally {
    cargando.value = false
  }
}

// ===== IMPRESIÓN =====
const imprimirDocumento = (doc, formato) => {
  // Crear contenido HTML para la impresión
  const contenido = generarContenidoDocumento(doc, formato)
  const ventana = window.open('', '_blank', 'width=800,height=600')
  ventana.document.write(contenido)
  ventana.document.close()
  ventana.focus()
  ventana.print()
}

const generarContenidoDocumento = (doc, formato) => {
  const esVenta = doc.cliente !== null
  const nombreCliente = esVenta ? doc.cliente?.nombre || 'Cliente N/A' : doc.proveedor?.nombre || 'Proveedor N/A'
  const tipoDoc = doc.tipo_documento || 'Factura'
  const total = (doc.total || 0).toFixed(2)
  const subtotal = (doc.subtotal || 0).toFixed(2)
  const iva = (doc.iva || 0).toFixed(2)
  const fecha = new Date(doc.fecha_emision).toLocaleDateString()
  const numero = doc.numero_factura || 'N/A'

  let ancho = '210mm'
  let padding = '20mm'
  let fontSize = '14px'
  if (formato === 'A2') {
    ancho = '420mm'
    padding = '20mm'
    fontSize = '18px'
  } else if (formato === 'Ticket') {
    ancho = '80mm'
    padding = '10mm'
    fontSize = '12px'
  }

  let detallesHtml = ''
  if (doc.detalles && doc.detalles.length > 0) {
    detallesHtml = `
      <table style="width:100%; border-collapse:collapse; margin-top:10px;">
        <thead>
          <tr style="background:#f2f2f2;">
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Producto</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:center;">Cant.</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:right;">Precio</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${doc.detalles.map(d => `
            <tr>
              <td style="border:1px solid #ddd; padding:8px;">${d.productoId || 'Producto'}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:center;">${d.cantidad || 0}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right;">$${(d.precio_unitario || 0).toFixed(2)}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right;">$${((d.cantidad || 0) * (d.precio_unitario || 0)).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Documento</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: ${padding};
          width: ${ancho};
          margin: 0 auto;
          font-size: ${fontSize};
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .header h1 {
          margin: 0;
          font-size: ${formato === 'A2' ? '28px' : '20px'};
        }
        .info {
          margin-bottom: 15px;
        }
        .info p {
          margin: 4px 0;
        }
        .footer {
          margin-top: 20px;
          text-align: center;
          font-size: ${formato === 'Ticket' ? '10px' : '12px'};
          border-top: 1px solid #ccc;
          padding-top: 10px;
        }
        @media print {
          body { margin: 0; padding: ${padding}; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Sistema Contable</h1>
        <p><strong>${tipoDoc}</strong></p>
      </div>
      <div class="info">
        <p><strong>Nº Documento:</strong> ${numero}</p>
        <p><strong>Fecha:</strong> ${fecha}</p>
        <p><strong>${esVenta ? 'Cliente' : 'Proveedor'}:</strong> ${nombreCliente}</p>
        <p><strong>Total:</strong> $${total}</p>
      </div>
      ${detallesHtml}
      <div style="margin-top: 15px; text-align: right;">
        <p><strong>Subtotal:</strong> $${subtotal}</p>
        <p><strong>IVA (15%):</strong> $${iva}</p>
        <p><strong>Total:</strong> $${total}</p>
      </div>
      <div class="footer">
        <p>Generado por Sistema Contable</p>
        <p>${formato} - ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `
}
</script>