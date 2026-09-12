<template>
  <div class="dashboard">
    <!-- HEADER -->
    <div class="dashboard-header">
      <div>
        <h1 class="dashboard-title">
          <span class="title-icon"><i class="fas fa-th-large"></i></span>
          Panel de Control
        </h1>
        <p class="dashboard-subtitle">Resumen en tiempo real de tu actividad contable</p>
      </div>
      <div class="dashboard-header-actions">
        <div class="live-indicator">
          <span class="pulse-dot"></span>
          <span class="live-text">En vivo</span>
        </div>
      </div>
    </div>

    <!-- ALERTAS DEL SISTEMA -->
    <div v-if="alertas.length > 0" class="alertas-grid">
      <div v-for="a in alertas" :key="a.id" class="alerta-card" :class="`alerta-${a.nivel}`">
        <div class="alerta-icon"><i :class="a.icon"></i></div>
        <div class="alerta-content">
          <div class="alerta-title">{{ a.titulo }}</div>
          <div class="alerta-text">{{ a.texto }}</div>
        </div>
        <router-link v-if="a.to" :to="a.to" class="alerta-action">
          {{ a.actionLabel || 'Ver' }} <i class="fas fa-arrow-right"></i>
        </router-link>
      </div>
    </div>

    <!-- ACCESOS RÁPIDOS -->
    <section class="dashboard-section">
      <h2 class="section-heading">
        <i class="fas fa-bolt"></i>
        Accesos Rápidos
      </h2>
      <div class="quick-grid">
        <router-link
          v-for="acceso in accesosRapidos"
          :key="acceso.to"
          :to="acceso.to"
          class="quick-card"
          :class="{ 'quick-card-highlight': acceso.destacado }"
        >
          <div class="quick-icon" :style="{ background: acceso.color }">
            <i :class="acceso.icon"></i>
          </div>
          <span class="quick-label">{{ acceso.label }}</span>
        </router-link>
      </div>
    </section>

    <!-- RESUMEN DEL DÍA -->
    <section v-if="puedeVerVentas || puedeVerCompras" class="dashboard-section">
      <h2 class="section-heading">
        <i class="fas fa-chart-pie"></i>
        Resumen del Día
      </h2>
      <div class="kpi-grid">
        <div v-if="puedeVerVentas" class="kpi-card" style="--kpi-color: #3498db;">
          <div class="kpi-header">
            <div class="kpi-icon"><i class="fas fa-file-invoice"></i></div>
            <span class="kpi-badge" :class="tendenciaVentas >= 0 ? 'positive' : 'negative'">
              <i :class="tendenciaVentas >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"></i>
              {{ Math.abs(tendenciaVentas).toFixed(1) }}%
            </span>
          </div>
          <div class="kpi-value">${{ ventasHoy.toFixed(2) }}</div>
          <div class="kpi-label">Ventas de Hoy</div>
          <div class="kpi-footer">
            <span>vs. ayer</span>
            <span class="kpi-trend-value">${{ ventasAyer.toFixed(2) }}</span>
          </div>
        </div>

        <div v-if="puedeVerCompras" class="kpi-card" style="--kpi-color: #2ecc71;">
          <div class="kpi-header">
            <div class="kpi-icon"><i class="fas fa-shopping-cart"></i></div>
            <span class="kpi-badge" :class="tendenciaCompras >= 0 ? 'positive' : 'negative'">
              <i :class="tendenciaCompras >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"></i>
              {{ Math.abs(tendenciaCompras).toFixed(1) }}%
            </span>
          </div>
          <div class="kpi-value">${{ comprasHoy.toFixed(2) }}</div>
          <div class="kpi-label">Compras de Hoy</div>
          <div class="kpi-footer">
            <span>vs. ayer</span>
            <span class="kpi-trend-value">${{ comprasAyer.toFixed(2) }}</span>
          </div>
        </div>

        <div v-if="puedeVerVentas" class="kpi-card" style="--kpi-color: #f39c12;">
          <div class="kpi-header">
            <div class="kpi-icon"><i class="fas fa-calendar-alt"></i></div>
          </div>
          <div class="kpi-value">${{ ventasMes.toFixed(2) }}</div>
          <div class="kpi-label">Ventas del Mes</div>
          <div class="kpi-footer">
            <span>{{ facturasMes }} facturas</span>
          </div>
        </div>

        <div v-if="puedeVerCompras" class="kpi-card" style="--kpi-color: #9b59b6;">
          <div class="kpi-header">
            <div class="kpi-icon"><i class="fas fa-calendar-check"></i></div>
          </div>
          <div class="kpi-value">${{ comprasMes.toFixed(2) }}</div>
          <div class="kpi-label">Compras del Mes</div>
          <div class="kpi-footer">
            <span>{{ comprasDelMes }} compras</span>
          </div>
        </div>
      </div>
    </section>

    <!-- INDICADORES CLAVE -->
    <section class="dashboard-section">
      <h2 class="section-heading">
        <i class="fas fa-chart-line"></i>
        Indicadores Clave
      </h2>
      <div class="kpi-grid">
        <div v-if="puedeVerVentas && puedeVerCompras" class="metric-card" style="--metric-color: #27ae60;">
          <div class="metric-top">
            <div class="metric-icon"><i class="fas fa-percent"></i></div>
            <div class="metric-info">
              <div class="metric-value" :style="{ color: margenBruto >= 0 ? '#27ae60' : '#e74c3c' }">
                {{ margenBruto.toFixed(2) }}%
              </div>
              <div class="metric-label">Margen bruto (mes)</div>
            </div>
          </div>
          <div class="metric-bar">
            <div class="metric-bar-fill" :style="{ width: `${Math.min(Math.max(margenBruto, 0), 100)}%` }"></div>
          </div>
        </div>

        <div v-if="puedeVerCompras" class="metric-card" style="--metric-color: #e74c3c;">
          <div class="metric-top">
            <div class="metric-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="metric-info">
              <div class="metric-value">{{ cuentasPorPagar }}</div>
              <div class="metric-label">Cuentas por Pagar</div>
            </div>
          </div>
          <div class="metric-bar">
            <div class="metric-bar-fill" :style="{ width: `${Math.min(cuentasPorPagar * 5, 100)}%` }"></div>
          </div>
        </div>

        <div v-if="puedeVerInventario" class="metric-card" style="--metric-color: #f39c12;">
          <div class="metric-top">
            <div class="metric-icon"><i class="fas fa-boxes"></i></div>
            <div class="metric-info">
              <div class="metric-value">{{ stockBajo }}</div>
              <div class="metric-label">Productos con Stock Bajo</div>
            </div>
          </div>
          <div class="metric-bar">
            <div class="metric-bar-fill" :style="{ width: `${Math.min(stockBajo * 10, 100)}%` }"></div>
          </div>
        </div>

        <div v-if="puedeVerVentas" class="metric-card" style="--metric-color: #3498db;">
          <div class="metric-top">
            <div class="metric-icon"><i class="fas fa-cloud-upload-alt"></i></div>
            <div class="metric-info">
              <div class="metric-value">{{ sri.firmados }}</div>
              <div class="metric-label">Docs. firmados (sin enviar)</div>
            </div>
          </div>
          <div class="metric-bar">
            <div class="metric-bar-fill" :style="{ width: `${Math.min(sri.firmados * 10, 100)}%` }"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- BANDEJAS -->
    <section v-if="puedeVerVentas || puedeVerCompras" class="dashboard-section">
      <h2 class="section-heading">
        <i class="fas fa-inbox"></i>
        Bandejas de Trabajo
      </h2>
      <div class="bandejas-grid">
        <div v-if="puedeVerVentas" class="bandeja-card">
          <div class="bandeja-header">
            <div class="bandeja-title">
              <div class="bandeja-icon" style="background: #3498db;"><i class="fas fa-hand-holding-usd"></i></div>
              <div>
                <div class="bandeja-name">Ventas Recientes</div>
                <div class="bandeja-sub">Últimos movimientos</div>
              </div>
            </div>
            <router-link to="/ventas" class="btn-view-all">
              Ver todas <i class="fas fa-arrow-right"></i>
            </router-link>
          </div>
          <div class="bandeja-body">
            <BandejaVentasWidget />
          </div>
        </div>

        <div v-if="puedeVerCompras" class="bandeja-card">
          <div class="bandeja-header">
            <div class="bandeja-title">
              <div class="bandeja-icon" style="background: #e67e22;"><i class="fas fa-shopping-cart"></i></div>
              <div>
                <div class="bandeja-name">Compras Recientes</div>
                <div class="bandeja-sub">Últimos movimientos</div>
              </div>
            </div>
            <router-link to="/compras" class="btn-view-all">
              Ver todas <i class="fas fa-arrow-right"></i>
            </router-link>
          </div>
          <div class="bandeja-body">
            <BandejaComprasWidget />
          </div>
        </div>
      </div>
    </section>

    <!-- GRÁFICOS -->
    <section v-if="puedeVerVentas || puedeVerCompras" class="dashboard-section">
      <h2 class="section-heading">
        <i class="fas fa-chart-area"></i>
        Tendencia (Últimos 7 días)
      </h2>
      <DashboardCharts
        :ventas-diarias="puedeVerVentas ? ventasDiarias : []"
        :compras-diarias="puedeVerCompras ? comprasDiarias : []"
        :dias="dias"
      />
    </section>

    <!-- TOP PRODUCTOS -->
    <section v-if="puedeVerVentas && topProductos.length > 0" class="dashboard-section">
      <h2 class="section-heading">
        <i class="fas fa-star"></i>
        Top 5 Productos del Mes
      </h2>
      <div class="card-cacao">
        <div class="card-body p-0">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:60px;">#</th>
                <th>Producto</th>
                <th style="width:120px;">Código</th>
                <th style="width:120px;" class="text-end">Cantidad</th>
                <th style="width:140px;" class="text-end">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, idx) in topProductos" :key="p.productoId">
                <td>
                  <span class="badge-ranking" :class="getRankClass(idx)">{{ idx + 1 }}</span>
                </td>
                <td class="fw-bold">{{ p.nombre }}</td>
                <td class="font-monospace small text-muted">{{ p.codigo || '—' }}</td>
                <td class="text-end">{{ p.cantidad }}</td>
                <td class="text-end fw-bold">${{ (p.total || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePermisos } from '../composables/usePermisos'
import { useEstadisticas } from '../composables/useEstadisticas'
import { api } from '../services/api'
import DashboardCharts from './dashboard/DashboardCharts.vue'
import BandejaVentasWidget from './dashboard/widgets/BandejaVentasWidget.vue'
import BandejaComprasWidget from './dashboard/widgets/BandejaComprasWidget.vue'

const { puede } = usePermisos()
const {
  ventasHoy, ventasAyer, ventasMes, facturasMes,
  comprasHoy, comprasAyer, comprasMes, comprasDelMes,
  tendenciaVentas, tendenciaCompras,
  ventasDiarias, comprasDiarias, dias,
  topProductos, cuentasPorPagar, stockBajo, sri,
  cargarEstadisticas
} = useEstadisticas()

// ===== PERMISOS =====
const puedeVerVentas = computed(() => puede('ventas', 'ver'))
const puedeCrearVentas = computed(() => puede('ventas', 'crear'))
const puedeVerCompras = computed(() => puede('compras', 'ver'))
const puedeCrearCompras = computed(() => puede('compras', 'crear'))
const puedeVerInventario = computed(() => puede('inventario', 'ver'))
const puedeVerKardex = computed(() => puede('kardex', 'ver'))
const puedeVerReportes = computed(() => puede('reportes', 'ver'))
const puedeVerRetenciones = computed(() => puede('retenciones', 'ver'))

// ===== MARGEN BRUTO =====
const margenBruto = computed(() => {
  if (ventasMes.value <= 0) return 0
  const costo = comprasMes.value
  return ((ventasMes.value - costo) / ventasMes.value) * 100
})

// ===== INFO DEL CERTIFICADO (para alerta) =====
const certInfo = ref(null)
const cargarCertInfo = async () => {
  if (!puede('usuarios', 'ver')) return
  try {
    certInfo.value = await api.request('/certificado/info', { method: 'GET', skipLoader: true })
  } catch (e) { /* silencioso */ }
}

// ===== ALERTAS =====
const alertas = computed(() => {
  const arr = []

  // Certificado por vencer
  if (certInfo.value?.cargado && certInfo.value.por_vencer) {
    arr.push({
      id: 'cert',
      nivel: 'warning',
      icon: 'fas fa-shield-alt',
      titulo: 'Certificado por vencer',
      texto: `Vence en ${certInfo.value.dias_restantes} días`,
      to: '/certificado-firma',
      actionLabel: 'Renovar'
    })
  } else if (certInfo.value && !certInfo.value.cargado && puede('usuarios', 'ver')) {
    arr.push({
      id: 'cert-missing',
      nivel: 'danger',
      icon: 'fas fa-exclamation-triangle',
      titulo: 'Sin certificado de firma',
      texto: 'No podrás firmar facturas hasta cargarlo',
      to: '/certificado-firma',
      actionLabel: 'Cargar'
    })
  }

  // Documentos firmados sin enviar
  if (sri.value.firmados > 0) {
    arr.push({
      id: 'firmados',
      nivel: 'info',
      icon: 'fas fa-cloud-upload-alt',
      titulo: `${sri.value.firmados} documentos firmados`,
      texto: 'Pendientes de envío al SRI',
      to: '/envio-sri',
      actionLabel: 'Enviar'
    })
  }

  // Stock bajo
  if (puedeVerInventario.value && stockBajo.value > 0) {
    arr.push({
      id: 'stock',
      nivel: 'warning',
      icon: 'fas fa-boxes',
      titulo: `${stockBajo.value} productos con stock bajo`,
      texto: 'Revisa el inventario para reabastecer',
      to: '/inventario/stock',
      actionLabel: 'Ver'
    })
  }

  return arr
})

// ===== ACCESOS RÁPIDOS =====
const accesosRapidos = computed(() => {
  const accesos = []
  if (puedeCrearVentas.value) {
    accesos.push(
      { label: 'Factura', icon: 'fas fa-file-invoice', color: 'linear-gradient(135deg, #3498db, #2980b9)', to: '/ventas/nuevo?tipo=factura' },
      { label: 'Guía', icon: 'fas fa-truck', color: 'linear-gradient(135deg, #2ecc71, #27ae60)', to: '/ventas/nuevo?tipo=guia_remision' },
      { label: 'Nota Crédito', icon: 'fas fa-undo-alt', color: 'linear-gradient(135deg, #e67e22, #d35400)', to: '/ventas/nuevo?tipo=nota_credito' }
    )
  }
  if (puedeCrearCompras.value) {
    accesos.push({ label: 'Nueva Compra', icon: 'fas fa-cart-plus', color: 'linear-gradient(135deg, #16a085, #138d75)', to: '/compras/nuevo' })
  }
  if (puedeVerVentas.value) {
    accesos.push({ label: 'Bandeja Ventas', icon: 'fas fa-hand-holding-usd', color: 'linear-gradient(135deg, #3498db, #2980b9)', to: '/ventas' })
  }
  if (puedeVerCompras.value) {
    accesos.push({ label: 'Bandeja Compras', icon: 'fas fa-inbox', color: 'linear-gradient(135deg, #e67e22, #d35400)', to: '/compras' })
  }
  if (puede('clientes', 'crear')) {
    accesos.push({ label: 'Cliente', icon: 'fas fa-user-plus', color: 'linear-gradient(135deg, #8e44ad, #6c3483)', to: '/clientes/nuevo' })
  }
  if (puede('productos', 'crear')) {
    accesos.push({ label: 'Producto', icon: 'fas fa-box', color: 'linear-gradient(135deg, #f1c40f, #d68910)', to: '/productos/nuevo' })
  }
  if (puedeVerVentas.value || puedeVerCompras.value) {
    accesos.push({ label: 'Consultar', icon: 'fas fa-search', color: 'linear-gradient(135deg, #2980b9, #1f618d)', to: '/consultar-documentos' })
  }
  if (puedeVerKardex.value) {
    accesos.push({ label: 'Kardex', icon: 'fas fa-clipboard-list', color: 'linear-gradient(135deg, #1abc9c, #16a085)', to: '/kardex' })
  }
  if (puedeVerInventario.value) {
    accesos.push({ label: 'Stock', icon: 'fas fa-boxes', color: 'linear-gradient(135deg, #16a085, #0e6655)', to: '/inventario/stock' })
  }
  if (puedeVerReportes.value) {
    accesos.push({ label: 'Reportes', icon: 'fas fa-chart-line', color: 'linear-gradient(135deg, #e74c3c, #c0392b)', to: '/reportes/ventas' })
  }
  if (puedeVerRetenciones.value) {
    accesos.push({ label: 'Retenciones', icon: 'fas fa-percent', color: 'linear-gradient(135deg, #9b59b6, #7d3c98)', to: '/retenciones' })
  }
  return accesos
})

// ===== HELPERS =====
const getRankClass = (idx) => {
  if (idx === 0) return 'gold'
  if (idx === 1) return 'silver'
  if (idx === 2) return 'bronze'
  return 'default'
}

onMounted(async () => {
  await cargarEstadisticas()
  await cargarCertInfo()
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 32px; }

/* HEADER */
.dashboard-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.dashboard-title { font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em; display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
.title-icon { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; box-shadow: 0 8px 20px rgba(52, 152, 219, 0.3); }
.dashboard-subtitle { color: var(--text-muted); font-size: 0.9rem; margin: 0; padding-left: 62px; }
.live-indicator { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: var(--success-bg); border: 1px solid rgba(39, 174, 96, 0.3); border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 600; color: var(--success); }
.pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.6); animation: pulse-live 2s infinite; }
@keyframes pulse-live { 0% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.6); } 70% { box-shadow: 0 0 0 8px rgba(39, 174, 96, 0); } 100% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0); } }

