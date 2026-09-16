<template>
  <div class="export-import-container">
    <!-- ===== EXPORTAR ===== -->
    <div class="ei-section">
      <div class="ei-section-title">
        <i class="fas fa-file-export" aria-hidden="true"></i>
        Exportar datos
      </div>
      <div class="ei-section-desc">
        Descarga un Excel con el listado completo de cada módulo.
      </div>

      <div class="ei-grid">
        <button
          v-for="opt in exportOptions"
          :key="opt.id"
          type="button"
          class="ei-card"
          :disabled="exportando[opt.id]"
          @click="exportar(opt)"
        >
          <div class="ei-card-icon" :style="{ background: opt.color }">
            <i :class="opt.icon" aria-hidden="true"></i>
          </div>
          <div class="ei-card-body">
            <div class="ei-card-title">{{ opt.label }}</div>
            <div class="ei-card-desc">{{ opt.desc }}</div>
          </div>
          <i
            v-if="exportando[opt.id]"
            class="fas fa-spinner fa-spin ei-card-spinner"
            aria-hidden="true"
          ></i>
          <i v-else class="fas fa-download ei-card-arrow" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Rango de fechas para reportes -->
      <div class="ei-date-range">
        <label class="ei-date-field">
          <span>Desde</span>
          <input type="date" v-model="rango.desde" :disabled="cualquierExportando" />
        </label>
        <label class="ei-date-field">
          <span>Hasta</span>
          <input type="date" v-model="rango.hasta" :disabled="cualquierExportando" />
        </label>
        <button
          type="button"
          class="ei-date-clear"
          @click="limpiarRango"
          :disabled="!rango.desde && !rango.hasta"
          title="Limpiar rango"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <!-- ===== IMPORTAR ===== -->
    <div class="ei-section">
      <div class="ei-section-title">
        <i class="fas fa-file-import" aria-hidden="true"></i>
        Importar productos
      </div>
      <div class="ei-section-desc">
        Carga masiva desde Excel (.xlsx, .xls) o CSV. Se validan fila por fila
        y se muestran los errores.
      </div>

      <div
        class="ei-drop"
        :class="{ 'drag-over': dragOver, 'has-file': !!archivoSeleccionado }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="abrirSelector"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          class="ei-file-input"
          @change="onFileChange"
        />

        <template v-if="!archivoSeleccionado">
          <i class="fas fa-cloud-upload-alt ei-drop-icon" aria-hidden="true"></i>
          <div class="ei-drop-title">Arrastra tu archivo aquí</div>
          <div class="ei-drop-sub">o haz clic para seleccionar</div>
          <div class="ei-drop-hint">
            Formatos: .xlsx, .xls, .csv · Máx. {{ formatBytes(MAX_FILE_SIZE) }}
          </div>
        </template>

        <template v-else>
          <i class="fas fa-file-excel ei-file-icon" aria-hidden="true"></i>
          <div class="ei-file-info">
            <div class="ei-file-name">{{ archivoSeleccionado.name }}</div>
            <div class="ei-file-size">{{ formatBytes(archivoSeleccionado.size) }}</div>
          </div>
          <button
            type="button"
            class="ei-file-remove"
            @click.stop="quitarArchivo"
            title="Quitar archivo"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </template>
      </div>

      <!-- Preview de filas -->
      <div v-if="filasPreview.length > 0" class="ei-preview">
        <div class="ei-preview-header">
          <div>
            <strong>{{ filasPreview.length }}</strong> fila(s) detectada(s)
            <span v-if="filasPreview.length > 10" class="text-muted">
              (mostrando las primeras 10)
            </span>
          </div>
          <button
            type="button"
            class="ei-preview-clear"
            @click="limpiarPreview"
            :disabled="importando"
          >
            Limpiar
          </button>
        </div>

        <div class="ei-preview-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Código</th>
                <th>P. Compra</th>
                <th>P. Venta</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(f, i) in filasPreview.slice(0, 10)"
                :key="i"
                :class="{ 'row-invalid': !f.valido }"
              >
                <td>{{ i + 1 }}</td>
                <td>
                  {{ f.nombre || '—' }}
                  <span v-if="!f.valido" class="row-error">{{ f.error }}</span>
                </td>
                <td class="mono">{{ f.codigo || '—' }}</td>
                <td class="num">${{ f.precio_compra.toFixed(2) }}</td>
                <td class="num">${{ f.precio_venta.toFixed(2) }}</td>
                <td class="num">{{ f.stock }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          class="ei-btn-import"
          :disabled="importando || !hayFilasValidas"
          @click="confirmarImportacion"
        >
          <i
            :class="importando ? 'fas fa-spinner fa-spin' : 'fas fa-check'"
            aria-hidden="true"
          ></i>
          {{ importando ? 'Importando…' : `Importar ${filasValidas.length} productos` }}
        </button>
      </div>

      <!-- Progreso -->
      <div v-if="importando" class="ei-progress">
        <div class="ei-progress-header">
          <span>{{ progreso.actual }} / {{ progreso.total }}</span>
          <span class="text-muted">
            ✔ {{ progreso.ok }} · ✖ {{ progreso.error }}
          </span>
        </div>
        <div class="ei-progress-bar">
          <div
            class="ei-progress-fill"
            :style="{ width: progresoPct + '%' }"
          ></div>
        </div>
      </div>

      <!-- Resultado -->
      <div v-if="resultadoImport" class="ei-resultado" :class="resultadoImport.errores.length ? 'warn' : 'ok'">
        <i
          :class="resultadoImport.errores.length ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'"
          aria-hidden="true"
        ></i>
        <div>
          <strong>{{ resultadoImport.ok }} producto(s) importado(s)</strong>
          <div v-if="resultadoImport.errores.length" class="small">
            {{ resultadoImport.errores.length }} con error. Se muestran abajo.
          </div>
        </div>
        <button type="button" class="ei-resultado-close" @click="resultadoImport = null">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <div v-if="resultadoImport?.errores?.length" class="ei-errores">
        <div class="ei-errores-title">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          Errores detallados
        </div>
        <ul>
          <li v-for="(e, i) in resultadoImport.errores.slice(0, 50)" :key="i">
            <strong>Fila {{ e.fila }}:</strong> {{ e.mensaje }}
          </li>
          <li v-if="resultadoImport.errores.length > 50" class="text-muted">
            … y {{ resultadoImport.errores.length - 50 }} más
          </li>
        </ul>
      </div>
    </div>

    <!-- ===== MODAL CONFIRMACIÓN ===== -->
    <div
      class="modal fade"
      id="modalConfirmImport"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header bg-warning">
            <h5 class="modal-title text-dark">
              <i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>
              Confirmar importación
            </h5>
            <button
              type="button"
              class="btn-close"
              @click="cancelarConfirm"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p>
              Se importarán <strong>{{ filasValidas.length }}</strong> producto(s).
            </p>
            <div v-if="filasPreview.length - filasValidas.length > 0" class="alert alert-warning small mb-0">
              <i class="fas fa-info-circle me-2" aria-hidden="true"></i>
              {{ filasPreview.length - filasValidas.length }} fila(s) serán omitidas por errores de formato.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelarConfirm">
              Cancelar
            </button>
            <button type="button" class="btn btn-warning" @click="aceptarConfirm">
              <i class="fas fa-check" aria-hidden="true"></i> Importar
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { Modal } from 'bootstrap'
import { useToast } from 'vue-toastification'
import { api } from '../services/api'

const toast = useToast()

// ===== CONSTANTES =====
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const IMPORT_MAX_FILAS = 2000
const IMPORT_BATCH_SIZE = 25

// ===== STATE =====
const archivoSeleccionado = ref(null)
const filasPreview = ref([])
const fileInput = ref(null)
const dragOver = ref(false)
const importando = ref(false)
const resultadoImport = ref(null)

const rango = reactive({ desde: '', hasta: '' })
const exportando = reactive({})
const progreso = reactive({ actual: 0, total: 0, ok: 0, error: 0 })

let modalConfirm = null
let confirmResolve = null
let unmounted = false

// ===== OPCIONES DE EXPORTACIÓN =====
const exportOptions = [
  {
    id: 'productos',
    label: 'Productos',
    desc: 'Catálogo completo con precios y stock',
    icon: 'fas fa-boxes',
    color: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    endpoint: '/productos'
  },
  {
    id: 'clientes',
    label: 'Clientes',
    desc: 'Listado de clientes con RUC y contacto',
    icon: 'fas fa-users',
    color: 'linear-gradient(135deg, #10b981, #059669)',
    endpoint: '/clientes'
  },
  {
    id: 'proveedores',
    label: 'Proveedores',
    desc: 'Listado de proveedores registrados',
    icon: 'fas fa-truck',
    color: 'linear-gradient(135deg, #f59e0b, #d97706)',
    endpoint: '/proveedores'
  },
  {
    id: 'ventas',
    label: 'Ventas',
    desc: 'Comprobantes emitidos en el rango',
    icon: 'fas fa-file-invoice',
    color: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    endpoint: '/reportes/ventas',
    conRango: true
  },
  {
    id: 'compras',
    label: 'Compras',
    desc: 'Comprobantes recibidos en el rango',
    icon: 'fas fa-shopping-cart',
    color: 'linear-gradient(135deg, #ef4444, #dc2626)',
    endpoint: '/reportes/compras',
    conRango: true
  }
]

// ===== COMPUTED =====
const cualquierExportando = computed(() => Object.values(exportando).some(Boolean))

const progresoPct = computed(() => {
  if (!progreso.total) return 0
  return Math.round((progreso.actual / progreso.total) * 100)
})

const filasValidas = computed(() => filasPreview.value.filter((f) => f.valido))

const hayFilasValidas = computed(() => filasValidas.value.length > 0)

// ===== HELPERS =====
const formatBytes = (b) => {
  const n = Number(b)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1)
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const sanitizeFilename = (nombre, fallback = 'archivo') => {
  const base = String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 100)
  return base || fallback
}

