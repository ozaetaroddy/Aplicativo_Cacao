<template>
  <div>
    <button class="btn btn-primary" @click="abrirModal">
      <i class="fas fa-file-import me-1"></i> Importar Facturas (TXT)
    </button>

    <!-- Modal -->
    <div class="modal fade" id="modalImportarFacturas" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-file-import me-2"></i>Importar Facturas desde TXT</h5>
            <button type="button" class="btn-close" @click="cerrarModal"></button>
          </div>
          <div class="modal-body">
            <!-- Paso 1: Subir archivo -->
            <div v-if="!procesado" class="mb-3">
              <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Seleccione un archivo TXT con el formato de facturas del SRI (columnas separadas por tabulador).
                Las líneas con RUC de proveedores no registrados se mostrarán para que pueda crearlos.
              </div>
              <div class="input-group">
                <input type="file" class="form-control" accept=".txt" @change="handleFileUpload" ref="fileInput" />
                <button class="btn btn-outline-secondary" @click="procesarArchivo" :disabled="!archivoCargado || procesando">
                  <i class="fas fa-cog" :class="{ 'fa-spin': procesando }"></i>
                  {{ procesando ? 'Procesando...' : 'Procesar Archivo' }}
                </button>
              </div>
              <div v-if="archivoCargado" class="mt-2">
                <span class="badge bg-success"><i class="fas fa-check"></i> Archivo cargado: {{ nombreArchivo }}</span>
                <span class="badge bg-secondary ms-2">{{ lineas.length }} líneas encontradas</span>
              </div>
            </div>

            <!-- Paso 2: Resultados del procesamiento -->
            <div v-if="procesado">
              <!-- Proveedores no encontrados -->
              <div v-if="proveedoresFaltantes.length > 0" class="alert alert-warning">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Proveedores no registrados</h6>
                <p>Los siguientes RUC no existen en el sistema. Puede crearlos ahora o omitir estas facturas.</p>
                <div class="table-responsive">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>RUC</th>
                        <th>Razón Social</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(prov, idx) in proveedoresFaltantes" :key="idx">
                        <td>{{ prov.ruc }}</td>
                        <td>{{ prov.razon_social }}</td>
                        <td>
                          <button class="btn btn-sm btn-success" @click="crearProveedor(prov)">
                            <i class="fas fa-plus"></i> Crear
                          </button>
                          <button class="btn btn-sm btn-danger" @click="omitirProveedor(prov.ruc)">
                            <i class="fas fa-times"></i> Omitir
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Lista de facturas a importar -->
              <div v-if="facturasValidas.length > 0">
                <h6><i class="fas fa-list me-2"></i>Facturas listas para importar ({{ facturasValidas.length }})</h6>
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                  <table class="table table-sm table-cacao">
                    <thead>
                      <tr>
                        <th style="width:20px;">#</th>
                        <th>Fecha</th>
                        <th>Proveedor</th>
                        <th>Nº Factura</th>
                        <th>Total</th>
                        <th>Tipo</th>
                        <th>Seleccionar</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(factura, idx) in facturasValidas" :key="idx">
                        <td>{{ idx + 1 }}</td>
                        <td>{{ factura.fecha }}</td>
                        <td>{{ factura.proveedor?.nombre || factura.razon_social }}</td>
                        <td>{{ factura.numero_factura }}</td>
                        <td>${{ factura.total.toFixed(2) }}</td>
                        <td>
                          <select class="form-select form-select-sm" v-model="factura.tipo_compra">
                            <option value="inventario">Inventario</option>
                            <option value="gasto">Gasto</option>
                          </select>
                        </td>
                        <td>
                          <input type="checkbox" v-model="factura.seleccionada" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-if="facturasValidas.length === 0 && proveedoresFaltantes.length === 0" class="alert alert-info">
                No se encontraron facturas válidas para importar.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="cerrarModal">Cerrar</button>
            <button class="btn btn-success" @click="importarSeleccionadas" :disabled="!haySeleccionadas || importando">
              <i class="fas fa-save" :class="{ 'fa-spin': importando }"></i>
              {{ importando ? 'Importando...' : 'Importar Seleccionadas' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Modal } from 'bootstrap'
import { useMongoDB } from '../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { find, insertOne, request } = useMongoDB()
const emit = defineEmits(['importado'])

// Estado del modal
let modalInstance = null
const fileInput = ref(null)
const archivoCargado = ref(false)
const nombreArchivo = ref('')
const lineas = ref([])
const procesado = ref(false)
const procesando = ref(false)
const importando = ref(false)

// Datos procesados
const proveedoresFaltantes = ref([])
const facturasValidas = ref([])
const proveedoresMap = ref({})

// Computed
const haySeleccionadas = computed(() => {
  return facturasValidas.value.some(f => f.seleccionada)
})

// Abrir modal
const abrirModal = () => {
  if (!modalInstance) {
    const modalEl = document.getElementById('modalImportarFacturas')
    modalInstance = new Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })
  }
  // Resetear estado
  archivoCargado.value = false
  nombreArchivo.value = ''
  lineas.value = []
  procesado.value = false
  proveedoresFaltantes.value = []
  facturasValidas.value = []
  proveedoresMap.value = {}
  modalInstance.show()
}

const cerrarModal = () => {
  if (modalInstance) {
    modalInstance.hide()
  }
}

