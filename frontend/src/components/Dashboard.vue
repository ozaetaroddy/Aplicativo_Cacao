<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Panel de Control</h4>

    <!-- ===== ACCESOS RÁPIDOS ===== -->
    <div class="row g-3 mb-4">
      <div class="col-12">
        <h5 class="section-subtitle"><i class="fas fa-bolt me-2"></i>Accesos Rápidos</h5>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=factura" class="quick-access">
          <div class="icon-circle" style="background: #3498db;"><i class="fas fa-file-invoice"></i></div>
          <span>Factura</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=guia_remision" class="quick-access">
          <div class="icon-circle" style="background: #2ecc71;"><i class="fas fa-truck"></i></div>
          <span>Guía Remisión</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=nota_credito" class="quick-access">
          <div class="icon-circle" style="background: #e67e22;"><i class="fas fa-undo-alt"></i></div>
          <span>Nota Crédito</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/compras/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #27ae60;"><i class="fas fa-shopping-cart"></i></div>
          <span>Compra</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/clientes/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #8e44ad;"><i class="fas fa-user-plus"></i></div>
          <span>Cliente</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/proveedores/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #2c3e50;"><i class="fas fa-truck-loading"></i></div>
          <span>Proveedor</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/productos/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #f1c40f;"><i class="fas fa-box"></i></div>
          <span>Producto</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/consultar-documentos" class="quick-access">
          <div class="icon-circle" style="background: #2980b9;"><i class="fas fa-search"></i></div>
          <span>Consultar Docs</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/kardex" class="quick-access">
          <div class="icon-circle" style="background: #1abc9c;"><i class="fas fa-clipboard-list"></i></div>
          <span>Kardex</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/stock" class="quick-access">
          <div class="icon-circle" style="background: #16a085;"><i class="fas fa-boxes"></i></div>
          <span>Stock Actual</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/reportes/ventas" class="quick-access">
          <div class="icon-circle" style="background: #e74c3c;"><i class="fas fa-chart-line"></i></div>
          <span>Reporte Ventas</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/reportes/compras" class="quick-access">
          <div class="icon-circle" style="background: #d35400;"><i class="fas fa-chart-bar"></i></div>
          <span>Reporte Compras</span>
        </router-link>
      </div>
    </div>

    <!-- ===== ESTADÍSTICAS RÁPIDAS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-lg-3 col-md-6">
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
      <div class="col-lg-3 col-md-6">
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
      <div class="col-lg-3 col-md-6">
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
      <div class="col-lg-3 col-md-6">
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
    <div class="row g-4 mb-4">
      <div class="col-lg-3 col-md-6">
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
      <div class="col-lg-3 col-md-6">
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
      <div class="col-lg-3 col-md-6">
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
      <div class="col-lg-3 col-md-6">
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

    <!-- ===== BANDEJAS: VENTAS Y COMPRAS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-12">
        <h5 class="section-subtitle"><i class="fas fa-inbox me-2"></i>Bandejas de Trabajo</h5>
      </div>
      <div class="col-lg-6">
        <div class="card card-cacao h-100">
          <div class="card-header">
            <i class="fas fa-hand-holding-usd me-2" style="color: #3498db;"></i>
            Bandeja de Ventas
          </div>
          <div class="card-body">
            <BandejaVentasWidget />
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card card-cacao h-100">
          <div class="card-header">
            <i class="fas fa-shopping-cart me-2" style="color: #e67e22;"></i>
            Bandeja de Compras
          </div>
          <div class="card-body">
            <BandejaComprasWidget />
          </div>
        </div>
      </div>
    </div>

    <!-- ===== GRÁFICOS ===== -->
    <DashboardCharts
      :ventas-diarias="ventasDiarias"
      :compras-diarias="comprasDiarias"
      :dias="dias"
    />

    <!-- ===== WIDGETS ===== -->
    <WidgetContainer :initial-widgets="defaultWidgets" />

    <!-- ===== EXPORTAR / IMPORTAR ===== -->
    <div class="row g-4 mt-2">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { useEstadisticas } from '../composables/useEstadisticas'
import DashboardCharts from './dashboard/DashboardCharts.vue'
import WidgetContainer from './dashboard/WidgetContainer.vue'
import ExportImport from './ExportImport.vue'
import BandejaVentasWidget from './dashboard/widgets/BandejaVentasWidget.vue'
import BandejaComprasWidget from './dashboard/widgets/BandejaComprasWidget.vue'

const { find } = useMongoDB()
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

// ===== CALCULAR KPIS =====
const calcularKPIs = async () => {
  try {
    const [ventas, compras, productos] = await Promise.all([
      find('ventas'),
      find('compras'),
      find('productos')
    ])

    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

    const facturadoMes = ventas
      .filter(v => new Date(v.fecha_emision) >= inicioMes)
      .reduce((sum, v) => sum + (v.total || 0), 0)
    totalFacturado.value = facturadoMes

    cuentasPorPagar.value = compras.filter(c => c.estado_pago === 'pendiente').length

    const totalVentas = ventas.reduce((sum, v) => sum + (v.total || 0), 0)
    const stockTotal = productos.reduce((sum, p) => sum + (p.stock || 0), 0)
    rotacionInventario.value = stockTotal > 0 ? totalVentas / stockTotal : 0

    const totalCompras = compras.reduce((sum, c) => sum + (c.total || 0), 0)
    margenBruto.value = totalVentas > 0 ? ((totalVentas - totalCompras) / totalVentas) * 100 : 0

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
</style>