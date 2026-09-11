<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Panel de Control</h4>

    <!-- ===== ACCESOS RÁPIDOS (filtrados por permisos) ===== -->
    <div v-if="accesosRapidos.length > 0" class="row g-3 mb-4">
      <div class="col-12">
        <h5 class="section-subtitle"><i class="fas fa-bolt me-2"></i>Accesos Rápidos</h5>
      </div>
      <div v-for="acceso in accesosRapidos" :key="acceso.to" class="col-md-2 col-4">
        <router-link :to="acceso.to" class="quick-access" :class="{ 'quick-access-bandeja': acceso.destacado }">
          <div class="icon-circle" :style="{ background: acceso.color }">
            <i :class="acceso.icon"></i>
          </div>
          <span>{{ acceso.label }}</span>
        </router-link>
      </div>
    </div>

    <!-- ===== ESTADÍSTICAS RÁPIDAS ===== -->
    <div v-if="puedeVerVentas || puedeVerCompras" class="row g-4 mb-4">
      <div v-if="puedeVerVentas" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #3498db;">
          <div class="stat-icon-wrapper" style="background: rgba(52,152,219,0.12);">
            <i class="fas fa-file-invoice" style="color:#3498db;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ ventasHoy.toFixed(2) }}</span>
            <span class="stat-label">Ventas Hoy</span>
          </div>
        </div>
      </div>
      <div v-if="puedeVerCompras" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #2ecc71;">
          <div class="stat-icon-wrapper" style="background: rgba(46,204,113,0.12);">
            <i class="fas fa-shopping-cart" style="color:#2ecc71;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ comprasHoy.toFixed(2) }}</span>
            <span class="stat-label">Compras Hoy</span>
          </div>
        </div>
      </div>
      <div v-if="puedeVerVentas" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #f39c12;">
          <div class="stat-icon-wrapper" style="background: rgba(243,156,18,0.12);">
            <i class="fas fa-calendar-alt" style="color:#f39c12;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ ventasMes.toFixed(2) }}</span>
            <span class="stat-label">Ventas del Mes</span>
          </div>
        </div>
      </div>
      <div v-if="puedeVerCompras" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #9b59b6;">
          <div class="stat-icon-wrapper" style="background: rgba(155,89,182,0.12);">
            <i class="fas fa-calendar-check" style="color:#9b59b6;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ comprasMes.toFixed(2) }}</span>
            <span class="stat-label">Compras del Mes</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== KPIS AVANZADOS ===== -->
    <div v-if="puedeVerVentas || puedeVerCompras" class="row g-4 mb-4">
      <div v-if="puedeVerVentas" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #3498db;">
          <div class="stat-icon-wrapper" style="background: rgba(52,152,219,0.12);">
            <i class="fas fa-credit-card" style="color:#3498db;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ totalFacturado.toFixed(2) }}</span>
            <span class="stat-label">Facturado (mes)</span>
          </div>
        </div>
      </div>
      <div v-if="puedeVerCompras" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #e74c3c;">
          <div class="stat-icon-wrapper" style="background: rgba(231,76,60,0.12);">
            <i class="fas fa-exclamation-triangle" style="color:#e74c3c;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">{{ cuentasPorPagar }}</span>
            <span class="stat-label">Cuentas por Pagar</span>
          </div>
        </div>
      </div>
      <div v-if="puedeVerInventario" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #f39c12;">
          <div class="stat-icon-wrapper" style="background: rgba(243,156,18,0.12);">
            <i class="fas fa-sync-alt" style="color:#f39c12;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">{{ rotacionInventario.toFixed(2) }}</span>
            <span class="stat-label">Rotación de Inventario</span>
          </div>
        </div>
      </div>
      <div v-if="puedeVerVentas" class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #2ecc71;">
          <div class="stat-icon-wrapper" style="background: rgba(46,204,113,0.12);">
            <i class="fas fa-percent" style="color:#2ecc71;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">{{ margenBruto.toFixed(2) }}%</span>
            <span class="stat-label">Margen Bruto</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== BANDEJAS ===== -->
    <div v-if="puedeVerVentas || puedeVerCompras" class="row g-4 mb-4">
      <div class="col-12">
        <h5 class="section-subtitle"><i class="fas fa-inbox me-2"></i>Bandejas de Trabajo</h5>
      </div>
      <div v-if="puedeVerVentas" :class="puedeVerCompras ? 'col-lg-6' : 'col-12'">
        <div class="card card-cacao h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="fas fa-hand-holding-usd me-2" style="color: #3498db;"></i> Bandeja de Ventas</span>
            <router-link to="/ventas" class="btn btn-sm btn-outline-primary">
              <i class="fas fa-list"></i> Ver todas
            </router-link>
          </div>
          <div class="card-body">
            <BandejaVentasWidget />
          </div>
        </div>
      </div>
      <div v-if="puedeVerCompras" :class="puedeVerVentas ? 'col-lg-6' : 'col-12'">
        <div class="card card-cacao h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><i class="fas fa-shopping-cart me-2" style="color: #e67e22;"></i> Bandeja de Compras</span>
            <router-link to="/compras" class="btn btn-sm btn-outline-primary">
              <i class="fas fa-list"></i> Ver todas
            </router-link>
          </div>
          <div class="card-body">
            <BandejaComprasWidget />
          </div>
        </div>
      </div>
    </div>

    <!-- ===== GRÁFICOS ===== -->
    <DashboardCharts
      v-if="puedeVerVentas || puedeVerCompras"
      :ventas-diarias="puedeVerVentas ? ventasDiarias : []"
      :compras-diarias="puedeVerCompras ? comprasDiarias : []"
      :dias="dias"
    />

    <!-- ===== WIDGETS ===== -->
    <WidgetContainer v-if="puedeVerVentas || puedeVerCompras" :initial-widgets="defaultWidgets" />

    <!-- ===== EXPORTAR / IMPORTAR (solo admin) ===== -->
    <div v-if="puedeExportar" class="row g-4 mt-2">
      <div class="col-12">
        <div class="card card-cacao">
          <div class="card-header">
            <i class="fas fa-file-export me-2"></i> Exportar / Importar Datos
          </div>
          <div class="card-body">
            <ExportImport />
          </div>
        </div>
      </div>
    </div>

    <!-- Si no tiene ningún permiso -->
    <div v-if="accesosRapidos.length === 0" class="card card-cacao">
      <div class="card-body text-center py-5">
        <i class="fas fa-lock fa-3x text-muted mb-3"></i>
        <h5>Bienvenido al sistema</h5>
        <p class="text-muted">Su rol actual no tiene acceso a módulos específicos. Contacte al administrador.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { useEstadisticas } from '../composables/useEstadisticas'
