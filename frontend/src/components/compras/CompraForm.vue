<template>
  <div class="compra-form">
    <div class="form-header">
      <div class="header-left">
        <button type="button" class="btn-back" @click="$router.push('/compras')">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div>
          <h1 class="form-title">
            <span class="title-icon title-icon-orange"><i class="fas fa-shopping-cart"></i></span>
            {{ id ? 'Editar Compra' : 'Nueva Compra' }}
          </h1>
          <p class="form-subtitle">
            {{ id ? 'Editando documento existente' : 'Registra una factura de compra o gasto' }}
          </p>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-ghost" @click="mostrarAyuda = !mostrarAyuda">
          <i class="fas fa-keyboard"></i>
          <span>Atajos</span>
        </button>
      </div>
    </div>

    <transition name="fade">
      <div v-if="mostrarAyuda" class="shortcuts-panel">
        <div class="shortcuts-title"><i class="fas fa-bolt"></i> Atajos de teclado</div>
        <div class="shortcuts-grid">
          <div class="shortcut-item"><kbd>F2</kbd><span>Buscar producto</span></div>
          <div class="shortcut-item"><kbd>Ctrl</kbd><kbd>↵</kbd><span>Guardar</span></div>
          <div class="shortcut-item"><kbd>Esc</kbd><span>Cerrar</span></div>
        </div>
      </div>
    </transition>

    <AlertaPeriodoCerrado :periodo-cerrado="periodoCerrado" />

    <form @submit.prevent="guardar" novalidate>
      <div class="form-grid">
        <div class="form-main">

          <!-- SECCIÓN: Datos -->
          <section class="form-section">
            <header class="section-header">
              <div class="section-number section-number-orange">1</div>
              <div class="section-header-content">
                <h2 class="section-title">Datos del documento</h2>
                <p class="section-desc">Tipo, número y fecha de la compra</p>
              </div>
            </header>
            <div class="section-body">
              <div class="form-row cols-2-1-1">
                <div class="form-field">
                  <label class="form-label"><span class="required">*</span> Tipo de compra</label>
                  <select class="form-select" v-model="compra.tipo_compra">
                    <option value="inventario">Inventario (Cacao, insumos)</option>
                    <option value="gasto">Gasto (Servicios, papelería, honorarios)</option>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label">Nº Factura</label>
                  <input type="text" class="form-control" v-model="compra.numero_factura" placeholder="Automático" />
                </div>
                <div class="form-field">
                  <label class="form-label"><span class="required">*</span> Fecha emisión</label>
                  <input type="date" class="form-control" v-model="compra.fecha_emision" required />
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN: Proveedor -->
          <section class="form-section card-with-dropdown">
            <header class="section-header">
              <div class="section-number section-number-orange">2</div>
              <div class="section-header-content">
                <h2 class="section-title">Proveedor</h2>
                <p class="section-desc">Selecciona o crea un proveedor</p>
              </div>
              <router-link to="/proveedores/nuevo" class="btn-new-inline">
                <i class="fas fa-plus"></i>
                <span>Nuevo</span>
              </router-link>
            </header>
            <div class="section-body">
              <div class="position-relative">
                <div class="search-input-group">
                  <i class="fas fa-search search-icon"></i>
                  <input
                    ref="inputProveedor"
                    type="text"
                    class="search-input"
                    placeholder="Escribe nombre, RUC o razón social..."
                    v-model="busquedaProveedor"
                    @focus="mostrarListaProveedores = true"
                    @input="filtrarProveedores"
                    @blur="cerrarListaProveedores"
                  />
                  <button v-if="compra.proveedorId" class="search-clear" type="button" @click="limpiarProveedor">
                    <i class="fas fa-times"></i>
                  </button>
                </div>

                <transition name="dropdown">
                  <div v-if="mostrarListaProveedores && proveedoresFiltrados.length > 0" class="search-dropdown">
                    <div
                      v-for="p in proveedoresFiltrados.slice(0, 8)"
                      :key="p._id"
                      class="dropdown-row"
                      @mousedown.prevent="seleccionarProveedor(p)"
                    >
                      <div class="row-avatar row-avatar-orange">{{ getInitials(p.nombre) }}</div>
                      <div class="row-content">
                        <div class="row-title">{{ p.nombre }}</div>
                        <div class="row-meta">
                          <span><i class="fas fa-id-card"></i> {{ p.ruc }}</span>
                          <span v-if="p.telefono"><i class="fas fa-phone"></i> {{ p.telefono }}</span>
                        </div>
                      </div>
                      <i v-if="compra.proveedorId === p._id" class="fas fa-check-circle row-check"></i>
                    </div>
                  </div>
                </transition>
              </div>

              <transition name="fade">
                <div v-if="proveedorActual" class="cliente-card cliente-card-orange">
                  <div class="cliente-avatar-large cliente-avatar-orange">{{ getInitials(proveedorActual.nombre) }}</div>
                  <div class="cliente-details">
                    <div class="cliente-name">{{ proveedorActual.nombre }}</div>
                    <div class="cliente-meta-grid">
                      <div><strong>RUC:</strong> {{ proveedorActual.ruc }}</div>
                      <div v-if="proveedorActual.telefono"><strong>Tel:</strong> {{ proveedorActual.telefono }}</div>
                      <div v-if="proveedorActual.email"><strong>Email:</strong> {{ proveedorActual.email }}</div>
                      <div v-if="proveedorActual.direccion"><strong>Dir:</strong> {{ proveedorActual.direccion }}</div>
                    </div>
                  </div>
                  <button class="cliente-change" @click="limpiarProveedor">
                    <i class="fas fa-exchange-alt"></i>
                  </button>
                </div>
              </transition>
            </div>
          </section>

          <!-- SECCIÓN: Productos -->
          <section class="form-section card-with-dropdown">
            <header class="section-header">
              <div class="section-number section-number-orange">3</div>
              <div class="section-header-content">
                <h2 class="section-title">
                  Detalles de compra
                  <span v-if="compra.detalles.length > 0" class="count-badge count-badge-orange">{{ compra.detalles.length }}</span>
                </h2>
                <p class="section-desc">Agrega productos o servicios</p>
              </div>
              <button type="button" class="btn-new-inline btn-new-orange" @click="focusBusquedaProducto">
                <i class="fas fa-search"></i>
                <span>Buscar (F2)</span>
              </button>
            </header>
            <div class="section-body">
              <div class="position-relative">
                <div class="search-input-group search-input-primary">
                  <i class="fas fa-barcode search-icon"></i>
                  <input
                    ref="inputProducto"
                    type="text"
                    class="search-input"
                    placeholder="Busca productos por nombre o código. Enter para agregar..."
                    v-model="busquedaProducto"
                    @focus="mostrarListaProductos = true"
                    @input="filtrarProductos"
                    @keydown.enter.prevent="agregarPrimerProducto"
                    @keydown.esc="limpiarBusquedaProducto"
                    @blur="cerrarListaProductos"
                  />
                </div>

                <transition name="dropdown">
                  <div v-if="mostrarListaProductos && productosFiltrados.length > 0" class="search-dropdown">
                    <div
                      v-for="p in productosFiltrados.slice(0, 10)"
                      :key="p._id"
                      class="dropdown-row"
                      @mousedown.prevent="agregarProducto(p)"
                    >
                      <div class="row-avatar row-avatar-product"><i class="fas fa-box"></i></div>
                      <div class="row-content">
                        <div class="row-title">{{ p.nombre }}</div>
                        <div class="row-meta">
                          <code>{{ p.codigo }}</code>
                          <span :class="p.stock <= 0 ? 'stock-zero' : 'stock-ok'">
                            <i class="fas fa-cube"></i> Stock: {{ p.stock || 0 }}
                          </span>
                        </div>
                      </div>
                      <div class="row-price">
                        <div class="price-value">${{ (p.precio_compra || 0).toFixed(2) }}</div>
                        <div class="price-label">compra</div>
                      </div>
                    </div>
                  </div>
                </transition>
              </div>

              <div v-if="compra.detalles.length === 0" class="empty-items">
                <div class="empty-icon"><i class="fas fa-box-open"></i></div>
                <div class="empty-title">No has agregado productos</div>
                <div class="empty-text">Usa el buscador o presiona <kbd>F2</kbd></div>
              </div>

              <div v-else class="items-list">
                <div v-for="(item, index) in compra.detalles" :key="index" class="item-card">
                  <div class="item-main">
                    <div class="item-icon item-icon-orange"><i class="fas fa-box"></i></div>
                    <div class="item-info">
                      <div class="item-name">{{ item.nombre || 'Producto' }}</div>
                      <div class="item-code">{{ item.codigo || 'Sin código' }}</div>
                    </div>
                  </div>

                  <div class="item-controls">
                    <div class="control-group">
                      <label>Cantidad</label>
                      <div class="qty-control">
                        <button type="button" @click="cambiarCantidad(index, -1)"><i class="fas fa-minus"></i></button>
                        <input type="number" v-model.number="item.cantidad" min="0.01" step="0.01" @blur="validarCantidad(index)" />
                        <button type="button" @click="cambiarCantidad(index, 1)"><i class="fas fa-plus"></i></button>
                      </div>
                    </div>

                    <div class="control-group">
                      <label>Costo unit.</label>
                      <div class="price-input">
                        <span>$</span>
                        <input type="number" v-model.number="item.costo_unitario" min="0" step="0.01" />
                      </div>
                    </div>

                    <div class="control-group">
                      <label>IVA</label>
                      <select class="form-select form-select-sm" v-model="item.aplica_iva">
                        <option :value="true">15%</option>
                        <option :value="false">0%</option>
                      </select>
                    </div>

                    <div class="control-group control-subtotal">
                      <label>Subtotal</label>
                      <div class="subtotal-value">
                        ${{ ((item.cantidad || 0) * (item.costo_unitario || 0)).toFixed(2) }}
                      </div>
                    </div>

                    <button class="item-remove" @click="eliminarDetalle(index)"><i class="fas fa-times"></i></button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN: Pago y retención -->
          <section class="form-section">
            <header class="section-header section-header-clickable" @click="seccionesExpandidas.pago = !seccionesExpandidas.pago">
              <div class="section-number section-number-orange"><i class="fas fa-credit-card"></i></div>
              <div class="section-header-content">
                <h2 class="section-title">Pago y Retención</h2>
                <p class="section-desc">Forma de pago y valores retenidos</p>
              </div>
              <i class="fas toggle-chevron" :class="seccionesExpandidas.pago ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </header>
            <transition name="collapse">
              <div v-show="seccionesExpandidas.pago" class="section-body">
                <div class="form-row cols-4">
                  <div class="form-field">
                    <label class="form-label">Estado de pago</label>
                    <select class="form-select" v-model="compra.estado_pago">
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label class="form-label">Forma de pago</label>
                    <SelectSRI v-model="compra.forma_pago" :lista="catalogos.FORMA_PAGO || []" placeholder="Seleccione..." />
                  </div>
                  <div class="form-field">
                    <label class="form-label">Fecha de pago</label>
                    <input type="date" class="form-control" v-model="compra.fecha_pago" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">Valor retenido ($)</label>
                    <input type="number" step="0.01" class="form-control" v-model.number="compra.retencion_valor" min="0" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label class="form-label">Observaciones</label>
                    <textarea class="form-control" v-model="compra.observaciones" rows="2" placeholder="Notas adicionales..."></textarea>
                  </div>
                </div>
              </div>
            </transition>
          </section>
        </div>

        <!-- SIDEBAR -->
        <aside class="form-sidebar">
          <div class="sidebar-sticky">
            <div class="summary-card summary-card-orange">
              <div class="summary-header summary-header-orange">
                <i class="fas fa-calculator"></i>
                <span>Resumen de compra</span>
              </div>
              <div class="summary-body">
                <div class="summary-row">
                  <span class="summary-label">Productos</span>
                  <span class="summary-value">{{ compra.detalles.length }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Subtotal</span>
                  <span class="summary-value">${{ subtotal.toFixed(2) }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">IVA 15%</span>
                  <span class="summary-value">${{ iva.toFixed(2) }}</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-total summary-total-orange">
                  <span class="total-label">TOTAL</span>
                  <span class="total-value total-value-orange">${{ total.toFixed(2) }}</span>
                </div>
              </div>
            </div>

            <div class="status-card">
              <div class="status-item" :class="{ complete: compra.proveedorId }">
                <i :class="compra.proveedorId ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                <span>Proveedor seleccionado</span>
              </div>
              <div class="status-item" :class="{ complete: compra.detalles.length > 0 }">
                <i :class="compra.detalles.length > 0 ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                <span>Productos agregados</span>
              </div>
              <div class="status-item" :class="{ complete: compra.fecha_emision }">
                <i :class="compra.fecha_emision ? 'fas fa-check-circle' : 'far fa-circle'"></i>
                <span>Fecha establecida</span>
              </div>
            </div>

            <div class="actions-card">
              <button type="submit" class="btn-save btn-save-orange" :disabled="cargando || !formularioValido || !!periodoCerrado">
                <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
                <span>{{ cargando ? 'Guardando...' : 'Guardar compra' }}</span>
                <kbd>Ctrl+↵</kbd>
              </button>
              <button type="button" class="btn-cancel" @click="$router.push('/compras')">
                <i class="fas fa-times"></i>
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      <transition name="fade">
        <div v-if="errorGeneral" class="error-banner">
          <i class="fas fa-exclamation-circle"></i>
          <span>{{ errorGeneral }}</span>
        </div>
      </transition>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { roundTo2 } from '../../utils/formatters'
import { useToast } from 'vue-toastification'
import { useCatalogosSRI } from '../../composables/useCatalogosSRI'
import SelectSRI from '../shared/SelectSRI.vue'
import AlertaPeriodoCerrado from '../shared/AlertaPeriodoCerrado.vue'
import { api } from '../../services/api'
import Fuse from 'fuse.js'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { find, findById, insertOne, updateOne } = useMongoDB()
const { catalogos, cargarCatalogos } = useCatalogosSRI()

const proveedores = ref([])
const productos = ref([])
const cargando = ref(false)
const errorGeneral = ref('')
const periodoCerrado = ref(null)
const id = route.params.id

const inputProveedor = ref(null)
const inputProducto = ref(null)
const busquedaProveedor = ref('')
const busquedaProducto = ref('')
const mostrarListaProveedores = ref(false)
const mostrarListaProductos = ref(false)
const mostrarAyuda = ref(false)
let fuseProveedores = null
let fuseProductos = null

const seccionesExpandidas = ref({ pago: true })

const compra = ref({
  proveedorId: '', numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  detalles: [], subtotal: 0, iva: 0, total: 0,
  tipo_compra: 'inventario', estado_pago: 'pendiente',
  forma_pago: '', fecha_pago: '', retencion_valor: 0,
  retencion_porcentaje: 0, observaciones: ''
})

const errores = ref({ proveedor: '', detalles: [] })

// ===== COMPUTED =====
const proveedorActual = computed(() => {
  if (!compra.value.proveedorId) return null
  return proveedores.value.find(p => p._id === compra.value.proveedorId) || null
})

const proveedoresFiltrados = computed(() => {
  try {
    if (!busquedaProveedor.value.trim()) return proveedores.value.slice(0, 20)
    if (!fuseProveedores) return []
    return fuseProveedores.search(busquedaProveedor.value.trim()).map(r => r.item)
  } catch (e) { return [] }
})

const productosFiltrados = computed(() => {
  try {
    if (!busquedaProducto.value.trim()) return productos.value.slice(0, 20)
    if (!fuseProductos) return []
    return fuseProductos.search(busquedaProducto.value.trim()).map(r => r.item)
  } catch (e) { return [] }
})

const subtotal = computed(() => roundTo2(compra.value.detalles.reduce((acc, d) => acc + ((d.cantidad || 0) * (d.costo_unitario || 0)), 0)))

const iva = computed(() => {
  let base = 0
  compra.value.detalles.forEach(d => {
    if (d.aplica_iva !== false) base += (d.cantidad || 0) * (d.costo_unitario || 0)
  })
  return roundTo2(base * 0.15)
})

const total = computed(() => roundTo2(subtotal.value + iva.value))

const formularioValido = computed(() => {
  if (!compra.value.proveedorId) return false
  if (!Array.isArray(compra.value.detalles) || compra.value.detalles.length === 0) return false
  return compra.value.detalles.every(d => d.productoId && d.cantidad > 0 && d.costo_unitario >= 0)
})

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const generarCodigoCompra = () => `COM-${String(Date.now()).slice(-6)}`

// ===== BÚSQUEDA =====
const filtrarProveedores = () => { mostrarListaProveedores.value = true }
const cerrarListaProveedores = () => { setTimeout(() => { mostrarListaProveedores.value = false }, 200) }
const seleccionarProveedor = (p) => {
  compra.value.proveedorId = p._id
  busquedaProveedor.value = ''
  mostrarListaProveedores.value = false
}
const limpiarProveedor = () => {
  compra.value.proveedorId = ''
  busquedaProveedor.value = ''
  nextTick(() => inputProveedor.value?.focus())
}

const filtrarProductos = () => { mostrarListaProductos.value = true }
const cerrarListaProductos = () => { setTimeout(() => { mostrarListaProductos.value = false }, 200) }
const limpiarBusquedaProducto = () => { busquedaProducto.value = ''; mostrarListaProductos.value = false }
const focusBusquedaProducto = () => { inputProducto.value?.focus() }
const agregarPrimerProducto = () => {
  if (productosFiltrados.value.length > 0) agregarProducto(productosFiltrados.value[0])
}

const agregarProducto = (p) => {
  if (!p || !p._id) return
  const existente = compra.value.detalles.find(d => d.productoId === p._id)
  if (existente) {
    existente.cantidad = (existente.cantidad || 1) + 1
    toast.info(`${p.nombre} aumentado a ${existente.cantidad}`)
  } else {
    compra.value.detalles.push({
      productoId: p._id,
      codigo: p.codigo || '',
      nombre: p.nombre || 'Producto',
      cantidad: 1,
      costo_unitario: roundTo2(p.precio_compra || 0),
      aplica_iva: p.aplica_iva !== undefined ? p.aplica_iva : true
    })
    errores.value.detalles.push({ producto: '', cantidad: '', costo: '' })
  }
  busquedaProducto.value = ''
  mostrarListaProductos.value = false
  nextTick(() => inputProducto.value?.focus())
}

const cambiarCantidad = (index, delta) => {
  const item = compra.value.detalles[index]
  const nueva = (item.cantidad || 0) + delta
  if (nueva < 0.01) return
  item.cantidad = roundTo2(nueva)
}
const validarCantidad = (index) => {
  const item = compra.value.detalles[index]
  if (!item.cantidad || item.cantidad <= 0) item.cantidad = 1
}
const eliminarDetalle = (index) => {
  compra.value.detalles.splice(index, 1)
  errores.value.detalles.splice(index, 1)
}

// ===== PERIODO =====
const verificarPeriodo = async () => {
  if (!compra.value.fecha_emision) { periodoCerrado.value = null; return }
  try {
    const fecha = new Date(compra.value.fecha_emision)
    const res = await api.request(`/periodos/verificar/${fecha.getFullYear()}/${fecha.getMonth() + 1}`, { method: 'GET' })
    periodoCerrado.value = res.cerrado ? res.periodo : null
  } catch (e) { periodoCerrado.value = null }
}

// ===== ATAJOS =====
const handleKeydown = (e) => {
  if (e.key === 'F2') {
    e.preventDefault()
    inputProducto.value?.focus()
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    if (formularioValido.value && !cargando.value) guardar()
  }
}

// ===== CARGA INICIAL =====
onMounted(async () => {
  try {
    try { await cargarCatalogos() } catch (e) { console.warn(e) }

    const [provs, prods] = await Promise.all([find('proveedores'), find('productos')])
    proveedores.value = Array.isArray(provs) ? provs : []
    productos.value = Array.isArray(prods) ? prods : []

    try {
      if (proveedores.value.length > 0) fuseProveedores = new Fuse(proveedores.value, { keys: ['nombre', 'ruc', 'telefono', 'email'], threshold: 0.3 })
      if (productos.value.length > 0) fuseProductos = new Fuse(productos.value, { keys: ['nombre', 'codigo', 'codigo_barras'], threshold: 0.3 })
    } catch (e) { console.warn(e) }

    if (id) {
      const data = await findById('compras', id)
      if (data) {
        if (data.detalles) {
          data.detalles = data.detalles.map(d => {
            const prod = productos.value.find(p => p._id === d.productoId)
            return {
              ...d,
              codigo: prod?.codigo || d.codigo || '',
              nombre: prod?.nombre || d.nombre || 'Producto'
            }
          })
        }
        compra.value = { ...compra.value, ...data }
      } else {
        errorGeneral.value = 'No se encontró la compra'
      }
    } else {
      compra.value.numero_factura = generarCodigoCompra()
    }

    document.addEventListener('keydown', handleKeydown)
  } catch (e) {
    errorGeneral.value = 'Error al cargar datos: ' + e.message
  }
})

onBeforeUnmount(() => { document.removeEventListener('keydown', handleKeydown) })

watch(() => compra.value.fecha_emision, verificarPeriodo, { immediate: true })

// ===== GUARDAR =====
const guardar = async () => {
  if (periodoCerrado.value) {
    toast.error(`No se puede guardar: ${periodoCerrado.value.nombre} está cerrado`)
    return
  }
  if (!formularioValido.value) {
    errorGeneral.value = 'Corrija los errores antes de guardar'
    toast.warning('Verifica los datos')
    return
  }

  errorGeneral.value = ''
  cargando.value = true

  try {
    const payload = {
      proveedorId: compra.value.proveedorId,
      numero_factura: compra.value.numero_factura,
      fecha_emision: compra.value.fecha_emision,
      detalles: compra.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        costo_unitario: roundTo2(d.costo_unitario),
        aplica_iva: d.aplica_iva
      })),
      subtotal: roundTo2(subtotal.value),
      iva: roundTo2(iva.value),
      total: roundTo2(total.value),
      tipo_compra: compra.value.tipo_compra,
      estado_pago: compra.value.estado_pago,
      forma_pago: compra.value.forma_pago || '',
      fecha_pago: compra.value.fecha_pago || null,
      retencion_valor: compra.value.retencion_valor || 0,
      retencion_porcentaje: compra.value.retencion_porcentaje || 0,
      observaciones: compra.value.observaciones || ''
    }

    if (id) {
      await updateOne('compras', id, payload)
      toast.success('Compra actualizada')
    } else {
      await insertOne('compras', payload)
      toast.success('Compra creada exitosamente')
    }
    router.push('/compras')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
/* Mismos estilos que VentaForm pero con tonos naranja */
.compra-form { max-width: 1400px; margin: 0 auto; padding: 0 0 40px; }

.form-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }

