<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-shopping-cart"></i> Compras</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" @click="abrirModalImportar">
          <i class="fas fa-file-import"></i> Importar TXT
        </button>
        <router-link to="/compras/nuevo" class="btn btn-success">
          <i class="fas fa-plus"></i> Nueva Compra
        </router-link>
      </div>
    </div>

    <!-- ===== TABLA DE COMPRAS ===== -->
    <div class="card card-cacao">
      <div class="card-body">
        <DataTablePaged
          ref="tablaRef"
          endpoint="/compras"
          :columns="columnas"
          :actions="acciones"
          :default-limit="20"
          default-sort="fecha_emision"
          default-sort-dir="desc"
        >
          <template #fecha_emision="{ row }">
            {{ new Date(row.fecha_emision).toLocaleDateString('es-EC') }}
          </template>
          <template #proveedor="{ row }">
            {{ row.proveedor?.nombre || 'N/A' }}
          </template>
          <template #tipo_compra="{ row }">
            <span class="badge" :class="row.tipo_compra === 'inventario' ? 'bg-success' : 'bg-warning text-dark'">
              {{ row.tipo_compra || 'inventario' }}
            </span>
          </template>
          <template #estado_pago="{ row }">
            <span class="badge" :class="row.estado_pago === 'pagado' ? 'bg-success' : 'bg-danger'">
              {{ row.estado_pago || 'pendiente' }}
            </span>
          </template>
          <template #subtotal="{ value }">${{ (value || 0).toFixed(2) }}</template>
          <template #iva="{ value }">${{ (value || 0).toFixed(2) }}</template>
          <template #total="{ value }"><strong>${{ (value || 0).toFixed(2) }}</strong></template>
          <template #retencion_valor="{ value }">${{ (value || 0).toFixed(2) }}</template>
        </DataTablePaged>
      </div>
    </div>

    <!-- ===== MODAL PARA IMPORTAR TXT ===== -->
    <div class="modal fade" id="modalImportar" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-file-import me-2"></i>Importar Facturas desde TXT</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle me-2"></i>
              Seleccione un archivo TXT con el formato de facturas del SRI (separado por tabuladores).
              Puede seleccionar individualmente si cada factura es de <strong>Inventario</strong> o <strong>Gasto</strong>.
            </div>

            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label"><span class="text-danger">*</span> Archivo TXT</label>
                <input type="file" class="form-control" accept=".txt" @change="procesarArchivo" ref="fileInput" />
              </div>
              <div class="col-md-6 d-flex align-items-end gap-2">
                <button class="btn btn-outline-success" @click="seleccionarTodos('inventario')" :disabled="!lineas.length">
                  <i class="fas fa-box"></i> Todos Inventario
                </button>
                <button class="btn btn-outline-warning" @click="seleccionarTodos('gasto')" :disabled="!lineas.length">
                  <i class="fas fa-receipt"></i> Todos Gasto
                </button>
                <button class="btn btn-primary" @click="importarFacturas" :disabled="!lineas.length || importando">
                  <i class="fas fa-upload" :class="{ 'fa-spin': importando }"></i>
                  {{ importando ? 'Importando...' : 'Importar' }}
                </button>
              </div>
            </div>

            <div v-if="lineas.length > 0" class="mt-3">
              <h6>Vista previa ({{ lineas.length }} líneas)</h6>
              <div class="table-responsive" style="max-height:400px; overflow-y:auto;">
                <table class="table table-sm table-bordered table-striped">
                  <thead class="sticky-top bg-white">
                    <tr>
                      <th style="width:40px;">#</th>
                      <th>RUC Emisor</th>
                      <th>Razón Social</th>
                      <th>Fecha</th>
                      <th>Total</th>
                      <th style="width:140px;">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(linea, idx) in lineas" :key="idx">
                      <td>{{ idx + 1 }}</td>
                      <td>{{ linea.ruc }}</td>
                      <td>{{ linea.razonSocial }}</td>
                      <td>{{ linea.fecha }}</td>
                      <td>${{ linea.total.toFixed(2) }}</td>
                      <td>
                        <select class="form-select form-select-sm" v-model="linea.tipo">
                          <option value="inventario">Inventario</option>
                          <option value="gasto">Gasto</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="resultadoImportacion" class="mt-3">
              <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                {{ resultadoImportacion.importados }} facturas importadas correctamente.
                <span v-if="resultadoImportacion.errores.length > 0">
                  <br><i class="fas fa-exclamation-triangle me-2"></i>
                  {{ resultadoImportacion.errores.length }} errores:
                </span>
              </div>
              <div v-if="resultadoImportacion.errores.length > 0" style="max-height:200px; overflow-y:auto;">
                <ul class="list-unstyled small">
                  <li v-for="(err, idx) in resultadoImportacion.errores.slice(0, 20)" :key="idx" class="text-danger">
                    - {{ err }}
                  </li>
                  <li v-if="resultadoImportacion.errores.length > 20" class="text-muted">
                    ... y {{ resultadoImportacion.errores.length - 20 }} más
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import DataTablePaged from '../shared/DataTablePaged.vue'

