<template>
  <div class="venta-form-wrapper">
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title mb-0">
        <i class="fas fa-file-invoice"></i>
        {{ tituloDocumento }}
      </h4>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="mostrarAyuda = !mostrarAyuda">
          <i class="fas fa-keyboard"></i> Atajos
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="$router.push('/ventas')">
          <i class="fas fa-arrow-left"></i> Volver
        </button>
      </div>
    </div>

    <!-- Ayuda de atajos -->
    <div v-if="mostrarAyuda" class="alert alert-info mb-3">
      <strong><i class="fas fa-keyboard me-2"></i>Atajos de teclado:</strong>
      <ul class="mb-0 mt-1 small">
        <li><kbd>F2</kbd> — Enfocar búsqueda de productos</li>
        <li><kbd>F3</kbd> — Enfocar búsqueda de clientes</li>
        <li><kbd>Ctrl</kbd> + <kbd>Enter</kbd> — Guardar factura</li>
        <li><kbd>Esc</kbd> — Limpiar búsqueda / Cerrar dropdown</li>
      </ul>
    </div>

    <AlertaPeriodoCerrado :periodo-cerrado="periodoCerrado" />

    <form @submit.prevent="guardar" novalidate>
      <div class="row g-3">
        <!-- ==================== COLUMNA PRINCIPAL ==================== -->
        <div class="col-lg-8">

          <!-- SECCIÓN: DATOS DEL DOCUMENTO -->
          <div class="card card-cacao mb-3">
            <div class="card-header">
              <i class="fas fa-file-alt me-2"></i> Datos del documento
            </div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-5">
                  <label class="form-label"><span class="text-danger">*</span> Tipo de documento</label>
                  <select class="form-select" v-model="venta.tipo_documento" @change="cambiarTipo">
                    <optgroup label="Documentos de Venta">
                      <option value="factura">01 - Factura</option>
                      <option value="nota_credito">04 - Nota de Crédito</option>
                      <option value="guia_remision">06 - Guía de Remisión</option>
                      <option value="retencion">07 - Comprobante de Retención</option>
                      <option value="liquidacion">03 - Liquidación de Compra</option>
                    </optgroup>
                    <optgroup label="Documentos Especiales">
                      <option value="exportacion">42 - Factura de Exportación</option>
                      <option value="reembolso">41 - Factura de Reembolso</option>
                      <option value="proforma">Proforma (no fiscal)</option>
                    </optgroup>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Nº documento</label>
                  <input type="text" class="form-control" v-model="venta.numero_factura" placeholder="Automático" />
                </div>
                <div class="col-md-4">
                  <label class="form-label"><span class="text-danger">*</span> Fecha emisión</label>
                  <input type="date" class="form-control" v-model="venta.fecha_emision" required />
                </div>
              </div>
            </div>
          </div>

          <!-- SECCIÓN: CLIENTE -->
          <div class="card card-cacao mb-3 card-with-dropdown" v-if="venta.tipo_documento !== 'guia_remision'">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><i class="fas fa-user me-2"></i> Cliente</span>
              <router-link to="/clientes/nuevo" class="btn btn-sm btn-outline-primary">
                <i class="fas fa-plus"></i> Nuevo
              </router-link>
            </div>
            <div class="card-body">
              <!-- Buscador de cliente -->
              <div class="position-relative">
                <label class="form-label"><span class="text-danger">*</span> Buscar cliente</label>
                <div class="input-group">
                  <span class="input-group-text"><i class="fas fa-search"></i></span>
                  <input
                    ref="inputCliente"
                    type="text"
                    class="form-control"
                    placeholder="Escribe nombre, RUC o cédula..."
                    v-model="busquedaCliente"
                    @focus="mostrarListaClientes = true"
                    @input="filtrarClientes"
                    @blur="cerrarListaClientes"
                  />
                  <button
                    v-if="venta.clienteId"
                    class="btn btn-outline-secondary"
                    type="button"
                    @click="limpiarCliente"
                    title="Cambiar cliente"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                </div>

                <!-- Dropdown de clientes -->
                <div v-if="mostrarListaClientes && clientesFiltrados.length > 0" class="dropdown-custom">
                  <div
                    v-for="c in clientesFiltrados.slice(0, 8)"
                    :key="c._id"
                    class="dropdown-item-custom"
                    @mousedown.prevent="seleccionarCliente(c)"
                  >
                    <div class="d-flex justify-content-between align-items-center">
                      <div>
                        <div class="fw-bold">{{ c.nombre }}</div>
                        <div class="small text-muted">
                          <i class="fas fa-id-card"></i> {{ c.ruc }}
                          <span v-if="c.telefono" class="ms-2"><i class="fas fa-phone"></i> {{ c.telefono }}</span>
                        </div>
                      </div>
                      <i class="fas fa-check-circle text-primary" v-if="venta.clienteId === c._id"></i>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Preview del cliente seleccionado -->
              <div v-if="clienteActual" class="cliente-preview mt-3">
                <div class="d-flex align-items-start gap-3">
                  <div class="cliente-avatar">{{ getInitials(clienteActual.nombre) }}</div>
                  <div class="flex-grow-1">
                    <div class="fw-bold">{{ clienteActual.nombre }}</div>
                    <div class="row small text-muted mt-1">
                      <div class="col-md-6"><strong>RUC/CI:</strong> {{ clienteActual.ruc }}</div>
                      <div class="col-md-6" v-if="clienteActual.telefono"><strong>Tel:</strong> {{ clienteActual.telefono }}</div>
                      <div class="col-md-6" v-if="clienteActual.email"><strong>Email:</strong> {{ clienteActual.email }}</div>
                      <div class="col-md-6" v-if="clienteActual.direccion"><strong>Dir:</strong> {{ clienteActual.direccion }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECCIÓN: PRODUCTOS -->
          <div class="card card-cacao mb-3 card-with-dropdown">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><i class="fas fa-boxes me-2"></i> Productos <span class="badge bg-primary ms-1">{{ venta.detalles.length }}</span></span>
              <button type="button" class="btn btn-sm btn-success" @click="focusBusquedaProducto">
                <i class="fas fa-search"></i> Buscar (F2)
              </button>
            </div>
            <div class="card-body">
              <!-- Buscador de productos -->
              <div class="position-relative mb-3">
                <div class="input-group">
                  <span class="input-group-text bg-primary text-white"><i class="fas fa-barcode"></i></span>
                  <input
                    ref="inputProducto"
                    type="text"
                    class="form-control"
                    placeholder="Escribe el nombre o código del producto y presiona Enter..."
                    v-model="busquedaProducto"
                    @focus="mostrarListaProductos = true"
                    @input="filtrarProductos"
                    @keydown.enter.prevent="agregarPrimerProducto"
                    @keydown.esc="limpiarBusquedaProducto"
                    @blur="cerrarListaProductos"
                  />
                </div>

                <!-- Dropdown de productos -->
                <div v-if="mostrarListaProductos && productosFiltrados.length > 0" class="dropdown-custom">
                  <div
                    v-for="p in productosFiltrados.slice(0, 10)"
                    :key="p._id"
                    class="dropdown-item-custom"
                    @mousedown.prevent="agregarProducto(p)"
                  >
                    <div class="d-flex justify-content-between align-items-center">
                      <div>
                        <div class="fw-bold">{{ p.nombre }}</div>
                        <div class="small text-muted">
                          <code>{{ p.codigo }}</code>
                          <span class="ms-2">Stock: <strong :class="p.stock <= 0 ? 'text-danger' : 'text-success'">{{ p.stock || 0 }}</strong></span>
                        </div>
                      </div>
                      <div class="text-end">
                        <div class="fw-bold text-primary">${{ (p.precio_venta || 0).toFixed(2) }}</div>
                        <small class="text-muted">precio venta</small>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="mostrarListaProductos && busquedaProducto.length > 0"
                  class="dropdown-custom p-3 text-center text-muted"
                >
                  <i class="fas fa-search"></i> Sin resultados para "{{ busquedaProducto }}"
                </div>
              </div>

              <!-- Tabla de productos agregados -->
              <div v-if="venta.detalles.length === 0" class="text-center py-4 text-muted">
                <i class="fas fa-box-open fa-3x mb-2 opacity-50"></i>
                <p class="mb-0">No has agregado productos</p>
                <small>Busca un producto arriba o presiona <kbd>F2</kbd></small>
              </div>

              <div v-else class="table-responsive">
                <table class="table items-table">
                  <thead>
                    <tr>
                      <th style="min-width:200px;">Producto</th>
                      <th style="width:150px;">Cantidad</th>
                      <th style="width:120px;">Precio</th>
                      <th style="width:100px;">IVA</th>
                      <th style="width:100px;" class="text-end">Subtotal</th>
                      <th style="width:50px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, index) in venta.detalles" :key="index">
                      <td>
                        <div class="fw-bold">{{ item.nombre || 'Producto' }}</div>
                        <small class="text-muted">{{ item.codigo || '' }}</small>
                        <div v-if="item.stockDisponible !== undefined" class="small" :class="item.cantidad > item.stockDisponible ? 'text-danger' : 'text-muted'">
                          Stock: {{ item.stockDisponible }}
                        </div>
                      </td>
                      <td>
                        <div class="input-group input-group-sm">
                          <button type="button" class="btn btn-outline-secondary" @click="cambiarCantidad(index, -1)">
                            <i class="fas fa-minus"></i>
                          </button>
                          <input
                            type="number"
                            class="form-control text-center"
                            v-model.number="item.cantidad"
                            min="0.01"
                            step="0.01"
                            @blur="validarCantidad(index)"
                          />
                          <button type="button" class="btn btn-outline-secondary" @click="cambiarCantidad(index, 1)">
                            <i class="fas fa-plus"></i>
                          </button>
                        </div>
                      </td>
                      <td>
                        <div class="input-group input-group-sm">
                          <span class="input-group-text">$</span>
                          <input
                            type="number"
                            class="form-control"
                            v-model.number="item.precio_unitario"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </td>
                      <td>
                        <select class="form-select form-select-sm" v-model="item.aplica_iva">
                          <option :value="true">15%</option>
                          <option :value="false">0%</option>
                        </select>
                      </td>
                      <td class="text-end fw-bold">
                        ${{ ((item.cantidad || 0) * (item.precio_unitario || 0)).toFixed(2) }}
                      </td>
                      <td>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger"
                          @click="eliminarDetalle(index)"
                          title="Quitar"
                        >
                          <i class="fas fa-times"></i>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- SECCIÓN: GUÍA DE REMISIÓN (colapsable) -->
          <div v-if="venta.tipo_documento === 'guia_remision'" class="card card-cacao mb-3">
            <div class="card-header" role="button" @click="seccionesExpandidas.guia = !seccionesExpandidas.guia">
              <div class="d-flex justify-content-between align-items-center">
                <span><i class="fas fa-truck me-2"></i> Datos de la Guía de Remisión</span>
                <i :class="seccionesExpandidas.guia ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
              </div>
            </div>
            <div v-show="seccionesExpandidas.guia" class="card-body">
              <div class="row g-3">
                <div class="col-12"><h6 class="text-primary">Datos Generales</h6></div>
                <div class="col-md-4">
                  <label class="form-label"><span class="text-danger">*</span> Establecimiento</label>
                  <input type="text" class="form-control" v-model="venta.establecimiento" required />
                </div>
                <div class="col-md-4">
                  <label class="form-label"><span class="text-danger">*</span> Nombre Comercial</label>
                  <input type="text" class="form-control" v-model="venta.nombre_comercial" required />
                </div>
                <div class="col-md-4">
                  <label class="form-label"><span class="text-danger">*</span> Punto de Emisión</label>
                  <input type="text" class="form-control" v-model="venta.punto_emision" required />
                </div>

                <div class="col-12 mt-3"><h6 class="text-primary">Destinatario</h6></div>
                <div class="col-md-3">
                  <label class="form-label"><span class="text-danger">*</span> Identificación</label>
                  <input type="text" class="form-control" v-model="venta.destinatario_identificacion" required />
                </div>
                <div class="col-md-3">
                  <label class="form-label"><span class="text-danger">*</span> Tipo Identificación</label>
                  <SelectSRI v-model="venta.destinatario_tipo" :lista="catalogos.TIPO_IDENTIFICACION || []" placeholder="Seleccione..." />
                </div>
                <div class="col-md-3">
                  <label class="form-label"><span class="text-danger">*</span> Razón Social</label>
                  <input type="text" class="form-control" v-model="venta.destinatario_razon_social" required />
                </div>
                <div class="col-md-3">
                  <label class="form-label"><span class="text-danger">*</span> Dirección Destino</label>
                  <input type="text" class="form-control" v-model="venta.destinatario_direccion" required />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Ruta</label>
                  <input type="text" class="form-control" v-model="venta.ruta" />
                </div>
                <div class="col-md-4">
                  <label class="form-label"><span class="text-danger">*</span> Motivo</label>
                  <input type="text" class="form-control" v-model="venta.motivo" required />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Documento Aduanero</label>
                  <input type="text" class="form-control" v-model="venta.documento_aduana" />
                </div>

                <div class="col-12 mt-3"><h6 class="text-primary">Comprobante Sustento</h6></div>
                <div class="col-md-3">
                  <label class="form-label">Tipo Emisión</label>
                  <select class="form-select" v-model="venta.comprobante_tipo_emision">
                    <option value="">Seleccione</option>
                    <option value="Física">Física</option>
                    <option value="Electrónica">Electrónica</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Tipo Comprobante</label>
                  <SelectSRI v-model="venta.comprobante_documento" :lista="catalogos.DOCUMENTO_SUSTENTO || []" placeholder="Seleccione..." />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Clave de Acceso</label>
                  <input type="text" class="form-control" v-model="venta.comprobante_clave_acceso" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Número Autorización</label>
                  <input type="text" class="form-control" v-model="venta.comprobante_numero_autorizacion" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Número Comprobante</label>
                  <input type="text" class="form-control" v-model="venta.comprobante_numero" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Fecha Emisión Comp.</label>
                  <input type="date" class="form-control" v-model="venta.comprobante_fecha_emision" />
                </div>

                <div class="col-12 mt-3"><h6 class="text-primary">Transportista</h6></div>
                <div class="col-md-3">
                  <label class="form-label">Identificación</label>
                  <input type="text" class="form-control" v-model="venta.transportista_identificacion" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Tipo Identificación</label>
                  <SelectSRI v-model="venta.transportista_tipo" :lista="catalogos.TIPO_IDENTIFICACION || []" placeholder="Seleccione..." />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Razón Social</label>
                  <input type="text" class="form-control" v-model="venta.transportista_razon_social" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Correo</label>
                  <input type="email" class="form-control" v-model="venta.transportista_correo" />
                </div>

                <div class="col-12 mt-3"><h6 class="text-primary">Traslado</h6></div>
                <div class="col-md-4">
                  <label class="form-label">Dirección Partida</label>
                  <input type="text" class="form-control" v-model="venta.direccion_partida" />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Inicio Transporte</label>
                  <input type="datetime-local" class="form-control" v-model="venta.inicio_transporte" />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Fin Transporte</label>
                  <input type="datetime-local" class="form-control" v-model="venta.fin_transporte" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Placa</label>
                  <input type="text" class="form-control" v-model="venta.placa_transporte" />
                </div>
              </div>
            </div>
          </div>

          <!-- SECCIÓN: INFORMACIÓN DE PAGO (colapsable) -->
          <div v-if="venta.tipo_documento !== 'guia_remision'" class="card card-cacao mb-3">
            <div class="card-header" role="button" @click="seccionesExpandidas.pago = !seccionesExpandidas.pago">
              <div class="d-flex justify-content-between align-items-center">
                <span><i class="fas fa-credit-card me-2"></i> Información de pago</span>
                <i :class="seccionesExpandidas.pago ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
              </div>
            </div>
            <div v-show="seccionesExpandidas.pago" class="card-body">
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label">Forma de pago</label>
                  <SelectSRI v-model="venta.forma_pago" :lista="catalogos.FORMA_PAGO || []" placeholder="Seleccione..." />
                </div>
                <div class="col-md-4">
                  <label class="form-label">Estado de pago</label>
                  <select class="form-select" v-model="venta.estado_pago">
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="parcial">Pago Parcial</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Fecha de pago</label>
                  <input type="date" class="form-control" v-model="venta.fecha_pago" />
                </div>
                <div class="col-12">
                  <label class="form-label">Observaciones</label>
                  <textarea class="form-control" v-model="venta.observaciones" rows="2" placeholder="Notas adicionales..."></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== SIDEBAR RESUMEN ==================== -->
        <div class="col-lg-4">
          <div class="sidebar-sticky">
            <!-- RESUMEN -->
            <div class="card card-cacao resumen-card">
              <div class="card-header">
                <i class="fas fa-calculator me-2"></i> Resumen
              </div>
              <div class="card-body">
                <div class="resumen-line">
                  <span>Productos</span>
                  <span class="fw-bold">{{ venta.detalles.length }}</span>
                </div>
                <div class="resumen-line">
                  <span>Subtotal</span>
                  <span>{{ formatCurrency(subtotal) }}</span>
                </div>
                <div class="resumen-line">
                  <span>IVA 15%</span>
                  <span>{{ formatCurrency(iva) }}</span>
                </div>
                <hr />
                <div class="resumen-total">
                  <div>TOTAL</div>
                  <div class="monto-total">{{ formatCurrency(total) }}</div>
                </div>
              </div>
            </div>

            <!-- ACCIONES -->
            <div class="card card-cacao mt-3">
              <div class="card-body">
                <button
                  type="submit"
                  class="btn btn-success w-100 mb-2"
                  :disabled="cargando || !formularioValido || !!periodoCerrado"
                >
                  <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
                  {{ cargando ? 'Guardando...' : 'Guardar' }}
                  <small class="d-block opacity-75">(Ctrl + Enter)</small>
                </button>
                <button type="button" class="btn btn-outline-secondary w-100" @click="$router.push('/ventas')">
                  Cancelar
                </button>

                <div v-if="(!venta.clienteId && venta.tipo_documento !== 'guia_remision') || venta.detalles.length === 0" class="alert alert-warning mt-3 mb-0 small">
                  <i class="fas fa-exclamation-triangle me-1"></i>
                  <span v-if="!venta.clienteId && venta.tipo_documento !== 'guia_remision'">Selecciona un cliente</span>
                  <span v-else-if="venta.detalles.length === 0">Agrega al menos un producto</span>
                </div>
              </div>
            </div>

            <!-- INFO CLAVE DE ACCESO -->
            <div v-if="puedeGenerarClave" class="card card-cacao mt-3">
              <div class="card-body">
                <div class="small text-muted">
                  <i class="fas fa-key me-1"></i>
                  Al guardar se generará automáticamente la <strong>clave de acceso de 49 dígitos</strong> para el SRI.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Errores generales -->
      <div v-if="errorGeneral" class="alert alert-danger mt-3">
        <i class="fas fa-exclamation-circle me-2"></i> {{ errorGeneral }}
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMongoDB } from '../../composables/useMongoDB'
import { roundTo2, formatCurrency } from '../../utils/formatters'
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

