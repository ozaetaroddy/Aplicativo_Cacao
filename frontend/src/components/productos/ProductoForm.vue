<template>
  <div class="entity-form entity-form-wide">
    <!-- HEADER -->
    <div class="form-header">
      <div class="header-left">
        <button
          type="button"
          class="btn-back"
          @click="volver"
          :disabled="cargando"
          aria-label="Volver a productos"
        >
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon" :class="id ? 'title-icon-edit' : 'title-icon-amber'">
              <i :class="id ? 'fas fa-box-open' : 'fas fa-box'"></i>
            </span>
            {{ id ? 'Editar Producto' : 'Nuevo Producto' }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Modifica los datos del producto' : 'Registra un nuevo producto en el catálogo' }}
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
      <p>Cargando producto...</p>
    </div>

    <form v-else @submit.prevent="guardar" novalidate>
      <div class="form-single">
        <!-- SECCIÓN 1: Identificación -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">1</div>
            <div class="section-header-content">
              <h2 class="section-title">Identificación</h2>
              <p class="section-desc">Código y nombre del producto</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-1-3">
              <div class="form-field">
                <label class="form-label">Código</label>
                <div class="input-with-icon">
                  <i class="fas fa-barcode input-icon"></i>
                  <input
                    type="text"
                    class="form-control readonly"
                    v-model="form.codigo"
                    readonly
                    aria-label="Código generado automáticamente"
                  />
                </div>
                <small class="form-hint">Generado automáticamente</small>
              </div>
              <div class="form-field">
                <label class="form-label" for="prod-nombre">
                  <span class="required">*</span> Nombre
                </label>
                <input
                  id="prod-nombre"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': mostrarError('nombre') }"
                  v-model="form.nombre"
                  maxlength="200"
                  placeholder="Ej: Aceite 15W40 1Gal"
                  :disabled="cargando"
                  @input="onNombreInput"
                  @blur="touched.nombre = true"
                />
                <div v-if="mostrarError('nombre')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.nombre }}
                </div>
                <small v-else class="form-hint">
                  {{ form.nombre.length }} / 200 caracteres
                </small>
              </div>
            </div>

            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label">Categoría</label>
                <div class="input-with-button">
                  <select
                    class="form-select"
                    v-model="form.categoriaId"
                    :disabled="cargando"
                  >
                    <option value="">Sin categoría</option>
                    <option v-for="cat in categorias" :key="cat._id" :value="cat._id">
                      {{ cat.nombre }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn-icon-outline"
                    @click="abrirModalCategoria"
                    :disabled="cargando"
                    title="Nueva categoría"
                    aria-label="Nueva categoría"
                  >
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="prod-barcode">Código de barras</label>
                <div class="input-with-icon">
                  <i class="fas fa-barcode input-icon"></i>
                  <input
                    id="prod-barcode"
                    type="text"
                    class="form-control"
                    v-model="form.codigo_barras"
                    maxlength="100"
                    placeholder="Opcional"
                    :disabled="cargando"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 2: Precios y stock -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">2</div>
            <div class="section-header-content">
              <h2 class="section-title">Precios y Stock</h2>
              <p class="section-desc">Precios de compra, venta y control de inventario</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-3">
              <div class="form-field">
                <label class="form-label" for="prod-pc">Precio compra</label>
                <div class="price-input-lg">
                  <span>$</span>
                  <input
                    id="prod-pc"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('precio_compra') }"
                    v-model.number="form.precio_compra"
                    placeholder="0.00"
                    :disabled="cargando"
                    @input="onPrecioCompraInput"
                    @blur="touched.precio_compra = true"
                  />
                </div>
                <div v-if="mostrarError('precio_compra')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.precio_compra }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="prod-pv">Precio venta</label>
                <div class="price-input-lg">
                  <span>$</span>
                  <input
                    id="prod-pv"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('precio_venta') }"
                    v-model.number="form.precio_venta"
                    placeholder="0.00"
                    :disabled="cargando"
                    @input="onPrecioVentaInput"
                    @blur="touched.precio_venta = true"
                  />
                </div>
                <div v-if="mostrarError('precio_venta')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.precio_venta }}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="prod-min">Stock mínimo</label>
                <div class="input-with-icon">
                  <i class="fas fa-cube input-icon"></i>
                  <input
                    id="prod-min"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control"
                    :class="{ 'is-invalid': mostrarError('stock_minimo') }"
                    v-model.number="form.stock_minimo"
                    placeholder="0"
                    :disabled="cargando"
                    @input="onStockMinimoInput"
                    @blur="touched.stock_minimo = true"
                  />
                </div>
                <div v-if="mostrarError('stock_minimo')" class="field-error">
                  <i class="fas fa-exclamation-circle"></i> {{ errores.stock_minimo }}
                </div>
              </div>
            </div>

            <!-- Preview del margen -->
            <transition name="fade">
              <div v-if="margenGanancia !== null" class="margin-info" :class="claseMargen">
                <i :class="iconoMargen"></i>
                <span>
                  Margen de ganancia:
                  <strong>{{ margenGanancia.toFixed(2) }}%</strong>
                  <span class="margin-detail">
                    (Utilidad: {{ formatCurrency(utilidadUnitaria) }})
                  </span>
                </span>
              </div>
            </transition>

            <!-- Stock actual (solo en edición) -->
            <div v-if="id && stockActual !== null" class="stock-info">
              <i class="fas fa-cubes"></i>
              <span>
                Stock actual en inventario:
                <strong>{{ formatCantidad(stockActual) }}</strong> unidades
              </span>
              <router-link
                to="/kardex"
                class="stock-link"
                title="Ver movimientos de kardex"
              >
                Ver kardex →
              </router-link>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 3: Medida e IVA -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">3</div>
            <div class="section-header-content">
              <h2 class="section-title">Medida e IVA</h2>
              <p class="section-desc">Unidades y configuración tributaria</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-3">
              <div class="form-field">
                <label class="form-label" for="prod-unidad">Unidad de medida</label>
                <select
                  id="prod-unidad"
                  class="form-select"
                  v-model="form.unidad_medida"
                  :disabled="cargando"
                >
                  <option value="unidad">Unidad</option>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="lb">Libra (lb)</option>
                  <option value="caja">Caja</option>
                  <option value="paquete">Paquete</option>
                  <option value="litro">Litro (L)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="metro">Metro (m)</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="prod-tipo-medida">Tipo de medida</label>
                <select
                  id="prod-tipo-medida"
                  class="form-select"
                  v-model="form.tipo_medida"
                  :disabled="cargando"
                >
                  <option value="unidad">Unidad (sin decimales)</option>
                  <option value="peso">Peso (con decimales)</option>
                  <option value="volumen">Volumen (con decimales)</option>
                  <option value="longitud">Longitud (con decimales)</option>
                  <option value="area">Área (con decimales)</option>
                  <option value="tiempo">Tiempo (con decimales)</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Aplica IVA</label>
                <label class="checkbox-switch-large" :class="{ active: form.aplica_iva }">
                  <input
                    type="checkbox"
                    v-model="form.aplica_iva"
                    :disabled="cargando"
                  />
                  <span>
                    <i :class="form.aplica_iva ? 'fas fa-check-circle' : 'fas fa-times-circle'"></i>
                    {{ form.aplica_iva ? 'Sí aplica IVA 15%' : 'No aplica IVA' }}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- SECCIÓN 4: Adicional -->
        <section class="form-section">
          <header class="section-header">
            <div class="section-number section-number-amber">4</div>
            <div class="section-header-content">
              <h2 class="section-title">Información adicional</h2>
              <p class="section-desc">Foto, descripción y notas</p>
            </div>
          </header>
          <div class="section-body">
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label" for="prod-foto">URL de la foto</label>
                <div class="input-with-icon">
                  <i class="fas fa-image input-icon"></i>
                  <input
                    id="prod-foto"
                    type="text"
                    class="form-control"
                    v-model="form.foto"
                    maxlength="500000"
                    placeholder="https://..."
                    :disabled="cargando"
                  />
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="prod-desc">Descripción</label>
                <input
                  id="prod-desc"
                  type="text"
                  class="form-control"
                  v-model="form.descripcion"
                  maxlength="1000"
                  placeholder="Descripción breve"
                  :disabled="cargando"
                />
              </div>
            </div>

            <!-- Preview de foto -->
            <transition name="fade">
              <div v-if="form.foto && !fotoError" class="photo-preview">
                <img
                  :src="form.foto"
                  alt="Vista previa del producto"
                  @error="fotoError = true"
                  @load="fotoError = false"
                />
              </div>
              <div v-else-if="form.foto && fotoError" class="photo-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>No se pudo cargar la imagen. Verifica la URL.</span>
              </div>
            </transition>

            <div class="form-row">
              <div class="form-field">
                <label class="form-label" for="prod-obs">Observaciones</label>
                <textarea
                  id="prod-obs"
                  class="form-control"
                  v-model="form.observaciones"
                  rows="3"
                  maxlength="1000"
                  placeholder="Notas internas..."
                  :disabled="cargando"
                ></textarea>
                <small class="form-hint">
                  {{ (form.observaciones || '').length }} / 1000 caracteres
                </small>
              </div>
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
            class="btn-save btn-save-amber"
            :disabled="cargando || !formularioValido"
          >
            <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
            <span>
              {{ cargando ? 'Guardando...' : (id ? 'Guardar cambios' : 'Crear producto') }}
            </span>
          </button>
        </div>
      </div>
    </form>

    <!-- MODAL NUEVA CATEGORÍA -->
    <div
      class="modal fade"
      id="modalCategoria"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header modal-header-cat">
            <h5 class="modal-title">
              <i class="fas fa-tag"></i>
              Nueva categoría
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cerrarModalCategoria"
              :disabled="cargandoCategoria"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <div class="form-field mb-3">
              <label class="form-label" for="cat-nombre">
                <span class="required">*</span> Nombre
              </label>
              <input
                id="cat-nombre"
                type="text"
                class="form-control"
                v-model="nuevaCategoria.nombre"
                maxlength="100"
                placeholder="Ej: Bebidas, Alimentos..."
                :disabled="cargandoCategoria"
                @keydown.enter.prevent="guardarCategoria"
              />
            </div>
            <div class="form-field">
              <label class="form-label" for="cat-desc">Descripción</label>
              <input
                id="cat-desc"
                type="text"
                class="form-control"
                v-model="nuevaCategoria.descripcion"
                maxlength="500"
                placeholder="Opcional"
                :disabled="cargandoCategoria"
                @keydown.enter.prevent="guardarCategoria"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click="cerrarModalCategoria"
              :disabled="cargandoCategoria"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="btn-save-modal"
              @click="guardarCategoria"
              :disabled="cargandoCategoria || !nuevaCategoria.nombre.trim()"
            >
              <i class="fas fa-save" :class="{ 'fa-spin': cargandoCategoria }"></i>
              {{ cargandoCategoria ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Modal } from 'bootstrap'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { formatCurrency } from '../../utils/formatters'

const toast = useToast()
const route = useRoute()
const router = useRouter()

// ===== STATE =====
const id = route.params.id || null
const categorias = ref([])
const cargandoInicial = ref(Boolean(id))
const cargando = ref(false)
const cargandoCategoria = ref(false)
const errorGeneral = ref('')
const fotoError = ref(false)

const form = ref({
  codigo: '',
  nombre: '',
  categoriaId: '',
  descripcion: '',
  precio_compra: 0,
  precio_venta: 0,
  stock_minimo: 0,
  unidad_medida: 'unidad',
  codigo_barras: '',
  foto: '',
  observaciones: '',
  aplica_iva: true,
  tipo_medida: 'unidad',
  stock: 0 // se preserva pero no se envía como cambio manual
})
const formOriginal = ref(null)
const stockActual = ref(null)

const errores = ref({
  nombre: '',
  precio_compra: '',
  precio_venta: '',
  stock_minimo: ''
})

const touched = reactive({
  nombre: false,
  precio_compra: false,
  precio_venta: false,
  stock_minimo: false
})

const nuevaCategoria = ref({ nombre: '', descripcion: '' })

// Modales
let modalCategoria = null
let unmounted = false

// Debounce
const debounceTimers = {}

// ===== COMPUTED =====
const margenGanancia = computed(() => {
  const pc = Number(form.value.precio_compra) || 0
  const pv = Number(form.value.precio_venta) || 0
  if (pc <= 0 || pv <= 0) return null
  return ((pv - pc) / pc) * 100
})

const utilidadUnitaria = computed(() => {
  const pc = Number(form.value.precio_compra) || 0
  const pv = Number(form.value.precio_venta) || 0
  return pv - pc
})

const claseMargen = computed(() => {
  const m = margenGanancia.value
  if (m === null) return 'margin-neutral'
  if (m < 0) return 'margin-danger'
  if (m < 10) return 'margin-warning'
  return 'margin-success'
})

const iconoMargen = computed(() => {
  const m = margenGanancia.value
  if (m === null) return 'fas fa-info-circle'
  if (m < 0) return 'fas fa-exclamation-triangle'
  return 'fas fa-chart-line'
})

const formularioValido = computed(() => {
  const nombre = String(form.value.nombre || '').trim()
  return (
    nombre.length >= 3 &&
    nombre.length <= 200 &&
    Number(form.value.precio_compra) >= 0 &&
    Number(form.value.precio_venta) >= 0 &&
    Number(form.value.stock_minimo) >= 0 &&
    !errores.value.nombre &&
    !errores.value.precio_compra &&
    !errores.value.precio_venta &&
    !errores.value.stock_minimo
  )
})

const hayCambios = computed(() => {
  if (!formOriginal.value) return false
  // Comparar solo campos editables (ignorar stock)
  const campos = ['nombre', 'categoriaId', 'descripcion', 'precio_compra',
                  'precio_venta', 'stock_minimo', 'unidad_medida',
                  'codigo_barras', 'foto', 'observaciones',
                  'aplica_iva', 'tipo_medida']
  return campos.some(k => form.value[k] !== formOriginal.value[k])
})

// ===== HELPERS =====
const mostrarError = (campo) => Boolean(touched[campo] && errores.value[campo])

const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const debounce = (key, fn, ms = 300) => {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key]
    fn()
  }, ms)
}

