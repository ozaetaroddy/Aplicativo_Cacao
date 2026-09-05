<template>
  <div class="import-facturas">
    <div class="card card-cacao">
      <div class="card-header">
        <i class="fas fa-file-import me-2"></i> Importar Facturas desde TXT (SRI)
      </div>
      <div class="card-body">
        <div class="alert alert-info">
          <i class="fas fa-info-circle me-2"></i>
          Seleccione un archivo TXT con el formato de facturas del SRI. 
          Los proveedores se crearán automáticamente si no existen.
        </div>

        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Tipo de Compra</label>
            <select class="form-select" v-model="tipoCompra">
              <option value="inventario">Inventario (Cacao, insumos)</option>
              <option value="gasto">Gasto (Servicios, papelería, honorarios)</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">Archivo TXT</label>
            <input type="file" class="form-control" @change="handleFileUpload" accept=".txt" ref="fileInput" />
          </div>
        </div>

        <div class="mt-3">
          <button class="btn btn-primary" @click="importar" :disabled="!archivoCargado || cargando">
            <i class="fas fa-upload" :class="{ 'fa-spin': cargando }"></i>
            {{ cargando ? 'Importando...' : 'Importar Facturas' }}
          </button>
          <button class="btn btn-secondary ms-2" @click="limpiar">
            <i class="fas fa-undo"></i> Limpiar
          </button>
        </div>

        <!-- Resultados -->
        <div v-if="resultado" class="mt-4">
          <div class="alert" :class="resultado.importados > 0 ? 'alert-success' : 'alert-warning'">
            <strong>{{ resultado.importados }}</strong> facturas importadas correctamente.
            <span v-if="resultado.proveedoresCreados && resultado.proveedoresCreados.length > 0">
              <br><strong>{{ resultado.proveedoresCreados.length }}</strong> proveedores creados automáticamente.
            </span>
          </div>

          <div v-if="resultado.errores && resultado.errores.length > 0" class="alert alert-danger">
            <strong>{{ resultado.errores.length }}</strong> errores:
            <ul class="mb-0 mt-1">
              <li v-for="(err, idx) in resultado.errores.slice(0, 10)" :key="idx">{{ err }}</li>
              <li v-if="resultado.errores.length > 10">... y {{ resultado.errores.length - 10 }} más</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useMongoDB } from '../../composables/useMongoDB'

const toast = useToast()
const { request } = useMongoDB()
const tipoCompra = ref('inventario')
const archivoCargado = ref(false)
const lineas = ref([])
const resultado = ref(null)
const cargando = ref(false)
const fileInput = ref(null)

const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const contenido = e.target.result
    const lineasArray = contenido.split('\n').filter(line => line.trim() !== '')
    lineas.value = lineasArray
    archivoCargado.value = lineasArray.length > 0
    toast.info(`${lineasArray.length} líneas cargadas`)
  }
  reader.readAsText(file)
}

const importar = async () => {
  if (!archivoCargado.value) {
    toast.warning('Seleccione un archivo TXT primero')
    return
  }

  cargando.value = true
  try {
    const data = await request('/compras/importar-txt', {
      method: 'POST',
      body: JSON.stringify({
        lineas: lineas.value,
        tipo_compra: tipoCompra.value
      })
    })
    resultado.value = data
    if (data.importados > 0) {
      toast.success(`${data.importados} facturas importadas correctamente`)
    } else {
      toast.warning('No se importó ninguna factura')
    }
  } catch (e) {
    toast.error('Error al importar: ' + e.message)
  } finally {
    cargando.value = false
  }
}

const limpiar = () => {
  lineas.value = []
  archivoCargado.value = false
  resultado.value = null
  if (fileInput.value) fileInput.value.value = ''
}
</script>