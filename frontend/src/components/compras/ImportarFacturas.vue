<template>
  <div class="importar-page">
    <!-- HEADER -->
    <div class="page-header">
      <div class="header-left">
        <button
          type="button"
          class="btn-back"
          @click="$router.push('/compras')"
          :disabled="importando"
          aria-label="Volver a compras"
        >
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <span class="title-icon"><i class="fas fa-file-import"></i></span>
            Importar facturas desde TXT
          </h1>
          <p class="page-subtitle">
            Sube el archivo del SRI para crear compras en lote
          </p>
        </div>
      </div>
    </div>

    <!-- INFO -->
    <div class="alert-card alert-info">
      <div class="alert-icon"><i class="fas fa-info-circle"></i></div>
      <div class="alert-body">
        <strong>Formato requerido</strong>
        <div class="small">
          Archivo TXT con campos separados por tabuladores (formato oficial del SRI).
          Si un proveedor no existe, se creará automáticamente con los datos del emisor.
          Máximo 500 líneas por archivo.
        </div>
      </div>
    </div>

    <!-- CARD PRINCIPAL -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-upload me-2"></i>
        Configuración de importación
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="imp-file">
              <span class="required">*</span> Archivo TXT
            </label>
            <div class="file-input-wrapper">
              <input
                id="imp-file"
                type="file"
                accept=".txt"
                @change="procesarArchivo"
                ref="fileInput"
                :disabled="importando"
              />
              <label
                for="imp-file"
                class="file-input-label"
                :class="{ 'has-file': archivoNombre, disabled: importando }"
              >
                <i :class="archivoNombre ? 'fas fa-file-alt' : 'fas fa-cloud-upload-alt'"></i>
                <div>
                  <div class="file-label-title">
                    {{ archivoNombre || 'Seleccionar archivo TXT' }}
                  </div>
                  <div class="file-label-hint">
                    {{ archivoNombre ? 'Haz clic para cambiar' : 'Formatos permitidos: .txt' }}
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div class="form-field">
            <label class="form-label" for="imp-tipo">
              <span class="required">*</span> Tipo de compra por defecto
            </label>
            <select
              id="imp-tipo"
              class="form-select"
              v-model="tipoImportacion"
              :disabled="importando"
            >
              <option value="inventario">Inventario (Cacao, insumos)</option>
              <option value="gasto">Gasto (Servicios, papelería, honorarios)</option>
            </select>
            <small class="form-hint">
              Podrás ajustar el tipo por línea en la vista previa.
            </small>
          </div>
        </div>

        <!-- PREVISUALIZACIÓN -->
        <transition name="fade">
          <div v-if="lineas.length > 0" class="preview-section">
            <div class="preview-header">
              <h6>
                <i class="fas fa-list"></i>
                Vista previa ({{ lineas.length }} línea{{ lineas.length === 1 ? '' : 's' }})
              </h6>
              <span class="preview-hint">Mostrando las primeras 5 líneas</span>
            </div>
            <div class="table-responsive">
              <table class="table-preview">
                <thead>
                  <tr>
                    <th style="width:40px;">#</th>
                    <th>RUC Emisor</th>
                    <th>Razón Social</th>
                    <th>Fecha</th>
                    <th class="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(linea, idx) in lineas.slice(0, 5)" :key="idx">
                    <td class="text-muted small">{{ idx + 1 }}</td>
                    <td class="font-mono small">{{ linea.ruc }}</td>
                    <td class="small">{{ linea.razonSocial }}</td>
                    <td class="small">{{ linea.fecha }}</td>
                    <td class="text-end font-mono small">${{ linea.total.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </transition>

        <!-- BOTÓN IMPORTAR -->
        <div v-if="lineas.length > 0" class="import-cta">
          <button
            type="button"
            class="btn-primary-large"
            @click="importarFacturas"
            :disabled="importando"
          >
            <i class="fas fa-upload" :class="{ 'fa-spin': importando }"></i>
            {{ importando ? 'Importando...' : `Importar ${lineas.length} factura(s)` }}
          </button>
        </div>

        <!-- RESULTADO -->
        <transition name="fade">
          <div v-if="resultadoImportacion" class="import-result">
            <div
              class="alert-card"
              :class="
                (resultadoImportacion.errores?.length || 0) > 0 ? 'alert-warning' : 'alert-success'
              "
            >
              <div class="alert-icon">
                <i
                  :class="
                    (resultadoImportacion.errores?.length || 0) > 0
                      ? 'fas fa-exclamation-triangle'
                      : 'fas fa-check-circle'
                  "
                ></i>
              </div>
              <div class="alert-body">
                <strong>
                  {{ resultadoImportacion.importados || 0 }} factura(s) importada(s) correctamente
                </strong>
                <div v-if="resultadoImportacion.proveedoresCreados > 0" class="small">
                  <i class="fas fa-user-plus me-1"></i>
                  {{ resultadoImportacion.proveedoresCreados }} proveedor(es) creado(s)
                </div>
                <div
                  v-if="(resultadoImportacion.errores?.length || 0) > 0"
                  class="small text-danger"
                >
                  {{ resultadoImportacion.errores.length }} error(es) encontrado(s)
                </div>
              </div>
            </div>

            <div
              v-if="(resultadoImportacion.errores?.length || 0) > 0"
              class="import-errors"
            >
              <div
                v-for="(err, idx) in resultadoImportacion.errores.slice(0, 20)"
                :key="idx"
                class="error-item"
              >
                <i class="fas fa-times-circle"></i>
                <span>{{ err }}</span>
              </div>
              <div
                v-if="resultadoImportacion.errores.length > 20"
                class="error-more"
              >
                ... y {{ resultadoImportacion.errores.length - 20 }} errores más
              </div>
            </div>

            <div class="result-actions">
              <button class="btn-primary" @click="$router.push('/compras')">
                <i class="fas fa-list"></i> Ver compras
              </button>
              <button
                class="btn-secondary"
                @click="resetearImportacion"
                :disabled="importando"
              >
                <i class="fas fa-undo"></i> Importar otro archivo
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'

const router = useRouter()
const toast = useToast()

// ===== CONSTANTES =====
const IMPORT_MAX_LINEAS = 500
const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

// ===== STATE =====
const fileInput = ref(null)
const lineas = ref([])
const tipoImportacion = ref('inventario')
const importando = ref(false)
const resultadoImportacion = ref(null)
const archivoNombre = ref('')

let unmounted = false

// ===== PROCESAR ARCHIVO =====
const procesarArchivo = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // Validaciones previas
  if (!file.name.toLowerCase().endsWith('.txt')) {
    toast.error('El archivo debe tener extensión .txt')
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  if (file.size > IMPORT_MAX_FILE_BYTES) {
    toast.error(`El archivo excede el límite de ${(IMPORT_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB`)
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  if (file.size === 0) {
    toast.error('El archivo está vacío')
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  archivoNombre.value = file.name
  const reader = new FileReader()

  reader.onload = (e) => {
    try {
      const contenido = String(e.target?.result || '')
      const lineasRaw = contenido.split('\n').filter(l => l.trim() !== '')

      const dataLines = lineasRaw[0].toLowerCase().includes('ruc_emisor')
        ? lineasRaw.slice(1)
        : lineasRaw

      if (dataLines.length === 0) {
        toast.warning('El archivo no contiene líneas de datos')
        return
      }
      if (dataLines.length > IMPORT_MAX_LINEAS) {
        toast.error(
          `El archivo tiene ${dataLines.length} líneas. Máximo: ${IMPORT_MAX_LINEAS}`
        )
        return
      }

      const parsed = dataLines
        .map(line => {
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
            fecha: campos[6] ? new Date(campos[6]).toLocaleDateString('es-EC') : ''
          }
        })
        .filter(l => l && l.ruc && l.total > 0)

      if (parsed.length === 0) {
        toast.error('No se pudieron procesar líneas válidas')
        return
      }

      lineas.value = parsed
      resultadoImportacion.value = null
      toast.info(`${parsed.length} línea(s) procesada(s)`)
    } catch (err) {
      toast.error('Error al procesar el archivo: ' + err.message)
    }
  }

  reader.onerror = () => toast.error('No se pudo leer el archivo')
  reader.readAsText(file)
}

// ===== IMPORTAR =====
const importarFacturas = async () => {
  if (lineas.value.length === 0 || importando.value) return
  importando.value = true
  resultadoImportacion.value = null

  try {
    const payload = {
      lineas: lineas.value.map(l => ({
        ruc: l.ruc,
        razonSocial: l.razonSocial,
        fechaEmision: l.fechaEmision,
        total: l.total,
        valorSinImpuestos: l.valorSinImpuestos,
        iva: l.iva,
        tipo_compra: tipoImportacion.value
      }))
    }

    const response = await api.request('/compras/importar-txt', {
      method: 'POST',
      body: JSON.stringify(payload),
      loaderMessage: 'Importando facturas...'
    })
    if (unmounted) return

    resultadoImportacion.value = response
    toast.success(`Importación completada: ${response.importados || 0} facturas`)

    if (
      (response.importados || 0) > 0 &&
      (response.errores?.length || 0) === 0
    ) {
      setTimeout(() => {
        if (!unmounted) router.push('/compras')
      }, 3000)
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'DEMASIADAS_LINEAS') {
      toast.error(e.message || `Máximo ${IMPORT_MAX_LINEAS} líneas`)
    } else if (codigo === 'PERIODO_CERRADO') {
      toast.error(e.message || 'Algunas líneas están en períodos cerrados')
    } else {
      toast.error('Error en la importación: ' + e.message)
    }
  } finally {
    if (!unmounted) importando.value = false
  }
}

// ===== RESET =====
const resetearImportacion = () => {
  lineas.value = []
  resultadoImportacion.value = null
  archivoNombre.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

// ===== LIFECYCLE =====
onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.importar-page {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.btn-back {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: all var(--transition);
  flex-shrink: 0;
}
.btn-back:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; transform: translateX(-3px); }
.btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 4px;
}
.title-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #e67e22, #d35400);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  box-shadow: 0 6px 16px rgba(230, 126, 34, 0.3);
}
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

/* ALERT */
.alert-card {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  border-radius: var(--radius-lg);
  border: 1px solid;
}
.alert-info { background: rgba(52, 152, 219, 0.08); border-color: rgba(52, 152, 219, 0.3); }
.alert-warning { background: rgba(243, 156, 18, 0.08); border-color: rgba(243, 156, 18, 0.3); }
.alert-success { background: rgba(39, 174, 96, 0.08); border-color: rgba(39, 174, 96, 0.3); }
.alert-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.alert-info .alert-icon { background: rgba(52, 152, 219, 0.15); color: #3498db; }
.alert-warning .alert-icon { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
.alert-success .alert-icon { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
.alert-body { flex: 1; font-size: 0.85rem; color: var(--text-secondary); }
.alert-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }
.alert-body .small { font-size: 0.78rem; line-height: 1.5; }

/* FORM */
.form-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-hint { font-size: 0.72rem; color: var(--text-muted); }
.form-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
}
.form-select:focus {
  border-color: #e67e22;
  box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.15);
  background: var(--bg-card);
}
.form-select:disabled { opacity: 0.6; cursor: not-allowed; }

/* FILE INPUT */
.file-input-wrapper { position: relative; }
.file-input-wrapper input[type="file"] {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  z-index: 2;
}
.file-input-label {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-table-stripe);
  cursor: pointer;
  transition: all var(--transition);
}
.file-input-label:hover:not(.disabled) {
  border-color: #e67e22;
  background: rgba(230, 126, 34, 0.05);
}
.file-input-label.has-file {
  border-style: solid;
  border-color: #e67e22;
  background: rgba(230, 126, 34, 0.05);
}
.file-input-label.disabled { opacity: 0.6; cursor: not-allowed; }
.file-input-label > i { font-size: 1.5rem; color: #e67e22; flex-shrink: 0; }
.file-label-title { font-weight: 700; color: var(--text-primary); font-size: 0.9rem; }
.file-label-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }

/* PREVIEW */
.preview-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-light); }
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.preview-header h6 {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.preview-hint { font-size: 0.72rem; color: var(--text-muted); }

.table-responsive { overflow-x: auto; }
.table-preview {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.table-preview thead { background: var(--bg-table-stripe); }
.table-preview th {
  padding: 10px 12px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 1px solid var(--border-color);
}
.table-preview td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
}
.table-preview tbody tr:last-child td { border-bottom: none; }
.font-mono { font-family: var(--font-mono, monospace); }
.text-end { text-align: right; }

/* CTA */
.import-cta { margin-top: 20px; display: flex; justify-content: flex-end; }
.btn-primary-large {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 28px;
  background: linear-gradient(135deg, #e67e22, #d35400);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3);
  font-family: inherit;
}
.btn-primary-large:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(230, 126, 34, 0.4);
}
.btn-primary-large:disabled { opacity: 0.5; cursor: not-allowed; }

/* RESULT */
.import-result { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-light); }
.import-errors {
  margin-top: 12px;
  max-height: 240px;
  overflow-y: auto;
  padding: 12px;
  background: rgba(231, 76, 60, 0.05);
  border-radius: var(--radius-md);
}
.error-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  font-size: 0.8rem;
  color: var(--danger);
}
.error-item i { flex-shrink: 0; margin-top: 2px; }
.error-more {
  font-size: 0.78rem;
  color: var(--text-muted);
  padding: 6px 0;
  font-style: italic;
}
.result-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: none;
}
.btn-primary {
  background: linear-gradient(135deg, #e67e22, #d35400);
  color: #fff;
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3);
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(230, 126, 34, 0.4); }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: #e67e22; color: #e67e22; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .form-grid { grid-template-columns: 1fr; }
  .import-cta { justify-content: stretch; }
  .btn-primary-large { width: 100%; justify-content: center; }
  .result-actions { flex-direction: column; }
  .result-actions .btn-primary,
  .result-actions .btn-secondary { width: 100%; justify-content: center; }
}
</style>