// ===== VALIDACIONES =====
const validarNombre = () => {
  const n = String(form.value.nombre || '').trim()
  if (!n) {
    errores.value.nombre = 'El nombre es obligatorio'
    return false
  }
  if (n.length < 3) {
    errores.value.nombre = 'Mínimo 3 caracteres'
    return false
  }
  if (n.length > 200) {
    errores.value.nombre = 'Máximo 200 caracteres'
    return false
  }
  errores.value.nombre = ''
  return true
}

const validarPrecioCompra = () => {
  const v = form.value.precio_compra
  if (v === '' || v === null || v === undefined) {
    errores.value.precio_compra = ''
    return true // opcional
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) {
    errores.value.precio_compra = 'Debe ser un número positivo'
    return false
  }
  if (n > 999999999) {
    errores.value.precio_compra = 'Valor demasiado alto'
    return false
  }
  errores.value.precio_compra = ''
  return true
}

const validarPrecioVenta = () => {
  const v = form.value.precio_venta
  if (v === '' || v === null || v === undefined) {
    errores.value.precio_venta = 'El precio de venta es obligatorio'
    return false
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) {
    errores.value.precio_venta = 'Debe ser un número positivo'
    return false
  }
  if (n > 999999999) {
    errores.value.precio_venta = 'Valor demasiado alto'
    return false
  }
  errores.value.precio_venta = ''
  return true
}