import { usePermisos } from '../composables/usePermisos'
import DashboardCharts from './dashboard/DashboardCharts.vue'
import WidgetContainer from './dashboard/WidgetContainer.vue'
import ExportImport from './ExportImport.vue'
import BandejaVentasWidget from './dashboard/widgets/BandejaVentasWidget.vue'
import BandejaComprasWidget from './dashboard/widgets/BandejaComprasWidget.vue'

const { find } = useMongoDB()
const { puede } = usePermisos()
const {
  ventasHoy,
  ventasMes,
  comprasHoy,
  comprasMes,
  ventasDiarias,
  comprasDiarias,
  dias,
  cargarEstadisticas
} = useEstadisticas()

// Permisos
const puedeVerVentas = computed(() => puede('ventas', 'ver'))
const puedeCrearVentas = computed(() => puede('ventas', 'crear'))
const puedeVerCompras = computed(() => puede('compras', 'ver'))
const puedeCrearCompras = computed(() => puede('compras', 'crear'))
const puedeVerClientes = computed(() => puede('clientes', 'ver'))
const puedeVerProveedores = computed(() => puede('proveedores', 'ver'))
const puedeVerProductos = computed(() => puede('productos', 'ver'))
const puedeVerInventario = computed(() => puede('inventario', 'ver'))
const puedeVerKardex = computed(() => puede('kardex', 'ver'))
const puedeVerReportes = computed(() => puede('reportes', 'ver'))
const puedeVerRetenciones = computed(() => puede('retenciones', 'ver'))
const puedeExportar = computed(() => puede('usuarios', 'ver'))

