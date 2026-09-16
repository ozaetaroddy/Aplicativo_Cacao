<template>
  <div class="dashboard">
    <!-- ===== HERO ===== -->
    <div class="hero">
      <div class="hero-content">
        <div class="hero-text">
          <div class="hero-greeting">
            <i :class="iconoSaludo" aria-hidden="true"></i>
            <span>{{ saludo }}, <strong>{{ nombreUsuario }}</strong></span>
          </div>
          <h1 class="hero-title">
            {{ esListo ? 'Todo listo para facturar' : 'Panel de Control' }}
          </h1>
          <p class="hero-subtitle">
            {{
              esListo
                ? 'Tu sistema está configurado. Emite comprobantes con validez legal en minutos.'
                : 'Revisa el estado del sistema y comienza a facturar electrónicamente.'
            }}
          </p>
        </div>
        <div class="hero-actions">
          <router-link
            v-if="puedeCrearVentas"
            to="/ventas/nuevo?tipo=factura"
            class="hero-btn hero-btn-primary"
          >
            <i class="fas fa-plus-circle" aria-hidden="true"></i>
            <span>Nueva Factura</span>
          </router-link>
          <router-link
            v-if="puedeVerVentas"
            to="/ventas"
            class="hero-btn hero-btn-ghost"
          >
            <i class="fas fa-list" aria-hidden="true"></i>
            <span>Ver ventas</span>
          </router-link>
        </div>
      </div>
      <div class="hero-decoration" aria-hidden="true">
        <div class="hero-circle hero-circle-1"></div>
        <div class="hero-circle hero-circle-2"></div>
        <div class="hero-circle hero-circle-3"></div>
      </div>
    </div>

    <!-- ===== ALERTAS ===== -->
    <transition-group
      v-if="alertas.length > 0"
      name="fade"
      tag="div"
      class="alerts-grid"
    >
      <div
        v-for="a in alertas"
        :key="a.id"
        class="alert-card"
        :class="`alert-${a.nivel}`"
      >
        <div class="alert-icon" aria-hidden="true">
          <i :class="a.icon"></i>
        </div>
        <div class="alert-content">
          <div class="alert-title">{{ a.titulo }}</div>
          <div class="alert-text">{{ a.texto }}</div>
        </div>
        <router-link
          v-if="a.to"
          :to="a.to"
          class="alert-action"
          :aria-label="a.actionLabel || 'Ver'"
        >
          {{ a.actionLabel || 'Ver' }}
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </router-link>
      </div>
    </transition-group>

    <!-- ===== ACCESOS RÁPIDOS ===== -->
    <section
      v-if="accesosRapidos.length > 0"
      class="section"
      data-tour="quick-actions"
    >
      <div class="section-header">
        <h2 class="section-title">
          <i class="fas fa-bolt" aria-hidden="true"></i>
          <span>Accesos Rápidos</span>
        </h2>
        <div class="section-hint">Las acciones más usadas</div>
      </div>
      <div class="quick-grid">
        <router-link
          v-for="acceso in accesosRapidos"
          :key="acceso.to"
          :to="acceso.to"
          class="quick-card"
        >
          <div class="quick-icon" :style="{ background: acceso.color }" aria-hidden="true">
            <i :class="acceso.icon"></i>
          </div>
          <div class="quick-info">
            <span class="quick-label">{{ acceso.label }}</span>
            <span class="quick-desc">{{ acceso.desc }}</span>
          </div>
          <i class="fas fa-arrow-right quick-arrow" aria-hidden="true"></i>
        </router-link>
      </div>
    </section>

    <!-- ===== KPIs ===== -->
    <section
      v-if="puedeVerVentas || puedeVerCompras"
      class="section"
      data-tour="kpis"
    >
      <div class="section-header">
        <h2 class="section-title">
          <i class="fas fa-chart-pie" aria-hidden="true"></i>
          <span>Resumen del Día</span>
        </h2>
        <div class="live-indicator">
          <span class="live-dot" aria-hidden="true"></span>
          <span class="live-text">En vivo</span>
        </div>
      </div>

      <div class="kpi-grid">
        <!-- Ventas Hoy -->
        <div v-if="puedeVerVentas" class="kpi-card" style="--accent: #2563eb;">
          <div class="kpi-top">
            <div class="kpi-icon" aria-hidden="true">
              <i class="fas fa-file-invoice"></i>
            </div>
            <div class="kpi-trend" :class="tendenciaVentas >= 0 ? 'up' : 'down'">
              <i
                :class="tendenciaVentas >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"
                aria-hidden="true"
              ></i>
              <span>{{ Math.abs(tendenciaVentas).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="kpi-value">${{ ventasHoy.toFixed(2) }}</div>
          <div class="kpi-label">Ventas de Hoy</div>
          <div class="kpi-footer">
            <span>vs ayer</span>
            <strong>${{ ventasAyer.toFixed(2) }}</strong>
          </div>
        </div>

        <!-- Compras Hoy -->
        <div v-if="puedeVerCompras" class="kpi-card" style="--accent: #10b981;">
          <div class="kpi-top">
            <div class="kpi-icon" aria-hidden="true">
              <i class="fas fa-shopping-cart"></i>
            </div>
            <div class="kpi-trend" :class="tendenciaCompras >= 0 ? 'up' : 'down'">
              <i
                :class="tendenciaCompras >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"
                aria-hidden="true"
              ></i>
              <span>{{ Math.abs(tendenciaCompras).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="kpi-value">${{ comprasHoy.toFixed(2) }}</div>
          <div class="kpi-label">Compras de Hoy</div>
          <div class="kpi-footer">
            <span>vs ayer</span>
            <strong>${{ comprasAyer.toFixed(2) }}</strong>
          </div>
        </div>

        <!-- Ventas Mes -->
        <div v-if="puedeVerVentas" class="kpi-card" style="--accent: #f59e0b;">
          <div class="kpi-top">
            <div class="kpi-icon" aria-hidden="true">
              <i class="fas fa-calendar-alt"></i>
            </div>
            <div class="kpi-trend" :class="varMesVentas >= 0 ? 'up' : 'down'">
              <i
                :class="varMesVentas >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"
                aria-hidden="true"
              ></i>
              <span>{{ Math.abs(varMesVentas).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="kpi-value">${{ ventasMes.toFixed(2) }}</div>
          <div class="kpi-label">Ventas del Mes</div>
          <div class="kpi-footer">
            <span>{{ facturasMes }} facturas</span>
          </div>
        </div>

        <!-- Compras Mes -->
        <div v-if="puedeVerCompras" class="kpi-card" style="--accent: #8b5cf6;">
          <div class="kpi-top">
            <div class="kpi-icon" aria-hidden="true">
              <i class="fas fa-truck"></i>
            </div>
            <div class="kpi-trend" :class="varMesCompras >= 0 ? 'up' : 'down'">
              <i
                :class="varMesCompras >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down'"
                aria-hidden="true"
              ></i>
              <span>{{ Math.abs(varMesCompras).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="kpi-value">${{ comprasMes.toFixed(2) }}</div>
          <div class="kpi-label">Compras del Mes</div>
          <div class="kpi-footer">
            <span>{{ comprasDelMes }} compras</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== INDICADORES CLAVE ===== -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">
          <i class="fas fa-chart-line" aria-hidden="true"></i>
          <span>Indicadores Clave</span>
        </h2>
      </div>
      <div class="metrics-grid">
        <div v-if="puedeVerVentas && puedeVerCompras" class="metric-card">
          <div class="metric-top">
            <div
              class="metric-icon"
              style="background: rgba(16, 185, 129, 0.12); color: #10b981;"
              aria-hidden="true"
            >
              <i class="fas fa-percent"></i>
            </div>
            <div class="metric-info">
              <div
                class="metric-value"
                :style="{ color: margenBruto >= 0 ? '#10b981' : '#ef4444' }"
              >
                {{ margenBruto.toFixed(2) }}%
              </div>
              <div class="metric-label">Margen bruto (mes)</div>
            </div>
          </div>
          <div class="metric-bar">
            <div
              class="metric-bar-fill"
              :style="{
                width: `${Math.min(Math.max(margenBruto, 0), 100)}%`,
                background: margenBruto >= 0 ? '#10b981' : '#ef4444'
              }"
            ></div>
          </div>
        </div>

        <div v-if="puedeVerCompras" class="metric-card">
          <div class="metric-top">
            <div
              class="metric-icon"
              style="background: rgba(239, 68, 68, 0.12); color: #ef4444;"
              aria-hidden="true"
            >
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ cuentasPorPagar }}</div>
              <div class="metric-label">Cuentas por Pagar</div>
            </div>
          </div>
          <div class="metric-bar">
            <div
              class="metric-bar-fill"
              :style="{
                width: `${Math.min(cuentasPorPagar * 5, 100)}%`,
                background: '#ef4444'
              }"
            ></div>
          </div>
        </div>

        <div v-if="puedeVerInventario" class="metric-card">
          <div class="metric-top">
            <div
              class="metric-icon"
              style="background: rgba(245, 158, 11, 0.12); color: #f59e0b;"
              aria-hidden="true"
            >
              <i class="fas fa-boxes"></i>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ stockBajo }}</div>
              <div class="metric-label">Productos con stock bajo</div>
            </div>
          </div>
          <div class="metric-bar">
            <div
              class="metric-bar-fill"
              :style="{
                width: `${Math.min(stockBajo * 10, 100)}%`,
                background: '#f59e0b'
              }"
            ></div>
          </div>
        </div>

        <div v-if="puedeVerVentas" class="metric-card">
          <div class="metric-top">
            <div
              class="metric-icon"
              style="background: rgba(37, 99, 235, 0.12); color: #2563eb;"
              aria-hidden="true"
            >
              <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ sri.firmados }}</div>
              <div class="metric-label">Docs firmados sin enviar</div>
            </div>
          </div>
          <div class="metric-bar">
            <div
              class="metric-bar-fill"
              :style="{
                width: `${Math.min(sri.firmados * 10, 100)}%`,
                background: '#2563eb'
              }"
            ></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== BANDEJAS ===== -->
    <section v-if="puedeVerVentas || puedeVerCompras" class="section">
      <div class="section-header">
        <h2 class="section-title">
          <i class="fas fa-inbox" aria-hidden="true"></i>
          <span>Bandejas de Trabajo</span>
        </h2>
      </div>
      <div class="bandejas-grid">
        <div v-if="puedeVerVentas" class="bandeja-card">
          <div class="bandeja-header">
            <div class="bandeja-title">
              <div
                class="bandeja-icon"
                style="background: linear-gradient(135deg, #2563eb, #1d4ed8);"
                aria-hidden="true"
              >
                <i class="fas fa-hand-holding-usd"></i>
              </div>
              <div>
                <div class="bandeja-name">Ventas Recientes</div>
                <div class="bandeja-sub">Últimos movimientos</div>
              </div>
            </div>
            <router-link to="/ventas" class="bandeja-link">
              Ver todas <i class="fas fa-arrow-right" aria-hidden="true"></i>
            </router-link>
          </div>
          <div class="bandeja-body">
            <BandejaVentasWidget />
          </div>
        </div>

        <div v-if="puedeVerCompras" class="bandeja-card">
          <div class="bandeja-header">
            <div class="bandeja-title">
              <div
                class="bandeja-icon"
                style="background: linear-gradient(135deg, #f59e0b, #d97706);"
                aria-hidden="true"
              >
                <i class="fas fa-shopping-cart"></i>
              </div>
              <div>
                <div class="bandeja-name">Compras Recientes</div>
                <div class="bandeja-sub">Últimos movimientos</div>
              </div>
            </div>
            <router-link to="/compras" class="bandeja-link">
              Ver todas <i class="fas fa-arrow-right" aria-hidden="true"></i>
            </router-link>
          </div>
          <div class="bandeja-body">
            <BandejaComprasWidget />
          </div>
        </div>
      </div>
    </section>

    <!-- ===== GRÁFICOS ===== -->
    <section v-if="puedeVerVentas || puedeVerCompras" class="section">
      <div class="section-header">
        <h2 class="section-title">
          <i class="fas fa-chart-area" aria-hidden="true"></i>
          <span>Tendencia (Últimos 7 días)</span>
        </h2>
      </div>
      <DashboardCharts
        :ventas-diarias="puedeVerVentas ? ventasDiarias : []"
        :compras-diarias="puedeVerCompras ? comprasDiarias : []"
        :dias="dias"
      />
    </section>

    <!-- ===== TOP PRODUCTOS ===== -->
    <section v-if="puedeVerVentas && topProductos.length > 0" class="section">
      <div class="section-header">
        <h2 class="section-title">
          <i class="fas fa-star" aria-hidden="true"></i>
          <span>Top 5 Productos del Mes</span>
        </h2>
      </div>
      <div class="card-cacao">
        <div class="card-body p-0">
          <table class="table-cacao">
            <thead>
              <tr>
                <th style="width: 60px;">#</th>
                <th>Producto</th>
                <th style="width: 120px;">Código</th>
                <th style="width: 120px;" class="text-end">Cantidad</th>
                <th style="width: 140px;" class="text-end">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, idx) in topProductos"
                :key="String(p.productoId || `top-${idx}`)"
              >
                <td>
                  <span class="rank-badge" :class="getRankClass(idx)">{{ idx + 1 }}</span>
                </td>
                <td class="fw-bold">{{ p.nombre }}</td>
                <td class="font-mono small text-muted">{{ p.codigo || '—' }}</td>
                <td class="text-end">{{ p.cantidad }}</td>
                <td class="text-end fw-bold">${{ Number(p.total || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  inject
} from 'vue'
import { usePermisos } from '../composables/usePermisos'
import { useEstadisticas } from '../composables/useEstadisticas'
import { api } from '../services/api'
import { useToast } from 'vue-toastification'
import DashboardCharts from './dashboard/DashboardCharts.vue'
import BandejaVentasWidget from './dashboard/widgets/BandejaVentasWidget.vue'
import BandejaComprasWidget from './dashboard/widgets/BandejaComprasWidget.vue'

const toast = useToast()
const socket = inject('socket', null)

const { puede } = usePermisos()
const {
  ventasHoy,
  ventasAyer,
  ventasMes,
  facturasMes,
  comprasHoy,
  comprasAyer,
  comprasMes,
  comprasDelMes,
  tendenciaVentas,
  tendenciaCompras,
  ventasMesPrev,
  comprasMesPrev,
  ventasDiarias,
  comprasDiarias,
  dias,
  topProductos,
  cuentasPorPagar,
  stockBajo,
  sri,
  cargarEstadisticas
} = useEstadisticas()

// ===== PERMISOS =====
const puedeVerVentas = computed(() => puede('ventas', 'ver'))
const puedeCrearVentas = computed(() => puede('ventas', 'crear'))
const puedeVerCompras = computed(() => puede('compras', 'ver'))
const puedeVerInventario = computed(() => puede('inventario', 'ver'))

// ===== USER (con try/catch) =====
const parseUser = () => {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const user = ref(parseUser())

const nombreUsuario = computed(() => {
  const n = user.value?.nombre
  if (!n || typeof n !== 'string') return 'Usuario'
  return n.split(/\s+/)[0] || 'Usuario'
})

// ===== SALUDO (con tick cada minuto para actualizarse) =====
const horaActual = ref(new Date().getHours())

const saludo = computed(() => {
  const h = horaActual.value
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
})

const iconoSaludo = computed(() => {
  const h = horaActual.value
  if (h < 12) return 'fas fa-sun'
  if (h < 19) return 'fas fa-sun'
  return 'fas fa-moon'
})

// ===== ESTADO DEL SISTEMA =====
const certInfo = ref(null)
const estadoGeneral = ref(null)

const esListo = computed(() => estadoGeneral.value?.listo_para_facturar === true)

// ===== GUARDS =====
let unmounted = false
let infoAbort = null
let statsAbort = null
let relojTimer = null
let kpiRefreshTimer = null
let refreshDebounce = null
const kpisEnVuelo = ref(false)

// ===== CARGA ESTADO SISTEMA =====
const cargarEstadoSistema = async () => {
  if (!puede('usuarios', 'ver')) return

  if (infoAbort) {
    try { infoAbort.abort() } catch { /* noop */ }
  }
  infoAbort = new AbortController()

  try {
    const [diag, cert] = await Promise.allSettled([
      api.request('/diagnostico', {
        method: 'GET',
        skipLoader: true,
        signal: infoAbort.signal
      }),
      api.request('/certificado/info', {
        method: 'GET',
        skipLoader: true,
        signal: infoAbort.signal
      })
    ])

    if (unmounted) return

    if (diag.status === 'fulfilled') estadoGeneral.value = diag.value
    if (cert.status === 'fulfilled') certInfo.value = cert.value
  } catch { /* silencioso */ }
}

// ===== VARIACIONES MES/MES =====
const varMesVentas = computed(() => {
  const prev = Number(ventasMesPrev.value) || 0
  const actual = Number(ventasMes.value) || 0
  if (prev === 0) return actual > 0 ? 100 : 0
  return ((actual - prev) / prev) * 100
})

const varMesCompras = computed(() => {
  const prev = Number(comprasMesPrev.value) || 0
  const actual = Number(comprasMes.value) || 0
  if (prev === 0) return actual > 0 ? 100 : 0
  return ((actual - prev) / prev) * 100
})

// ===== MARGEN =====
const margenBruto = computed(() => {
  const ventas = Number(ventasMes.value) || 0
  const compras = Number(comprasMes.value) || 0
  if (ventas <= 0) return 0
  return ((ventas - compras) / ventas) * 100
})

// ===== ALERTAS =====
const alertas = computed(() => {
  const arr = []
  const puedeVerUsuarios = puede('usuarios', 'ver')

  if (certInfo.value?.cargado && certInfo.value.por_vencer) {
    arr.push({
      id: 'cert-warning',
      nivel: 'warning',
      icon: 'fas fa-shield-alt',
      titulo: 'Certificado por vencer',
      texto: `Vence en ${certInfo.value.dias_restantes} días. Renueva para no interrumpir tu facturación.`,
      to: '/certificado-firma',
      actionLabel: 'Renovar'
    })
  } else if (certInfo.value && !certInfo.value.cargado && puedeVerUsuarios) {
    arr.push({
      id: 'cert-missing',
      nivel: 'danger',
      icon: 'fas fa-exclamation-triangle',
      titulo: 'Sin certificado de firma',
      texto: 'No podrás firmar facturas hasta cargarlo.',
      to: '/certificado-firma',
      actionLabel: 'Cargar'
    })
  }

  const firmados = Number(sri.value?.firmados) || 0
  if (firmados > 0) {
    arr.push({
      id: 'firmados',
      nivel: 'info',
      icon: 'fas fa-cloud-upload-alt',
      titulo: `${firmados} documentos firmados`,
      texto: 'Listos para enviar al SRI.',
      to: '/envio-sri',
      actionLabel: 'Enviar'
    })
  }

  const bajoStock = Number(stockBajo.value) || 0
  if (puedeVerInventario.value && bajoStock > 0) {
    arr.push({
      id: 'stock',
      nivel: 'warning',
      icon: 'fas fa-boxes',
      titulo: `${bajoStock} productos con stock bajo`,
      texto: 'Revisa el inventario para reabastecer.',
      to: '/inventario/stock',
      actionLabel: 'Ver stock'
    })
  }

  return arr
})

// ===== ACCESOS RÁPIDOS =====
const accesosRapidos = computed(() => {
  const accesos = []

  if (puedeCrearVentas.value) {
    accesos.push({
      label: 'Nueva Factura',
      desc: 'Emite comprobante electrónico',
      icon: 'fas fa-file-invoice',
      color: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
      to: '/ventas/nuevo?tipo=factura'
    })
    accesos.push({
      label: 'Guía de Remisión',
      desc: 'Traslado de mercadería',
      icon: 'fas fa-truck',
      color: 'linear-gradient(135deg, #10b981, #059669)',
      to: '/ventas/nuevo?tipo=guia_remision'
    })
    accesos.push({
      label: 'Nota de Crédito',
      desc: 'Anulación o devolución',
      icon: 'fas fa-undo-alt',
      color: 'linear-gradient(135deg, #f59e0b, #d97706)',
      to: '/ventas/nuevo?tipo=nota_credito'
    })
  }
  if (puedeVerVentas.value) {
    accesos.push({
      label: 'Bandeja de Ventas',
      desc: 'Ver y gestionar comprobantes',
      icon: 'fas fa-hand-holding-usd',
      color: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      to: '/ventas'
    })
  }
  if (puede('clientes', 'crear')) {
    accesos.push({
      label: 'Nuevo Cliente',
      desc: 'Registrar en el sistema',
      icon: 'fas fa-user-plus',
      color: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      to: '/clientes/nuevo'
    })
  }
  if (puede('productos', 'crear')) {
    accesos.push({
      label: 'Nuevo Producto',
      desc: 'Agregar al catálogo',
      icon: 'fas fa-box',
      color: 'linear-gradient(135deg, #f59e0b, #d97706)',
      to: '/productos/nuevo'
    })
  }
  if (puedeVerVentas.value) {
    accesos.push({
      label: 'Consultar Documentos',
      desc: 'Buscar por número o clave',
      icon: 'fas fa-search',
      color: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
      to: '/consultar-documentos'
    })
  }
  if (puede('reportes', 'ver')) {
    accesos.push({
      label: 'Reportes',
      desc: 'Ventas, compras y más',
      icon: 'fas fa-chart-line',
      color: 'linear-gradient(135deg, #ef4444, #dc2626)',
      to: '/reportes/ventas'
    })
  }

  return accesos.slice(0, 6)
})

const getRankClass = (idx) => {
  if (idx === 0) return 'gold'
  if (idx === 1) return 'silver'
  if (idx === 2) return 'bronze'
  return 'default'
}

// ===== WEBSOCKET (con debounce) =====
const refrescarEstadisticasConDebounce = () => {
  if (refreshDebounce) clearTimeout(refreshDebounce)
  refreshDebounce = setTimeout(() => {
    refreshDebounce = null
    if (!unmounted && !kpisEnVuelo.value) {
      kpisEnVuelo.value = true
      cargarEstadisticas(true)
        .catch(() => { /* noop */ })
        .finally(() => { kpisEnVuelo.value = false })
    }
  }, 800)
}

const handlerVenta = (venta) => {
  const num = venta?.numero_factura || 'documento'
  toast.info(`📤 Nueva venta: ${num}`)
  refrescarEstadisticasConDebounce()
}

const handlerCompra = (compra) => {
  const num = compra?.numero_factura || 'documento'
  toast.info(`📥 Nueva compra: ${num}`)
  refrescarEstadisticasConDebounce()
}

// ===== LIFECYCLE =====
onMounted(async () => {
  // Carga inicial
  try {
    await Promise.allSettled([
      cargarEstadisticas(),
      cargarEstadoSistema()
    ])
  } catch { /* noop */ }

  // Reloj: actualizar saludo cada minuto
  relojTimer = setInterval(() => {
    if (unmounted) return
    horaActual.value = new Date().getHours()
  }, 60 * 1000)

  // Auto-refresh de KPIs cada 5 minutos
  kpiRefreshTimer = setInterval(() => {
    if (unmounted || kpisEnVuelo.value) return
    kpisEnVuelo.value = true
    cargarEstadisticas(true)
      .catch(() => { /* noop */ })
      .finally(() => { kpisEnVuelo.value = false })
  }, 5 * 60 * 1000)

  // WebSocket
  if (socket && typeof socket.on === 'function') {
    socket.on('nueva-venta', handlerVenta)
    socket.on('nueva-compra', handlerCompra)
  }
})

onBeforeUnmount(() => {
  unmounted = true

  if (infoAbort) {
    try { infoAbort.abort() } catch { /* noop */ }
    infoAbort = null
  }
  if (statsAbort) {
    try { statsAbort.abort() } catch { /* noop */ }
    statsAbort = null
  }
  if (refreshDebounce) {
    clearTimeout(refreshDebounce)
    refreshDebounce = null
  }
  if (relojTimer) {
    clearInterval(relojTimer)
    relojTimer = null
  }
  if (kpiRefreshTimer) {
    clearInterval(kpiRefreshTimer)
    kpiRefreshTimer = null
  }

  if (socket && typeof socket.off === 'function') {
    socket.off('nueva-venta', handlerVenta)
    socket.off('nueva-compra', handlerCompra)
  }
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

/* ============================================================
   HERO
   ============================================================ */
.hero {
  position: relative;
  padding: 40px 40px;
  background: linear-gradient(135deg, #0f1e35 0%, #1e3a5f 55%, #24467a 100%);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(15, 30, 53, 0.18);
}

.hero-content {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.hero-text { flex: 1; min-width: 280px; }

.hero-greeting {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 16px;
  backdrop-filter: blur(8px);
}
.hero-greeting i { color: #fbbf24; }
.hero-greeting strong { color: #fff; font-weight: 700; }

.hero-title {
  font-size: clamp(1.6rem, 3.5vw, 2.25rem);
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.03em;
  margin: 0 0 10px;
  line-height: 1.15;
}

.hero-subtitle {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  max-width: 560px;
  line-height: 1.55;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 13px 24px;
  border-radius: var(--radius-md);
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  transition: all var(--transition);
  border: 1.5px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  height: 48px;
}

.hero-btn-primary {
  background: #fff;
  color: #0f1e35;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.hero-btn-primary:hover {
  transform: translateY(-2px);
  color: #0f1e35;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.hero-btn-ghost {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
}
.hero-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  transform: translateY(-2px);
}

.hero-decoration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 1;
  pointer-events: none;
}

.hero-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
}
.hero-circle-1 {
  width: 320px; height: 320px;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.5), transparent);
  top: -100px; right: -80px;
  animation: heroFloat 12s ease-in-out infinite;
}
.hero-circle-2 {
  width: 260px; height: 260px;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.35), transparent);
  bottom: -100px; right: 25%;
  animation: heroFloat 16s ease-in-out infinite reverse;
}
.hero-circle-3 {
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.3), transparent);
  top: 30%; left: 40%;
  animation: heroFloat 20s ease-in-out infinite;
}

