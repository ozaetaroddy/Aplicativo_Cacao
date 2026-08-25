<template>
  <div>
    <h4 class="section-title"><i class="fas fa-search"></i> Consultar Documentos</h4>

    <!-- ===== FILTROS ===== -->
    <div class="row g-3 mb-3">
      <div class="col-md-3">
        <label class="form-label">Tipo de Documento</label>
        <select class="form-select" v-model="tipoDocumento" @change="cargarDatos">
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
      <div class="col-md-3">
        <label class="form-label">Desde</label>
        <input type="date" class="form-control" v-model="fechaDesde">
      </div>
      <div class="col-md-3">
        <label class="form-label">Hasta</label>
        <input type="date" class="form-control" v-model="fechaHasta">
      </div>
      <div class="col-md-3 d-flex align-items-end">
        <button class="btn btn-primary w-100" @click="cargarDatos">
          <i class="fas fa-sync"></i> Buscar
        </button>
      </div>
    </div>

    <!-- ===== BOTONES DE IMPRESIÓN ===== -->
    <div class="mb-3" v-if="documentos.length > 0">
      <button class="btn btn-outline-primary me-2" @click="imprimir('A4')">
        <i class="fas fa-print"></i> Imprimir A4
      </button>
      <button class="btn btn-outline-secondary me-2" @click="imprimir('A2')">
        <i class="fas fa-print"></i> Imprimir A2
      </button>
      <button class="btn btn-outline-success" @click="imprimir('ticket')">
        <i class="fas fa-receipt"></i> Ticket
      </button>
    </div>

    <!-- ===== TABLA DE RESULTADOS ===== -->
    <div class="card card-cacao">
      <div class="card-body table-responsive" id="tablaDocumentos">
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
                {{ doc.cliente?.nombre || doc.proveedor?.nombre || 'N/A' }}
              </td>
              <td>{{ doc.numero_factura || doc.numero_guia || 'N/A' }}</td>
              <td><strong>${{ doc.total?.toFixed(2) || '0.00' }}</strong></td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-1" @click="verDetalle(doc)">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-success" @click="imprimirDoc(doc, 'ticket')">
                  <i class="fas fa-receipt"></i>
                </button>
              </td>
            </tr>
            <tr v-if="documentos.length === 0 && !cargando">
              <td colspan="5" class="text-muted text-center">No hay documentos que coincidan con los filtros</td>
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
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'

const { find } = useMongoDB()
const tipoDocumento = ref('factura')
const fechaDesde = ref('')
const fechaHasta = ref('')
const documentos = ref([])
const cargando = ref(false)

const cargarDatos = async () => {
  cargando.value = true
  try {
    let datos = []
    // Si es compras, buscamos en la colección de compras
    if (tipoDocumento.value === 'compras') {
      datos = await find('compras')
    } else {
      // Para los demás tipos, buscamos en ventas y filtramos por tipo_documento
      const todasVentas = await find('ventas')
      datos = todasVentas.filter(d => d.tipo_documento === tipoDocumento.value)
    }

    // Aplicar filtro de fechas
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

const verDetalle = (doc) => {
  alert(JSON.stringify(doc, null, 2))
}

const imprimirDoc = (doc, formato) => {
  alert(`Imprimir documento ${doc._id} en formato ${formato}`)
}

const imprimir = (formato) => {
  alert(`Imprimir ${documentos.value.length} documentos en formato ${formato}`)
}

onMounted(() => {
  cargarDatos()
})
</script>