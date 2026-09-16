<template>
  <div class="widget-container">
    <!-- TOOLBAR -->
    <div class="widget-toolbar">
      <div class="toolbar-info">
        <i class="fas fa-th-large"></i>
        <span>Panel personalizado</span>
      </div>
      <div class="toolbar-actions">
        <button
          type="button"
          class="btn-toolbar"
          :class="editMode ? 'btn-toolbar-success' : 'btn-toolbar-primary'"
          @click="toggleEditMode"
          :aria-label="editMode ? 'Guardar layout' : 'Editar widgets'"
        >
          <i :class="editMode ? 'fas fa-check' : 'fas fa-edit'"></i>
          <span>{{ editMode ? 'Guardar layout' : 'Editar widgets' }}</span>
        </button>
        <button
          v-if="editMode"
          type="button"
          class="btn-toolbar btn-toolbar-danger"
          @click="pedirResetLayout"
          aria-label="Restablecer layout por defecto"
        >
          <i class="fas fa-undo"></i>
          <span>Restablecer</span>
        </button>
      </div>
    </div>

    <!-- GRID -->
    <draggable
      v-model="widgets"
      group="widgets"
      class="widget-grid"
      :disabled="!editMode"
      item-key="id"
      :animation="200"
      ghost-class="widget-ghost"
      drag-class="widget-drag"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div
          class="widget-item"
          :class="[element.size, { 'is-editing': editMode }]"
        >
          <!-- HEADER solo en modo edición -->
          <div v-if="editMode" class="widget-header">
            <span class="drag-handle" title="Arrastrar">
              <i class="fas fa-grip-vertical"></i>
            </span>
            <span class="widget-title">{{ element.title }}</span>
            <button
              type="button"
              class="btn-remove-widget"
              @click="pedirRemoveWidget(element)"
              :aria-label="`Eliminar widget ${element.title}`"
              :title="`Eliminar ${element.title}`"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- BODY -->
          <div class="widget-body">
            <component
              :is="getComponent(element.component)"
              v-if="getComponent(element.component)"
              v-bind="element.props || {}"
            />
            <div v-else class="widget-error">
              <i class="fas fa-exclamation-triangle"></i>
              <span>Widget no disponible: {{ element.component }}</span>
            </div>
          </div>
        </div>
      </template>
    </draggable>

    <!-- EMPTY STATE -->
    <div v-if="widgets.length === 0" class="widgets-empty">
      <div class="empty-icon"><i class="fas fa-th-large"></i></div>
      <div class="empty-title">No hay widgets en el panel</div>
      <div class="empty-text">
        {{ editMode ? 'Agrega widgets desde el panel inferior' : 'Activa el modo edición para agregar widgets' }}
      </div>
      <button
        v-if="!editMode"
        type="button"
        class="btn-empty-action"
        @click="editMode = true"
      >
        <i class="fas fa-edit"></i> Editar widgets
      </button>
    </div>

    <!-- PALETTE -->
    <transition name="slide-up">
      <div v-if="editMode" class="widget-palette">
        <div class="palette-header">
          <i class="fas fa-plus-circle"></i>
          <span>Agregar widget al panel</span>
        </div>
        <div class="palette-items">
          <button
            v-for="w in availableWidgets"
            :key="w.id"
            type="button"
            class="palette-btn"
            :class="{ 'palette-btn-added': isWidgetAdded(w.id) }"
            :disabled="isWidgetAdded(w.id)"
            @click="addWidget(w)"
          >
            <i :class="w.icon"></i>
            <span>{{ w.label }}</span>
            <i v-if="isWidgetAdded(w.id)" class="fas fa-check palette-check"></i>
          </button>
        </div>
        <div class="palette-hint">
          <i class="fas fa-info-circle"></i>
          Arrastra los widgets desde el ícono <i class="fas fa-grip-vertical"></i> para reordenarlos
        </div>
      </div>
    </transition>

    <!-- MODAL CONFIRMACIÓN -->
    <div
      class="modal fade"
      id="modalConfirmWidget"
      tabindex="-1"
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modal-content-clean">
          <div class="modal-header" :class="`bg-${confirmState.variante}`">
            <h5 class="modal-title text-white">
              <i :class="confirmState.icono" class="me-2"></i>
              {{ confirmState.titulo }}
            </h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              @click="cancelarConfirm"
              aria-label="Cerrar"
            ></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">{{ confirmState.mensaje }}</p>
            <div v-if="confirmState.detalle" class="alert alert-warning small mb-0">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <span>{{ confirmState.detalle }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="cancelarConfirm">
              {{ confirmState.textoCancelar }}
            </button>
            <button
              type="button"
              class="btn"
              :class="`btn-${confirmState.variante}`"
              @click="aceptarConfirm"
            >
              {{ confirmState.textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import draggable from 'vuedraggable'
import { Modal } from 'bootstrap'
import { useToast } from 'vue-toastification'

// Widgets
import StatsWidget from './widgets/StatsWidget.vue'
import VentasChartWidget from './widgets/VentasChartWidget.vue'
import ComprasChartWidget from './widgets/ComprasChartWidget.vue'
import TopProductosWidget from './widgets/TopProductosWidget.vue'
import ActividadRecienteWidget from './widgets/ActividadRecienteWidget.vue'
import BandejaVentasWidget from './widgets/BandejaVentasWidget.vue'
import BandejaComprasWidget from './widgets/BandejaComprasWidget.vue'

// ===== CONSTANTES =====
const STORAGE_KEY = 'dashboard_layout_v2'
const STORAGE_VERSION = 2

// ===== PROPS =====
const props = defineProps({
  initialWidgets: {
    type: Array,
    default: () => []
  }
})

// ===== MAPA DE COMPONENTES =====
const componentMap = Object.freeze({
  StatsWidget,
  VentasChartWidget,
  ComprasChartWidget,
  TopProductosWidget,
  ActividadRecienteWidget,
  BandejaVentasWidget,
  BandejaComprasWidget
})

const getComponent = (name) => componentMap[name] || null

// ===== CATÁLOGO DE WIDGETS DISPONIBLES =====
const availableWidgets = Object.freeze([
  { id: 'stats',              label: 'Estadísticas',       icon: 'fas fa-chart-pie',   component: 'StatsWidget',              size: 'col-12 col-md-6' },
  { id: 'ventas-chart',       label: 'Gráfico Ventas',     icon: 'fas fa-chart-line',  component: 'VentasChartWidget',        size: 'col-12 col-md-6' },
  { id: 'compras-chart',      label: 'Gráfico Compras',    icon: 'fas fa-chart-bar',   component: 'ComprasChartWidget',       size: 'col-12 col-md-6' },
  { id: 'top-productos',      label: 'Top Productos',      icon: 'fas fa-star',        component: 'TopProductosWidget',       size: 'col-12 col-md-6' },
  { id: 'actividad-reciente', label: 'Actividad Reciente', icon: 'fas fa-clock',       component: 'ActividadRecienteWidget',  size: 'col-12 col-md-6' },
  { id: 'bandeja-ventas',     label: 'Bandeja Ventas',     icon: 'fas fa-file-invoice',component: 'BandejaVentasWidget',      size: 'col-12 col-md-6' },
  { id: 'bandeja-compras',    label: 'Bandeja Compras',    icon: 'fas fa-shopping-cart',component: 'BandejaComprasWidget',    size: 'col-12 col-md-6' }
])

// ===== STATE =====
const toast = useToast()
const widgets = ref([])
const editMode = ref(false)

// Modales
let modalConfirm = null
let unmounted = false

// Confirm state
const confirmState = reactive({
  titulo: '',
  mensaje: '',
  detalle: '',
  textoConfirmar: 'Confirmar',
  textoCancelar: 'Cancelar',
  variante: 'primary',
  icono: 'fas fa-question-circle',
  resolve: null
})

// ===== HELPERS =====
const construirWidget = (def) => ({
  id: def.id,
  title: def.label,
  component: def.component,
  size: def.size,
  props: {}
})

const isWidgetAdded = (id) => widgets.value.some(w => w.id === id)

// ===== CONFIRMACIÓN =====
const pedirConfirmacion = (opts = {}) => {
  return new Promise((resolve) => {
    confirmState.titulo = opts.titulo || 'Confirmar acción'
    confirmState.mensaje = opts.mensaje || '¿Estás seguro?'
    confirmState.detalle = opts.detalle || ''
    confirmState.textoConfirmar = opts.textoConfirmar || 'Confirmar'
    confirmState.textoCancelar = opts.textoCancelar || 'Cancelar'
    confirmState.variante = opts.variante || 'primary'
    confirmState.icono = opts.icono || 'fas fa-question-circle'
    confirmState.resolve = resolve

    if (!modalConfirm) {
      modalConfirm = new Modal(document.getElementById('modalConfirmWidget'), {
        backdrop: 'static'
      })
    }
    modalConfirm.show()
  })
}

const aceptarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(true)
}

const cancelarConfirm = () => {
  const r = confirmState.resolve
  confirmState.resolve = null
  modalConfirm?.hide()
  if (r) r(false)
}

// ===== PERSISTENCIA =====
const validarLayoutGuardado = (data) => {
  if (!data || typeof data !== 'object') return null
  if (!Array.isArray(data.widgets)) return null
  if (data.version !== STORAGE_VERSION) return null

  // Filtrar widgets inválidos (componentes desconocidos)
  const widgetsValidos = data.widgets
    .filter(w => w && typeof w.id === 'string' && componentMap[w.component])
    .map(w => ({
      id: w.id,
      title: String(w.title || 'Widget'),
      component: w.component,
      size: typeof w.size === 'string' ? w.size : 'col-12 col-md-6',
      props: (w.props && typeof w.props === 'object') ? w.props : {}
    }))

  return widgetsValidos
}

const loadLayout = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const validado = validarLayoutGuardado(parsed)
      if (validado) {
        widgets.value = validado
        return
      }
      // Layout viejo o corrupto → eliminar
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // JSON corrupto
    localStorage.removeItem(STORAGE_KEY)
  }

  // Fallback: props.initialWidgets o el catálogo completo
  if (Array.isArray(props.initialWidgets) && props.initialWidgets.length > 0) {
    widgets.value = props.initialWidgets
      .filter(w => w && componentMap[w.component])
      .map(w => ({
        id: w.id,
        title: w.title || 'Widget',
        component: w.component,
        size: w.size || 'col-12 col-md-6',
        props: w.props || {}
      }))
  } else {
    // Layout por defecto: solo los 5 widgets principales
    const porDefecto = ['stats', 'ventas-chart', 'compras-chart', 'top-productos', 'actividad-reciente']
    widgets.value = availableWidgets
      .filter(w => porDefecto.includes(w.id))
      .map(construirWidget)
  }
}

