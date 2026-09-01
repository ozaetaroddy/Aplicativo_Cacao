<template>
  <div>
    <h4 class="section-title"><i class="fas fa-search"></i> Consultar Documentos</h4>

    <!-- FILTROS -->
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Tipo de Documento</label>
        <select class="form-select" v-model="tipoDocumento">
          <option value="factura">Factura</option>
          <option value="guia_remision">Guía de Remisión</option>
          <option value="exportacion">Factura de Exportación</option>
          <option value="reembolso">Factura de Reembolso</option>
          <option value="retencion">Comprobante de Retención</option>
          <option value="liquidacion">Liquidación de Compra</option>
          <option value="nota_credito">Nota de Crédito</option>
          <option value="proforma">Proforma</option>
          <option value="compras">Compras</option>
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label">Desde</label>
        <input type="date" class="form-control" v-model="fechaDesde">
      </div>
      <div class="col-md-2">
        <label class="form-label">Hasta</label>
        <input type="date" class="form-control" v-model="fechaHasta">
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary w-100" @click="cargarDatos">
          <i class="fas fa-search"></i> Buscar
        </button>
      </div>
      <div class="col-md-3 d-flex align-items-end justify-content-end">
        <button class="btn btn-outline-secondary" @click="limpiarFiltros">
          <i class="fas fa-undo"></i> Limpiar
        </button>
      </div>
    </div>

    <!-- TABLA DE RESULTADOS -->
    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente/Proveedor</th>
              <th>Nº Documento</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in documentos" :key="doc._id">
              <td>{{ new Date(doc.fecha_emision).toLocaleDateString() }}</td>
              <td>
                <a href="#" @click.prevent="verEditar(doc)" class="text-primary">
                  {{ doc.cliente?.nombre || doc.proveedor?.nombre || 'N/A' }}
                </a>
              </td>
              <td>{{ doc.numero_factura || doc.numero_guia || 'N/A' }}</td>
              <td><strong>${{ doc.total?.toFixed(2) || '0.00' }}</strong></td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-sm btn-outline-primary" @click="verEditar(doc)">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                    <span class="visually-hidden">Toggle Dropdown</span>
                  </button>
                  <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="#" @click.prevent="imprimirDoc(doc, 'A4')"><i class="fas fa-file-pdf"></i> A4</a></li>
                    <li><a class="dropdown-item" href="#" @click.prevent="imprimirDoc(doc, 'A2')"><i class="fas fa-file-pdf"></i> A2</a></li>
                    <li><a class="dropdown-item" href="#" @click.prevent="imprimirDoc(doc, 'ticket')"><i class="fas fa-receipt"></i> Ticket</a></li>
                  </ul>
                </div>
              </td>
            </tr>
            <tr v-if="documentos.length === 0 && !cargando && buscado">
              <td colspan="5" class="text-muted text-center">No hay documentos que coincidan con los filtros</td>
            </tr>
            <tr v-if="!buscado && documentos.length === 0">
              <td colspan="5" class="text-muted text-center">Seleccione un tipo y presione Buscar</td>
            </tr>
            <tr v-if="cargando">
              <td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../composables/useMongoDB'

const router = useRouter()
const { find } = useMongoDB()
const tipoDocumento = ref('factura')
const fechaDesde = ref('')
const fechaHasta = ref('')
const documentos = ref([])
const cargando = ref(false)
const buscado = ref(false)

const cargarDatos = async () => {
  cargando.value = true
  buscado.value = true
  try {
    let datos = []
    if (tipoDocumento.value === 'compras') {
      datos = await find('compras')
    } else {
      const todasVentas = await find('ventas')
      datos = todasVentas.filter(d => d.tipo_documento === tipoDocumento.value)
    }

    // Filtro de fechas
    if (fechaDesde.value) {
      const desde = new Date(fechaDesde.value)
      datos = datos.filter(d => new Date(d.fecha_emision) >= desde)
    }
    if (fechaHasta.value) {
      const hasta = new Date(fechaHasta.value)
      hasta.setHours(23, 59, 59, 999)
      datos = datos.filter(d => new Date(d.fecha_emision) <= hasta)
    }

    documentos.value = datos
  } catch (e) {
    console.error('Error cargando documentos:', e)
    alert('Error al cargar los documentos')
  } finally {
    cargando.value = false
  }
}