const validarStockMinimo = () => {
  const v = form.value.stock_minimo
  if (v === '' || v === null || v === undefined) {
    errores.value.stock_minimo = ''
    return true // opcional, default 0
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) {
    errores.value.stock_minimo = 'Debe ser >= 0'
    return false
  }
  errores.value.stock_minimo = ''
  return true
}

// ===== INPUT HANDLERS =====
const onNombreInput = () => debounce('nombre', validarNombre, 300)
const onPrecioCompraInput = () => debounce('precio_compra', validarPrecioCompra, 300)
const onPrecioVentaInput = () => debounce('precio_venta', validarPrecioVenta, 300)
const onStockMinimoInput = () => debounce('stock_minimo', validarStockMinimo, 300)

// ===== NAVEGACIÓN =====
const volver = () => {
  if (cargando.value) return
  if (hayCambios.value) {
    if (!window.confirm('Hay cambios sin guardar. ¿Salir de todas formas?')) return
  }
  router.push('/productos')
}

// ===== CÓDIGO =====
const generarCodigoProducto = () => {
  const ahora = new Date()
  const año = ahora.getFullYear().toString().slice(-2)
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  const aleatorio = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `PROD-${año}${mes}${dia}-${aleatorio}`
}

// ===== MODAL CATEGORÍA =====
const abrirModalCategoria = () => {
  nuevaCategoria.value = { nombre: '', descripcion: '' }
  if (!modalCategoria) {
    modalCategoria = new Modal(document.getElementById('modalCategoria'), {
      backdrop: 'static'
    })
  }
  modalCategoria.show()
  // Focus en el input después de mostrarse
  setTimeout(() => {
    document.getElementById('cat-nombre')?.focus()
  }, 200)
}