/**
 * Normaliza una clave del Excel a una forma estándar (snake_case,
 * sin acentos, lowercase) para aceptar cualquier variante de header.
 */
const normalizarHeader = (k) =>
  String(k || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

/**
 * Mapea una fila cruda del Excel a un producto validado.
 * Acepta headers en múltiples idiomas/formatos.
 */
const mapearFila = (row, idx) => {
  const norm = {}
  for (const [k, v] of Object.entries(row || {})) {
    norm[normalizarHeader(k)] = v
  }

  const pick = (...keys) => {
    for (const k of keys) {
      const v = norm[normalizarHeader(k)]
      if (v !== undefined && v !== null && v !== '') return v
    }
    return undefined
  }

  const nombre = String(pick('nombre', 'name', 'descripcion', 'producto') || '').trim()
  const codigoRaw = String(pick('codigo', 'code', 'sku', 'cod', 'referencia') || '').trim()
  const codigo = codigoRaw
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '')
    .slice(0, 50)
  const codigoBarras = String(pick('codigo_barras', 'barcode', 'ean', 'upc') || '').trim()
  const descripcion = String(pick('descripcion', 'description', 'detalle') || '').trim()

  const parseNum = (v, fallback = 0) => {
    if (v === undefined || v === null || v === '') return fallback
    const s = String(v).replace(/[$,\s]/g, '').replace(',', '.')
    const n = Number(s)
    return Number.isFinite(n) ? n : fallback
  }

  const precioCompra = parseNum(pick('precio_compra', 'p_compra', 'costo', 'cost', 'costo_unitario'))
  const precioVenta = parseNum(pick('precio_venta', 'p_venta', 'precio', 'price', 'precio_unitario'))
  const stockMinimo = parseNum(pick('stock_minimo', 'min_stock', 'minimo'))
  const unidadMedida = String(pick('unidad_medida', 'unidad', 'unit') || 'unidad').trim() || 'unidad'
  const tipoMedida = String(pick('tipo_medida', 'tipo') || 'unidad').trim() || 'unidad'
  const aplicaIVA = (() => {
    const v = pick('aplica_iva', 'iva', 'con_iva')
    if (v === undefined) return true
    if (typeof v === 'boolean') return v
    const s = String(v).toLowerCase().trim()
    return !['0', 'false', 'no', 'n', 'falso'].includes(s)
  })()

  // Validaciones
  const errores = []
  if (!nombre) errores.push('nombre vacío')
  else if (nombre.length < 2) errores.push('nombre muy corto')
  else if (nombre.length > 200) errores.push('nombre muy largo')
  if (!codigo) errores.push('código vacío')
  if (precioVenta < 0) errores.push('precio venta negativo')
  if (precioCompra < 0) errores.push('precio compra negativo')

  return {
    fila: idx + 2, // +2 por el header + índice humano
    valido: errores.length === 0,
    error: errores.join(', '),
    nombre,
    codigo,
    codigo_barras: codigoBarras,
    descripcion,
    precio_compra: precioCompra,
    precio_venta: precioVenta,
    stock_minimo: stockMinimo,
    unidad_medida: unidadMedida,
    tipo_medida: tipoMedida,
    aplica_iva: aplicaIVA
  }
}