// ===== ACCESOS RÁPIDOS (filtrados por permisos) =====
const accesosRapidos = computed(() => {
  const accesos = []

  if (puedeCrearVentas.value) {
    accesos.push({
      label: 'Factura',
      icon: 'fas fa-file-invoice',
      color: '#3498db',
      to: '/ventas/nuevo?tipo=factura'
    })
    accesos.push({
      label: 'Guía Remisión',
      icon: 'fas fa-truck',
      color: '#2ecc71',
      to: '/ventas/nuevo?tipo=guia_remision'
    })
    accesos.push({
      label: 'Nota Crédito',
      icon: 'fas fa-undo-alt',
      color: '#e67e22',
      to: '/ventas/nuevo?tipo=nota_credito'
    })
  }

  if (puedeCrearCompras.value) {
    accesos.push({
      label: 'Nueva Compra',
      icon: 'fas fa-cart-plus',
      color: '#27ae60',
      to: '/compras/nuevo'
    })
  }

  if (puedeVerVentas.value) {
    accesos.push({
      label: 'Bandeja Ventas',
      icon: 'fas fa-hand-holding-usd',
      color: 'linear-gradient(135deg, #3498db, #2980b9)',
      to: '/ventas',
      destacado: true
    })
  }

  if (puedeVerCompras.value) {
    accesos.push({
      label: 'Bandeja Compras',
      icon: 'fas fa-inbox',
      color: 'linear-gradient(135deg, #e67e22, #d35400)',
      to: '/compras',
      destacado: true
    })
  }

  if (puede('clientes', 'crear')) {
    accesos.push({
      label: 'Cliente',
      icon: 'fas fa-user-plus',
      color: '#8e44ad',
      to: '/clientes/nuevo'
    })
  }

  if (puede('proveedores', 'crear')) {
    accesos.push({
      label: 'Proveedor',
      icon: 'fas fa-truck-loading',
      color: '#2c3e50',
      to: '/proveedores/nuevo'
    })
  }

  if (puede('productos', 'crear')) {
    accesos.push({
      label: 'Producto',
      icon: 'fas fa-box',
      color: '#f1c40f',
      to: '/productos/nuevo'
    })
  }

  if (puedeVerVentas.value || puedeVerCompras.value) {
    accesos.push({
      label: 'Consultar Docs',
      icon: 'fas fa-search',
      color: '#2980b9',
      to: '/consultar-documentos'
    })
  }

  if (puedeVerKardex.value) {
    accesos.push({
      label: 'Kardex',
      icon: 'fas fa-clipboard-list',
      color: '#1abc9c',
      to: '/kardex'
    })
  }

  if (puedeVerInventario.value) {
    accesos.push({
      label: 'Stock Actual',
      icon: 'fas fa-boxes',
      color: '#16a085',
      to: '/inventario/stock'
    })
  }

  if (puedeVerReportes.value) {
    accesos.push({
      label: 'Reporte Ventas',
      icon: 'fas fa-chart-line',
      color: '#e74c3c',
      to: '/reportes/ventas'
    })
    accesos.push({
      label: 'Reporte Compras',
      icon: 'fas fa-chart-bar',
      color: '#d35400',
      to: '/reportes/compras'
    })
  }

  if (puedeVerRetenciones.value) {
    accesos.push({
      label: 'Retenciones',
      icon: 'fas fa-percent',
      color: '#9b59b6',
      to: '/retenciones'
    })
  }

  return accesos
})