@keyframes heroFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(20px, -20px) scale(1.05); }
  66% { transform: translate(-15px, 15px) scale(0.97); }
}

/* ============================================================
   ALERTAS
   ============================================================ */
.alerts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.alert-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition);
}
.alert-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.alert-warning { border-left-color: var(--warning, #f59e0b); }
.alert-danger { border-left-color: var(--danger, #ef4444); }
.alert-info { border-left-color: var(--info, #0ea5e9); }

.alert-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  flex-shrink: 0;
}
.alert-warning .alert-icon { background: var(--warning-bg, rgba(245,158,11,0.15)); color: var(--warning, #f59e0b); }
.alert-danger .alert-icon { background: var(--danger-bg, rgba(239,68,68,0.15)); color: var(--danger, #ef4444); }
.alert-info .alert-icon { background: var(--info-bg, rgba(14,165,233,0.15)); color: var(--info, #0ea5e9); }

.alert-content { flex: 1; min-width: 0; }
.alert-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.alert-text {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.alert-action {
  padding: 8px 14px;
  border-radius: var(--radius-md);
  background: var(--bg-table-stripe);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
  flex-shrink: 0;
  white-space: nowrap;
}
.alert-action:hover {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);
  transform: translateX(2px);
}

/* ============================================================
   SECCIONES
   ============================================================ */
.section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 1.0625rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 0;
  border: none;
}

.section-title i {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
  color: #fff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  flex-shrink: 0;
}

.section-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-weight: 500;
}

.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--success-bg, rgba(16,185,129,0.15));
  border: 1px solid var(--success-border, rgba(16,185,129,0.3));
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--success, #10b981);
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success, #10b981);
  animation: pulse-status 2s infinite;
}
@keyframes pulse-status {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* ============================================================
   QUICK ACTIONS
   ============================================================ */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: all var(--transition);
  position: relative;
  overflow: hidden;
}
.quick-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.03), transparent 60%);
  opacity: 0;
  transition: opacity var(--transition);
  pointer-events: none;
}
.quick-card:hover {
  transform: translateY(-3px);
  border-color: var(--primary-color);
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.12);
}
.quick-card:hover::before { opacity: 1; }

.quick-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.15rem;
  flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  transition: transform var(--transition);
}
.quick-card:hover .quick-icon { transform: scale(1.08) rotate(-4deg); }

.quick-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.quick-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.quick-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.quick-arrow {
  color: var(--text-muted);
  font-size: 0.8rem;
  transition: all var(--transition);
  flex-shrink: 0;
}
.quick-card:hover .quick-arrow {
  color: var(--primary-color);
  transform: translateX(4px);
}

/* ============================================================
   KPI CARDS
   ============================================================ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.kpi-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  position: relative;
  overflow: hidden;
  transition: all var(--transition);
  border-top: 3px solid var(--accent);
}
.kpi-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 120px;
  height: 120px;
  background: var(--accent);
  opacity: 0.05;
  border-radius: 50%;
  transform: translate(30%, -30%);
  transition: transform var(--transition);
  pointer-events: none;
}
.kpi-card:hover::after {
  transform: translate(20%, -20%) scale(1.2);
}
.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
  border-color: var(--border-strong);
}

.kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  position: relative;
  z-index: 1;
}

.kpi-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.kpi-trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}
.kpi-trend.up { background: var(--success-bg, rgba(16,185,129,0.15)); color: var(--success, #10b981); }
.kpi-trend.down { background: var(--danger-bg, rgba(239,68,68,0.15)); color: var(--danger, #ef4444); }

.kpi-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.05;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  position: relative;
  z-index: 1;
}

.kpi-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  margin-top: 6px;
  position: relative;
  z-index: 1;
}

.kpi-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-light);
  position: relative;
  z-index: 1;
}
.kpi-footer strong { color: var(--text-secondary); font-weight: 600; }

/* ============================================================
   METRICS
   ============================================================ */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 18px;
  transition: all var(--transition);
}
.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.metric-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.metric-info { flex: 1; min-width: 0; }
.metric-value {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.metric-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  margin-top: 3px;
}

.metric-bar {
  height: 5px;
  background: var(--border-light);
  border-radius: 999px;
  overflow: hidden;
}
.metric-bar-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 0.6s ease-out;
}