// ===== ESTADO =====
const clientes = ref([])
const productos = ref([])
const cargando = ref(false)
const errorGeneral = ref('')
const periodoCerrado = ref(null)

const tipoInicial = route.query.tipo || 'factura'
const id = route.params.id

// ===== BÚSQUEDA =====
const inputCliente = ref(null)
const inputProducto = ref(null)
const busquedaCliente = ref('')
const busquedaProducto = ref('')
const mostrarListaClientes = ref(false)
const mostrarListaProductos = ref(false)
let fuseClientes = null
let fuseProductos = null

// ===== ATAJOS =====
const mostrarAyuda = ref(false)

// ===== SECCIONES COLAPSABLES =====
const seccionesExpandidas = ref({
  guia: false,
  pago: true
})

// ===== FORM =====
const venta = ref({
  clienteId: '',
  numero_factura: '',
  fecha_emision: new Date().toISOString().split('T')[0],
  tipo_documento: tipoInicial,
  detalles: [],
  numero_guia: '',
  transportista: '',
  placa: '',
  numero_exportacion: '',
  pais_destino: '',
  numero_retencion: '',
  porcentaje_retencion: 0,
  establecimiento: '',
  nombre_comercial: '',
  punto_emision: '',
  transportista_identificacion: '',
  transportista_tipo: '',
  transportista_razon_social: '',
  transportista_correo: '',
  direccion_partida: '',
  inicio_transporte: '',
  fin_transporte: '',
  placa_transporte: '',
  destinatario_identificacion: '',
  destinatario_tipo: '',
  destinatario_razon_social: '',
  destinatario_direccion: '',
  ruta: '',
  motivo: '',
  documento_aduana: '',
  comprobante_tipo_emision: '',
  comprobante_documento: '',
  comprobante_buscar: '',
  comprobante_clave_acceso: '',
  comprobante_numero_autorizacion: '',
  comprobante_numero: '',
  comprobante_fecha_emision: '',
  forma_pago: '',
  estado_pago: 'pendiente',
  fecha_pago: '',
  observaciones: ''
})