const saveLayout = () => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, widgets: widgets.value })
    )
  } catch (e) {
    console.warn('[WidgetContainer] No se pudo guardar el layout:', e)
  }
}

// ===== EDICIÓN =====
const toggleEditMode = () => {
  editMode.value = !editMode.value
  if (!editMode.value) {
    saveLayout()
    toast.success('Layout guardado')
  }
}

const onDragEnd = () => {
  // Guardado silencioso tras cada reordenamiento
  if (editMode.value) saveLayout()
}

// ===== RESET =====
const pedirResetLayout = async () => {
  const confirmado = await pedirConfirmacion({
    titulo: 'Restablecer layout',
    mensaje: '¿Restablecer el layout predeterminado?',
    detalle: 'Se perderán los cambios personalizados del panel.',
    textoConfirmar: 'Restablecer',
    textoCancelar: 'Cancelar',
    variante: 'warning',
    icono: 'fas fa-undo'
  })
  if (!confirmado || unmounted) return

  const porDefecto = ['stats', 'ventas-chart', 'compras-chart', 'top-productos', 'actividad-reciente']
  widgets.value = availableWidgets
    .filter(w => porDefecto.includes(w.id))
    .map(construirWidget)
  saveLayout()
  toast.success('Layout restablecido')
}

// ===== AGREGAR =====
const addWidget = (widget) => {
  if (isWidgetAdded(widget.id)) {
    toast.info('Este widget ya está agregado')
    return
  }
  widgets.value.push(construirWidget(widget))
  saveLayout()
  toast.success(`Widget "${widget.label}" agregado`)
}