// ===== EXPORTACIÓN (vía API) =====
const exportar = async (opt) => {
  if (cualquierExportando.value) return

  exportando[opt.id] = true
  try {
    // Construir URL con rango opcional
    const params = new URLSearchParams()
    params.set('limit', '5000')
    if (opt.conRango && rango.desde) params.set('desde', rango.desde)
    if (opt.conRango && rango.hasta) params.set('hasta', rango.hasta)

    const url = `${opt.endpoint}?${params.toString()}`
    const res = await api.request(url, { method: 'GET' })

    const data = Array.isArray(res) ? res : (res?.data || [])
    if (data.length === 0) {
      toast.warning(`No hay datos para exportar en "${opt.label}"`)
      return
    }

    // Limpiar campos internos / pesados
    const CAMPOS_OMITIR = new Set([
      '_id', 'createdAt', 'updatedAt', 'password',
      'password_cifrado', 'xml_generado', 'xml_firmado', 'xml_autorizado',
      'respuesta_sri', 'envios_email'
    ])

    const clean = data.map((item) => {
      const obj = {}
      for (const [k, v] of Object.entries(item || {})) {
        if (CAMPOS_OMITIR.has(k)) continue
        if (v === undefined || v === null) {
          obj[k] = ''
        } else if (typeof v === 'object') {
          obj[k] = Array.isArray(v) ? `${v.length} item(s)` : JSON.stringify(v)
        } else {
          obj[k] = v
        }
      }
      return obj
    })

    // Import dinámico de XLSX (solo cuando se usa)
    const XLSX = await import('xlsx')

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(clean)

    // Autoajustar ancho de columnas
    const cols = Object.keys(clean[0] || {})
    ws['!cols'] = cols.map((c) => ({
      wch: Math.min(
        40,
        Math.max(
          10,
          c.length + 2,
          ...clean.slice(0, 100).map((r) => String(r[c] ?? '').length + 2)
        )
      )
    }))

    XLSX.utils.book_append_sheet(wb, ws, opt.label.slice(0, 30))

    const stamp = new Date().toISOString().slice(0, 10)
    const filename = `${sanitizeFilename(opt.id)}_${stamp}.xlsx`
    XLSX.writeFile(wb, filename)

    toast.success(`${opt.label}: ${data.length} registro(s) exportado(s)`)
  } catch (e) {
    if (!unmounted) toast.error('Error al exportar: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) exportando[opt.id] = false
  }
}

const limpiarRango = () => {
  rango.desde = ''
  rango.hasta = ''
}

// ===== IMPORTACIÓN (vía API) =====
const abrirSelector = () => {
  if (!importando.value) fileInput.value?.click()
}

const onFileChange = (event) => {
  const f = event.target.files?.[0]
  if (f) procesarArchivo(f)
}

const onDrop = (event) => {
  dragOver.value = false
  const f = event.dataTransfer?.files?.[0]
  if (f) procesarArchivo(f)
}

const quitarArchivo = () => {
  archivoSeleccionado.value = null
  filasPreview.value = []
  resultadoImport.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const limpiarPreview = () => {
  filasPreview.value = []
  archivoSeleccionado.value = null
  resultadoImport.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const procesarArchivo = async (file) => {
  // Validaciones básicas
  const ext = String(file.name || '').toLowerCase().split('.').pop()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    toast.error('Formato no soportado. Usa .xlsx, .xls o .csv')
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.error(`El archivo excede ${formatBytes(MAX_FILE_SIZE)}`)
    return
  }
  if (file.size === 0) {
    toast.error('El archivo está vacío')
    return
  }

  archivoSeleccionado.value = file
  resultadoImport.value = null

  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) throw new Error('El archivo no tiene hojas')

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
    if (rows.length === 0) {
      toast.warning('El archivo no tiene filas de datos')
      quitarArchivo()
      return
    }
    if (rows.length > IMPORT_MAX_FILAS) {
      toast.error(`Máximo ${IMPORT_MAX_FILAS} filas por importación`)
      quitarArchivo()
      return
    }

    filasPreview.value = rows.map((r, idx) => mapearFila(r, idx))
  } catch (e) {
    console.error('Error leyendo archivo:', e)
    toast.error('No se pudo leer el archivo: ' + (e?.message || 'desconocido'))
    quitarArchivo()
  }
}