/* ALERTAS */
.alertas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.alerta-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: var(--radius-lg); border: 1px solid; transition: all var(--transition); }
.alerta-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.alerta-warning { background: rgba(243, 156, 18, 0.08); border-color: rgba(243, 156, 18, 0.3); }
.alerta-danger { background: rgba(231, 76, 60, 0.08); border-color: rgba(231, 76, 60, 0.3); }
.alerta-info { background: rgba(52, 152, 219, 0.08); border-color: rgba(52, 152, 219, 0.3); }
.alerta-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.alerta-warning .alerta-icon { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
.alerta-danger .alerta-icon { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
.alerta-info .alerta-icon { background: rgba(52, 152, 219, 0.15); color: #3498db; }
.alerta-content { flex: 1; min-width: 0; }
.alerta-title { font-weight: 700; font-size: 0.85rem; color: var(--text-primary); }
.alerta-text { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.alerta-action { padding: 6px 12px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); font-size: 0.78rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; transition: all var(--transition-fast); flex-shrink: 0; }
.alerta-action:hover { background: var(--primary-color); color: #fff; border-color: var(--primary-color); }

/* SECCIONES */
.dashboard-section { display: flex; flex-direction: column; gap: 16px; }
.section-heading { font-size: 1rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 2px solid var(--border-light); margin: 0; }
.section-heading i { color: var(--primary-color); font-size: 1.1rem; }

/* ACCESOS RÁPIDOS */
.quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
.quick-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 12px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); text-decoration: none; transition: all var(--transition); position: relative; overflow: hidden; }
.quick-card:hover { transform: translateY(-4px); border-color: var(--primary-color); box-shadow: var(--shadow-lg); }
.quick-card-highlight { border-color: rgba(52, 152, 219, 0.3); }
.quick-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.3rem; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15); transition: transform var(--transition); }
.quick-card:hover .quick-icon { transform: scale(1.08); }
.quick-label { font-size: 0.78rem; font-weight: 600; text-align: center; color: var(--text-primary); line-height: 1.2; }