const limpiarFiltros = () => {
  tipoDocumento.value = 'factura'
  fechaDesde.value = ''
  fechaHasta.value = ''
  documentos.value = []
  buscado.value = false
}

const verEditar = (doc) => {
  if (doc.tipo_documento === 'compras' || !doc.tipo_documento) {
    router.push(`/compras/editar/${doc._id}`)
  } else {
    router.push(`/ventas/editar/${doc._id}`)
  }
}

// ===== IMPRESIÓN DIRECTA (sin alert) =====
const imprimirDoc = (doc, formato) => {
  // Crear contenido HTML para impresión
  const contenido = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Documento ${doc.numero_factura || doc.numero_guia}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #1a2a3a; }
        .info { margin-bottom: 20px; }
        .info table { width: 100%; }
        .info td { padding: 5px; }
        .detalles { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .detalles th, .detalles td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .detalles th { background: #f2f2f2; }
        .total { text-align: right; font-weight: bold; margin-top: 20px; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #888; }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>System Ozaet's Electronics</h1>
        <h2>${doc.tipo_documento?.toUpperCase() || 'DOCUMENTO'}</h2>
        <p>Nº: ${doc.numero_factura || doc.numero_guia || 'N/A'}</p>
        <p>Fecha: ${new Date(doc.fecha_emision).toLocaleDateString()}</p>
      </div>

      <div class="info">
        <table>
          <tr>
            <td><strong>Cliente:</strong></td>
            <td>${doc.cliente?.nombre || doc.proveedor?.nombre || 'N/A'}</td>
          </tr>
          <tr>
            <td><strong>RUC:</strong></td>
            <td>${doc.cliente?.ruc || doc.proveedor?.ruc || 'N/A'}</td>
          </tr>
        </table>
      </div>

      <table class="detalles">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio Unit.</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${doc.detalles?.map(d => `
            <tr>
              <td>${d.productoId || 'N/A'}</td>
              <td>${d.cantidad || 0}</td>
              <td>$${d.precio_unitario?.toFixed(2) || d.costo_unitario?.toFixed(2) || '0.00'}</td>
              <td>$${(d.cantidad * (d.precio_unitario || d.costo_unitario || 0)).toFixed(2)}</td>
            </tr>
          `).join('') || '<tr><td colspan="4">Sin detalles</td></tr>'}
        </tbody>
      </table>

      <div class="total">
        <p>Subtotal: $${doc.subtotal?.toFixed(2) || '0.00'}</p>
        <p>IVA (15%): $${doc.iva?.toFixed(2) || '0.00'}</p>
        <p style="font-size: 1.2em;">Total: $${doc.total?.toFixed(2) || '0.00'}</p>
      </div>

      <div class="footer">
        <p>Documento generado por Sistema Contable - System Ozaet's Electronics</p>
        <p>Formato: ${formato}</p>
      </div>

      <div class="no-print" style="text-align:center; margin-top:30px;">
        <button onclick="window.print()">Imprimir</button>
        <button onclick="window.close()">Cerrar</button>
      </div>
    </body>
    </html>
  `;

  // Abrir ventana para impresión
  const ventana = window.open('', '_blank', 'width=800,height=600');
  if (ventana) {
    ventana.document.write(contenido);
    ventana.document.close();
    // Esperar a que cargue y luego imprimir automáticamente (opcional)
    // ventana.onload = function() { ventana.print(); };
  } else {
    alert('Por favor, permita ventanas emergentes para imprimir');
  }
}
</script>