// ===== ELIMINAR =====
const pedirRemoveWidget = async (widget) => {
  const confirmado = await pedirConfirmacion({
    titulo: 'Quitar widget',
    mensaje: `¿Quitar el widget "${widget.title}" del panel?`,
    detalle: 'Podrás volver a agregarlo desde la paleta inferior.',
    textoConfirmar: 'Quitar',
    textoCancelar: 'Cancelar',
    variante: 'danger',
    icono: 'fas fa-trash'
  })
  if (!confirmado || unmounted) return

  widgets.value = widgets.value.filter(w => w.id !== widget.id)
  saveLayout()
  toast.success('Widget eliminado')
}

// ===== LIFECYCLE =====
onMounted(loadLayout)

onBeforeUnmount(() => {
  unmounted = true
  try { modalConfirm?.hide() } catch { /* noop */ }
  if (confirmState.resolve) {
    confirmState.resolve(false)
    confirmState.resolve = null
  }
})
</script>

<style scoped>
.widget-container { padding: 10px 0; }

/* TOOLBAR */
.widget-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}
.toolbar-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}
.toolbar-info i { color: var(--primary-color); font-size: 1rem; }
.toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.btn-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  border: 1.5px solid;
}
.btn-toolbar-primary {
  background: var(--bg-card);
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.btn-toolbar-primary:hover { border-color: var(--primary-color); color: var(--primary-color); }
.btn-toolbar-success {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  border-color: #27ae60;
  color: #fff;
  box-shadow: 0 4px 12px rgba(39,174,96,0.3);
}
.btn-toolbar-success:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(39,174,96,0.4); }
.btn-toolbar-danger {
  background: transparent;
  border-color: #e74c3c;
  color: #e74c3c;
}
.btn-toolbar-danger:hover { background: #e74c3c; color: #fff; }

/* GRID */
.widget-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -8px;
  min-height: 100px;
}
.widget-item {
  padding: 8px;
  transition: transform var(--transition-fast);
}
.widget-item.is-editing {
  cursor: grab;
}
.widget-item.is-editing:active {
  cursor: grabbing;
}
.widget-ghost {
  opacity: 0.4;
  background: var(--bg-table-stripe);
  border-radius: var(--radius-lg);
}
.widget-drag {
  transform: rotate(1deg) scale(1.02);
  box-shadow: 0 12px 32px rgba(0,0,0,0.2);
  opacity: 0.95;
}