.btn-back {
  width: 44px; height: 44px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; transition: all var(--transition); flex-shrink: 0;
}
.btn-back:hover { border-color: #e67e22; color: #e67e22; transform: translateX(-3px); }

.form-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800; color: var(--text-primary);
  letter-spacing: -0.03em; display: flex; align-items: center;
  gap: 12px; margin: 0 0 4px;
}
.title-icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 1.15rem; box-shadow: 0 6px 16px rgba(52, 152, 219, 0.3);
}
.title-icon-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 6px 16px rgba(230, 126, 34, 0.3);
}
.form-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

.btn-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); font-weight: 600; font-size: 0.85rem;
  cursor: pointer; transition: all var(--transition); font-family: inherit;
}
.btn-ghost:hover { border-color: #e67e22; color: #e67e22; }

.shortcuts-panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 20px; }
.shortcuts-title { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.shortcuts-title i { color: #e67e22; }
.shortcuts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.shortcut-item { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--text-muted); }
kbd {
  background: var(--bg-table-stripe); color: var(--text-primary);
  padding: 3px 8px; border-radius: 6px; font-family: var(--font-mono);
  font-size: 0.7rem; font-weight: 700; border: 1px solid var(--border-color);
  min-width: 26px; text-align: center;
}

.form-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
.form-main { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

.form-section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.form-section.card-with-dropdown { overflow: visible; }

.section-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-bottom: 1px solid var(--border-light);
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
}
.section-header-clickable { cursor: pointer; user-select: none; }
.section-header-clickable:hover { background: var(--bg-table-stripe); }

.section-number {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 0.9rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.25);
}
.section-number-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.25);
}
.section-header-content { flex: 1; min-width: 0; }
.section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; display: flex; align-items: center; gap: 8px; }
.section-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

