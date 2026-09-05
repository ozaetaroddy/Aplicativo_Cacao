<template>
  <div>
    <h4 class="section-title"><i class="fas fa-file-import"></i> Importar Facturas</h4>

    <div class="card card-cacao">
      <div class="card-body">
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i>
          Sube un archivo de texto (TSV) con facturas para importarlas automáticamente.
          El archivo debe tener las columnas: RUC_EMISOR, RAZON_SOCIAL_EMISOR, TIPO_COMPROBANTE,
          SERIE_COMPROBANTE, CLAVE_ACCESO, FECHA_AUTORIZACION, FECHA_EMISION,
          IDENTIFICACION_RECEPTOR, VALOR_SIN_IMPUESTOS, IVA, IMPORTE_TOTAL.
        </div>

        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Archivo de Facturas (.txt)</label>
            <input type="file" class="form-control" @change="handleFileUpload" accept=".txt" ref="fileInput" />
          </div>
          <div class="col-md-3">
            <label class="form-label">RUC del Comprador</label>
            <input type="text" class="form-control" v-model="rucComprador" placeholder="1311552069" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Tipo por Defecto</label>
            <select class="form-select" v-model="tipoPorDefecto">
              <option value="gasto">Gasto</option>
              <option value="inventario">Inventario</option>
            </select>
          </div>
        </div>

        <div class="mt-3">
          <button class="btn btn-primary" @click="importarFacturas" :disabled="!facturas.length || cargando">
            <i class="fas fa-upload" :class="{ 'fa-spin': cargando }"></i>
            {{ cargando ? 'Importando...' : 'Importar Facturas' }}
          </button>
          <button class="btn btn-secondary ms-2" @click="limpiarArchivo">
            <i class="fas fa-undo"></i> Limpiar
          </button>
        </div>

        <!-- Previsualización -->
        <div v-if="facturas.length > 0" class="mt-3">
          <h6>Previsualización ({{ facturas.length }} facturas encontradas)</h6>
          <div class="table-responsive" style="max-height:300px;">
            <table class="table table-sm table-cacao">
              <thead>
                <tr>
                  <th>RUC Emisor</th>
                  <th>Razón Social</th>
                  <th>Nº Factura</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>IVA</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(f, idx) in facturas.slice(0, 20)" :key="idx">
                  <td>{{ f.ruc_emisor }}</td>
                  <td>{{ f.razon_social_emisor }}</td>
                  <td>{{ f.numero_factura }}</td>
                  <td>{{ f.fecha_emision }}</td>
                  <td>${{ f.importe_total }}</td>
                  <td>${{ f.iva }}</td>
                </tr>
                <tr v-if="facturas.length > 20">
                  <td colspan="6" class="text-muted text-center">
                    ... y {{ facturas.length - 20 }} más
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Resultados -->
        <div v-if="resultados" class="mt-3">
          <div class="alert" :class="resultados.errores.length > 0 ? 'alert-warning' : 'alert-success'">
            <strong>Importación completada</strong><br />
            Total: {{ resultados.total }} | Exitosos: {{ resultados.exitosos.length }} | Errores: {{ resultados.errores.length }}
          </div>
          <div v-if="resultados.errores.length > 0" class="table-responsive">
            <table class="table table-sm table-cacao">
              <thead><tr><th>Factura</th><th>Error</th></tr></thead>
              <tbody>
                <tr v-for="e in resultados.errores" :key="e.factura">
                  <td>{{ e.factura }}</td>
                  <td class="text-danger">{{ e.error }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="resultados.resultados && resultados.resultados.length > 0" class="table-responsive">
            <table class="table table-sm table-cacao">
              <thead><tr><th>Factura</th><th>Tipo</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="r in resultados.resultados.slice(0, 20)" :key="r.factura">
                  <td>{{ r.factura }}</td>
                  <td><span class="badge" :class="r.tipo === 'inventario' ? 'bg-success' : 'bg-info'">{{ r.tipo }}</span></td>
                  <td><span class="badge bg-success">Exitoso</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'

const toast = useToast()
const { request } = useMongoDB()
const fileInput = ref(null)
const facturas = ref([])
const rucComprador = ref('1311552069')
const tipoPorDefecto = ref('gasto')
const cargando = ref(false)
const resultados = ref(null)

const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    const lineas = contenido.split('\n')
    
    // Obtener encabezados
    const encabezados = lineas[0].split('\t').map(h => h.trim())
    
    const facturasParseadas = []
    for (let i = 1; i < lineas.length; i++) {
      if (!lineas[i].trim()) continue
      const valores = lineas[i].split('\t')
      if (valores.length < 11) continue
      
      const factura = {}
      encabezados.forEach((key, idx) => {
        factura[key] = valores[idx]?.trim() || ''
      })
      facturasParseadas.push(factura)
    }
    
    facturas.value = facturasParseadas
    toast.success(`Se encontraron ${facturasParseadas.length} facturas en el archivo`)
  }
  reader.readAsText(file)
}

const limpiarArchivo = () => {
  fileInput.value.value = ''
  facturas.value = []
  resultados.value = null
}

const importarFacturas = async () => {
  if (!facturas.value.length) {
    toast.warning('No hay facturas para importar')
    return
  }

  cargando.value = true
  try {
    const data = await request('/compras/importar-facturas', {
      method: 'POST',
      body: JSON.stringify({
        facturas: facturas.value,
        rucComprador: rucComprador.value,
        tipoCompraPorDefecto: tipoPorDefecto.value
      })
    })
    resultados.value = data
    toast.success(data.mensaje)
  } catch (e) {
    toast.error('Error al importar: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>