/* KPI CARDS */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.kpi-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; position: relative; overflow: hidden; transition: all var(--transition); border-left: 4px solid var(--kpi-color); }
.kpi-card::after { content: ''; position: absolute; top: 0; right: 0; width: 100px; height: 100px; background: var(--kpi-color); opacity: 0.05; border-radius: 50%; transform: translate(30%, -30%); transition: transform var(--transition); }
.kpi-card:hover::after { transform: translate(20%, -20%) scale(1.2); }
.kpi-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }
.kpi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; position: relative; z-index: 1; }
.kpi-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--kpi-color); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
.kpi-badge { font-size: 0.7rem; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-full); display: inline-flex; align-items: center; gap: 4px; }
.kpi-badge.positive { background: var(--success-bg); color: var(--success); }
.kpi-badge.negative { background: var(--danger-bg); color: var(--danger); }
.kpi-value { font-size: 1.8rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; position: relative; z-index: 1; }
.kpi-label { font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-top: 4px; position: relative; z-index: 1; }
.kpi-footer { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-light); position: relative; z-index: 1; }
.kpi-trend-value { font-weight: 600; color: var(--text-secondary); }

/* METRIC CARDS */
.metric-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 18px; transition: all var(--transition); }
.metric-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.metric-top { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.metric-icon { width: 44px; height: 44px; border-radius: 12px; background: color-mix(in srgb, var(--metric-color) 15%, transparent); color: var(--metric-color); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; }
.metric-info { flex: 1; min-width: 0; }
.metric-value { font-size: 1.4rem; font-weight: 800; color: var(--text-primary); line-height: 1.1; font-variant-numeric: tabular-nums; }
.metric-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 2px; }
.metric-bar { height: 4px; background: var(--border-light); border-radius: var(--radius-full); overflow: hidden; }
.metric-bar-fill { height: 100%; background: var(--metric-color); border-radius: inherit; transition: width 0.6s var(--ease-out); }