// ===== KPIS =====
const totalFacturado = ref(0)
const cuentasPorPagar = ref(0)
const rotacionInventario = ref(0)
const margenBruto = ref(0)

const defaultWidgets = [
  { id: 'stats', title: 'Estadísticas', component: 'StatsWidget', size: 'col-12 col-md-6', props: {} },
  { id: 'ventas-chart', title: 'Ventas (7 días)', component: 'VentasChartWidget', size: 'col-12 col-md-6', props: {} },
  { id: 'compras-chart', title: 'Compras (7 días)', component: 'ComprasChartWidget', size: 'col-12 col-md-6', props: {} },
  { id: 'top-productos', title: 'Top Productos', component: 'TopProductosWidget', size: 'col-12 col-md-6', props: {} },
  { id: 'actividad-reciente', title: 'Actividad Reciente', component: 'ActividadRecienteWidget', size: 'col-12 col-md-6', props: {} }
]

const calcularKPIs = async () => {
  try {
    const [ventas, compras, productos] = await Promise.all([
      puedeVerVentas.value ? find('ventas') : Promise.resolve([]),
      puedeVerCompras.value ? find('compras') : Promise.resolve([]),
      puedeVerInventario.value ? find('productos') : Promise.resolve([])
    ])

    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

    if (puedeVerVentas.value) {
      totalFacturado.value = ventas
        .filter(v => new Date(v.fecha_emision) >= inicioMes)
        .reduce((sum, v) => sum + (v.total || 0), 0)
    }

    if (puedeVerCompras.value) {
      cuentasPorPagar.value = compras.filter(c => c.estado_pago === 'pendiente').length
    }

    if (puedeVerInventario.value && puedeVerVentas.value) {
      const totalVentas = ventas.reduce((sum, v) => sum + (v.total || 0), 0)
      const stockTotal = productos.reduce((sum, p) => sum + (p.stock || 0), 0)
      rotacionInventario.value = stockTotal > 0 ? totalVentas / stockTotal : 0
    }

    if (puedeVerVentas.value && puedeVerCompras.value) {
      const totalVentas = ventas.reduce((sum, v) => sum + (v.total || 0), 0)
      const totalCompras = compras.reduce((sum, c) => sum + (c.total || 0), 0)
      margenBruto.value = totalVentas > 0 ? ((totalVentas - totalCompras) / totalVentas) * 100 : 0
    }
  } catch (e) {
    console.error('Error calculando KPIs:', e)
  }
}

onMounted(async () => {
  await cargarEstadisticas()
  await calcularKPIs()
})
</script>

<style scoped>
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px var(--shadow-color);
  transition: var(--transition);
  height: 90px;
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px var(--shadow-hover);
}
.stat-icon-wrapper {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-icon-wrapper i {
  font-size: 1.6rem;
}
.stat-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.stat-number {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.quick-access {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: var(--text-primary);
  padding: 8px 4px;
  border-radius: 12px;
  transition: var(--transition);
  background: var(--bg-card);
  box-shadow: 0 1px 4px var(--shadow-color);
  border: 1px solid var(--border-color);
}
.quick-access:hover {
  background: var(--bg-table-stripe);
  transform: translateY(-3px);
  box-shadow: 0 6px 16px var(--shadow-hover);
  text-decoration: none;
  color: var(--primary-dark);
}
.quick-access .icon-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.4rem;
  margin-bottom: 6px;
}
.quick-access span {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}
.quick-access-bandeja {
  background: linear-gradient(135deg, rgba(52,152,219,0.08), rgba(230,126,34,0.05));
  border: 1.5px solid rgba(52,152,219,0.3);
}
.quick-access-bandeja:hover {
  border-color: var(--primary-color);
  box-shadow: 0 6px 16px rgba(52,152,219,0.2);
}

.section-subtitle {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 6px;
}
.section-subtitle i {
  color: var(--primary-color);
}

.card-cacao .card-header {
  display: flex;
  align-items: center;
}
</style>