const cerrarModalCategoria = () => {
  if (cargandoCategoria.value) return
  modalCategoria?.hide()
}

const guardarCategoria = async () => {
  const nombre = String(nuevaCategoria.value.nombre || '').trim()
  if (!nombre) {
    toast.warning('El nombre es obligatorio')
    return
  }
  if (nombre.length < 2) {
    toast.warning('Mínimo 2 caracteres')
    return
  }
  if (cargandoCategoria.value) return

  cargandoCategoria.value = true
  try {
    const res = await api.request('/categorias', {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        descripcion: String(nuevaCategoria.value.descripcion || '').trim()
      }),
      loaderMessage: 'Creando categoría...'
    })
    if (unmounted) return

    const nuevaId = res?._id || res?.categoria?._id
    if (nuevaId) {
      form.value.categoriaId = nuevaId
      // Refrescar lista de categorías
      const cats = await api.request('/categorias', { method: 'GET', skipLoader: true })
      categorias.value = Array.isArray(cats) ? cats : (cats?.data || [])
    }
    modalCategoria?.hide()
    toast.success('Categoría creada')
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'CATEGORIA_DUPLICADA') {
      toast.error('Ya existe una categoría con ese nombre')
    } else {
      toast.error('Error al crear categoría: ' + e.message)
    }
  } finally {
    if (!unmounted) cargandoCategoria.value = false
  }
}

