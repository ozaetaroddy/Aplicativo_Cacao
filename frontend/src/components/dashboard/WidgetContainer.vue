<template>
  <div class="widget-container">
    <div class="widget-toolbar">
      <button class="btn btn-sm btn-outline-secondary" @click="toggleEditMode">
        <i :class="editMode ? 'fas fa-check' : 'fas fa-edit'"></i>
        {{ editMode ? 'Guardar layout' : 'Editar widgets' }}
      </button>
      <button v-if="editMode" class="btn btn-sm btn-outline-danger" @click="resetLayout">
        <i class="fas fa-undo"></i> Restablecer
      </button>
    </div>
    <draggable
      v-model="widgets"
      group="widgets"
      class="widget-grid"
      :disabled="!editMode"
      item-key="id"
      @end="saveLayout"
    >
      <template #item="{ element }">
        <div class="widget-item" :class="element.size">
          <div class="widget-header" v-if="editMode">
            <span class="drag-handle"><i class="fas fa-grip-lines"></i></span>
            <span class="widget-title">{{ element.title }}</span>
            <button class="btn-close btn-sm" @click="removeWidget(element.id)"></button>
          </div>
          <div class="widget-body">
            <component :is="element.component" v-bind="element.props" />
          </div>
        </div>
      </template>
    </draggable>
    <div v-if="editMode" class="widget-palette">
      <h6>Agregar widget</h6>
      <div class="palette-items">
        <button v-for="w in availableWidgets" :key="w.id" class="btn btn-sm btn-outline-primary" @click="addWidget(w)">
          <i :class="w.icon"></i> {{ w.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, defineAsyncComponent } from 'vue'
import draggable from 'vuedraggable'

// Widgets disponibles
const availableWidgets = [
  { id: 'stats', label: 'Estadísticas', icon: 'fas fa-chart-pie', component: 'StatsWidget', size: 'col-12 col-md-6' },
  { id: 'ventas-chart', label: 'Gráfico Ventas', icon: 'fas fa-chart-line', component: 'VentasChartWidget', size: 'col-12 col-md-6' },
  { id: 'compras-chart', label: 'Gráfico Compras', icon: 'fas fa-chart-bar', component: 'ComprasChartWidget', size: 'col-12 col-md-6' },
  { id: 'top-productos', label: 'Top Productos', icon: 'fas fa-star', component: 'TopProductosWidget', size: 'col-12 col-md-6' },
  { id: 'actividad-reciente', label: 'Actividad Reciente', icon: 'fas fa-clock', component: 'ActividadRecienteWidget', size: 'col-12 col-md-6' }
]

// Mapeo de componentes (lazy loading)
const componentMap = {
  StatsWidget: defineAsyncComponent(() => import('./widgets/StatsWidget.vue')),
  VentasChartWidget: defineAsyncComponent(() => import('./widgets/VentasChartWidget.vue')),
  ComprasChartWidget: defineAsyncComponent(() => import('./widgets/ComprasChartWidget.vue')),
  TopProductosWidget: defineAsyncComponent(() => import('./widgets/TopProductosWidget.vue')),
  ActividadRecienteWidget: defineAsyncComponent(() => import('./widgets/ActividadRecienteWidget.vue'))
}

const props = defineProps({
  initialWidgets: { type: Array, default: () => [] }
})

const emit = defineEmits(['layout-changed'])

const widgets = ref([])
const editMode = ref(false)

const loadLayout = () => {
  const saved = localStorage.getItem('dashboard_layout')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      widgets.value = parsed
      return
    } catch (e) {}
  }
  // Layout por defecto
  widgets.value = props.initialWidgets.length ? props.initialWidgets : availableWidgets.map(w => ({
    id: w.id,
    title: w.label,
    component: w.component,
    size: w.size,
    props: {}
  }))
}

const saveLayout = () => {
  localStorage.setItem('dashboard_layout', JSON.stringify(widgets.value))
  emit('layout-changed', widgets.value)
}

const toggleEditMode = () => {
  editMode.value = !editMode.value
  if (!editMode.value) saveLayout()
}

const resetLayout = () => {
  if (confirm('¿Restablecer el layout predeterminado?')) {
    widgets.value = availableWidgets.map(w => ({
      id: w.id,
      title: w.label,
      component: w.component,
      size: w.size,
      props: {}
    }))
    saveLayout()
  }
}

const addWidget = (widget) => {
  const exists = widgets.value.find(w => w.id === widget.id)
  if (exists) {
    alert('Este widget ya está agregado')
    return
  }
  widgets.value.push({
    id: widget.id,
    title: widget.label,
    component: widget.component,
    size: widget.size,
    props: {}
  })
  saveLayout()
}

const removeWidget = (id) => {
  widgets.value = widgets.value.filter(w => w.id !== id)
  saveLayout()
}

onMounted(loadLayout)
</script>

<style scoped>
.widget-container {
  padding: 10px 0;
}
.widget-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.widget-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -8px;
}
.widget-item {
  padding: 8px;
  transition: all 0.2s;
}
.widget-item .widget-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
  border-bottom: 1px solid #e0e0e0;
}
.widget-item .drag-handle {
  cursor: grab;
  color: #bdc3c7;
}
.widget-item .drag-handle:active {
  cursor: grabbing;
}
.widget-item .widget-title {
  flex: 1;
  font-weight: 500;
  font-size: 0.9rem;
}
.widget-body {
  background: #fff;
  border-radius: 0 0 8px 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.col-12 { width: 100%; }
.col-6 { width: 50%; }
.col-4 { width: 33.333%; }
.col-3 { width: 25%; }
@media (max-width: 768px) {
  .col-md-6 { width: 100%; }
  .col-md-4 { width: 100%; }
  .col-md-3 { width: 100%; }
}
.widget-palette {
  margin-top: 20px;
  padding: 16px;
  border: 2px dashed #e0e0e0;
  border-radius: 12px;
}
.palette-items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
body.dark-mode .widget-body {
  background: #16213e;
}
body.dark-mode .widget-item .widget-header {
  background: #1e2a4a;
  border-bottom-color: #2d3748;
}
body.dark-mode .widget-palette {
  border-color: #2d3748;
}
</style>