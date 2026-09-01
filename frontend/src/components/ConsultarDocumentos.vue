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
  // Redirigir a la vista de edición según el tipo
  if (doc.tipo_documento === 'compras' || !doc.tipo_documento) {
    router.push(`/compras/editar/${doc._id}`)
  } else {
    router.push(`/ventas/editar/${doc._id}`)
  }
}

const imprimirDoc = (doc, formato) => {
  alert(`Imprimir documento ${doc.numero_factura || doc.numero_guia} en formato ${formato}`)
}
</script>