// ===== CARGA INICIAL =====
const cargarDatos = async () => {
  if (id) cargandoInicial.value = true
  try {
    // Cargar categorías (paralelo con producto)
    const catsPromise = api.request('/categorias', {
      method: 'GET',
      skipLoader: true
    }).catch(() => [])

    if (id) {
      const [prod, catsRes] = await Promise.all([
        api.request(`/productos/${id}`, {
          method: 'GET',
          loaderMessage: 'Cargando producto...'
        }),
        catsPromise
      ])
      if (unmounted) return

      categorias.value = Array.isArray(catsRes) ? catsRes : (catsRes?.data || [])

      if (!prod || !prod._id) {
        errorGeneral.value = 'Producto no encontrado'
        return
      }

      stockActual.value = Number(prod.stock) || 0
      form.value = {
        codigo: prod.codigo || '',
        nombre: prod.nombre || '',
        categoriaId: prod.categoriaId || '',
        descripcion: prod.descripcion || '',
        precio_compra: Number(prod.precio_compra) || 0,
        precio_venta: Number(prod.precio_venta) || 0,
        stock_minimo: Number(prod.stock_minimo) || 0,
        unidad_medida: prod.unidad_medida || 'unidad',
        codigo_barras: prod.codigo_barras || '',
        foto: prod.foto || '',
        observaciones: prod.observaciones || '',
        aplica_iva: prod.aplica_iva !== false,
        tipo_medida: prod.tipo_medida || 'unidad',
        stock: Number(prod.stock) || 0
      }
    } else {
      const catsRes = await catsPromise
      if (unmounted) return
      categorias.value = Array.isArray(catsRes) ? catsRes : (catsRes?.data || [])
      form.value.codigo = generarCodigoProducto()
    }

    formOriginal.value = JSON.parse(JSON.stringify(form.value))

    // Validar en limpio (sin marcar como tocados)
    if (form.value.nombre) validarNombre()
    validarPrecioCompra()
    validarPrecioVenta()
    validarStockMinimo()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'PRODUCTO_NOT_FOUND' || codigo === 'ID_INVALIDO') {
      errorGeneral.value = 'Producto no encontrado'
    } else {
      errorGeneral.value = 'Error al cargar: ' + e.message
      toast.error('Error al cargar producto')
    }
  } finally {
    if (!unmounted) cargandoInicial.value = false
  }
}

