<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="section-title"><i class="fas fa-file-import"></i> Importar Facturas desde TXT</h4>
      <button class="btn btn-secondary" @click="$router.push('/compras')">
        <i class="fas fa-arrow-left"></i> Volver a Compras
      </button>
    </div>

    <div class="card card-cacao">
      <div class="card-body">
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
          <div class="alert" :class="resultadoImportacion.errores.length > 0 ? 'alert-warning' : 'alert-success'">
            <i class="fas fa-check-circle me-2"></i>
            {{ resultadoImportacion.importados }} facturas importadas correctamente.
            <span v-if="resultadoImportacion.proveedoresCreados && resultadoImportacion.proveedoresCreados.length > 0">
              <br><i class="fas fa-user-plus me-2"></i>
              Proveedores creados: {{ resultadoImportacion.proveedoresCreados.join(', ') }}
            </span>
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
          <div v-if="resultadoImportacion.importados > 0" class="mt-2">
            <button class="btn btn-success me-2" @click="$router.push('/compras')">
              <i class="fas fa-list"></i> Ver Compras
            </button>
            <button class="btn btn-outline-primary" @click="resetearImportacion">
              <i class="fas fa-undo"></i> Importar otro archivo
            </button>
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

const router = useRouter()
const toast = useToast()
const { request } = useMongoDB()

const fileInput = ref(null)
const lineas = ref([])
const tipoImportacion = ref('inventario')
const importando = ref(false)
const resultadoImportacion = ref(null)

// Procesar archivo TXT
const procesarArchivo = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    const lineasRaw = contenido.split('\n').filter(line => line.trim() !== '')

    // Saltar encabezado si existe
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

// Importar facturas
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

    if (response.importados > 0 && response.errores.length === 0) {
      // Si todo ok, redirigir automáticamente después de 3 segundos
      setTimeout(() => {
        router.push('/compras')
      }, 3000)
    }
  } catch (e) {
    toast.error('Error en la importación: ' + e.message)
  } finally {
    importando.value = false
  }
}

// Resetear para nuevo archivo
const resetearImportacion = () => {
  lineas.value = []
  resultadoImportacion.value = null
  if (fileInput.value) fileInput.value.value = ''
}
</script>