const errores = ref({ cliente: '', detalles: [] })

// ===== COMPUTED =====
const tituloDocumento = computed(() => {
  const titulos = {
    factura: 'Nueva Factura',
    guia_remision: 'Guía de Remisión',
    exportacion: 'Factura de Exportación',
    reembolso: 'Factura de Reembolso',
    retencion: 'Comprobante de Retención',
    liquidacion: 'Liquidación de Compra',
    nota_credito: 'Nota de Crédito',
    proforma: 'Proforma'
  }
  const base = titulos[venta.value.tipo_documento] || 'Documento'
  return id ? `Editar ${base}` : base
})

const clienteActual = computed(() => {
  if (!venta.value.clienteId) return null
  if (!Array.isArray(clientes.value)) return null
  return clientes.value.find(c => c._id === venta.value.clienteId) || null
})

const clientesFiltrados = computed(() => {
  try {
    if (!busquedaCliente.value.trim()) {
      return Array.isArray(clientes.value) ? clientes.value.slice(0, 20) : []
    }
    if (!fuseClientes) return []
    return fuseClientes.search(busquedaCliente.value.trim()).map(r => r.item)
  } catch (e) {
    console.error('Error filtrando clientes:', e)
    return []
  }
})

const productosFiltrados = computed(() => {
  try {
    if (!busquedaProducto.value.trim()) {
      return Array.isArray(productos.value) ? productos.value.slice(0, 20) : []
    }
    if (!fuseProductos) return []
    return fuseProductos.search(busquedaProducto.value.trim()).map(r => r.item)
  } catch (e) {
    console.error('Error filtrando productos:', e)
    return []
  }
})