const confirmarImportacion = () => {
  if (!hayFilasValidas.value) {
    toast.warning('No hay filas válidas para importar')
    return
  }

  return new Promise((resolve) => {
    confirmResolve = resolve
    if (!modalConfirm) {
      modalConfirm = new Modal(document.getElementById('modalConfirmImport'), {
        backdrop: 'static'
      })
    }
    modalConfirm.show()
  }).then((confirmado) => {
    if (confirmado) ejecutarImportacion()
  })
}

const aceptarConfirm = () => {
  const r = confirmResolve
  confirmResolve = null
  modalConfirm?.hide()
  if (r) r(true)
}

const cancelarConfirm = () => {
  const r = confirmResolve
  confirmResolve = null
  modalConfirm?.hide()
  if (r) r(false)
}

const ejecutarImportacion = async () => {
  const filas = filasValidas.value
  importando.value = true
  resultadoImport.value = null
  progreso.actual = 0
  progreso.total = filas.length
  progreso.ok = 0
  progreso.error = 0

  const errores = []

  try {
    // Envío secuencial para respetar unicidad y auditoría
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      try {
        await api.request('/productos', {
          method: 'POST',
          body: JSON.stringify({
            nombre: f.nombre,
            codigo: f.codigo,
            codigo_barras: f.codigo_barras || undefined,
            descripcion: f.descripcion || undefined,
            precio_compra: f.precio_compra,
            precio_venta: f.precio_venta,
            stock_minimo: f.stock_minimo,
            unidad_medida: f.unidad_medida,
            tipo_medida: f.tipo_medida,
            aplica_iva: f.aplica_iva
          }),
          skipLoader: true
        })
        progreso.ok++
      } catch (e) {
        const msg = e?.codigo === 'PRODUCTO_DUPLICADO'
          ? 'Código o nombre ya existe'
          : (e?.message || 'Error desconocido')
        errores.push({ fila: f.fila, mensaje: msg })
        progreso.error++
      } finally {
        progreso.actual = i + 1
      }
    }

    resultadoImport.value = {
      ok: progreso.ok,
      errores
    }

    if (progreso.error === 0) {
      toast.success(`✅ ${progreso.ok} producto(s) importado(s)`)
    } else if (progreso.ok > 0) {
      toast.warning(`Importados ${progreso.ok} · ${progreso.error} con error`)
    } else {
      toast.error('No se importó ningún producto')
    }

    // Limpiar preview si todo salió bien
    if (progreso.error === 0) {
      setTimeout(() => {
        if (!unmounted) limpiarPreview()
      }, 2000)
    }
  } catch (e) {
    if (!unmounted) toast.error('Error en la importación: ' + (e?.message || 'desconocido'))
  } finally {
    if (!unmounted) importando.value = false
  }
}

