<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-shopping-cart"></i> Compras</h4>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-primary" @click="abrirModalImportar">
          <i class="fas fa-file-import"></i> Importar TXT
        </button>
        <router-link to="/compras/nuevo" class="btn btn-success">
          <i class="fas fa-plus"></i> Nueva Compra
        </router-link>
      </div>
    </div>

    <div class="card card-cacao">
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Nº Factura</th>
              <th>Tipo</th>
              <th>Subtotal</th>
              <th>IVA</th>
              <th>Total</th>
              <th>Estado Pago</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in compras" :key="c._id">
              <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
              <td>{{ c.numero_factura }}</td>
              <td>
                <span class="badge" :class="c.tipo_compra === 'inventario' ? 'bg-primary' : 'bg-warning'">
                  {{ c.tipo_compra === 'inventario' ? 'Inventario' : 'Gasto' }}
                </span>
              </td>
              <td>${{ c.subtotal?.toFixed(2) }}</td>
              <td>${{ c.iva?.toFixed(2) }}</td>
              <td><strong>${{ c.total?.toFixed(2) }}</strong></td>
              <td>
                <span class="badge" :class="c.estado_pago === 'pagado' ? 'bg-success' : 'bg-danger'">
                  {{ c.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente' }}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-1" @click="editarCompra(c._id)">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(c._id)">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="compras.length === 0">
              <td colspan="9" class="text-muted text-center">No hay compras registradas</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== MODAL IMPORTAR TXT ===== -->
    <div class="modal fade" id="modalImportarTXT" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-file-import me-2"></i> Importar Facturas desde TXT (SRI)</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i>
              Seleccione el archivo TXT con el formato del SRI. Las líneas deben contener: RUC_EMISOR, RAZON_SOCIAL, TIPO_COMPROBANTE, SERIE, CLAVE_ACCESO, FECHA_AUTORIZACION, FECHA_EMISION, IDENTIFICACION_RECEPTOR, VALOR_SIN_IMPUESTOS, IVA, IMPORTE_TOTAL
            </div>

            <div class="row g-3">
              <div class="col-md-8">
                <label class="form-label">Seleccionar archivo TXT</label>
                <input type="file" class="form-control" accept=".txt" ref="fileInputModal" @change="handleFileUploadModal" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Tipo de Compra</label>
                <select class="form-select" v-model="tipoCompraImportModal">
                  <option value="inventario">Inventario (Cacao)</option>
                  <option value="gasto">Gasto</option>
                </select>
              </div>
            </div>

            <div v-if="lineasTXTModal.length > 0" class="mt-3">
              <p class="text-muted small">
                <i class="fas fa-file-alt"></i>
                {{ lineasTXTModal.length }} líneas detectadas para importar
              </p>
              <div class="table-responsive" style="max-height:200px;">
                <table class="table table-sm table-striped">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>RUC Emisor</th>
                      <th>Razón Social</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(linea, idx) in lineasTXTModal.slice(0, 10)" :key="idx">
                      <td>{{ idx + 1 }}</td>
                      <td>{{ linea.split('\t')[0] || 'N/A' }}</td>
                      <td>{{ linea.split('\t')[1] || 'N/A' }}</td>
                      <td>${{ parseFloat(linea.split('\t')[10])?.toFixed(2) || '0.00' }}</td>
                    </tr>
                    <tr v-if="lineasTXTModal.length > 10">
                      <td colspan="4" class="text-muted text-center">... y {{ lineasTXTModal.length - 10 }} más</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="resultadoImportacionModal" class="mt-3">
              <div v-if="resultadoImportacionModal.success" class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                {{ resultadoImportacionModal.importados }} facturas importadas correctamente.
                <span v-if="resultadoImportacionModal.errores.length > 0" class="d-block mt-2">
                  <i class="fas fa-exclamation-triangle"></i>
                  {{ resultadoImportacionModal.errores.length }} errores:
                  <ul class="mb-0">
                    <li v-for="(err, idx) in resultadoImportacionModal.errores" :key="idx">{{ err }}</li>
                  </ul>
                </span>
              </div>
              <div v-else class="alert alert-danger">
                <i class="fas fa-exclamation-circle"></i>
                {{ resultadoImportacionModal.mensaje || 'Error al importar' }}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button class="btn btn-success" @click="importarFacturasModal" :disabled="!archivoCargadoModal || importandoModal">
              <i class="fas fa-upload" :class="{ 'fa-spin': importandoModal }"></i>
              {{ importandoModal ? 'Importando...' : 'Importar Facturas' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { Modal } from 'bootstrap'

const router = useRouter()
const toast = useToast()
const { find, deleteOne } = useMongoDB()
const compras = ref([])

// ===== IMPORTACIÓN MODAL =====
const fileInputModal = ref(null)
const archivoCargadoModal = ref(false)
const importandoModal = ref(false)
const tipoCompraImportModal = ref('inventario')
const resultadoImportacionModal = ref(null)
const lineasTXTModal = ref([])
let modalInstance = null

const handleFileUploadModal = (event) => {
  const file = event.target.files[0]
  if (!file) {
    archivoCargadoModal.value = false
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    const texto = e.target.result
    const lineas = texto.split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && !linea.startsWith('RUC_EMISOR'))
    lineasTXTModal.value = lineas
    archivoCargadoModal.value = lineas.length > 0
    resultadoImportacionModal.value = null
    if (lineas.length === 0) {
      toast.warning('El archivo está vacío o no tiene líneas de datos')
    }
  }
  reader.readAsText(file)
}

const importarFacturasModal = async () => {
  if (!archivoCargadoModal.value || lineasTXTModal.value.length === 0) {
    toast.warning('Seleccione un archivo TXT válido')
    return
  }

  importandoModal.value = true
  resultadoImportacionModal.value = null

  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/compras/importar-txt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lineas: lineasTXTModal.value,
        tipo_compra: tipoCompraImportModal.value
      })
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Error al importar')
    }

    resultadoImportacionModal.value = {
      success: true,
      importados: data.importados || 0,
      errores: data.errores || []
    }

    toast.success(`Importadas ${data.importados || 0} facturas correctamente`)

    // Recargar lista
    await cargarCompras()

    // Limpiar archivo
    if (fileInputModal.value) {
      fileInputModal.value.value = ''
    }
    archivoCargadoModal.value = false
    lineasTXTModal.value = []

    // Cerrar modal después de 2 segundos
    setTimeout(() => {
      if (modalInstance) {
        modalInstance.hide()
      }
    }, 2000)

  } catch (e) {
    resultadoImportacionModal.value = {
      success: false,
      mensaje: e.message
    }
    toast.error('Error al importar: ' + e.message)
  } finally {
    importandoModal.value = false
  }
}

const abrirModalImportar = () => {
  if (!modalInstance) {
    const modalEl = document.getElementById('modalImportarTXT')
    modalInstance = new Modal(modalEl)
  }
  // Resetear estado
  archivoCargadoModal.value = false
  lineasTXTModal.value = []
  resultadoImportacionModal.value = null
  if (fileInputModal.value) {
    fileInputModal.value.value = ''
  }
  modalInstance.show()
}

// ===== CARGAR COMPRAS =====
const cargarCompras = async () => {
  try {
    compras.value = await find('compras')
  } catch (e) {
    toast.error('Error al cargar compras: ' + e.message)
  }
}

// ===== ELIMINAR COMPRA =====
const eliminar = async (id) => {
  if (confirm('¿Eliminar esta compra?')) {
    try {
      await deleteOne('compras', id)
      toast.success('Compra eliminada')
      await cargarCompras()
    } catch (e) {
      toast.error('Error al eliminar: ' + e.message)
    }
  }
}

// ===== EDITAR COMPRA =====
const editarCompra = (id) => {
  router.push(`/compras/editar/${id}`)
}

onMounted(() => {
  cargarCompras()
})
</script>