/* ============================================================
   BANDEJAS
   ============================================================ */
.bandejas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}

.bandeja-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition);
}
.bandeja-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

.bandeja-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-table-stripe);
}

.bandeja-title { display: flex; align-items: center; gap: 12px; }
.bandeja-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.bandeja-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
}
.bandeja-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.bandeja-link {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition: gap 0.15s ease;
}
.bandeja-link:hover { gap: 10px; }

.bandeja-body { padding: 12px 20px 16px; }

/* ============================================================
   TOP PRODUCTOS TABLE
   ============================================================ */
.text-end { text-align: right; }
.p-0 { padding: 0 !important; }

.rank-badge {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 800;
  font-size: 0.75rem;
  letter-spacing: 0;
}
.rank-badge.gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1a2a3a; }
.rank-badge.silver { background: linear-gradient(135deg, #d1d5db, #9ca3af); color: #1a2a3a; }
.rank-badge.bronze { background: linear-gradient(135deg, #d97706, #92400e); color: #fff; }
.rank-badge.default {
  background: var(--bg-table-stripe);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 992px) {
  .dashboard { gap: 28px; }
  .hero { padding: 28px 24px; border-radius: 20px; }
  .kpi-value { font-size: 1.5rem; }
}

@media (max-width: 640px) {
  .dashboard { gap: 24px; }
  .hero { padding: 24px 20px; border-radius: 16px; }
  .hero-content { flex-direction: column; align-items: stretch; }
  .hero-actions { width: 100%; }
  .hero-btn { flex: 1; justify-content: center; }
  .hero-circle { display: none; }
  .quick-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .metrics-grid { grid-template-columns: 1fr; }
  .bandejas-grid { grid-template-columns: 1fr; }
}

/* ============================================================
   ACCESIBILIDAD
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .hero-circle,
  .live-dot {
    animation: none;
  }
  * {
    transition-duration: 0.01ms !important;
  }
}
</style>