// ===== GUARDAR =====
const guardar = async () => {
  // Marcar todos los campos como tocados para mostrar errores
  touched.nombre = true
  touched.precio_compra = true
  touched.precio_venta = true
  touched.stock_minimo = true

  const okNombre = validarNombre()
  const okPc = validarPrecioCompra()
  const okPv = validarPrecioVenta()
  const okMin = validarStockMinimo()

  if (!okNombre || !okPc || !okPv || !okMin) {
    errorGeneral.value = 'Corrige los errores marcados antes de guardar'
    toast.warning('Verifica los datos del formulario')
    return
  }
  if (cargando.value) return

  errorGeneral.value = ''
  cargando.value = true

  try {
    // ⚠️ No enviamos `stock` — solo cambia vía kardex.
    const payload = {
      codigo: form.value.codigo,
      nombre: String(form.value.nombre || '').trim(),
      categoriaId: form.value.categoriaId || null,
      descripcion: String(form.value.descripcion || '').trim(),
      precio_compra: Number(form.value.precio_compra) || 0,
      precio_venta: Number(form.value.precio_venta) || 0,
      stock_minimo: Number(form.value.stock_minimo) || 0,
      unidad_medida: form.value.unidad_medida || 'unidad',
      codigo_barras: String(form.value.codigo_barras || '').trim(),
      foto: String(form.value.foto || '').trim(),
      observaciones: String(form.value.observaciones || '').trim(),
      aplica_iva: Boolean(form.value.aplica_iva),
      tipo_medida: form.value.tipo_medida || 'unidad'
    }

    if (id) {
      await api.request(`/productos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
        loaderMessage: 'Guardando cambios...'
      })
      if (unmounted) return
      toast.success('Producto actualizado correctamente')
    } else {
      await api.request('/productos', {
        method: 'POST',
        body: JSON.stringify(payload),
        loaderMessage: 'Creando producto...'
      })
      if (unmounted) return
      toast.success('Producto creado correctamente')
    }

    formOriginal.value = JSON.parse(JSON.stringify(form.value))
    router.push('/productos')
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    const codigoErr = e?.codigo || e?.code

    if (codigo === 'PRODUCTO_DUPLICADO' || codigo === 'DUPLICADO') {
      errores.value.nombre = 'Ya existe un producto con ese nombre o código'
      errorGeneral.value = e.message || 'Producto duplicado'
      toast.error('Ya existe un producto con ese nombre o código')
    } else if (codigo === 'CODIGO_BARRAS_DUPLICADO') {
      errorGeneral.value = 'El código de barras ya existe'
      toast.error('El código de barras ya existe')
    } else if (codigo === 'PRODUCTO_NOT_FOUND') {
      errorGeneral.value = 'Producto no encontrado'
      toast.error('El producto ya no existe')
    } else if (codigoErr === 'VALIDACION') {
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

// ===== PREVENIR SALIDA =====
const beforeUnloadHandler = (e) => {
  if (hayCambios.value && !cargando.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// ===== LIFECYCLE =====
onMounted(async () => {
  await cargarDatos()
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  unmounted = true
  window.removeEventListener('beforeunload', beforeUnloadHandler)

  for (const k of Object.keys(debounceTimers)) {
    clearTimeout(debounceTimers[k])
    delete debounceTimers[k]
  }

  try { modalCategoria?.hide() } catch { /* noop */ }
})
</script>

<style scoped>
.entity-form-wide { max-width: 1000px; margin: 0 auto; padding: 0 0 40px; }

/* HEADER */
.form-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
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
.btn-back:hover:not(:disabled) {
  border-color: #f39c12;
  color: #f39c12;
  transform: translateX(-3px);
}
.btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

.form-title {
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
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}
.title-icon-amber {
  background: linear-gradient(135deg, #f39c12, #d68910);
  box-shadow: 0 6px 16px rgba(243,156,18,0.3);
}
.title-icon-edit {
  background: linear-gradient(135deg, #3498db, #2980b9);
  box-shadow: 0 6px 16px rgba(52,152,219,0.3);
}
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.header-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}
.header-status i { font-size: 0.65rem; }
.header-status.complete { background: var(--success-bg); color: var(--success); }

/* LOADING */
.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.spinner-lg {
  width: 44px;
  height: 44px;
  margin: 0 auto 14px;
  border: 4px solid var(--border-color);
  border-top-color: #f39c12;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* FORM */
.form-single { display: flex; flex-direction: column; gap: 20px; }

.form-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
  border-bottom: 1px solid var(--border-light);
}
.section-number {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(243,156,18,0.25);
}
.section-number-amber { background: linear-gradient(135deg, #f39c12, #d68910); }
.section-header-content { flex: 1; }
.section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.section-body { padding: 24px; }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-row.cols-3 { grid-template-columns: repeat(3, 1fr); }
.form-row.cols-1-3 { grid-template-columns: 1fr 3fr; }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-hint { font-size: 0.72rem; color: var(--text-muted); }

.form-control, .form-select {
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  transition: all var(--transition-fast);
  outline: none;
}
.form-control:focus, .form-select:focus {
  border-color: #f39c12;
  box-shadow: 0 0 0 4px rgba(243,156,18,0.15);
  background: var(--bg-card);
}
.form-control.is-invalid { border-color: var(--danger); }
.form-control:disabled, .form-select:disabled { opacity: 0.6; cursor: not-allowed; }
.form-control.readonly {
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  cursor: not-allowed;
}

.input-with-icon { position: relative; }
.input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
}
.input-with-icon .form-control { padding-left: 42px; }

.input-with-button { display: flex; gap: 8px; }
.input-with-button .form-select { flex: 1; }

.btn-icon-outline {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}
.btn-icon-outline:hover:not(:disabled) {
  border-color: #f39c12;
  color: #f39c12;
  background: rgba(243,156,18,0.08);
}
.btn-icon-outline:disabled { opacity: 0.5; cursor: not-allowed; }

.price-input-lg { position: relative; }
.price-input-lg span {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-weight: 700;
  font-size: 1rem;
}
.price-input-lg .form-control { padding-left: 32px; font-weight: 700; }

.field-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--danger);
  margin-top: 2px;
}

.margin-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-left: 4px solid;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 4px;
}
.margin-success { background: rgba(39,174,96,0.08); border-color: #27ae60; color: #1e8449; }
.margin-success i { color: #27ae60; }
.margin-warning { background: rgba(243,156,18,0.08); border-color: #f39c12; color: #d68910; }
.margin-warning i { color: #f39c12; }
.margin-danger { background: rgba(231,76,60,0.08); border-color: #e74c3c; color: #c0392b; }
.margin-danger i { color: #e74c3c; }
.margin-neutral { background: var(--bg-table-stripe); border-color: var(--border-color); }
.margin-info strong { color: inherit; font-weight: 800; font-size: 0.95rem; }
.margin-detail { font-size: 0.78rem; opacity: 0.8; margin-left: 4px; }

.stock-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(52,152,219,0.06);
  border-left: 4px solid #3498db;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-top: 12px;
  flex-wrap: wrap;
}
.stock-info i { color: #3498db; }
.stock-info strong { color: var(--text-primary); font-weight: 800; }
.stock-link {
  margin-left: auto;
  font-size: 0.78rem;
  color: #3498db;
  font-weight: 600;
  text-decoration: none;
  transition: all var(--transition-fast);
}
.stock-link:hover { color: #2980b9; text-decoration: underline; }

.checkbox-switch-large {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1.5px solid var(--border-color);
  transition: all var(--transition-fast);
  height: 46px;
}
.checkbox-switch-large:hover:not(:has(input:disabled)) { border-color: #f39c12; }
.checkbox-switch-large.active {
  background: rgba(39,174,96,0.08);
  border-color: rgba(39,174,96,0.4);
}
.checkbox-switch-large input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #27ae60;
}
.checkbox-switch-large input:disabled { cursor: not-allowed; }
.checkbox-switch-large span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}
.checkbox-switch-large span i { color: var(--success); }
.checkbox-switch-large:not(.active) span i { color: #95a5a6; }

.photo-preview {
  max-width: 200px;
  margin-top: 12px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}
.photo-preview img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}
.photo-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  background: rgba(231,76,60,0.06);
  border-left: 4px solid #e74c3c;
  border-radius: var(--radius-md);
  color: #c0392b;
  font-size: 0.82rem;
}
.photo-error i { font-size: 1rem; }

.error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--danger-bg);
  border: 1px solid rgba(231,76,60,0.3);
  border-left: 4px solid var(--danger);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-weight: 500;
  font-size: 0.88rem;
}

.form-actions-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 28px;
  background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: 0 4px 12px rgba(39,174,96,0.3);
  font-family: inherit;
}
.btn-save-amber {
  background: linear-gradient(135deg, #f39c12, #d68910);
  box-shadow: 0 4px 12px rgba(243,156,18,0.3);
}
.btn-save-amber:hover:not(:disabled) { box-shadow: 0 8px 20px rgba(243,156,18,0.4); }
.btn-save:hover:not(:disabled) { transform: translateY(-2px); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.btn-cancel {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  text-decoration: none;
  transition: all var(--transition);
  cursor: pointer;
  font-family: inherit;
}
.btn-cancel:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg);
}
.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

/* MODAL CATEGORÍA */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }
.modal-header-cat {
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  border: none;
}
.modal-header-cat .modal-title {
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 700;
}
.btn-save-modal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  box-shadow: 0 3px 10px rgba(243,156,18,0.3);
}
.btn-save-modal:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(243,156,18,0.4);
}
.btn-save-modal:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* TRANSITIONS */
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .form-row.cols-2,
  .form-row.cols-3,
  .form-row.cols-1-3 { grid-template-columns: 1fr; }
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