const router = useRouter()
const toast = useToast()
const { deleteOne } = useMongoDB()
const tablaRef = ref(null)
const modalInstance = ref(null)

// Estado para importación
const fileInput = ref(null)
const lineas = ref([])
const importando = ref(false)
const resultadoImportacion = ref(null)

const columnas = [
  { key: 'fecha_emision', label: 'Fecha', sortable: true, width: '110px' },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'numero_factura', label: 'Nº Factura', sortable: true },
  { key: 'tipo_compra', label: 'Tipo', width: '110px' },
  { key: 'estado_pago', label: 'Estado Pago', width: '110px' },
  { key: 'subtotal', label: 'Subtotal', width: '100px' },
  { key: 'iva', label: 'IVA', width: '80px' },
  { key: 'total', label: 'Total', sortable: true, width: '110px' },
  { key: 'retencion_valor', label: 'Retención', width: '100px' }
]

const acciones = [
  {
    key: 'edit',
    icon: 'fas fa-edit',
    class: 'btn-outline-primary',
    title: 'Editar',
    handler: (row) => router.push(`/compras/editar/${row._id}`)
  },
  {
    key: 'delete',
    icon: 'fas fa-trash',
    class: 'btn-outline-danger',
    title: 'Eliminar',
    handler: async (row) => {
      if (!confirm('¿Eliminar esta compra?')) return
      try {
        await deleteOne('compras', row._id)
        tablaRef.value?.reload()
        toast.success('Compra eliminada')
      } catch (e) {
        toast.error('Error al eliminar: ' + e.message)
      }
    }
  }
]

// ===== MODAL IMPORTAR =====
const abrirModalImportar = () => {
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalImportar')
    modalInstance.value = new Modal(modalEl, { backdrop: 'static' })
  }
  lineas.value = []
  resultadoImportacion.value = null
  importando.value = false
  if (fileInput.value) fileInput.value.value = ''
  modalInstance.value.show()
}

const procesarArchivo = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    const lineasRaw = contenido.split('\n').filter(line => line.trim() !== '')

    const dataLines = lineasRaw[0].toLowerCase().includes('ruc_emisor') ? lineasRaw.slice(1) : lineasRaw

    const parsed = dataLines.map(line => {
      const campos = line.split('\t').map(c => c.trim())
      if (campos.length < 11) return null
      return {
        ruc: campos[0],
        razonSocial: campos[1],
        tipoComprobante: campos[2],
        serie: campos[3],
        claveAcceso: campos[4],
        fechaAutorizacion: campos[5],
        fechaEmision: campos[6],
        identificacionReceptor: campos[7],
        valorSinImpuestos: parseFloat(campos[8]) || 0,
        iva: parseFloat(campos[9]) || 0,
        total: parseFloat(campos[10]) || 0,
        tipo: 'inventario',
        fecha: campos[6] ? new Date(campos[6]).toLocaleDateString() : ''
      }
    }).filter(line => line && line.ruc && line.total > 0)

    lineas.value = parsed
    resultadoImportacion.value = null
    toast.info(`${parsed.length} líneas procesadas`)
  }
  reader.readAsText(file)
}

const seleccionarTodos = (tipo) => {
  lineas.value.forEach(linea => {
    linea.tipo = tipo
  })
}

const importarFacturas = async () => {
  if (lineas.value.length === 0) {
    toast.warning('No hay líneas para importar')
    return
  }

  importando.value = true
  resultadoImportacion.value = null

  try {
    const payload = {
      lineas: lineas.value.map(linea => ({
        ruc: linea.ruc,
        razonSocial: linea.razonSocial,
        fechaEmision: linea.fechaEmision,
        total: linea.total,
        valorSinImpuestos: linea.valorSinImpuestos,
        iva: linea.iva,
        tipo_compra: linea.tipo
      }))
    }

    const data = await api.request('/compras/importar-txt', {
      method: 'POST',
      body: JSON.stringify(payload),
      loaderMessage: 'Importando facturas...'
    })

    resultadoImportacion.value = data
    toast.success(`Importación completada: ${data.importados} facturas`)

    tablaRef.value?.reload()

    if (data.errores.length === 0) {
      setTimeout(() => {
        if (modalInstance.value) modalInstance.value.hide()
      }, 2000)
    }
  } catch (e) {
    console.error('❌ Error en importación:', e)
    toast.error('Error en la importación: ' + e.message)
  } finally {
    importando.value = false
  }
}
</script>

<style scoped>
.sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
}
</style>