const subtotal = computed(() => {
  if (!Array.isArray(venta.value.detalles)) return 0
  const total = venta.value.detalles.reduce((acc, d) => acc + ((d.cantidad || 0) * (d.precio_unitario || 0)), 0)
  return roundTo2(total)
})

const iva = computed(() => {
  if (!Array.isArray(venta.value.detalles)) return 0
  let baseImponible = 0
  venta.value.detalles.forEach(d => {
    if (d.aplica_iva !== false) {
      baseImponible += (d.cantidad || 0) * (d.precio_unitario || 0)
    }
  })
  return roundTo2(baseImponible * 0.15)
})

const total = computed(() => roundTo2(subtotal.value + iva.value))

const formularioValido = computed(() => {
  if (venta.value.tipo_documento !== 'guia_remision' && !venta.value.clienteId) return false
  if (!Array.isArray(venta.value.detalles) || venta.value.detalles.length === 0) return false
  return venta.value.detalles.every(d => d.productoId && d.cantidad > 0 && d.precio_unitario >= 0)
})

const puedeGenerarClave = computed(() => {
  return ['factura', 'liquidacion', 'nota_credito', 'guia_remision', 'retencion', 'exportacion', 'reembolso'].includes(venta.value.tipo_documento)
})

// ===== HELPERS =====
const getInitials = (nombre) => {
  if (!nombre) return '?'
  return String(nombre).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const generarCodigoLocal = (tipo) => {
  const prefijos = {
    'factura': 'FAC', 'guia_remision': 'GUI', 'exportacion': 'EXP', 'reembolso': 'REB',
    'retencion': 'RET', 'liquidacion': 'LIQ', 'nota_credito': 'NCR', 'proforma': 'PRO'
  }
  const prefijo = prefijos[tipo] || 'DOC'
  const numero = String(Date.now()).slice(-6)
  return `${prefijo}-${numero}`
}

// ===== BÚSQUEDA CLIENTES =====
const filtrarClientes = () => { mostrarListaClientes.value = true }
const cerrarListaClientes = () => { setTimeout(() => { mostrarListaClientes.value = false }, 200) }

const seleccionarCliente = (c) => {
  venta.value.clienteId = c._id
  busquedaCliente.value = ''
  mostrarListaClientes.value = false
  errores.value.cliente = ''
}

const limpiarCliente = () => {
  venta.value.clienteId = ''
  busquedaCliente.value = ''
  nextTick(() => inputCliente.value?.focus())
}

// ===== BÚSQUEDA PRODUCTOS =====
const filtrarProductos = () => { mostrarListaProductos.value = true }
const cerrarListaProductos = () => { setTimeout(() => { mostrarListaProductos.value = false }, 200) }
const limpiarBusquedaProducto = () => { busquedaProducto.value = ''; mostrarListaProductos.value = false }
const focusBusquedaProducto = () => { inputProducto.value?.focus() }

const agregarPrimerProducto = () => {
  if (productosFiltrados.value.length > 0) {
    agregarProducto(productosFiltrados.value[0])
  }
}

const agregarProducto = (p) => {
  if (!p || !p._id) return
  const existente = venta.value.detalles.find(d => d.productoId === p._id)
  if (existente) {
    existente.cantidad = (existente.cantidad || 1) + 1
    toast.info(`${p.nombre} aumentado a ${existente.cantidad}`)
  } else {
    venta.value.detalles.push({
      productoId: p._id,
      codigo: p.codigo || '',
      nombre: p.nombre || 'Producto',
      cantidad: 1,
      precio_unitario: roundTo2(p.precio_venta || 0),
      aplica_iva: p.aplica_iva !== undefined ? p.aplica_iva : true,
      stockDisponible: p.stock || 0
    })
    errores.value.detalles.push({ producto: '', cantidad: '', precio: '' })
  }
  busquedaProducto.value = ''
  mostrarListaProductos.value = false
  nextTick(() => inputProducto.value?.focus())
}

const cambiarCantidad = (index, delta) => {
  const item = venta.value.detalles[index]
  const nueva = (item.cantidad || 0) + delta
  if (nueva < 0.01) return
  item.cantidad = roundTo2(nueva)
}

const validarCantidad = (index) => {
  const item = venta.value.detalles[index]
  if (!item.cantidad || item.cantidad <= 0) item.cantidad = 1
}

const eliminarDetalle = (index) => {
  venta.value.detalles.splice(index, 1)
  errores.value.detalles.splice(index, 1)
}

// ===== TIPO =====
const asignarCodigos = () => {
  const tipo = venta.value.tipo_documento
  venta.value.numero_factura = generarCodigoLocal(tipo)
  if (tipo === 'exportacion') venta.value.numero_exportacion = generarCodigoLocal('exportacion')
  if (tipo === 'guia_remision') venta.value.numero_guia = generarCodigoLocal('guia_remision')
  if (tipo === 'retencion') venta.value.numero_retencion = generarCodigoLocal('retencion')
}

const cambiarTipo = () => {
  Object.assign(venta.value, {
    numero_guia: '', transportista: '', placa: '', numero_exportacion: '', pais_destino: '',
    numero_retencion: '', porcentaje_retencion: 0, establecimiento: '', nombre_comercial: '',
    punto_emision: '', transportista_identificacion: '', transportista_tipo: '',
    transportista_razon_social: '', transportista_correo: '', direccion_partida: '',
    inicio_transporte: '', fin_transporte: '', placa_transporte: '',
    destinatario_identificacion: '', destinatario_tipo: '', destinatario_razon_social: '',
    destinatario_direccion: '', ruta: '', motivo: '', documento_aduana: '',
    comprobante_tipo_emision: '', comprobante_documento: '', comprobante_buscar: '',
    comprobante_clave_acceso: '', comprobante_numero_autorizacion: '', comprobante_numero: '',
    comprobante_fecha_emision: ''
  })
  if (!id) asignarCodigos()
}

// ===== PERIODO =====
const verificarPeriodo = async () => {
  if (!venta.value.fecha_emision) {
    periodoCerrado.value = null
    return
  }
  try {
    const fecha = new Date(venta.value.fecha_emision)
    const res = await api.request(`/periodos/verificar/${fecha.getFullYear()}/${fecha.getMonth() + 1}`, {
      method: 'GET'
    })
    periodoCerrado.value = res.cerrado ? res.periodo : null
  } catch (e) {
    periodoCerrado.value = null
  }
}

// ===== ATAJOS =====
const handleKeydown = (e) => {
  if (e.key === 'F2') {
    e.preventDefault()
    inputProducto.value?.focus()
  } else if (e.key === 'F3') {
    e.preventDefault()
    inputCliente.value?.focus()
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    if (formularioValido.value && !cargando.value) guardar()
  }
}

// ===== CARGAR =====
onMounted(async () => {
  try {
    try { await cargarCatalogos() } catch (e) { console.warn('No se pudieron cargar catálogos:', e) }

    const [clis, prods] = await Promise.all([find('clientes'), find('productos')])
    clientes.value = Array.isArray(clis) ? clis : []
    productos.value = Array.isArray(prods) ? prods : []

    // Inicializar Fuse de forma segura
    try {
      if (clientes.value.length > 0) {
        fuseClientes = new Fuse(clientes.value, {
          keys: ['nombre', 'ruc', 'telefono', 'email'],
          threshold: 0.3
        })
      }
      if (productos.value.length > 0) {
        fuseProductos = new Fuse(productos.value, {
          keys: ['nombre', 'codigo', 'codigo_barras'],
          threshold: 0.3
        })
      }
    } catch (e) {
      console.warn('Error inicializando Fuse:', e)
    }

    if (id) {
      const data = await findById('ventas', id)
      if (data) {
        if (data.detalles) {
          data.detalles = data.detalles.map(d => {
            const prod = productos.value.find(p => p._id === d.productoId)
            return {
              ...d,
              codigo: prod?.codigo || d.codigo || '',
              nombre: prod?.nombre || d.nombre || 'Producto',
              stockDisponible: prod?.stock || 0
            }
          })
        }
        venta.value = { ...venta.value, ...data }
      } else {
        errorGeneral.value = 'No se encontró el documento'
      }
    } else {
      asignarCodigos()
    }

    document.addEventListener('keydown', handleKeydown)
  } catch (e) {
    console.error('Error en onMounted:', e)
    errorGeneral.value = 'Error al cargar datos: ' + e.message
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})

watch(() => venta.value.fecha_emision, verificarPeriodo, { immediate: true })

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
      clienteId: venta.value.clienteId || '',
      numero_factura: venta.value.numero_factura,
      fecha_emision: venta.value.fecha_emision,
      tipo_documento: venta.value.tipo_documento,
      detalles: venta.value.detalles.map(d => ({
        productoId: d.productoId,
        cantidad: roundTo2(d.cantidad),
        precio_unitario: roundTo2(d.precio_unitario),
        aplica_iva: d.aplica_iva
      })),
      subtotal: roundTo2(subtotal.value),
      iva: roundTo2(iva.value),
      total: roundTo2(total.value),
      numero_guia: venta.value.numero_guia || '',
      transportista: venta.value.transportista || '',
      placa: venta.value.placa || '',
      numero_exportacion: venta.value.numero_exportacion || '',
      pais_destino: venta.value.pais_destino || '',
      numero_retencion: venta.value.numero_retencion || '',
      porcentaje_retencion: venta.value.porcentaje_retencion || 0,
      establecimiento: venta.value.establecimiento || '',
      nombre_comercial: venta.value.nombre_comercial || '',
      punto_emision: venta.value.punto_emision || '',
      transportista_identificacion: venta.value.transportista_identificacion || '',
      transportista_tipo: venta.value.transportista_tipo || '',
      transportista_razon_social: venta.value.transportista_razon_social || '',
      transportista_correo: venta.value.transportista_correo || '',
      direccion_partida: venta.value.direccion_partida || '',
      inicio_transporte: venta.value.inicio_transporte || '',
      fin_transporte: venta.value.fin_transporte || '',
      placa_transporte: venta.value.placa_transporte || '',
      destinatario_identificacion: venta.value.destinatario_identificacion || '',
      destinatario_tipo: venta.value.destinatario_tipo || '',
      destinatario_razon_social: venta.value.destinatario_razon_social || '',
      destinatario_direccion: venta.value.destinatario_direccion || '',
      ruta: venta.value.ruta || '',
      motivo: venta.value.motivo || '',
      documento_aduana: venta.value.documento_aduana || '',
      comprobante_tipo_emision: venta.value.comprobante_tipo_emision || '',
      comprobante_documento: venta.value.comprobante_documento || '',
      comprobante_buscar: venta.value.comprobante_buscar || '',
      comprobante_clave_acceso: venta.value.comprobante_clave_acceso || '',
      comprobante_numero_autorizacion: venta.value.comprobante_numero_autorizacion || '',
      comprobante_numero: venta.value.comprobante_numero || '',
      comprobante_fecha_emision: venta.value.comprobante_fecha_emision || '',
      forma_pago: venta.value.forma_pago || '',
      estado_pago: venta.value.estado_pago || 'pendiente',
      fecha_pago: venta.value.fecha_pago || null,
      observaciones: venta.value.observaciones || ''
    }

    if (id) {
      await updateOne('ventas', id, payload)
      toast.success('Documento actualizado')
    } else {
      await insertOne('ventas', payload)
      toast.success('Documento creado exitosamente')
    }
    router.push('/ventas')
  } catch (e) {
    errorGeneral.value = 'Error al guardar: ' + e.message
    toast.error('Error: ' + e.message)
  } finally {
    cargando.value = false
  }
}
</script>