// ===== CLEANUP =====
onBeforeUnmount(() => {
  unmounted = true
  try { modalConfirm?.hide() } catch { /* noop */ }
  if (confirmResolve) {
    confirmResolve(false)
    confirmResolve = null
  }
})
</script>

<style scoped>
.export-import-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 8px 0;
}

.ei-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 22px;
}

.ei-section-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.ei-section-title i { color: var(--primary-color); }
.ei-section-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.5;
}

/* ===== GRID EXPORTAR ===== */
.ei-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ei-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-table-stripe);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  text-align: left;
  width: 100%;
}
.ei-card:hover:not(:disabled) {
  border-color: var(--primary-color);
  background: var(--bg-card);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
.ei-card:disabled { opacity: 0.6; cursor: not-allowed; }

.ei-card-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.1rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ei-card-body { flex: 1; min-width: 0; }
.ei-card-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.ei-card-desc {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.ei-card-arrow,
.ei-card-spinner {
  color: var(--text-muted);
  font-size: 0.85rem;
  flex-shrink: 0;
}

/* ===== RANGO ===== */
.ei-date-range {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
  flex-wrap: wrap;
}
.ei-date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ei-date-field span {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.ei-date-field input {
  padding: 8px 12px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.85rem;
  outline: none;
}
.ei-date-field input:focus { border-color: var(--primary-color); }
.ei-date-field input:disabled { opacity: 0.6; cursor: not-allowed; }

.ei-date-clear {
  padding: 8px 12px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.ei-date-clear:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.ei-date-clear:disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== DROP ZONE ===== */
.ei-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 32px 20px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-table-stripe);
  cursor: pointer;
  transition: all var(--transition);
  min-height: 180px;
  position: relative;
  text-align: center;
}
.ei-drop:hover { border-color: var(--primary-color); background: rgba(52, 152, 219, 0.04); }
.ei-drop.drag-over {
  border-color: var(--primary-color);
  background: rgba(52, 152, 219, 0.1);
  transform: scale(1.01);
}
.ei-drop.has-file {
  flex-direction: row;
  justify-content: flex-start;
  text-align: left;
  padding: 20px;
  min-height: auto;
  border-style: solid;
  border-color: #27ae60;
  background: rgba(39, 174, 96, 0.05);
}

.ei-file-input { display: none; }

.ei-drop-icon { font-size: 2.5rem; color: var(--primary-color); margin-bottom: 4px; }
.ei-drop-title { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; }
.ei-drop-sub { font-size: 0.82rem; color: var(--text-muted); }
.ei-drop-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; opacity: 0.7; }

.ei-file-icon { font-size: 2rem; color: #27ae60; flex-shrink: 0; }
.ei-file-info { flex: 1; min-width: 0; }
.ei-file-name { font-weight: 700; color: var(--text-primary); font-size: 0.9rem; word-break: break-all; }
.ei-file-size { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.ei-file-remove {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.ei-file-remove:hover { background: #e74c3c; color: #fff; }

/* ===== PREVIEW ===== */
.ei-preview {
  margin-top: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-card);
}
.ei-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-table-stripe);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
}
.ei-preview-clear {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--text-muted);
  font-family: inherit;
}
.ei-preview-clear:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); }