// Manejar selección de archivo
const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return
  archivoCargado.value = true
  nombreArchivo.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    lineas.value = contenido.split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.split('\t').map(c => c.trim()))
    // Filtrar líneas que tengan al menos 11 columnas
    lineas.value = lineas.value.filter(campos => campos.length >= 11)
    toast.info(`Archivo cargado: ${lineas.value.length} líneas procesadas`)
  }
  reader.readAsText(file)
}

// Procesar archivo
const procesarArchivo = async () => {
  if (lineas.value.length === 0) {
    toast.warning('No hay líneas para procesar')
    return
  }

  procesando.value = true
  try {
    // Obtener todos los proveedores existentes
    const proveedores = await find('proveedores')
    const proveedoresPorRuc = {}
    proveedores.forEach(p => {
      proveedoresPorRuc[p.ruc] = p
    })
    proveedoresMap.value = proveedoresPorRuc

    const faltantes = []
    const validas = []

    for (const campos of lineas.value) {
      const [
        ruc_emisor,
        razon_social_emisor,
        tipo_comprobante,
        serie_comprobante,
        clave_acceso,
        fecha_autorizacion,
        fecha_emision,
        identificacion_receptor,
        valor_sin_impuestos,
        iva,
        importe_total
      ] = campos

      const total = parseFloat(importe_total) || 0
      if (total === 0) continue

      const proveedor = proveedoresPorRuc[ruc_emisor]
      if (!proveedor) {
        faltantes.push({
          ruc: ruc_emisor,
          razon_social: razon_social_emisor
        })
        continue
      }

      validas.push({
        ruc_emisor,
        razon_social: razon_social_emisor,
        proveedor: proveedor,
        fecha: fecha_emision,
        numero_factura: serie_comprobante,
        valor_sin_impuestos: parseFloat(valor_sin_impuestos) || 0,
        iva: parseFloat(iva) || 0,
        total: total,
        tipo_compra: 'inventario',
        seleccionada: true,
        detalles: [
          {
            productoId: null,
            cantidad: 1,
            costo_unitario: total,
            aplica_iva: parseFloat(iva) > 0
          }
        ]
      })
    }

    proveedoresFaltantes.value = faltantes
    facturasValidas.value = validas
    procesado.value = true

    if (faltantes.length > 0) {
      toast.warning(`${faltantes.length} proveedores no encontrados. Cree o omita para continuar.`)
    }
    if (validas.length === 0 && faltantes.length === 0) {
      toast.info('No se encontraron facturas válidas')
    } else {
      toast.success(`${validas.length} facturas listas para importar`)
    }
  } catch (e) {
    toast.error('Error al procesar archivo: ' + e.message)
  } finally {
    procesando.value = false
  }
}

// Crear proveedor desde el modal
const crearProveedor = async (prov) => {
  try {
    const nuevo = {
      ruc: prov.ruc,
      nombre: prov.razon_social,
      telefono: '',
      email: '',
      direccion: ''
    }
    const result = await insertOne('proveedores', nuevo)
    // Actualizar mapa de proveedores
    proveedoresMap.value[prov.ruc] = { ...nuevo, _id: result.insertedId }
    // Eliminar de la lista de faltantes
    proveedoresFaltantes.value = proveedoresFaltantes.value.filter(p => p.ruc !== prov.ruc)
    // Actualizar facturas que usaban este proveedor
    facturasValidas.value = facturasValidas.value.map(f => {
      if (f.ruc_emisor === prov.ruc) {
        return { ...f, proveedor: proveedoresMap.value[prov.ruc] }
      }
      return f
    })
    toast.success(`Proveedor ${prov.razon_social} creado`)
  } catch (e) {
    toast.error('Error al crear proveedor: ' + e.message)
  }
}

const omitirProveedor = (ruc) => {
  proveedoresFaltantes.value = proveedoresFaltantes.value.filter(p => p.ruc !== ruc)
  // Ocultar facturas de ese proveedor
  facturasValidas.value = facturasValidas.value.filter(f => f.ruc_emisor !== ruc)
  toast.info('Proveedor omitido')
}

// Importar facturas seleccionadas
const importarSeleccionadas = async () => {
  const seleccionadas = facturasValidas.value.filter(f => f.seleccionada)
  if (seleccionadas.length === 0) {
    toast.warning('Seleccione al menos una factura')
    return
  }

  importando.value = true
  try {
    const payload = seleccionadas.map(f => ({
      proveedorId: f.proveedor._id,
      numero_factura: f.numero_factura,
      fecha_emision: f.fecha,
      detalles: f.detalles,
      subtotal: f.valor_sin_impuestos,
      iva: f.iva,
      total: f.total,
      tipo_compra: f.tipo_compra,
      estado_pago: 'pendiente',
      forma_pago: '',
      observaciones: `Importado desde TXT. Emisor: ${f.razon_social}`
    }))

    const response = await request('/compras/importar-txt', {
      method: 'POST',
      body: JSON.stringify({ facturas: payload })
    })

    if (response.success) {
      toast.success(`Importadas ${response.importadas} facturas correctamente`)
      if (response.errores && response.errores.length > 0) {
        toast.warning(`Errores: ${response.errores.join(', ')}`)
      }
      emit('importado')
      cerrarModal()
    } else {
      toast.error('Error al importar: ' + (response.error || 'Error desconocido'))
    }
  } catch (e) {
    toast.error('Error al importar: ' + e.message)
  } finally {
    importando.value = false
  }
}
</script>