.count-badge { background: var(--primary-color); color: #fff; padding: 2px 10px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 700; }
.count-badge-orange { background: #e67e22; }

.btn-new-inline {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-secondary); font-weight: 600; font-size: 0.78rem;
  text-decoration: none; cursor: pointer; transition: all var(--transition-fast);
  flex-shrink: 0; font-family: inherit;
}
.btn-new-inline:hover { border-color: #e67e22; color: #e67e22; }
.btn-new-orange { background: #e67e22; border-color: #e67e22; color: #fff; }
.btn-new-orange:hover { background: #d35400; color: #fff; }

.toggle-chevron { color: var(--text-muted); transition: transform var(--transition); }
.section-body { padding: 24px; }

.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row:last-child { margin-bottom: 0; }
.form-row.cols-2-1-1 { grid-template-columns: 2fr 1fr 1fr; }
.form-row.cols-4 { grid-template-columns: repeat(4, 1fr); }

.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }

.form-control, .form-select {
  width: 100%; padding: 10px 14px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-color); background: var(--bg-input);
  color: var(--text-primary); font-size: 0.88rem;
  font-family: inherit; transition: all var(--transition-fast); outline: none;
}
.form-control:focus, .form-select:focus {
  border-color: #e67e22;
  box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.15);
  background: var(--bg-card);
}

.search-input-group { position: relative; display: flex; align-items: center; }
.search-icon { position: absolute; left: 16px; color: var(--text-muted); font-size: 0.9rem; pointer-events: none; }
.search-input {
  width: 100%; padding: 14px 50px 14px 46px;
  border-radius: var(--radius-md); border: 1.5px solid var(--border-color);
  background: var(--bg-input); color: var(--text-primary);
  font-size: 0.9rem; font-family: inherit;
  transition: all var(--transition-fast); outline: none;
}
.search-input:focus { border-color: #e67e22; box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.15); background: var(--bg-card); }
.search-clear {
  position: absolute; right: 12px; background: transparent; border: none;
  color: var(--text-muted); cursor: pointer; padding: 8px;
  border-radius: var(--radius-xs); transition: all var(--transition-fast);
}
.search-clear:hover { color: var(--danger); background: var(--danger-bg); }

.search-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  z-index: 100; background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  max-height: 400px; overflow-y: auto; padding: 6px;
}
.dropdown-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: var(--radius-md);
  cursor: pointer; transition: background var(--transition-fast);
}
.dropdown-row:hover { background: var(--bg-table-stripe); }
.row-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 0.75rem; flex-shrink: 0;
}
.row-avatar-orange { background: linear-gradient(135deg, #e67e22, #d35400); }
.row-avatar-product { background: linear-gradient(135deg, #f39c12, #d68910); font-size: 0.9rem; }
.row-content { flex: 1; min-width: 0; }
.row-title { font-weight: 600; color: var(--text-primary); font-size: 0.88rem; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-meta { display: flex; align-items: center; gap: 12px; font-size: 0.72rem; color: var(--text-muted); flex-wrap: wrap; }
.row-meta code { background: var(--bg-table-stripe); padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono); color: #e67e22; }
.stock-ok { color: var(--success); }
.stock-zero { color: var(--danger); }
.row-price { text-align: right; flex-shrink: 0; }
.price-value { font-weight: 800; color: #e67e22; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
.price-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; }
.row-check { color: #e67e22; font-size: 1rem; }

.cliente-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px; margin-top: 16px;
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.05), rgba(52, 152, 219, 0.02));
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--radius-md); border-left: 4px solid var(--primary-color);
}
.cliente-card-orange {
  background: linear-gradient(135deg, rgba(230, 126, 34, 0.05), rgba(230, 126, 34, 0.02));
  border-color: rgba(230, 126, 34, 0.2);
  border-left-color: #e67e22;
}
.cliente-avatar-large {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1rem; flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.cliente-avatar-orange {
  background: linear-gradient(135deg, #e67e22, #d35400);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3);
}
.cliente-details { flex: 1; min-width: 0; }
.cliente-name { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 6px; }
.cliente-meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 16px; font-size: 0.78rem; color: var(--text-secondary); }
.cliente-meta-grid strong { color: var(--text-muted); font-weight: 600; margin-right: 4px; }
.cliente-change {
  width: 36px; height: 36px; border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; transition: all var(--transition-fast);
}
.cliente-change:hover { border-color: #e67e22; color: #e67e22; background: rgba(230, 126, 34, 0.08); }

.empty-items { text-align: center; padding: 48px 20px; }
.empty-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--bg-table-stripe); display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); font-size: 1.8rem; margin: 0 auto 14px;
}
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 4px; }
.empty-text { font-size: 0.82rem; color: var(--text-muted); }