.ei-preview-table {
  overflow-x: auto;
  max-height: 320px;
}
.ei-preview-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.ei-preview-table th {
  padding: 10px 12px;
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
  font-weight: 700;
  background: var(--bg-table-stripe);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}
.ei-preview-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
}
.ei-preview-table .mono { font-family: monospace; font-size: 0.78rem; }
.ei-preview-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.row-invalid { background: rgba(231, 76, 60, 0.06); }
.row-error {
  display: block;
  font-size: 0.7rem;
  color: var(--danger);
  margin-top: 2px;
}

.ei-btn-import {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #27ae60, #1e8449);
  color: #fff;
  border: none;
  border-radius: 0;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}
.ei-btn-import:hover:not(:disabled) { filter: brightness(1.08); }
.ei-btn-import:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== PROGRESO ===== */
.ei-progress {
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.ei-progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.ei-progress-bar {
  height: 6px;
  background: var(--border-light);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.ei-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #10b981);
  transition: width 0.3s ease;
}

/* ===== RESULTADO ===== */
.ei-resultado {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
  padding: 14px 18px;
  border-radius: var(--radius-md);
  border: 1px solid;
  position: relative;
}
.ei-resultado.ok {
  background: rgba(39, 174, 96, 0.08);
  border-color: rgba(39, 174, 96, 0.3);
  color: #1e8449;
}
.ei-resultado.warn {
  background: rgba(243, 156, 18, 0.08);
  border-color: rgba(243, 156, 18, 0.3);
  color: #b9770e;
}
.ei-resultado > i { font-size: 1.3rem; flex-shrink: 0; }
.ei-resultado strong { display: block; margin-bottom: 2px; }
.ei-resultado-close {
  position: absolute;
  top: 8px; right: 8px;
  width: 26px; height: 26px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.6;
}
.ei-resultado-close:hover { opacity: 1; }

.ei-errores {
  margin-top: 12px;
  padding: 14px 18px;
  background: rgba(231, 76, 60, 0.06);
  border: 1px solid rgba(231, 76, 60, 0.2);
  border-radius: var(--radius-md);
  max-height: 260px;
  overflow-y: auto;
}
.ei-errores-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--danger);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.ei-errores ul {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.8rem;
}
.ei-errores li {
  padding: 4px 0;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
}
.ei-errores li:last-child { border-bottom: none; }
.ei-errores strong { color: var(--text-primary); }

.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

@media (max-width: 640px) {
  .ei-grid { grid-template-columns: 1fr; }
  .ei-date-range { flex-direction: column; align-items: stretch; }
}
</style>