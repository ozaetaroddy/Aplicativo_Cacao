<template>
  <div class="ajustes-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-orange"><i class="fas fa-edit"></i></span>
          Ajustes de Inventario
        </h1>
        <p class="page-subtitle">
          Corrige diferencias entre el stock del sistema y el stock físico real
        </p>
      </div>
    </div>

    <!-- ALERTA BACKEND -->
    <div class="info-card info-card-warning">
      <div class="info-icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="info-body">
        <strong>Requiere endpoint en backend</strong>
        <div class="small">
          Este módulo consume <code>POST /api/inventario/ajustar</code>. Si aún no
          está implementado en el backend, las peticiones devolverán error 404.
          El ajuste registra un movimiento en el kardex para mantener auditoría.
        </div>
      </div>
    </div>

    <!-- FORMULARIO -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-sliders-h me-2"></i>
        Nuevo ajuste
      </div>
      <div class="card-body">
        <form @submit.prevent="aplicarAjuste">
          <div class="form-grid">
            <div class="form-field form-field-full">
              <label class="form-label" for="ajuste-producto">
                <span class="required">*</span> Producto
              </label>
              <div class="search-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input
                  id="ajuste-producto"
                  type="text"
                  class="form-input"
                  placeholder="Buscar por nombre o código..."
                  v-model="busquedaProducto"
                  @focus="mostrarLista = true"
                  @blur="cerrarLista"
                  :disabled="cargando"
                />
              </div>

              <transition name="dropdown">
                <div v-if="mostrarLista && productosFiltrados.length > 0" class="search-dropdown">
                  <div
                    v-for="p in productosFiltrados.slice(0, 8)"
                    :key="p._id"
                    class="dropdown-row"
                    @mousedown.prevent="seleccionarProducto(p)"
                  >
                    <div class="row-icon"><i class="fas fa-box"></i></div>
                    <div class="row-content">
                      <div class="row-title">{{ p.nombre }}</div>
                      <div class="row-meta">
                        <code>{{ p.codigo }}</code>
                        <span>Stock actual: {{ p.stock }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>
            </div>

            <template v-if="productoActual">
              <div class="producto-banner">
                <div class="banner-icon"><i class="fas fa-box"></i></div>
                <div class="banner-body">
                  <div class="banner-name">{{ productoActual.nombre }}</div>
                  <div class="banner-meta">
                    <span><strong>Código:</strong> {{ productoActual.codigo }}</span>
                    <span><strong>Stock actual:</strong> {{ formatCantidad(productoActual.stock) }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="banner-change"
                  @click="limpiarProducto"
                  :disabled="cargando"
                  aria-label="Cambiar producto"
                >
                  <i class="fas fa-exchange-alt"></i>
                </button>
              </div>
            </template>

            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label" for="ajuste-tipo">
                  <span class="required">*</span> Tipo de ajuste
                </label>
                <select
                  id="ajuste-tipo"
                  class="form-input"
                  v-model="ajuste.tipo"
                  :disabled="cargando || !productoActual"
                >
                  <option value="">Seleccionar...</option>
                  <option value="sumar">Sumar (ingreso)</option>
                  <option value="restar">Restar (salida)</option>
                  <option value="corregir">Corregir (asignar valor exacto)</option>
                </select>
                <small class="form-hint">{{ hintTipo }}</small>
              </div>

              <div class="form-field">
                <label class="form-label" for="ajuste-cantidad">
                  <span class="required">*</span>
                  {{ ajuste.tipo === 'corregir' ? 'Nuevo stock' : 'Cantidad' }}
                </label>
                <input
                  id="ajuste-cantidad"
                  type="number"
                  class="form-input"
                  v-model.number="ajuste.cantidad"
                  min="0"
                  step="0.01"
                  :disabled="cargando || !productoActual"
                />
                <small v-if="ajuste.tipo" class="form-hint">
                  Stock resultante: <strong>{{ stockResultante }}</strong>
                </small>
              </div>
            </div>

            <div class="form-field form-field-full">
              <label class="form-label" for="ajuste-motivo">
                Motivo del ajuste
              </label>
              <textarea
                id="ajuste-motivo"
                class="form-input"
                v-model="ajuste.motivo"
                rows="3"
                maxlength="500"
                placeholder="Ej: Producto dañado, error de conteo, merma, donación..."
                :disabled="cargando"
              ></textarea>
              <small class="form-hint">
                {{ (ajuste.motivo || '').length }} / 500 caracteres
              </small>
            </div>

            <transition name="fade">
              <div v-if="errorMensaje" class="error-banner">
                <i class="fas fa-exclamation-circle"></i>
                <span>{{ errorMensaje }}</span>
              </div>
            </transition>

            <div class="form-actions">
              <button
                type="button"
                class="btn-secondary"
                @click="resetForm"
                :disabled="cargando"
              >
                <i class="fas fa-times"></i> Cancelar
              </button>
              <button
                type="submit"
                class="btn-primary"
                :disabled="cargando || !formularioValido"
              >
                <i class="fas fa-save" :class="{ 'fa-spin': cargando }"></i>
                {{ cargando ? 'Aplicando...' : 'Aplicar ajuste' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- HISTORIAL -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-history me-2"></i>
        Historial de ajustes recientes
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:160px;">Fecha</th>
                <th>Producto</th>
                <th style="width:130px;">Tipo</th>
                <th style="width:110px;" class="text-end">Cantidad</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="historial.length === 0">
                <td colspan="5" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <div class="empty-title">No hay ajustes registrados</div>
                    <div class="empty-text">
                      Los ajustes que realices aparecerán aquí
                    </div>
                  </div>
                </td>
              </tr>
              <tr v-else v-for="adj in historial" :key="adj._id">
                <td class="small">{{ formatFecha(adj.fecha) }}</td>
                <td>
                  <div class="prod-nombre">{{ adj.productoNombre || '—' }}</div>
                </td>
                <td>
                  <span class="badge-tipo-ajuste" :class="`tipo-${adj.tipo}`">
                    <i :class="iconoTipo(adj.tipo)"></i>
                    {{ etiquetaTipo(adj.tipo) }}
                  </span>
                </td>
                <td class="text-end">
                  <span class="cantidad-num">{{ formatCantidad(adj.cantidad) }}</span>
                </td>
                <td>
                  <div class="motivo-text" :title="adj.motivo">{{ adj.motivo || '—' }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { roundTo2 } from '../../utils/formatters'

const toast = useToast()

// ===== STATE =====
const productos = ref([])
const historial = ref([])
const loading = ref(false)
const cargando = ref(false)
const errorMensaje = ref('')

const busquedaProducto = ref('')
const mostrarLista = ref(false)
const productoSeleccionadoId = ref('')

const ajuste = ref({
  tipo: '',
  cantidad: 0,
  motivo: ''
})

let unmounted = false

// ===== COMPUTED =====
const productosFiltrados = computed(() => {
  const q = String(busquedaProducto.value || '').trim().toLowerCase()
  if (!q) return productos.value.slice(0, 20)
  return productos.value
    .filter(p => {
      const nombre = String(p.nombre || '').toLowerCase()
      const codigo = String(p.codigo || '').toLowerCase()
      return nombre.includes(q) || codigo.includes(q)
    })
    .slice(0, 20)
})

const productoActual = computed(() =>
  productos.value.find(p => p._id === productoSeleccionadoId.value) || null
)

const stockResultante = computed(() => {
  if (!productoActual.value) return 0
  const actual = Number(productoActual.value.stock) || 0
  const cant = Number(ajuste.value.cantidad) || 0
  if (ajuste.value.tipo === 'sumar') return roundTo2(actual + cant)
  if (ajuste.value.tipo === 'restar') return roundTo2(Math.max(0, actual - cant))
  if (ajuste.value.tipo === 'corregir') return roundTo2(cant)
  return actual
})

const formularioValido = computed(() => {
  if (!productoSeleccionadoId.value) return false
  if (!ajuste.value.tipo) return false
  const cant = Number(ajuste.value.cantidad)
  if (!Number.isFinite(cant) || cant < 0) return false
  if (ajuste.value.tipo === 'restar' && cant > (Number(productoActual.value?.stock) || 0)) return false
  return true
})

const hintTipo = computed(() => {
  if (ajuste.value.tipo === 'sumar') return 'Añade unidades al stock'
  if (ajuste.value.tipo === 'restar') return 'Resta unidades del stock (no puede quedar negativo)'
  if (ajuste.value.tipo === 'corregir') return 'Establece un valor exacto de stock'
  return 'Selecciona el tipo de ajuste'
})

// ===== HELPERS =====
const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

const iconoTipo = (tipo) => {
  if (tipo === 'sumar') return 'fas fa-arrow-up'
  if (tipo === 'restar') return 'fas fa-arrow-down'
  return 'fas fa-equals'
}

const etiquetaTipo = (tipo) => {
  if (tipo === 'sumar') return 'Sumar'
  if (tipo === 'restar') return 'Restar'
  if (tipo === 'corregir') return 'Corregir'
  return tipo || '—'
}

// ===== ACCIONES =====
const cerrarLista = () => {
  setTimeout(() => { mostrarLista.value = false }, 200)
}

const seleccionarProducto = (p) => {
  productoSeleccionadoId.value = p._id
  busquedaProducto.value = ''
  mostrarLista.value = false
  errorMensaje.value = ''
}

const limpiarProducto = () => {
  productoSeleccionadoId.value = ''
  busquedaProducto.value = ''
  ajuste.value = { tipo: '', cantidad: 0, motivo: '' }
  errorMensaje.value = ''
}

const resetForm = () => {
  ajuste.value = { tipo: '', cantidad: 0, motivo: '' }
  errorMensaje.value = ''
}

// ===== CARGAR =====
const cargarProductos = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/productos?limit=5000&sortBy=nombre&sortDir=asc', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return
    productos.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar productos: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== APLICAR AJUSTE =====
const aplicarAjuste = async () => {
  errorMensaje.value = ''
  if (!formularioValido.value) {
    errorMensaje.value = 'Completa los campos obligatorios correctamente'
    return
  }
  if (cargando.value) return

  cargando.value = true
  try {
    // ⚠️ Endpoint a implementar en el backend:
    //   POST /api/inventario/ajustar
    //   Body: { productoId, tipo, cantidad, motivo }
    //   El backend debe actualizar stock + registrar movimiento en kardex
    const res = await api.request('/inventario/ajustar', {
      method: 'POST',
      body: JSON.stringify({
        productoId: productoSeleccionadoId.value,
        tipo: ajuste.value.tipo,
        cantidad: Number(ajuste.value.cantidad) || 0,
        motivo: String(ajuste.value.motivo || '').trim()
      }),
      loaderMessage: 'Aplicando ajuste...'
    })
    if (unmounted) return

    toast.success('Ajuste aplicado correctamente')

    // Refrescar producto (in-place)
    const idx = productos.value.findIndex(p => p._id === productoSeleccionadoId.value)
    if (idx !== -1 && res?.producto) {
      productos.value[idx] = { ...productos.value[idx], ...res.producto }
    } else {
      // Fallback: recargar
      await cargarProductos()
    }

    // Agregar al historial
    if (res?.ajuste) {
      historial.value.unshift(res.ajuste)
    }

    resetForm()
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'RUTA_NO_ENCONTRADA' || e?.status === 404) {
      errorMensaje.value =
        'El endpoint POST /api/inventario/ajustar no está disponible. ' +
        'Contacta al administrador para habilitarlo.'
      toast.error('Endpoint no disponible en el backend')
    } else if (codigo === 'STOCK_INSUFICIENTE') {
      errorMensaje.value = e.message || 'No hay stock suficiente para restar'
      toast.error('Stock insuficiente')
    } else if (codigo === 'PRODUCTO_NOT_FOUND') {
      errorMensaje.value = 'El producto no existe'
      toast.error('El producto no existe')
    } else if (codigo === 'VALIDACION') {
      errorMensaje.value = e.message || 'Datos inválidos'
      toast.error(e.message || 'Datos inválidos')
    } else {
      errorMensaje.value = 'Error al aplicar ajuste: ' + e.message
      toast.error('Error: ' + e.message)
    }
  } finally {
    if (!unmounted) cargando.value = false
  }
}

// ===== LIFECYCLE =====
onMounted(cargarProductos)
onBeforeUnmount(() => { unmounted = true })
</script>

<style scoped>
.ajustes-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  letter-spacing: -0.03em;
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
.title-icon-orange {
  background: linear-gradient(135deg, #f39c12, #d68910);
  box-shadow: 0 6px 16px rgba(243,156,18,0.3);
}
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }

/* INFO */
.info-card {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  border-radius: var(--radius-lg);
  border-left: 4px solid;
}
.info-card-warning {
  background: rgba(243,156,18,0.06);
  border-color: #f39c12;
  border-top: 1px solid rgba(243,156,18,0.25);
  border-right: 1px solid rgba(243,156,18,0.25);
  border-bottom: 1px solid rgba(243,156,18,0.25);
}
.info-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(243,156,18,0.15);
  color: #f39c12;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.info-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; }
.info-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }
.info-body code {
  background: rgba(0,0,0,0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  color: #d68910;
}

/* FORM */
.form-grid { display: flex; flex-direction: column; gap: 18px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-field-full { width: 100%; }
.form-row { display: grid; gap: 16px; }
.form-row.cols-2 { grid-template-columns: 1fr 1fr; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-hint { font-size: 0.72rem; color: var(--text-muted); }

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-fast);
}
.form-input:focus {
  border-color: #f39c12;
  box-shadow: 0 0 0 4px rgba(243,156,18,0.15);
  background: var(--bg-card);
}
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }

/* SEARCH */
.search-wrapper { position: relative; }
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
}
.search-wrapper .form-input { padding-left: 40px; }

.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 40px rgba(0,0,0,0.15);
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
}
.dropdown-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.dropdown-row:hover { background: var(--bg-table-stripe); }
.row-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.row-content { flex: 1; min-width: 0; }
.row-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-meta { display: flex; gap: 10px; font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
.row-meta code {
  background: var(--bg-table-stripe);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
}

/* PRODUCTO BANNER */
.producto-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: linear-gradient(135deg, rgba(243,156,18,0.06), rgba(243,156,18,0.02));
  border: 1px solid rgba(243,156,18,0.25);
  border-left: 4px solid #f39c12;
  border-radius: var(--radius-md);
}
.banner-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(243,156,18,0.3);
}
.banner-body { flex: 1; min-width: 0; }
.banner-name { font-weight: 700; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 4px; }
.banner-meta { display: flex; gap: 16px; font-size: 0.78rem; color: var(--text-secondary); flex-wrap: wrap; }
.banner-meta strong { color: var(--text-muted); font-weight: 600; margin-right: 4px; }
.banner-change {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.banner-change:hover:not(:disabled) {
  border-color: #f39c12;
  color: #f39c12;
  background: rgba(243,156,18,0.08);
}

/* FORM ACTIONS */
.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}
.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: none;
}
.btn-primary {
  background: linear-gradient(135deg, #f39c12, #d68910);
  color: #fff;
  box-shadow: 0 4px 12px rgba(243,156,18,0.3);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(243,156,18,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  color: var(--text-secondary);
}
.btn-secondary:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* ERROR */
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

/* TABLA */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th {
  padding: 14px 12px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}
.table-modern td {
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.prod-nombre {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-tipo-ajuste {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.tipo-sumar { background: var(--success-bg); color: var(--success); }
.tipo-restar { background: var(--danger-bg); color: var(--danger); }
.tipo-corregir { background: rgba(243,156,18,0.15); color: #d68910; }
.cantidad-num {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.motivo-text {
  color: var(--text-secondary);
  font-size: 0.82rem;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* EMPTY */
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center;
  padding: 50px 20px;
  color: var(--text-muted);
}
.empty-state i { font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 12px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; }

/* TRANSITIONS */
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .form-row.cols-2 { grid-template-columns: 1fr; }
  .form-actions { flex-direction: column-reverse; }
  .form-actions button { width: 100%; justify-content: center; }
}
</style>