.items-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.item-card {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 14px 16px;
  background: var(--bg-table-stripe); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); transition: all var(--transition-fast); flex-wrap: wrap;
}
.item-card:hover { border-color: #e67e22; background: var(--bg-card); box-shadow: var(--shadow-sm); }
.item-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px; }
.item-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.item-icon-orange { background: linear-gradient(135deg, #e67e22, #d35400); }
.item-info { min-width: 0; flex: 1; }
.item-name { font-weight: 700; color: var(--text-primary); font-size: 0.9rem; margin-bottom: 2px; }
.item-code { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); }

.item-controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.control-group { display: flex; flex-direction: column; gap: 4px; }
.control-group label { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }

.qty-control {
  display: flex; align-items: center; background: var(--bg-card);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden;
}
.qty-control button {
  width: 32px; height: 36px; border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer;
  transition: all var(--transition-fast); font-size: 0.75rem;
}
.qty-control button:hover { background: rgba(230, 126, 34, 0.08); color: #e67e22; }
.qty-control input {
  width: 60px; height: 36px; border: none; text-align: center;
  font-weight: 700; font-size: 0.9rem; background: transparent;
  color: var(--text-primary); outline: none; font-family: inherit;
}

.price-input {
  display: flex; align-items: center; background: var(--bg-card);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm);
  overflow: hidden; height: 36px;
}
.price-input span { padding: 0 8px; color: var(--text-muted); font-weight: 700; font-size: 0.85rem; }
.price-input input {
  width: 80px; height: 100%; border: none; background: transparent;
  padding: 0 10px 0 0; font-weight: 700; font-size: 0.88rem;
  color: var(--text-primary); outline: none; font-family: inherit;
}

.control-subtotal { min-width: 100px; }
.subtotal-value {
  padding: 9px 12px; background: var(--bg-card);
  border: 1.5px solid var(--border-color); border-radius: var(--radius-sm);
  font-weight: 800; color: #e67e22; font-size: 0.9rem;
  text-align: right; font-variant-numeric: tabular-nums;
}

.item-remove {
  width: 36px; height: 36px; border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; transition: all var(--transition-fast);
}
.item-remove:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }

.form-sidebar { position: relative; }
.sidebar-sticky { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 16px; }

.summary-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.summary-header {
  padding: 14px 20px; background: linear-gradient(135deg, var(--primary-dark), #1a2a3a);
  color: #fff; font-weight: 700; font-size: 0.9rem;
  display: flex; align-items: center; gap: 10px;
}
.summary-header-orange { background: linear-gradient(135deg, #d35400, #a04000); }
.summary-header i { color: var(--accent-color); }
.summary-body { padding: 20px; }
.summary-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; font-size: 0.88rem; }
.summary-label { color: var(--text-muted); font-weight: 500; }
.summary-value { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.summary-divider { height: 1px; background: var(--border-light); margin: 8px 0; }
.summary-total { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 4px; border-top: 2px solid var(--primary-color); }
.summary-total-orange { border-top-color: #e67e22; }
.total-label { font-size: 0.85rem; font-weight: 800; color: var(--text-primary); letter-spacing: 0.5px; }
.total-value { font-size: 1.65rem; font-weight: 800; color: var(--primary-color); font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
.total-value-orange { color: #e67e22; }

.status-card {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-lg); padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.status-item { display: flex; align-items: center; gap: 10px; font-size: 0.82rem; color: var(--text-muted); transition: color var(--transition-fast); }
.status-item i { font-size: 0.95rem; color: var(--border-strong); }
.status-item.complete { color: var(--text-primary); font-weight: 500; }
.status-item.complete i { color: var(--success); }

.actions-card { display: flex; flex-direction: column; gap: 10px; }
.btn-save {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 14px 20px; background: linear-gradient(135deg, var(--success), #1e8449);
  color: #fff; border: none; border-radius: var(--radius-md);
  font-weight: 700; font-size: 0.92rem; cursor: pointer;
  transition: all var(--transition); box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
  font-family: inherit;
}
.btn-save-orange { background: linear-gradient(135deg, #e67e22, #d35400); box-shadow: 0 4px 12px rgba(230, 126, 34, 0.3); }
.btn-save-orange:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(230, 126, 34, 0.4); }
.btn-save:hover:not(:disabled) { transform: translateY(-2px); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-save kbd { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.2); color: #fff; padding: 2px 6px; font-size: 0.65rem; }

.btn-cancel {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 20px; background: var(--bg-card);
  border: 1.5px solid var(--border-color); color: var(--text-secondary);
  border-radius: var(--radius-md); font-weight: 600; font-size: 0.88rem;
  cursor: pointer; transition: all var(--transition); font-family: inherit;
}
.btn-cancel:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }

.error-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: var(--danger-bg);
  border: 1px solid rgba(231, 76, 60, 0.3); border-left: 4px solid var(--danger);
  border-radius: var(--radius-md); color: var(--danger);
  font-weight: 500; font-size: 0.88rem; margin-top: 20px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s var(--ease-out); }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.collapse-enter-active, .collapse-leave-active { transition: all 0.3s var(--ease-out); overflow: hidden; }
.collapse-enter-from, .collapse-leave-to { max-height: 0; opacity: 0; }
.collapse-enter-to, .collapse-leave-from { max-height: 2000px; opacity: 1; }

@media (max-width: 992px) {
  .form-grid { grid-template-columns: 1fr; }
  .sidebar-sticky { position: static; }
  .form-row.cols-2-1-1, .form-row.cols-4 { grid-template-columns: 1fr 1fr; }
  .cliente-meta-grid { grid-template-columns: 1fr; }
}

@media (max-width: 576px) {
  .form-row.cols-2-1-1, .form-row.cols-4 { grid-template-columns: 1fr; }
  .form-title { font-size: 1.2rem; }
  .form-subtitle { padding-left: 0; }
  .section-header { padding: 16px 18px; }
  .section-body { padding: 18px; }
}
</style>