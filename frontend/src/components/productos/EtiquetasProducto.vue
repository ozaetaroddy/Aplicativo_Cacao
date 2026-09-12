<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 no-print">
      <h4 class="section-title"><i class="fas fa-tags"></i> Etiquetas con Código de Barras</h4>
      <div class="d-flex gap-2">
        <select v-model="productoSeleccionado" class="form-select" style="width: 300px;">
          <option value="">Seleccione un producto...</option>
          <option v-for="p in productos" :key="p._id" :value="p._id">
            {{ p.nombre }} — {{ p.codigo }}
          </option>
        </select>
        <input
          type="number"
          v-model.number="cantidadEtiquetas"
          min="1" max="100"
          class="form-control"
          style="width: 100px;"
          placeholder="Cantidad"
        />
        <button class="btn btn-success" @click="imprimir" :disabled="!productoActual">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>
    </div>

    <div v-if="productoActual" class="preview-area">
      <div v-for="i in Math.min(cantidadEtiquetas, 12)" :key="i" class="etiqueta-preview">
        <div class="etiqueta-nombre">{{ productoActual.nombre }}</div>
        <div class="etiqueta-precio">${{ (productoActual.precio_venta || 0).toFixed(2) }}</div>
        <div class="etiqueta-codigo" v-html="barcodeActual"></div>
        <div class="etiqueta-codigo-texto">{{ codigoEAN }}</div>
      </div>
    </div>

    <div v-else class="alert alert-info">
      <i class="fas fa-info-circle me-2"></i>
      Selecciona un producto para ver la vista previa de la etiqueta.
      <br><small class="text-muted">Si el producto no tiene código de barras EAN-13 válido (12 o 13 dígitos), se usará su código interno.</small>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMongoDB } from '../../composables/useMongoDB'
import { useToast } from 'vue-toastification'
import { generarEAN13SVG, generarCode128SVG } from '../../utils/barcodeGenerator'

const toast = useToast()
const { find } = useMongoDB()

const productos = ref([])
const productoSeleccionado = ref('')
const cantidadEtiquetas = ref(12)

const productoActual = computed(() =>
  productos.value.find(p => p._id === productoSeleccionado.value) || null
)

// Determinar código EAN-13 válido o usar interno como Code128
const codigoEAN = computed(() => {
  if (!productoActual.value) return ''
  const cb = (productoActual.value.codigo_barras || '').replace(/\D/g, '')
  if (cb.length === 12 || cb.length === 13) return cb
  // Fallback: usar código interno numérico de 12 dígitos
  const codigo = (productoActual.value.codigo || '').replace(/\D/g, '')
  return codigo.padStart(12, '0').slice(-12)
})

const barcodeActual = computed(() => {
  if (!codigoEAN.value) return ''
  try {
    if (codigoEAN.value.length === 12 || codigoEAN.value.length === 13) {
      return generarEAN13SVG(codigoEAN.value, { height: 50 })
    }
  } catch (e) { /* fallthrough */ }
  return generarCode128SVG(codigoEAN.value, { height: 50 })
})

const imprimir = () => {
  const ventana = window.open('', '_blank', 'width=900,height=700')
  const html = `<!DOCTYPE html><html><head><title>Etiquetas</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; padding: 10mm; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
      .etiqueta { border: 1px dashed #999; padding: 3mm; text-align: center; page-break-inside: avoid; }
      .etiqueta-nombre { font-size: 9pt; font-weight: 700; margin-bottom: 2px; line-height: 1.1; }
      .etiqueta-precio { font-size: 14pt; font-weight: 800; margin: 2px 0; }
      .etiqueta-codigo svg { width: 100%; height: 40px; }
      .etiqueta-codigo-texto { font-family: monospace; font-size: 8pt; letter-spacing: 1px; margin-top: 2px; }
      @media print { .no-print { display: none; } body { padding: 5mm; } }
    </style></head><body>
    <div class="grid">
      ${Array(cantidadEtiquetas.value).fill(0).map(() => `
        <div class="etiqueta">
          <div class="etiqueta-nombre">${productoActual.value.nombre}</div>
          <div class="etiqueta-precio">$${(productoActual.value.precio_venta || 0).toFixed(2)}</div>
          <div class="etiqueta-codigo">${barcodeActual.value}</div>
          <div class="etiqueta-codigo-texto">${codigoEAN.value}</div>
        </div>
      `).join('')}
    </div>
    <script>window.onload=()=>{setTimeout(()=>{window.print();window.onafterprint=()=>window.close()},300)}<\/script>
    </body></html>`
  ventana.document.write(html)
  ventana.document.close()
}

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    toast.error('Error cargando productos: ' + e.message)
  }
})
</script>

<style scoped>
.preview-area {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  background: var(--bg-card);
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
}
.etiqueta-preview {
  border: 1px dashed var(--border-color);
  padding: 10px;
  text-align: center;
  background: white;
  color: #1a1a1a;
  border-radius: 6px;
}
.etiqueta-nombre { font-size: 0.75rem; font-weight: 700; line-height: 1.1; margin-bottom: 4px; }
.etiqueta-precio { font-size: 1.1rem; font-weight: 800; margin: 4px 0; }
.etiqueta-codigo { margin: 4px 0; }
.etiqueta-codigo-texto { font-family: monospace; font-size: 0.7rem; letter-spacing: 1px; }
</style>