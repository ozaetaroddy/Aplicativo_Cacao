<template>
  <div class="retencion-form">
    <!-- HEADER -->
    <div class="form-header">
      <div class="header-left">
        <button
          type="button"
          class="btn-back"
          @click="volver"
          :disabled="cargando"
          aria-label="Volver a retenciones"
        >
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon title-icon-purple">
              <i class="fas fa-percent"></i>
            </span>
            Nueva Retención
          </h1>
          <p class="form-subtitle">
            Registra un comprobante de retención aplicado a un proveedor
          </p>
        </div>
      </div>
      <div class="header-actions">
        <div class="header-status" :class="{ complete: formularioValido }">
          <i :class="formularioValido ? 'fas fa-check-circle' : 'fas fa-circle'"></i>
          <span>{{ formularioValido ? 'Listo para guardar' : 'Complete los campos' }}</span>
        </div>
      </div>
    </div>

    <!-- LOADING INICIAL -->
    <div v-if="cargandoInicial" class="loading-state">
      <div class="spinner-lg"></div>
      <p>Cargando datos...</p>
    </div>

    <form v-else @submit.prevent="guardar" novalidate>
      <div class="form-single">
        <!-- SECCIÓN 1: Proveedor -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">1</div>
            <div class="section-header-content">
              <h2 class="section-title">Proveedor</h2>
              <p class="section-desc">Sujeto retenido</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-field form-field-full">
              <label class="form-label" for="ret-proveedor">
                <span class="required">*</span> Proveedor
              </label>
              <div class="search-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input
                  id="ret-proveedor"
                  type="text"
                  class="form-input"
                  :placeholder="proveedorActual ? proveedorActual.nombre : 'Buscar proveedor por nombre o RUC...'"
                  v-model="busquedaProveedor"
                  :disabled="cargando || Boolean(proveedorActual)"
                  readonly
                  @click="abrirLista"
                />
                <button
                  v-if="proveedorActual"
                  type="button"
                  class="search-clear"
                  @click="limpiarProveedor"
                  aria-label="Cambiar proveedor"
                >
                  <i class="fas fa-times"></i>
                </button>
              </div>

              <transition name="dropdown">
                <div
                  v-if="mostrarLista && proveedoresFiltrados.length > 0"
                  class="search-dropdown"
                >
                  <div
                    v-for="p in proveedoresFiltrados.slice(0, 10)"
                    :key="p._id"
                    class="dropdown-row"
                    @mousedown.prevent="seleccionarProveedor(p)"
                  >
                    <div class="row-avatar">{{ inicial(p.nombre) }}</div>
                    <div class="row-content">
                      <div class="row-title">{{ p.nombre }}</div>
                      <div class="row-meta">
                        <code>{{ p.ruc }}</code>
                        <span v-if="p.telefono">
                          <i class="fas fa-phone"></i> {{ p.telefono }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>

              <transition name="fade">
                <div v-if="proveedorActual" class="proveedor-banner">
                  <div class="banner-avatar">{{ inicial(proveedorActual.nombre) }}</div>
                  <div class="banner-body">
                    <div class="banner-name">{{ proveedorActual.nombre }}</div>
                    <div class="banner-meta">
                      <span><strong>RUC:</strong> {{ proveedorActual.ruc }}</span>
                      <span v-if="proveedorActual.email">
                        <strong>Email:</strong> {{ proveedorActual.email }}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="banner-change"
                    @click="limpiarProveedor"
                    aria-label="Cambiar proveedor"
                  >
                    <i class="fas fa-exchange-alt"></i>
                  </button>
                </div>
              </transition>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 2: Documento -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">2</div>
            <div class="section-header-content">
              <h2 class="section-title">Documento sustento</h2>
              <p class="section-desc">Factura que origina la retención</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label" for="ret-factura">N° Factura</label>
                <input
                  id="ret-factura"
                  type="text"
                  class="form-input"
                  v-model="retencion.numero_factura"
                  maxlength="50"
                  placeholder="001-001-000000123"
                  :disabled="cargando"
                />
                <small class="form-hint">Opcional. Nº del documento sustento.</small>
              </div>
              <div class="form-field">
                <label class="form-label" for="ret-fecha">
                  <span class="required">*</span> Fecha de emisión
                </label>
                <input
                  id="ret-fecha"
                  type="date"
                  class="form-input"
                  :class="{ 'is-invalid': mostrarError('fecha_emision') }"
                  v-model="retencion.fecha_emision"
                  :disabled="cargando"
                  @blur="touched.fecha_emision = true"
                />
                <div v-if="mostrarError('fecha_emision')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.fecha_emision }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 3: Retención -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">3</div>
            <div class="section-header-content">
              <h2 class="section-title">Detalle de la retención</h2>
              <p class="section-desc">Tipo, base y valor retenido según catálogo SRI</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row">
              <div class="form-field form-field-full">
                <label class="form-label" for="ret-tipo">
                  <span class="required">*</span> Tipo de retención
                </label>
                <select
                  id="ret-tipo"
                  class="form-input"
                  :class="{ 'is-invalid': mostrarError('tipo_retencion') }"
                  v-model="tipoRetencionSeleccionado"
                  :disabled="cargando || cargandoCatalogos"
                  @change="onTipoRetencionChange"
                  @blur="touched.tipo_retencion = true"
                >
                  <option value="">— Seleccione tipo del catálogo SRI —</option>
                  <optgroup label="Impuesto a la Renta">
                    <option
                      v-for="t in tiposRenta"
                      :key="`RENTA:${t.codigo}`"
                      :value="`RENTA:${t.codigo}`"
                    >
                      {{ t.codigo }} — {{ t.nombre }} ({{ t.porcentaje }}%)
                    </option>
                  </optgroup>
                  <optgroup label="IVA">
                    <option
                      v-for="t in tiposIva"
                      :key="`IVA:${t.codigo}`"
                      :value="`IVA:${t.codigo}`"
                    >
                      {{ t.codigo }} — {{ t.nombre }} ({{ t.porcentaje }}%)
                    </option>
                  </optgroup>
                </select>
                <div v-if="mostrarError('tipo_retencion')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.tipo_retencion }}
                </div>
                <div v-else-if="catalogoSeleccionado" class="field-info">
                  <i class="fas fa-info-circle"></i>
                  {{ catalogoSeleccionado.nombre }} — Impuesto:
                  <strong>{{ catalogoSeleccionado.impuesto }}</strong>
                </div>
              </div>
            </div>

            <div class="form-row cols-3">
              <div class="form-field">
                <label class="form-label" for="ret-base">Base imponible ($)</label>
                <div class="price-input-lg">
                  <span>$</span>
                  <input
                    id="ret-base"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-input"
                    v-model.number="retencion.base_imponible"
                    placeholder="0.00"
                    :disabled="cargando"
                  />
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="ret-porcentaje">
                  <span class="required">*</span> Porcentaje (%)
                </label>
                <input
                  id="ret-porcentaje"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  class="form-input"
                  :class="{ 'is-invalid': mostrarError('porcentaje') }"
                  v-model.number="retencion.porcentaje"
                  :disabled="cargando"
                  @input="onPorcentajeInput"
                  @blur="touched.porcentaje = true"
                />
                <div v-if="mostrarError('porcentaje')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.porcentaje }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="ret-valor">
                  <span class="required">*</span> Valor retenido ($)
                </label>
                <div class="price-input-lg">
                  <span>$</span>
                  <input
                    id="ret-valor"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-input"
                    :class="{ 'is-invalid': mostrarError('valor_retenido') }"
                    v-model.number="retencion.valor_retenido"
                    placeholder="0.00"
                    :disabled="cargando"
                    @input="onValorInput"
                    @blur="touched.valor_retenido = true"
                  />
                </div>
                <div v-if="mostrarError('valor_retenido')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.valor_retenido }}
                </div>
              </div>
            </div>

            <!-- Preview del cálculo -->
            <transition name="fade">
              <div
                v-if="calculoPreview"
                class="calculo-preview"
                :class="calculoPreview.consistente ? 'preview-ok' : 'preview-warn'"
              >
                <div class="preview-icon">
                  <i
                    :class="
                      calculoPreview.consistente
                        ? 'fas fa-check-circle'
                        : 'fas fa-exclamation-triangle'
                    "
                  ></i>
                </div>
                <div class="preview-body">
                  <div class="preview-title">{{ calculoPreview.titulo }}</div>
                  <div class="preview-detail">{{ calculoPreview.detalle }}</div>
                </div>
              </div>
            </transition>

            <!-- Advertencia del catálogo -->
            <transition name="fade">
              <div v-if="advertenciaCatalogo" class="advertencia-box">
                <i class="fas fa-exclamation-triangle"></i>
                <span>{{ advertenciaCatalogo }}</span>
              </div>
            </transition>
          </div>
        </section>

        <!-- SECCIÓN 4: Observaciones -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number">4</div>
            <div class="section-header-content">
              <h2 class="section-title">Observaciones</h2>
              <p class="section-desc">Notas adicionales (opcional)</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-field form-field-full">
              <label class="form-label" for="ret-obs">Observaciones</label>
              <textarea
                id="ret-obs"
                class="form-input"
                v-model="retencion.observaciones"
                rows="3"
                maxlength="1000"
                placeholder="Notas internas, referencias, etc."
                :disabled="cargando"
              ></textarea>
              <small class="form-hint">
                {{ (retencion.observaciones || '').length }} / 1000 caracteres
              </small>
            </div>
          </div>
        </section>

        <!-- ERROR -->
        <transition name="fade">
          <div v-if="errorGeneral" class="error-banner">
            <i class="fas fa-exclamation-circle"></i>
            <span>{{ errorGeneral }}</span>
          </div>
        </transition>

        <!-- ACCIONES -->
        <div class="form-actions-footer">
          <button
            type="button"
            class="btn-cancel"
            @click="volver"
            :disabled="cargando"
          >
            <i class="fas fa-times"></i>
            <span>Cancelar</span>
          </button>
          <button
            type="submit"
            class="btn-save"
            :disabled="cargando || !formularioValido"
          >
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>{{ cargando ? 'Guardando...' : 'Guardar retención' }}</span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { useCatalogosSRI } from '../../composables/useCatalogosSRI'
import { roundTo2 } from '../../utils/formatters'

const toast = useToast()
const router = useRouter()
const { catalogos, cargarCatalogos } = useCatalogosSRI()

// ===== STATE =====
const proveedores = ref([])
const cargandoInicial = ref(true)
const cargando = ref(false)
const cargandoCatalogos = ref(false)
const errorGeneral = ref('')

const busquedaProveedor = ref('')
const mostrarLista = ref(false)
const proveedorSeleccionadoId = ref('')

const tipoRetencionSeleccionado = ref('')
const advertenciaCatalogo = ref('')

const retencion = ref({
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  base_imponible: 0,
  porcentaje: 0,
  valor_retenido: 0,
  observaciones: ''
})

const errores = ref({
  proveedorId: '',
  fecha_emision: '',
  tipo_retencion: '',
  porcentaje: '',
  valor_retenido: ''
})

const touched = reactive({
  proveedorId: false,
  fecha_emision: false,
  tipo_retencion: false,
  porcentaje: false,
  valor_retenido: false
})

let unmounted = false

// ===== COMPUTED =====
const proveedorActual = computed(() =>
  proveedores.value.find(p => p._id === proveedorSeleccionadoId.value) || null
)

const proveedoresFiltrados = computed(() => {
  const q = String(busquedaProveedor.value || '').trim().toLowerCase()
  const list = proveedores.value
  if (!q) return list.slice(0, 20)
  return list.filter(p => {
    const n = String(p.nombre || '').toLowerCase()
    const r = String(p.ruc || '').toLowerCase()
    return n.includes(q) || r.includes(q)
  }).slice(0, 20)
})

// Del catálogo SRI
const tiposRenta = computed(() => {
  const arr = catalogos.value?.TIPO_RETENCION || []
  return arr.filter(t => t.impuesto === 'RENTA')
})

const tiposIva = computed(() => {
  const arr = catalogos.value?.TIPO_RETENCION || []
  return arr.filter(t => t.impuesto === 'IVA')
})

// Parse del valor "RENTA:725" → { impuesto, codigo, catalogo }
const parseTipoRetencion = (val) => {
  if (!val || typeof val !== 'string') return null
  const [impuesto, codigo] = val.split(':')
  if (!impuesto || !codigo) return null
  const arr = catalogos.value?.TIPO_RETENCION || []
  const cat = arr.find(t => t.impuesto === impuesto && t.codigo === codigo)
  if (!cat) return null
  return { impuesto, codigo, cat }
}

const catalogoSeleccionado = computed(() => {
  const parsed = parseTipoRetencion(tipoRetencionSeleccionado.value)
  return parsed?.cat || null
})

const calculoPreview = computed(() => {
  const base = Number(retencion.value.base_imponible) || 0
  const pct = Number(retencion.value.porcentaje) || 0
  const valor = Number(retencion.value.valor_retenido) || 0

  if (base <= 0 || pct <= 0 || valor <= 0) return null

  const esperado = roundTo2(base * (pct / 100))
  const diff = Math.abs(esperado - valor)
  const consistente = diff < 0.01

  if (consistente) {
    return {
      consistente: true,
      titulo: 'Cálculo consistente',
      detalle: `Base $${base.toFixed(2)} × ${pct}% = $${esperado.toFixed(2)}`
    }
  }
  return {
    consistente: false,
    titulo: 'El valor no coincide con el cálculo',
    detalle: `Esperado: $${esperado.toFixed(2)} (base × %). Enviado: $${valor.toFixed(2)}. Diferencia: $${diff.toFixed(2)}`
  }
})

const formularioValido = computed(() => {
  return (
    Boolean(proveedorSeleccionadoId.value) &&
    Boolean(tipoRetencionSeleccionado.value) &&
    Boolean(retencion.value.fecha_emision) &&
    Number(retencion.value.porcentaje) > 0 &&
    Number(retencion.value.valor_retenido) > 0 &&
    !errores.value.proveedorId &&
    !errores.value.fecha_emision &&
    !errores.value.tipo_retencion &&
    !errores.value.porcentaje &&
    !errores.value.valor_retenido
  )
})

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

const mostrarError = (campo) => Boolean(touched[campo] && errores.value[campo])

// ===== LISTA PROVEEDORES =====
const abrirLista = () => {
  if (proveedorActual.value) return
  mostrarLista.value = true
}

const cerrarLista = () => {
  setTimeout(() => { mostrarLista.value = false }, 200)
}

const seleccionarProveedor = (p) => {
  proveedorSeleccionadoId.value = p._id
  busquedaProveedor.value = ''
  mostrarLista.value = false
  errores.value.proveedorId = ''
}

const limpiarProveedor = () => {
  proveedorSeleccionadoId.value = ''
  busquedaProveedor.value = ''
}

// ===== CAMBIOS EN RETENCIÓN =====
const onTipoRetencionChange = () => {
  const parsed = parseTipoRetencion(tipoRetencionSeleccionado.value)
  if (!parsed) {
    advertenciaCatalogo.value = ''
    return
  }
  // Auto-completar porcentaje desde el catálogo
  retencion.value.porcentaje = parsed.cat.porcentaje
  // Recalcular valor si hay base
  if (retencion.value.base_imponible > 0) {
    retencion.value.valor_retenido = roundTo2(
      retencion.value.base_imponible * (parsed.cat.porcentaje / 100)
    )
  }
  advertenciaCatalogo.value = ''
}

const onPorcentajeInput = () => {
  // Si hay base, recalcular valor automáticamente
  const base = Number(retencion.value.base_imponible) || 0
  const pct = Number(retencion.value.porcentaje) || 0
  if (base > 0 && pct > 0) {
    retencion.value.valor_retenido = roundTo2(base * (pct / 100))
  }
  // Validar que el % coincida con el catálogo
  const cat = catalogoSeleccionado.value
  if (cat && Math.abs(cat.porcentaje - pct) > 0.01) {
    advertenciaCatalogo.value =
      `El porcentaje ingresado (${pct}%) difiere del catálogo SRI (${cat.porcentaje}%)`
  } else {
    advertenciaCatalogo.value = ''
  }
}

const onValorInput = () => {
  advertenciaCatalogo.value = ''
}

// ===== VALIDACIONES =====
const validarProveedor = () => {
  if (!proveedorSeleccionadoId.value) {
    errores.value.proveedorId = 'Selecciona un proveedor'
    return false
  }
  errores.value.proveedorId = ''
  return true
}

const validarFecha = () => {
  if (!retencion.value.fecha_emision) {
    errores.value.fecha_emision = 'Fecha obligatoria'
    return false
  }
  const fecha = new Date(retencion.value.fecha_emision)
  if (Number.isNaN(fecha.getTime())) {
    errores.value.fecha_emision = 'Fecha inválida'
    return false
  }
  const limite = new Date()
  limite.setHours(23, 59, 59, 999)
  limite.setDate(limite.getDate() + 1)
  if (fecha > limite) {
    errores.value.fecha_emision = 'No puede ser futura'
    return false
  }
  errores.value.fecha_emision = ''
  return true
}

const validarTipoRetencion = () => {
  if (!tipoRetencionSeleccionado.value) {
    errores.value.tipo_retencion = 'Selecciona un tipo del catálogo'
    return false
  }
  const parsed = parseTipoRetencion(tipoRetencionSeleccionado.value)
  if (!parsed) {
    errores.value.tipo_retencion = 'Tipo inválido'
    return false
  }
  errores.value.tipo_retencion = ''
  return true
}

const validarPorcentaje = () => {
  const pct = Number(retencion.value.porcentaje)
  if (!Number.isFinite(pct) || pct <= 0) {
    errores.value.porcentaje = 'Debe ser mayor a 0'
    return false
  }
  if (pct > 100) {
    errores.value.porcentaje = 'Máximo 100%'
    return false
  }
  errores.value.porcentaje = ''
  return true
}

const validarValor = () => {
  const v = Number(retencion.value.valor_retenido)
  if (!Number.isFinite(v) || v <= 0) {
    errores.value.valor_retenido = 'Debe ser mayor a 0'
    return false
  }
  errores.value.valor_retenido = ''
  return true
}

// ===== CARGA INICIAL =====
const cargarDatos = async () => {
  cargandoInicial.value = true
  try {
    // Cargar catálogos y proveedores en paralelo
    const [, proveedoresRes] = await Promise.allSettled([
      (async () => {
        cargandoCatalogos.value = true
        try {
          await cargarCatalogos()
        } finally {
          cargandoCatalogos.value = false
        }
      })(),
      api.request('/proveedores?limit=2000&sortBy=nombre&sortDir=asc', {
        method: 'GET',
        skipLoader: true
      })
    ])

    if (unmounted) return

    if (proveedoresRes.status === 'fulfilled') {
      const data = proveedoresRes.value
      proveedores.value = Array.isArray(data) ? data : (data?.data || [])
    } else {
      toast.error('Error al cargar proveedores')
    }
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar datos: ' + e.message)
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
}

// ===== NAVEGACIÓN =====
const volver = () => {
  if (cargando.value) return
  router.push('/retenciones')
}

// ===== GUARDAR =====
const guardar = async () => {
  // Marcar todo como tocado para mostrar errores
  touched.proveedorId = true
  touched.fecha_emision = true
  touched.tipo_retencion = true
  touched.porcentaje = true
  touched.valor_retenido = true

  const ok1 = validarProveedor()
  const ok2 = validarFecha()
  const ok3 = validarTipoRetencion()
  const ok4 = validarPorcentaje()
  const ok5 = validarValor()

  if (!ok1 || !ok2 || !ok3 || !ok4 || !ok5) {
    errorGeneral.value = 'Corrige los errores marcados antes de guardar'
    toast.warning('Verifica los datos del formulario')
    return
  }
  if (cargando.value) return

  errorGeneral.value = ''
  cargando.value = true

  try {
    const parsed = parseTipoRetencion(tipoRetencionSeleccionado.value)

    const payload = {
      proveedorId: proveedorSeleccionadoId.value,
      numero_factura: String(retencion.value.numero_factura || '').trim(),
      fecha_emision: retencion.value.fecha_emision,
      base_imponible: roundTo2(retencion.value.base_imponible || 0),
      porcentaje: roundTo2(retencion.value.porcentaje),
      valor_retenido: roundTo2(retencion.value.valor_retenido),
      tipo: 'manual',
      tipo_retencion: parsed?.codigo || '',
      impuesto_retencion: parsed?.impuesto || '',
      observaciones: String(retencion.value.observaciones || '').trim()
    }

    const res = await api.request('/retenciones', {
      method: 'POST',
      body: JSON.stringify(payload),
      loaderMessage: 'Guardando retención...'
    })
    if (unmounted) return

    toast.success('Retención guardada correctamente')

    // Aviso del backend si el % difiere del catálogo
    if (res?._advertencia) {
      toast.warning(res._advertencia, { timeout: 8000 })
    }

    router.push('/retenciones')
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'RETENCION_DUPLICADA') {
      errorGeneral.value =
        'Ya existe una retención activa para esta compra con el mismo tipo'
      toast.error('Retención duplicada')
    } else if (codigo === 'RETENCION_CATALOGO_INVALIDO') {
      errores.value.tipo_retencion = e.message || 'Código de retención inválido'
      errorGeneral.value = e.message
      toast.error('Tipo de retención inválido')
    } else if (codigo === 'PROVEEDOR_NOT_FOUND') {
      errorGeneral.value = 'El proveedor no existe'
      toast.error('El proveedor no existe')
    } else if (codigo === 'COMPRA_NO_EXISTE') {
      errorGeneral.value = 'La compra referenciada no existe'
      toast.error('Compra no encontrada')
    } else if (codigo === 'PROVEEDOR_NO_COINCIDE') {
      errorGeneral.value = 'El proveedor no coincide con el de la compra'
      toast.error('Proveedor no coincide')
    } else if (codigo === 'VALIDACION') {
      errorGeneral.value = e.message || 'Datos inválidos'
      toast.error(e.message || 'Datos inválidos')
    } else {
      errorGeneral.value = 'Error al guardar: ' + e.message
      toast.error('Error: ' + e.message)
    }
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(cargarDatos)

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.retencion-form { max-width: 900px; margin: 0 auto; padding: 0 0 40px; }

/* HEADER */
.form-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.btn-back { width: 44px; height: 44px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; transition: all var(--transition); flex-shrink: 0; }
.btn-back:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; transform: translateX(-3px); }
.btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

.form-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em; display: flex; align-items: center; gap: 12px; margin: 0 0 4px; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-purple { background: linear-gradient(135deg, #8e44ad, #6c3483); box-shadow: 0 6px 16px rgba(142,68,173,0.3); }
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.header-status { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: var(--radius-full); background: var(--bg-table-stripe); color: var(--text-muted); font-size: 0.78rem; font-weight: 600; transition: all var(--transition); }
.header-status i { font-size: 0.65rem; }
.header-status.complete { background: var(--success-bg); color: var(--success); }

/* LOADING */
.loading-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; margin: 0 auto 14px; border: 4px solid var(--border-color); border-top-color: #8e44ad; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* FORM */
.form-single { display: flex; flex-direction: column; gap: 20px; }

.form-section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.section-header { display: flex; align-items: center; gap: 14px; padding: 20px 24px; background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card)); border-bottom: 1px solid var(--border-light); }
.section-number { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(142,68,173,0.25); }
.section-header-content { flex: 1; }
.section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.section-body { padding: 24px; }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-row.cols-3 { grid-template-columns: repeat(3, 1fr); }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-field-full { width: 100%; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-hint { font-size: 0.72rem; color: var(--text-muted); }

.form-input { width: 100%; padding: 12px 16px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: var(--bg-input); color: var(--text-primary); font-size: 0.9rem; font-family: inherit; transition: all var(--transition-fast); outline: none; }
.form-input:focus { border-color: #8e44ad; box-shadow: 0 0 0 4px rgba(142,68,173,0.15); background: var(--bg-card); }
.form-input.is-invalid { border-color: var(--danger); }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }
.form-input[readonly] { cursor: pointer; }

.price-input-lg { position: relative; }
.price-input-lg span { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 700; font-size: 1rem; }
.price-input-lg .form-input { padding-left: 32px; font-weight: 700; }

.field-error, .field-info { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 500; margin-top: 2px; }
.field-error { color: var(--danger); }
.field-info { color: #8e44ad; }
.field-info i { color: #8e44ad; }

/* SEARCH */
.search-wrapper { position: relative; }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem; pointer-events: none; }
.search-wrapper .form-input { padding-left: 40px; padding-right: 40px; }
.search-clear { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.search-clear:hover { color: var(--danger); background: var(--bg-table-stripe); }

.search-dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 100; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: 0 20px 40px rgba(0,0,0,0.15); max-height: 400px; overflow-y: auto; padding: 6px; }
.dropdown-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-md); cursor: pointer; transition: background var(--transition-fast); }
.dropdown-row:hover { background: var(--bg-table-stripe); }
.row-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82rem; flex-shrink: 0; }
.row-content { flex: 1; min-width: 0; }
.row-title { font-weight: 600; color: var(--text-primary); font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-meta { display: flex; gap: 10px; font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; flex-wrap: wrap; }
.row-meta code { background: var(--bg-table-stripe); padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono, monospace); }

/* PROVEEDOR BANNER */
.proveedor-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; margin-top: 12px; background: linear-gradient(135deg, rgba(142,68,173,0.06), rgba(142,68,173,0.02)); border: 1px solid rgba(142,68,173,0.25); border-left: 4px solid #8e44ad; border-radius: var(--radius-md); }
.banner-avatar { width: 46px; height: 46px; border-radius: 12px; background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.05rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(142,68,173,0.3); }
.banner-body { flex: 1; min-width: 0; }
.banner-name { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 4px; }
.banner-meta { display: flex; gap: 16px; font-size: 0.78rem; color: var(--text-secondary); flex-wrap: wrap; }
.banner-meta strong { color: var(--text-muted); font-weight: 600; margin-right: 4px; }
.banner-change { width: 34px; height: 34px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); cursor: pointer; transition: all var(--transition-fast); flex-shrink: 0; }
.banner-change:hover { border-color: #8e44ad; color: #8e44ad; background: rgba(142,68,173,0.08); }

/* CALCULO PREVIEW */
.calculo-preview { display: flex; gap: 12px; padding: 12px 16px; border-radius: var(--radius-md); border-left: 4px solid; margin-top: 12px; }
.preview-ok { background: rgba(39,174,96,0.06); border-color: #27ae60; }
.preview-warn { background: rgba(243,156,18,0.06); border-color: #f39c12; }
.preview-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.preview-ok .preview-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.preview-warn .preview-icon { background: rgba(243,156,18,0.15); color: #f39c12; }
.preview-body { flex: 1; min-width: 0; }
.preview-title { font-weight: 700; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 2px; }
.preview-detail { font-size: 0.78rem; color: var(--text-secondary); }

.advertencia-box { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; margin-top: 10px; background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.3); border-radius: var(--radius-md); color: #d68910; font-size: 0.8rem; }
.advertencia-box i { margin-top: 2px; flex-shrink: 0; }

/* ERROR */
.error-banner { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--danger-bg); border: 1px solid rgba(231,76,60,0.3); border-left: 4px solid var(--danger); border-radius: var(--radius-md); color: var(--danger); font-weight: 500; font-size: 0.88rem; }

/* ACTIONS */
.form-actions-footer { display: flex; gap: 12px; justify-content: flex-end; padding: 20px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); }
.btn-save { display: inline-flex; align-items: center; gap: 10px; padding: 12px 28px; background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; border: none; border-radius: var(--radius-md); font-weight: 700; font-size: 0.92rem; cursor: pointer; transition: all var(--transition); box-shadow: 0 4px 12px rgba(142,68,173,0.3); font-family: inherit; }
.btn-save:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(142,68,173,0.4); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-cancel { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all var(--transition); font-family: inherit; }
.btn-cancel:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }
.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

/* TRANSITIONS */
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .form-row.cols-2, .form-row.cols-3 { grid-template-columns: 1fr; }
}
@media (max-width: 576px) {
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
  .form-actions-footer { flex-direction: column-reverse; }
  .btn-save, .btn-cancel { width: 100%; justify-content: center; }
}
</style>