/* HEADER (solo en modo edición) */
.widget-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: linear-gradient(135deg, var(--bg-table-stripe), var(--bg-card));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  border: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-light);
}
.drag-handle {
  color: var(--text-muted);
  cursor: grab;
  padding: 4px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}
.drag-handle:hover { color: var(--primary-color); background: rgba(52,152,219,0.1); }
.drag-handle:active { cursor: grabbing; }
.widget-title {
  flex: 1;
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-remove-widget {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(231,76,60,0.12);
  color: #e74c3c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  transition: all var(--transition-fast);
}
.btn-remove-widget:hover {
  background: #e74c3c;
  color: #fff;
}

/* BODY */
.widget-body {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 14px;
  box-shadow: var(--shadow-sm);
  min-height: 200px;
  transition: box-shadow var(--transition);
}
.widget-item.is-editing .widget-body {
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  border-top: none;
}

.widget-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--danger);
  font-size: 0.82rem;
  text-align: center;
}
.widget-error i { font-size: 1.8rem; opacity: 0.5; }

/* EMPTY STATE */
.widgets-empty {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-card);
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
}
.empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-table-stripe);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1.8rem;
  margin: 0 auto 14px;
}
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 4px;
}
.empty-text {
  font-size: 0.85rem;
  margin-bottom: 16px;
}
.btn-empty-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.btn-empty-action:hover { transform: translateY(-2px); box-shadow: 0 6px 16px var(--shadow-focus); }

/* PALETTE */
.widget-palette {
  margin-top: 20px;
  padding: 18px 20px;
  background: linear-gradient(135deg, rgba(52,152,219,0.05), rgba(155,89,182,0.03));
  border: 2px dashed rgba(52,152,219,0.3);
  border-radius: var(--radius-lg);
}
.palette-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 14px;
}
.palette-header i { color: var(--primary-color); }
.palette-items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.palette-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  position: relative;
}
.palette-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: rgba(52,152,219,0.05);
  transform: translateY(-1px);
}
.palette-btn:disabled,
.palette-btn-added {
  opacity: 0.55;
  cursor: not-allowed;
  border-color: var(--success);
  color: var(--success);
  background: var(--success-bg);
}
.palette-check {
  color: var(--success);
  font-size: 0.85rem;
}
.palette-hint {
  margin-top: 14px;
  font-size: 0.75rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.palette-hint i { color: var(--primary-color); }

/* TRANSITIONS */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* MODAL */
.modal-content-clean { border-radius: 14px; overflow: hidden; border: none; }

/* COLUMNAS */
.col-12 { width: 100%; }
.col-md-6 { width: 50%; }

@media (max-width: 768px) {
  .col-md-6 { width: 100%; }
  .widget-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-actions {
    justify-content: stretch;
  }
  .btn-toolbar {
    flex: 1;
    justify-content: center;
  }
}
</style>