<style scoped>
.venta-form-wrapper {
  padding-bottom: 40px;
}

/* ===== SECCIONES COLAPSABLES ===== */
.card-header[role="button"] {
  cursor: pointer;
  user-select: none;
}
.card-header[role="button"]:hover {
  background: var(--bg-table-stripe);
}

/* ===== FIX: permitir que los dropdowns sobresalgan ===== */
.card-with-dropdown {
  overflow: visible !important;
  position: relative;
  z-index: 1;
}
.card-with-dropdown:focus-within {
  z-index: 100;
}
.card-with-dropdown .card-body,
.card-with-dropdown .position-relative,
.card-with-dropdown .input-group {
  overflow: visible !important;
}

/* ===== DROPDOWN CUSTOM ===== */
.dropdown-custom {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 9999 !important;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.18);
  max-height: 350px;
  overflow-y: auto;
  margin-top: 4px;
}
.dropdown-item-custom {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}
.dropdown-item-custom:last-child {
  border-bottom: none;
}
.dropdown-item-custom:hover {
  background: var(--bg-table-stripe);
}

/* ===== CLIENTE PREVIEW ===== */
.cliente-preview {
  padding: 14px;
  background: var(--bg-table-stripe);
  border-radius: 10px;
  border-left: 3px solid var(--primary-color);
}
.cliente-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ===== TABLA DE ITEMS ===== */
.items-table {
  margin-bottom: 0;
}
.items-table thead {
  background: var(--bg-table-stripe);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--text-muted);
}
.items-table th {
  padding: 8px 10px;
  border-bottom: 2px solid var(--border-color);
  font-weight: 700;
}
.items-table td {
  padding: 10px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
.items-table tbody tr:hover {
  background: rgba(52,152,219,0.03);
}

/* ===== SIDEBAR STICKY ===== */
.sidebar-sticky {
  position: sticky;
  top: 80px;
}
.sidebar-sticky > .card-cacao {
  height: auto !important;
}

.resumen-card .card-body {
  padding: 20px;
}
.resumen-line {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 0.95rem;
  color: var(--text-primary);
}
.resumen-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary-dark);
  border-top: 2px solid var(--primary-color);
  margin-top: 8px;
}
.monto-total {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--primary-color);
}

/* ===== INPUT GROUP MINI ===== */
.input-group-sm .form-control {
  padding: 4px 8px;
  font-size: 0.85rem;
}

/* ===== BADGES ===== */
kbd {
  background: #2c3e50;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', monospace;
}

/* Fix: evitar que las tarjetas se estiren en la columna principal */
.col-lg-8 > .card-cacao {
  height: auto !important;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 992px) {
  .sidebar-sticky {
    position: static;
  }
  .monto-total {
    font-size: 1.5rem;
  }
}

@media (max-width: 576px) {
  .items-table {
    font-size: 0.85rem;
  }
  .items-table th,
  .items-table td {
    padding: 6px 4px;
  }
}
</style>