/* BANDEJAS */
.bandejas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
.bandeja-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; transition: all var(--transition); }
.bandeja-card:hover { box-shadow: var(--shadow-md); }
.bandeja-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-table-stripe); }
.bandeja-title { display: flex; align-items: center; gap: 12px; }
.bandeja-icon { width: 40px; height: 40px; border-radius: 10px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.bandeja-name { font-weight: 700; font-size: 0.92rem; color: var(--text-primary); }
.bandeja-sub { font-size: 0.72rem; color: var(--text-muted); }
.btn-view-all { font-size: 0.78rem; font-weight: 600; color: var(--primary-color); display: flex; align-items: center; gap: 6px; text-decoration: none; transition: gap var(--transition-fast); }
.btn-view-all:hover { gap: 10px; }
.bandeja-body { padding: 12px 20px 16px; }

/* TABLA TOP PRODUCTOS */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 12px 14px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); }
.table-modern td { padding: 12px 14px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }
.badge-ranking { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-weight: 700; font-size: 0.8rem; }
.badge-ranking.gold { background: #f1c40f; color: #1a2a3a; }
.badge-ranking.silver { background: #bdc3c7; color: #1a2a3a; }
.badge-ranking.bronze { background: #cd7f32; color: #fff; }
.badge-ranking.default { background: #3498db; color: #fff; }

/* RESPONSIVE */
@media (max-width: 768px) {
  .dashboard { gap: 24px; }
  .dashboard-subtitle { padding-left: 0; }
  .quick-grid { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
  .quick-card { padding: 14px 8px; }
  .quick-icon { width: 44px; height: 44px; font-size: 1.1rem; }
  .quick-label { font-size: 0.7rem; }
  .kpi-value { font-size: 1.5rem; }
  .metric-value { font-size: 1.2rem; }
}
</style>