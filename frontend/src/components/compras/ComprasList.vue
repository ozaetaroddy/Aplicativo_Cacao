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
      <div class="card-body table-responsive">
        <table class="table table-cacao">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Nº Factura</th>
              <th>Tipo</th>
              <th>Estado Pago</th>
              <th>Subtotal</th>
              <th>IVA</th>
              <th>Total</th>
              <th>Retención</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in compras" :key="c._id">
              <td>{{ new Date(c.fecha_emision).toLocaleDateString() }}</td>
              <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
              <td>{{ c.numero_factura }}</td>
              <td>
                <span class="badge" :class="c.tipo_compra === 'inventario' ? 'bg-success' : 'bg-warning'">
                  {{ c.tipo_compra || 'inventario' }}
                </span>
              </td>
              <td>
                <span class="badge" :class="c.estado_pago === 'pagado' ? 'bg-success' : 'bg-danger'">
                  {{ c.estado_pago || 'pendiente' }}
                </span>
              </td>
              <td>${{ c.subtotal?.toFixed(2) }}</td>
              <td>${{ c.iva?.toFixed(2) }}</td>
              <td><strong>${{ c.total?.toFixed(2) }}</strong></td>
              <td>${{ c.retencion_valor?.toFixed(2) || '0.00' }}</td>
              <td>
                <router-link :to="`/compras/editar/${c._id}`" class="btn btn-sm btn-outline-primary me-1">
                  <i class="fas fa-edit"></i>
                </router-link>
                <button class="btn btn-sm btn-outline-danger" @click="eliminar(c._id)">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="compras.length === 0">
              <td colspan="10" class="text-muted text-center">No hay compras registradas</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== MODAL PARA IMPORTAR TXT ===== -->
    <div class="modal fade" id="modalImportar" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-file-import me-2"></i>Importar Facturas desde TXT</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle me-2"></i>
              Seleccione un archivo TXT con el formato de facturas del SRI (separado por tabuladores).
              Si el proveedor no existe, se creará automáticamente con los datos del emisor.
            </div>

            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label"><span class="text-danger">*</span> Archivo TXT</label>
                <input type="file" class="form-control" accept=".txt" @change="procesarArchivo" ref="fileInput" />
              </div>
              <div class="col-md-3">
                <label class="form-label"><span class="text-danger">*</span> Tipo de Compra</label>
                <select class="form-select" v-model="tipoImportacion">
                  <option value="inventario">Inventario (Cacao)</option>
                  <option value="gasto">Gasto</option>
                </select>
              </div>
              <div class="col-md-3 d-flex align-items-end">
                <button class="btn btn-primary w-100" @click="importarFacturas" :disabled="!lineas.length || importando">
                  <i class="fas fa-upload" :class="{ 'fa-spin': importando }"></i>
                  {{ importando ? 'Importando...' : 'Importar' }}
                </button>
              </div>
            </div>

            <!-- Previsualización -->
            <div v-if="lineas.length > 0" class="mt-3">
              <h6>Vista previa (primeras 5 líneas)</h6>
              <div class="table-responsive">
                <table class="table table-sm table-bordered">
                  <thead>
                    <tr>
                      <th>RUC Emisor</th>
                      <th>Razón Social</th>
                      <th>Fecha</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(linea, idx) in lineas.slice(0, 5)" :key="idx">
                      <td>{{ linea.ruc }}</td>
                      <td>{{ linea.razonSocial }}</td>
                      <td>{{ linea.fecha }}</td>
                      <td>${{ linea.total }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-muted small">Total de líneas: {{ lineas.length }}</p>
            </div>

            <!-- Resultados -->
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
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { Modal } from 'bootstrap'

const toast = useToast()
const { find, deleteOne, request } = useMongoDB()
const compras = ref([])
const modalInstance = ref(null)

// Estado para importación
const fileInput = ref(null)
const lineas = ref([])
const tipoImportacion = ref('inventario')
const importando = ref(false)
const resultadoImportacion = ref(null)

const cargarCompras = async () => {
  try {
    compras.value = await find('compras')
  } catch (e) {
    toast.error('Error al cargar compras: ' + e.message)
  }
}

const eliminar = async (id) => {
  if (!confirm('¿Eliminar esta compra?')) return
  try {
    await deleteOne('compras', id)
    await cargarCompras()
    toast.success('Compra eliminada')
  } catch (e) {
    toast.error('Error al eliminar: ' + e.message)
  }
}

// ===== MODAL IMPORTAR =====
const abrirModalImportar = () => {
  if (!modalInstance.value) {
    const modalEl = document.getElementById('modalImportar')
    modalInstance.value = new Modal(modalEl, { backdrop: 'static' })
  }
  // Resetear estado al abrir
  lineas.value = []
  resultadoImportacion.value = null
  importando.value = false
  if (fileInput.value) fileInput.value.value = ''
  modalInstance.value.show()
}

// Procesar archivo TXT
const procesarArchivo = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    const lineasRaw = contenido.split('\n').filter(line => line.trim() !== '')

    // Saltar encabezado (primera línea si tiene nombres de columnas)
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
        total: parseFloat(campos[10]) || 0
      }
    }).filter(line => line && line.ruc && line.total > 0)

    lineas.value = parsed
    resultadoImportacion.value = null
    toast.info(`${parsed.length} líneas procesadas`)
  }
  reader.readAsText(file)
}

// Importar facturas al backend
const importarFacturas = async () => {
  if (lineas.value.length === 0) {
    toast.warning('No hay líneas para importar')
    return
  }

  importando.value = true
  resultadoImportacion.value = null

  try {
    const payload = {
      lineas: lineas.value,
      tipo_compra: tipoImportacion.value
    }
    const response = await request('/compras/importar-txt', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    resultadoImportacion.value = response
    toast.success(`Importación completada: ${response.importados} facturas`)

    // Recargar lista de compras
    await cargarCompras()

    // Si hay errores, no cerramos el modal para que el usuario los vea
    if (response.errores.length > 0) {
      // Mantener abierto
    } else {
      // Si todo ok, cerrar después de 2 segundos
      setTimeout(() => {
        if (modalInstance.value) modalInstance.value.hide()
      }, 2000)
    }
  } catch (e) {
    toast.error('Error en la importación: ' + e.message)
  } finally {
    importando.value = false
  }
}

onMounted(() => {
  cargarCompras()
})
</script>