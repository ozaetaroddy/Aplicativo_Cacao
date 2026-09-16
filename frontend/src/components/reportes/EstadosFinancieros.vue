<template>
  <div class="estados-financieros-page">
    <!-- HEADER -->
    <div class="page-header no-print">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-teal"><i class="fas fa-chart-line"></i></span>
          Estados Financieros
        </h1>
        <p class="page-subtitle">
          Estado de resultados y balance general con comparación de períodos
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarExcel"
          :disabled="!datosListos || loading"
          aria-label="Exportar a Excel"
        >
          <i class="fas fa-file-excel"></i>
          Excel
        </button>
        <button
          class="btn-danger"
          @click="exportarPDF"
          :disabled="!datosListos || loading"
          aria-label="Exportar a PDF"
        >
          <i class="fas fa-file-pdf"></i>
          PDF
        </button>
        <button
          class="btn-secondary"
          @click="imprimir"
          :disabled="!datosListos || loading"
          aria-label="Imprimir"
        >
          <i class="fas fa-print"></i>
          Imprimir
        </button>
      </div>
    </div>

    <!-- TABS -->
    <div class="tabs no-print">
      <button
        type="button"
        class="tab"
        :class="{ active: tab === 'resultados' }"
        @click="tab = 'resultados'"
      >
        <i class="fas fa-chart-line"></i>
        Estado de Resultados
      </button>
      <button
        type="button"
        class="tab"
        :class="{ active: tab === 'balance' }"
        @click="tab = 'balance'"
      >
        <i class="fas fa-balance-scale"></i>
        Balance General
      </button>
    </div>

    <!-- ============ TAB: ESTADO DE RESULTADOS ============ -->
    <div v-show="tab === 'resultados'">
      <!-- Filtros -->
      <div class="filters-card no-print">
        <div class="filters-grid">
          <div class="form-field">
            <label class="form-label" for="ef-desde">Desde</label>
            <input
              id="ef-desde"
              type="date"
              class="form-input"
              v-model="filtros.desde"
              :disabled="loadingRes"
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="ef-hasta">Hasta</label>
            <input
              id="ef-hasta"
              type="date"
              class="form-input"
              v-model="filtros.hasta"
              :disabled="loadingRes"
            />
          </div>
          <div class="form-field form-field-check">
            <label class="form-label">Comparar</label>
            <label class="checkbox-switch">
              <input
                type="checkbox"
                v-model="filtros.comparar"
                :disabled="loadingRes"
              />
              <span>Con período anterior</span>
            </label>
          </div>
          <div class="quick-dates">
            <button
              v-for="q in quickDates"
              :key="q.label"
              type="button"
              class="quick-chip"
              :disabled="loadingRes"
              @click="aplicarQuickDate(q)"
            >
              {{ q.label }}
            </button>
          </div>
          <div class="filters-actions">
            <button
              type="button"
              class="btn-primary"
              @click="cargarResultados"
              :disabled="loadingRes || !filtros.desde || !filtros.hasta"
              aria-label="Generar estado de resultados"
            >
              <i class="fas fa-sync" :class="{ 'fa-spin': loadingRes }"></i>
              {{ loadingRes ? 'Calculando...' : 'Generar' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loadingRes" class="loading-block no-print">
        <div class="spinner-lg"></div>
        <p>Calculando estado de resultados...</p>
      </div>

      <!-- Empty -->
      <div v-else-if="!resultados" class="empty-block no-print">
        <div class="empty-icon"><i class="fas fa-chart-line"></i></div>
        <div class="empty-title">Estado de Resultados</div>
        <div class="empty-text">
          Selecciona un período y presiona <strong>Generar</strong> para ver
          el estado de resultados con ingresos, costos, gastos y utilidades.
        </div>
      </div>

      <!-- Resultados -->
      <div v-else ref="contenidoResultados">
        <!-- Header documento -->
        <div class="documento-header">
          <h2 class="doc-title">ESTADO DE RESULTADOS</h2>
          <div class="doc-subtitle">
            Del {{ formatFecha(resultados.periodo?.desde) }} al
            {{ formatFecha(resultados.periodo?.hasta) }}
          </div>
          <div v-if="nombreEmpresa" class="doc-empresa">{{ nombreEmpresa }}</div>
        </div>

        <!-- Comparación -->
        <div v-if="resultados.comparacion" class="card-cacao">
          <div class="card-header">
            <i class="fas fa-exchange-alt me-2"></i>
            Comparación con período anterior
          </div>
          <div class="card-body">
            <div class="comp-grid">
              <div class="comp-box">
                <div class="comp-label">Ingresos actuales</div>
                <div class="comp-value">{{ formatCurrency(resultados.ingresos?.ingresosNetos) }}</div>
                <div class="comp-sub">{{ resultados.ingresos?.cantidadFacturas || 0 }} facturas</div>
              </div>
              <div class="comp-box">
                <div class="comp-label">Ingresos anteriores</div>
                <div class="comp-value">{{ formatCurrency(resultados.comparacion.ingresosNetos) }}</div>
                <div class="comp-sub">
                  {{ formatFecha(resultados.comparacion.periodo_anterior?.desde) }} -
                  {{ formatFecha(resultados.comparacion.periodo_anterior?.hasta) }}
                </div>
              </div>
              <div class="comp-box comp-box-highlight">
                <div class="comp-label">Variación</div>
                <div
                  class="comp-value"
                  :class="claseVariacion(resultados.comparacion.variaciones?.ingresosNetos)"
                >
                  {{ formatVariacion(resultados.comparacion.variaciones?.ingresosNetos) }}
                </div>
                <div class="comp-sub">
                  {{ formatVariacionAbsoluta(
                    resultados.ingresos?.ingresosNetos,
                    resultados.comparacion.ingresosNetos
                  ) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cuadro ER -->
        <div class="card-cacao">
          <div class="card-body p-0">
            <table class="er-table">
              <tbody>
                <tr class="er-section">
                  <td colspan="2">INGRESOS OPERACIONALES</td>
                </tr>
                <tr>
                  <td>Ventas brutas ({{ resultados.ingresos?.cantidadFacturas || 0 }} facturas)</td>
                  <td class="text-end">{{ formatCurrency(resultados.ingresos?.subtotal) }}</td>
                </tr>
                <tr v-if="(resultados.ingresos?.devoluciones || 0) > 0">
                  <td class="text-muted ps-4">(-) Devoluciones / Notas de crédito</td>
                  <td class="text-end text-danger">
                    -{{ formatCurrency(resultados.ingresos.devoluciones) }}
                  </td>
                </tr>
                <tr class="er-subtotal">
                  <td>(=) INGRESOS NETOS</td>
                  <td class="text-end">{{ formatCurrency(resultados.ingresos?.ingresosNetos) }}</td>
                </tr>

                <tr class="er-section">
                  <td colspan="2">COSTO DE VENTAS</td>
                </tr>
                <tr>
                  <td>Costo de los productos vendidos</td>
                  <td class="text-end">{{ formatCurrency(resultados.costos?.costoDeVentas) }}</td>
                </tr>
                <tr class="er-subtotal">
                  <td>(=) UTILIDAD BRUTA</td>
                  <td
                    class="text-end"
                    :class="(resultados.utilidad?.utilidadBruta || 0) >= 0 ? 'text-success' : 'text-danger'"
                  >
                    {{ formatCurrency(resultados.utilidad?.utilidadBruta) }}
                  </td>
                </tr>
                <tr class="er-meta">
                  <td>Margen bruto</td>
                  <td class="text-end">{{ (resultados.costos?.margenBruto || 0).toFixed(2) }}%</td>
                </tr>

                <tr class="er-section">
                  <td colspan="2">GASTOS OPERATIVOS</td>
                </tr>
                <tr>
                  <td>
                    Gastos administrativos y otros
                    ({{ resultados.gastos?.cantidadCompras || 0 }} compras)
                  </td>
                  <td class="text-end text-danger">
                    -{{ formatCurrency(resultados.gastos?.gastosOperativos) }}
                  </td>
                </tr>
                <tr class="er-subtotal">
                  <td>(=) UTILIDAD OPERATIVA</td>
                  <td class="text-end">
                    {{
                      formatCurrency(
                        (resultados.utilidad?.utilidadBruta || 0) -
                        (resultados.gastos?.gastosOperativos || 0)
                      )
                    }}
                  </td>
                </tr>

                <tr class="er-section">
                  <td colspan="2">RESULTADO DEL EJERCICIO</td>
                </tr>
                <tr class="er-total">
                  <td>(=) UTILIDAD NETA DEL PERÍODO</td>
                  <td
                    class="text-end"
                    :class="(resultados.utilidad?.utilidadNeta || 0) >= 0 ? 'text-success' : 'text-danger'"
                  >
                    {{ formatCurrency(resultados.utilidad?.utilidadNeta) }}
                  </td>
                </tr>
                <tr class="er-meta">
                  <td>Margen neto</td>
                  <td class="text-end">{{ (resultados.utilidad?.margenNeto || 0).toFixed(2) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- IVA Informativo -->
        <div class="card-cacao">
          <div class="card-header">
            <i class="fas fa-percent me-2"></i>
            Resumen de IVA (informativo)
          </div>
          <div class="card-body">
            <div class="iva-grid">
              <div class="iva-box iva-box-info">
                <div class="iva-label">IVA en ventas</div>
                <div class="iva-value">{{ formatCurrency(resultados.iva?.ivaVentas) }}</div>
              </div>
              <div class="iva-box iva-box-warning">
                <div class="iva-label">IVA en compras</div>
                <div class="iva-value">{{ formatCurrency(resultados.iva?.ivaCompras) }}</div>
              </div>
              <div
                class="iva-box"
                :class="(resultados.iva?.ivaPorPagar || 0) > 0 ? 'iva-box-danger' : 'iva-box-success'"
              >
                <div class="iva-label">IVA por pagar</div>
                <div class="iva-value">{{ formatCurrency(resultados.iva?.ivaPorPagar) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Desglose gastos por proveedor -->
        <div v-if="resultados.gastos?.desglosePorProveedor?.length > 0" class="card-cacao">
          <div class="card-header">
            <i class="fas fa-list me-2"></i>
            Gastos por proveedor
            <span class="header-count">Top {{ resultados.gastos.desglosePorProveedor.length }}</span>
          </div>
          <div class="card-body p-0">
            <table class="table-modern">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th style="width:160px;">RUC</th>
                  <th style="width:100px;" class="text-center">Compras</th>
                  <th style="width:140px;" class="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in resultados.gastos.desglosePorProveedor" :key="g.proveedorId || g._id">
                  <td>
                    <div class="prod-nombre" :title="g.proveedorNombre">
                      {{ g.proveedorNombre || 'N/A' }}
                    </div>
                  </td>
                  <td><code class="ruc-badge">{{ g.proveedorRuc || '—' }}</code></td>
                  <td class="text-center">{{ g.cantidad || 0 }}</td>
                  <td class="text-end money-total">{{ formatCurrency(g.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Meta -->
        <div v-if="resultados._meta?.tiempoMs" class="meta-info no-print">
          <i class="far fa-clock"></i>
          Calculado en {{ resultados._meta.tiempoMs }}ms
        </div>
      </div>
    </div>

    <!-- ============ TAB: BALANCE GENERAL ============ -->
    <div v-show="tab === 'balance'">
      <!-- Filtros -->
      <div class="filters-card no-print">
        <div class="filters-grid">
          <div class="form-field">
            <label class="form-label" for="ef-fecha-balance">Fecha de corte</label>
            <input
              id="ef-fecha-balance"
              type="date"
              class="form-input"
              v-model="filtros.fechaBalance"
              :disabled="loadingBal"
            />
          </div>
          <div class="quick-dates">
            <button
              type="button"
              class="quick-chip"
              :disabled="loadingBal"
              @click="atajoBalance('hoy')"
            >
              Hoy
            </button>
            <button
              type="button"
              class="quick-chip"
              :disabled="loadingBal"
              @click="atajoBalance('fin-mes')"
            >
              Fin de mes
            </button>
            <button
              type="button"
              class="quick-chip"
              :disabled="loadingBal"
              @click="atajoBalance('fin-anio')"
            >
              Fin de año
            </button>
          </div>
          <div class="filters-actions">
            <button
              type="button"
              class="btn-primary"
              @click="cargarBalance"
              :disabled="loadingBal || !filtros.fechaBalance"
              aria-label="Generar balance general"
            >
              <i class="fas fa-sync" :class="{ 'fa-spin': loadingBal }"></i>
              {{ loadingBal ? 'Calculando...' : 'Generar' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loadingBal" class="loading-block no-print">
        <div class="spinner-lg"></div>
        <p>Calculando balance general...</p>
      </div>

      <!-- Empty -->
      <div v-else-if="!balance" class="empty-block no-print">
        <div class="empty-icon"><i class="fas fa-balance-scale"></i></div>
        <div class="empty-title">Balance General</div>
        <div class="empty-text">
          Selecciona una fecha de corte y presiona <strong>Generar</strong> para
          ver el balance general con activos, pasivos y patrimonio.
        </div>
      </div>

      <!-- Balance -->
      <div v-else ref="contenidoBalance">
        <div class="documento-header">
          <h2 class="doc-title">BALANCE GENERAL</h2>
          <div class="doc-subtitle">Al {{ formatFecha(balance.fecha_corte) }}</div>
          <div v-if="nombreEmpresa" class="doc-empresa">{{ nombreEmpresa }}</div>
        </div>

        <div class="balance-grid">
          <!-- ACTIVOS -->
          <div class="card-cacao balance-card">
            <div class="card-header balance-header-activos">
              <i class="fas fa-coins me-2"></i>
              ACTIVOS
            </div>
            <div class="card-body">
              <div class="balance-section-title balance-title-activos">ACTIVO CORRIENTE</div>
              <div class="balance-row">
                <span>Inventario (valor de compra)</span>
                <span class="balance-num">{{ formatCurrency(balance.activos?.inventario) }}</span>
              </div>
              <div class="balance-row">
                <span>Cuentas por cobrar ({{ balance.activos?.cantidadCxC || 0 }})</span>
                <span class="balance-num">{{ formatCurrency(balance.activos?.cuentasPorCobrar) }}</span>
              </div>
              <div class="balance-row">
                <span>IVA crédito tributario</span>
                <span class="balance-num">{{ formatCurrency(balance.activos?.ivaCreditoTributario) }}</span>
              </div>
              <div class="balance-total balance-total-activos">
                <span>TOTAL ACTIVOS</span>
                <span>{{ formatCurrency(balance.activos?.total) }}</span>
              </div>
            </div>
          </div>

          <!-- PASIVOS + PATRIMONIO -->
          <div class="card-cacao balance-card">
            <div class="card-header balance-header-pasivos">
              <i class="fas fa-hand-holding-usd me-2"></i>
              PASIVOS Y PATRIMONIO
            </div>
            <div class="card-body">
              <div class="balance-section-title balance-title-pasivos">PASIVO CORRIENTE</div>
              <div class="balance-row">
                <span>Cuentas por pagar ({{ balance.pasivos?.cantidadCxP || 0 }})</span>
                <span class="balance-num">{{ formatCurrency(balance.pasivos?.cuentasPorPagar) }}</span>
              </div>
              <div class="balance-row">
                <span>IVA por pagar</span>
                <span class="balance-num">{{ formatCurrency(balance.pasivos?.ivaPorPagar) }}</span>
              </div>
              <div class="balance-subtotal balance-subtotal-pasivos">
                <span>TOTAL PASIVOS</span>
                <span>{{ formatCurrency(balance.pasivos?.total) }}</span>
              </div>

              <div class="balance-section-title balance-title-patrimonio mt-3">PATRIMONIO</div>
              <div class="balance-row">
                <span>Utilidades acumuladas</span>
                <span class="balance-num">{{ formatCurrency(balance.patrimonio?.utilidadesAcumuladas) }}</span>
              </div>
              <div class="balance-subtotal balance-subtotal-patrimonio">
                <span>TOTAL PATRIMONIO</span>
                <span>{{ formatCurrency(balance.patrimonio?.total) }}</span>
              </div>

              <div class="balance-total balance-total-final">
                <span>TOTAL PASIVO + PATRIMONIO</span>
                <span>
                  {{
                    formatCurrency(
                      (balance.pasivos?.total || 0) + (balance.patrimonio?.total || 0)
                    )
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Verificación contable -->
        <div
          class="verificacion-card"
          :class="balance.verificacion?.cuadra ? 'verif-ok' : 'verif-warn'"
        >
          <div class="verif-icon">
            <i
              :class="
                balance.verificacion?.cuadra
                  ? 'fas fa-check-circle'
                  : 'fas fa-exclamation-triangle'
              "
            ></i>
          </div>
          <div class="verif-body">
            <div class="verif-title">
              {{
                balance.verificacion?.cuadra
                  ? 'Ecuación contable cuadra correctamente'
                  : 'La ecuación contable NO cuadra'
              }}
            </div>
            <div class="verif-detail">
              Activos: {{ formatCurrency(balance.verificacion?.totalActivos) }} |
              Pasivos + Patrimonio:
              {{ formatCurrency(balance.verificacion?.totalPasivoPatrimonio) }}
              <span v-if="!balance.verificacion?.cuadra">
                | Diferencia: {{ formatCurrency(balance.verificacion?.diferencia) }}
              </span>
            </div>
            <div
              v-if="balance.verificacion?.nota"
              class="verif-note"
            >
              <i class="fas fa-info-circle"></i>
              {{ balance.verificacion.nota }}
            </div>
          </div>
        </div>

        <div v-if="balance._meta?.tiempoMs" class="meta-info no-print">
          <i class="far fa-clock"></i>
          Calculado en {{ balance._meta.tiempoMs }}ms
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { formatCurrency, roundTo2 } from '../../utils/formatters'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()

// ===== CONSTANTES =====
const STORAGE_TAB_KEY = 'eeff_tab'
const QUICK_DATES_RES = Object.freeze([
  { label: 'Este mes', tipo: 'mes' },
  { label: 'Mes anterior', tipo: 'mes-anterior' },
  { label: 'Trimestre', tipo: 'trimestre' },
  { label: 'Este año', tipo: 'anio' }
])

// ===== STATE =====
const tab = ref('resultados')

const filtros = ref({
  desde: '',
  hasta: '',
  comparar: false,
  fechaBalance: new Date().toISOString().slice(0, 10)
})

const resultados = ref(null)
const balance = ref(null)
const loadingRes = ref(false)
const loadingBal = ref(false)

const nombreEmpresa = ref('')

let unmounted = false

const quickDates = QUICK_DATES_RES

// ===== COMPUTED =====
const datosListos = computed(() => {
  if (tab.value === 'resultados') return Boolean(resultados.value)
  if (tab.value === 'balance') return Boolean(balance.value)
  return false
})

// ===== HELPERS =====
const formatFecha = (fecha) => {
  if (!fecha) return '—'
  try {
    return new Date(fecha).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return '—'
  }
}

const toISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ===== ATAJOS RÁPIDOS RESULTADOS =====
const aplicarQuickDate = (q) => {
  const hoy = new Date()
  if (q.tipo === 'mes') {
    filtros.value.desde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    filtros.value.hasta = toISODate(hoy)
  } else if (q.tipo === 'mes-anterior') {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    filtros.value.desde = toISODate(inicio)
    filtros.value.hasta = toISODate(fin)
  } else if (q.tipo === 'trimestre') {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)
    filtros.value.desde = toISODate(inicio)
    filtros.value.hasta = toISODate(hoy)
  } else if (q.tipo === 'anio') {
    filtros.value.desde = toISODate(new Date(hoy.getFullYear(), 0, 1))
    filtros.value.hasta = toISODate(hoy)
  }
}

// ===== ATAJOS BALANCE =====
const atajoBalance = (tipo) => {
  const hoy = new Date()
  if (tipo === 'hoy') {
    filtros.value.fechaBalance = toISODate(hoy)
  } else if (tipo === 'fin-mes') {
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    filtros.value.fechaBalance = toISODate(fin)
  } else if (tipo === 'fin-anio') {
    const fin = new Date(hoy.getFullYear(), 11, 31)
    filtros.value.fechaBalance = toISODate(fin)
  }
}

// ===== VARIACIÓN =====
const claseVariacion = (pct) => {
  if (pct === null || pct === undefined) return ''
  if (pct > 0) return 'text-success'
  if (pct < 0) return 'text-danger'
  return 'text-muted'
}

const formatVariacion = (pct) => {
  if (pct === null || pct === undefined) return '—'
  const n = Number(pct)
  if (!Number.isFinite(n)) return '—'
  const signo = n >= 0 ? '+' : ''
  return `${signo}${n.toFixed(2)}%`
}

const formatVariacionAbsoluta = (actual, anterior) => {
  const a = Number(actual) || 0
  const b = Number(anterior) || 0
  const diff = roundTo2(a - b)
  const signo = diff >= 0 ? '+' : ''
  return `${signo}${formatCurrency(diff)}`
}

// ===== CARGAR RESULTADOS =====
const cargarResultados = async () => {
  if (!filtros.value.desde || !filtros.value.hasta) {
    toast.warning('Completa las fechas "desde" y "hasta"')
    return
  }
  if (filtros.value.desde > filtros.value.hasta) {
    toast.warning('La fecha "desde" no puede ser posterior a "hasta"')
    return
  }
  if (loadingRes.value) return

  loadingRes.value = true
  try {
    const params = new URLSearchParams()
    params.set('desde', filtros.value.desde)
    params.set('hasta', filtros.value.hasta)
    if (filtros.value.comparar) params.set('comparar', 'true')

    const res = await api.request(`/estados-financieros/resultados?${params.toString()}`, {
      method: 'GET',
      loaderMessage: 'Calculando estado de resultados...'
    })
    if (unmounted) return

    resultados.value = res
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'PERIODO_DEMASIADO_LARGO') {
      toast.warning(e.message || 'El período es demasiado largo')
    } else if (codigo === 'RANGO_INVALIDO') {
      toast.error('Rango de fechas inválido')
    } else if (codigo === 'DESDE_INVALIDO') {
      toast.error('Fecha "desde" inválida')
    } else if (codigo === 'HASTA_INVALIDO') {
      toast.error('Fecha "hasta" inválida')
    } else {
      toast.error('Error al generar estado de resultados: ' + e.message)
    }
    resultados.value = null
  } finally {
    if (!unmounted) loadingRes.value = false
  }
}

// ===== CARGAR BALANCE =====
const cargarBalance = async () => {
  if (!filtros.value.fechaBalance) {
    toast.warning('Selecciona una fecha de corte')
    return
  }
  if (loadingBal.value) return

  loadingBal.value = true
  try {
    const res = await api.request(
      `/estados-financieros/balance?fecha=${filtros.value.fechaBalance}`,
      { method: 'GET', loaderMessage: 'Calculando balance general...' }
    )
    if (unmounted) return

    balance.value = res
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code

    if (codigo === 'FECHA_REQUERIDA') {
      toast.error('Selecciona una fecha de corte')
    } else {
      toast.error('Error al generar balance: ' + e.message)
    }
    balance.value = null
  } finally {
    if (!unmounted) loadingBal.value = false
  }
}

// ===== EMPRESA =====
const cargarEmpresa = async () => {
  try {
    const res = await api.request('/configuracion/empresa', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return
    const razon = res?.razon_social || res?.nombre_comercial || ''
    const ruc = res?.ruc || ''
    nombreEmpresa.value = razon && ruc ? `${razon} — RUC: ${ruc}` : razon
  } catch {
    /* silencioso */
  }
}

// ===== EXPORTAR EXCEL =====
const exportarExcel = () => {
  if (!datosListos.value) {
    toast.warning('Genera un reporte primero')
    return
  }

  const wb = XLSX.utils.book_new()

  if (tab.value === 'resultados' && resultados.value) {
    const r = resultados.value
    const rows = [
      ['ESTADO DE RESULTADOS'],
      [`Del ${formatFecha(r.periodo?.desde)} al ${formatFecha(r.periodo?.hasta)}`],
      [],
      ['CONCEPTO', 'VALOR'],
      ['INGRESOS OPERACIONALES', ''],
      [`Ventas brutas (${r.ingresos?.cantidadFacturas || 0})`, r.ingresos?.subtotal || 0],
      ['(-) Devoluciones', -(r.ingresos?.devoluciones || 0)],
      ['(=) INGRESOS NETOS', r.ingresos?.ingresosNetos || 0],
      [],
      ['COSTO DE VENTAS', r.costos?.costoDeVentas || 0],
      ['(=) UTILIDAD BRUTA', r.utilidad?.utilidadBruta || 0],
      ['Margen Bruto (%)', r.costos?.margenBruto || 0],
      [],
      ['GASTOS OPERATIVOS', r.gastos?.gastosOperativos || 0],
      ['(=) UTILIDAD OPERATIVA',
        (r.utilidad?.utilidadBruta || 0) - (r.gastos?.gastosOperativos || 0)],
      [],
      ['(=) UTILIDAD NETA', r.utilidad?.utilidadNeta || 0],
      ['Margen Neto (%)', r.utilidad?.margenNeto || 0],
      [],
      ['IVA EN VENTAS', r.iva?.ivaVentas || 0],
      ['IVA EN COMPRAS', r.iva?.ivaCompras || 0],
      ['IVA POR PAGAR', r.iva?.ivaPorPagar || 0]
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 50 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Estado Resultados')

    if (r.gastos?.desglosePorProveedor?.length > 0) {
      const detalle = r.gastos.desglosePorProveedor.map(g => ({
        Proveedor: g.proveedorNombre || 'N/A',
        RUC: g.proveedorRuc || '',
        Compras: g.cantidad || 0,
        Total: g.total || 0
      }))
      const ws2 = XLSX.utils.json_to_sheet(detalle)
      ws2['!cols'] = [{ wch: 35 }, { wch: 16 }, { wch: 12 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Gastos por proveedor')
    }
  } else if (tab.value === 'balance' && balance.value) {
    const b = balance.value
    const rows = [
      ['BALANCE GENERAL'],
      [`Al ${formatFecha(b.fecha_corte)}`],
      [],
      ['ACTIVOS', ''],
      ['Inventario', b.activos?.inventario || 0],
      ['Cuentas por cobrar', b.activos?.cuentasPorCobrar || 0],
      ['IVA crédito', b.activos?.ivaCreditoTributario || 0],
      ['TOTAL ACTIVOS', b.activos?.total || 0],
      [],
      ['PASIVOS', ''],
      ['Cuentas por pagar', b.pasivos?.cuentasPorPagar || 0],
      ['IVA por pagar', b.pasivos?.ivaPorPagar || 0],
      ['TOTAL PASIVOS', b.pasivos?.total || 0],
      [],
      ['PATRIMONIO', ''],
      ['Utilidades acumuladas', b.patrimonio?.utilidadesAcumuladas || 0],
      ['TOTAL PATRIMONIO', b.patrimonio?.total || 0],
      [],
      ['TOTAL PASIVO + PATRIMONIO',
        (b.pasivos?.total || 0) + (b.patrimonio?.total || 0)],
      ['Verificación contable', b.verificacion?.cuadra ? 'OK' : 'NO CUADRA']
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 35 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Balance General')
  }

  const sufijo =
    tab.value === 'resultados'
      ? `${filtros.value.desde}_${filtros.value.hasta}`
      : filtros.value.fechaBalance

  XLSX.writeFile(wb, `estados_financieros_${sufijo}.xlsx`)
  toast.success('Excel generado correctamente')
}

// ===== EXPORTAR PDF =====
const exportarPDF = () => {
  if (!datosListos.value) {
    toast.warning('Genera un reporte primero')
    return
  }

  if (tab.value === 'resultados' && resultados.value) {
    exportarResultadosPDF()
  } else if (tab.value === 'balance' && balance.value) {
    exportarBalancePDF()
  }
}

const exportarResultadosPDF = () => {
  const r = resultados.value
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE RESULTADOS', pageWidth / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Del ${formatFecha(r.periodo?.desde)} al ${formatFecha(r.periodo?.hasta)}`,
    pageWidth / 2, y, { align: 'center' }
  )
  y += 5
  if (nombreEmpresa.value) {
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(nombreEmpresa.value, pageWidth / 2, y, { align: 'center' })
    doc.setTextColor(0)
  }
  y += 10

  const rows = [
    ['INGRESOS OPERACIONALES', ''],
    [`Ventas brutas (${r.ingresos?.cantidadFacturas || 0} facturas)`, (r.ingresos?.subtotal || 0).toFixed(2)],
    ...((r.ingresos?.devoluciones || 0) > 0
      ? [['(-) Devoluciones / Notas de crédito', `-${(r.ingresos.devoluciones || 0).toFixed(2)}`]]
      : []),
    ['(=) INGRESOS NETOS', (r.ingresos?.ingresosNetos || 0).toFixed(2)],
    ['', ''],
    ['COSTO DE VENTAS', ''],
    ['Costo de los productos vendidos', (r.costos?.costoDeVentas || 0).toFixed(2)],
    ['(=) UTILIDAD BRUTA', (r.utilidad?.utilidadBruta || 0).toFixed(2)],
    [`Margen bruto: ${(r.costos?.margenBruto || 0).toFixed(2)}%`, ''],
    ['', ''],
    ['GASTOS OPERATIVOS', ''],
    [
      `Gastos administrativos y otros (${r.gastos?.cantidadCompras || 0} compras)`,
      `-${(r.gastos?.gastosOperativos || 0).toFixed(2)}`
    ],
    [
      '(=) UTILIDAD OPERATIVA',
      ((r.utilidad?.utilidadBruta || 0) - (r.gastos?.gastosOperativos || 0)).toFixed(2)
    ],
    ['', ''],
    ['RESULTADO DEL EJERCICIO', ''],
    ['(=) UTILIDAD NETA DEL PERÍODO', (r.utilidad?.utilidadNeta || 0).toFixed(2)],
    [`Margen neto: ${(r.utilidad?.margenNeto || 0).toFixed(2)}%`, '']
  ]

  autoTable(doc, {
    startY: y,
    head: [['CONCEPTO', 'VALOR ($)']],
    body: rows,
    theme: 'plain',
    headStyles: { fillColor: [44, 62, 80], fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      const text = String(data.cell.raw || '')
      if (
        text.startsWith('INGRESOS') ||
        text.startsWith('COSTO') ||
        text.startsWith('GASTOS') ||
        text.startsWith('RESULTADO')
      ) {
        data.cell.styles.fillColor = [240, 240, 240]
        data.cell.styles.fontStyle = 'bold'
      }
      if (text.startsWith('(=)')) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [250, 250, 250]
      }
    }
  })

  y = doc.lastAutoTable.finalY + 10

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('RESUMEN DE IVA (informativo)', 14, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(`IVA en Ventas: $${(r.iva?.ivaVentas || 0).toFixed(2)}`, 14, y)
  y += 5
  doc.text(`IVA en Compras: $${(r.iva?.ivaCompras || 0).toFixed(2)}`, 14, y)
  y += 5
  doc.text(`IVA por Pagar: $${(r.iva?.ivaPorPagar || 0).toFixed(2)}`, 14, y)

  doc.save(`estado_resultados_${filtros.value.desde}_${filtros.value.hasta}.pdf`)
  toast.success('PDF generado correctamente')
}

const exportarBalancePDF = () => {
  const b = balance.value
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('BALANCE GENERAL', pageWidth / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Al ${formatFecha(b.fecha_corte)}`, pageWidth / 2, y, { align: 'center' })
  y += 5
  if (nombreEmpresa.value) {
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(nombreEmpresa.value, pageWidth / 2, y, { align: 'center' })
    doc.setTextColor(0)
  }
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ACTIVOS', 14, y)
  doc.text('PASIVOS Y PATRIMONIO', pageWidth / 2 + 5, y)
  y += 5

  const startY = y
  autoTable(doc, {
    startY,
    head: [['Activo', 'Valor']],
    body: [
      ['Inventario', (b.activos?.inventario || 0).toFixed(2)],
      [`CxC (${b.activos?.cantidadCxC || 0})`, (b.activos?.cuentasPorCobrar || 0).toFixed(2)],
      ['IVA crédito', (b.activos?.ivaCreditoTributario || 0).toFixed(2)],
      ['TOTAL ACTIVOS', (b.activos?.total || 0).toFixed(2)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [52, 152, 219], fontSize: 9 },
    styles: { fontSize: 8 },
    margin: { left: 14, right: pageWidth / 2 + 2 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30, halign: 'right' }
    }
  })

  autoTable(doc, {
    startY,
    head: [['Pasivo / Patrimonio', 'Valor']],
    body: [
      [`CxP (${b.pasivos?.cantidadCxP || 0})`, (b.pasivos?.cuentasPorPagar || 0).toFixed(2)],
      ['IVA por pagar', (b.pasivos?.ivaPorPagar || 0).toFixed(2)],
      ['TOTAL PASIVOS', (b.pasivos?.total || 0).toFixed(2)],
      ['Utilidades acumuladas', (b.patrimonio?.utilidadesAcumuladas || 0).toFixed(2)],
      ['TOTAL PATRIMONIO', (b.patrimonio?.total || 0).toFixed(2)],
      [
        'TOTAL PASIVO + PATRIMONIO',
        ((b.pasivos?.total || 0) + (b.patrimonio?.total || 0)).toFixed(2)
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: [231, 76, 60], fontSize: 9 },
    styles: { fontSize: 8 },
    margin: { left: pageWidth / 2 + 2, right: 14 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30, halign: 'right' }
    }
  })

  y = Math.max(
    doc.lastAutoTable.finalY + 10,
    (doc.previousAutoTable?.finalY || 0) + 10
  )

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  const okCuadra = b.verificacion?.cuadra
  doc.setTextColor(okCuadra ? 39 : 231, okCuadra ? 174 : 76, okCuadra ? 96 : 60)
  doc.text(
    okCuadra
      ? '✓ La ecuación contable cuadra correctamente'
      : '⚠ La ecuación contable NO cuadra',
    14,
    y
  )
  doc.setTextColor(0)

  doc.save(`balance_general_${filtros.value.fechaBalance}.pdf`)
  toast.success('PDF generado correctamente')
}

const imprimir = () => window.print()

// ===== WATCHERS =====
watch(tab, (v) => {
  try {
    sessionStorage.setItem(STORAGE_TAB_KEY, v)
  } catch { /* noop */ }
})

// ===== LIFECYCLE =====
onMounted(async () => {
  // Restaurar tab
  try {
    const saved = sessionStorage.getItem(STORAGE_TAB_KEY)
    if (saved === 'resultados' || saved === 'balance') tab.value = saved
  } catch { /* noop */ }

  // Default período: mes actual
  const hoy = new Date()
  filtros.value.desde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  filtros.value.hasta = toISODate(hoy)

  await cargarEmpresa()
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.estados-financieros-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-teal { background: linear-gradient(135deg, #16a085, #138d75); box-shadow: 0 6px 16px rgba(22,160,133,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary, .btn-danger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
  text-decoration: none;
}
.btn-primary { background: linear-gradient(135deg, #16a085, #138d75); color: #fff; box-shadow: 0 4px 12px rgba(22,160,133,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(22,160,133,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #16a085; color: #16a085; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

/* TABS */
.tabs { display: inline-flex; gap: 4px; padding: 4px; background: var(--bg-table-stripe); border-radius: var(--radius-lg); align-self: flex-start; }
.tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-md); border: none; background: transparent; color: var(--text-muted); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.tab:hover:not(.active) { color: #16a085; }
.tab.active { background: var(--bg-card); color: #16a085; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

/* FILTROS */
.filters-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px 20px; }
.filters-grid { display: grid; grid-template-columns: 1fr 1fr auto 1fr auto; gap: 12px; align-items: end; }
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-field-check { min-width: 180px; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-input { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.form-input:focus { border-color: #16a085; box-shadow: 0 0 0 4px rgba(22,160,133,0.15); background: var(--bg-card); }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }

.checkbox-switch { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-table-stripe); border-radius: var(--radius-md); border: 1.5px solid var(--border-color); cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); transition: all var(--transition-fast); }
.checkbox-switch:hover { border-color: #16a085; }
.checkbox-switch input { accent-color: #16a085; cursor: pointer; }

.quick-dates { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.quick-chip { padding: 6px 12px; background: var(--bg-table-stripe); border: 1px solid var(--border-color); border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); font-family: inherit; white-space: nowrap; }
.quick-chip:hover:not(:disabled) { border-color: #16a085; color: #16a085; background: rgba(22,160,133,0.06); }
.quick-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.filters-actions { display: flex; justify-content: flex-end; }
.filters-actions .btn-primary { padding: 11px 24px; }

/* DOCUMENTO */
.documento-header { text-align: center; padding: 16px; background: var(--bg-table-stripe); border-radius: var(--radius-lg); margin-bottom: 4px; }
.doc-title { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; letter-spacing: 0.5px; }
.doc-subtitle { font-size: 0.85rem; color: var(--text-secondary); }
.doc-empresa { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; }

/* COMPARACIÓN */
.comp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.comp-box { padding: 14px 16px; background: var(--bg-table-stripe); border-radius: var(--radius-md); text-align: center; border: 1px solid var(--border-color); }
.comp-box-highlight { background: linear-gradient(135deg, rgba(22,160,133,0.08), rgba(22,160,133,0.03)); border-color: rgba(22,160,133,0.3); }
.comp-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px; }
.comp-value { font-size: 1.35rem; font-weight: 800; color: var(--text-primary); margin: 6px 0; font-variant-numeric: tabular-nums; }
.comp-sub { font-size: 0.72rem; color: var(--text-muted); }

/* ER TABLE */
.er-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.er-table td { padding: 10px 20px; border: none; vertical-align: middle; }
.er-section td { background: var(--bg-table-stripe); font-weight: 800; color: var(--text-primary); letter-spacing: 0.5px; font-size: 0.82rem; padding: 10px 20px; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
.er-subtotal td { background: rgba(22,160,133,0.05); font-weight: 800; padding: 12px 20px; border-top: 1px dashed var(--border-color); border-bottom: 1px dashed var(--border-color); }
.er-total td { background: linear-gradient(135deg, rgba(22,160,133,0.12), rgba(39,174,96,0.08)); padding: 16px 20px; font-weight: 800; font-size: 1.05rem; border-top: 2px solid #16a085; border-bottom: 2px solid #16a085; }
.er-meta td { font-size: 0.78rem; color: var(--text-muted); padding: 6px 20px; }

.text-success { color: #27ae60; }
.text-danger { color: #e74c3c; }
.text-muted { color: var(--text-muted); }

/* IVA */
.iva-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.iva-box { padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-left: 4px solid #3498db; border-radius: var(--radius-lg); }
.iva-box-info { border-left-color: #3498db; }
.iva-box-warning { border-left-color: #f39c12; }
.iva-box-danger { border-left-color: #e74c3c; background: rgba(231,76,60,0.03); }
.iva-box-success { border-left-color: #27ae60; background: rgba(39,174,96,0.03); }
.iva-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px; }
.iva-value { font-size: 1.25rem; font-weight: 800; color: var(--text-primary); margin-top: 6px; font-variant-numeric: tabular-nums; }

/* BALANCE */
.balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.balance-card { overflow: visible; }
.balance-header-activos { background: linear-gradient(135deg, rgba(52,152,219,0.12), var(--bg-card)); color: #2980b9; border-bottom-color: rgba(52,152,219,0.3); }
.balance-header-pasivos { background: linear-gradient(135deg, rgba(231,76,60,0.12), var(--bg-card)); color: #c0392b; border-bottom-color: rgba(231,76,60,0.3); }

.balance-section-title { font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; }
.balance-title-activos { color: #2980b9; }
.balance-title-pasivos { color: #c0392b; }
.balance-title-patrimonio { color: #1e8449; }

.balance-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--border-light); font-size: 0.88rem; gap: 12px; }
.balance-row span:first-child { color: var(--text-secondary); }
.balance-num { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }

.balance-subtotal { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; margin-top: 8px; font-weight: 800; font-size: 0.92rem; color: var(--text-primary); gap: 12px; }
.balance-subtotal-pasivos { border-top: 2px solid #e74c3c; }
.balance-subtotal-patrimonio { border-top: 2px solid #27ae60; }

.balance-total { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; margin-top: 12px; border-radius: var(--radius-md); font-weight: 800; font-size: 1rem; gap: 12px; }
.balance-total-activos { background: rgba(52,152,219,0.12); color: #1c5c8a; }
.balance-total-final { background: linear-gradient(135deg, rgba(52,152,219,0.12), rgba(39,174,96,0.12)); color: var(--text-primary); }

/* Verificación */
.verificacion-card { display: flex; gap: 14px; padding: 18px 20px; border-radius: var(--radius-lg); border-left: 4px solid; margin-top: 8px; }
.verif-ok { background: rgba(39,174,96,0.06); border-color: #27ae60; }
.verif-warn { background: rgba(231,76,60,0.06); border-color: #e74c3c; }
.verif-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }
.verif-ok .verif-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.verif-warn .verif-icon { background: rgba(231,76,60,0.15); color: #e74c3c; }
.verif-body { flex: 1; min-width: 0; }
.verif-title { font-weight: 800; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 4px; }
.verif-detail { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; }
.verif-note { margin-top: 8px; font-size: 0.78rem; color: var(--text-muted); padding: 8px 12px; background: rgba(0,0,0,0.03); border-radius: var(--radius-sm); display: flex; align-items: flex-start; gap: 6px; }
.verif-note i { color: #3498db; flex-shrink: 0; margin-top: 2px; }

/* TABLA (reuso para desglose) */
.header-count { margin-left: 8px; padding: 2px 10px; background: rgba(22,160,133,0.15); color: #138d75; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }
.prod-nombre { font-weight: 600; color: var(--text-primary); font-size: 0.85rem; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ruc-badge { background: var(--bg-table-stripe); padding: 3px 10px; border-radius: 6px; font-family: var(--font-mono, monospace); font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.money-total { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text-primary); font-size: 0.9rem; }

/* LOADING/EMPTY */
.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #16a085; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-block { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 2px dashed var(--border-color); border-radius: var(--radius-lg); }
.empty-icon { width: 72px; height: 72px; border-radius: 50%; background: rgba(22,160,133,0.08); color: #16a085; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; margin: 0 auto 14px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; color: var(--text-muted); max-width: 460px; margin: 0 auto; line-height: 1.5; }
.meta-info { font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 4px; }

/* RESPONSIVE */
@media (max-width: 992px) {
  .filters-grid { grid-template-columns: 1fr 1fr; }
  .quick-dates, .filters-actions { grid-column: 1 / -1; }
  .filters-actions { justify-content: stretch; }
  .filters-actions .btn-primary { width: 100%; justify-content: center; }
  .balance-grid { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .tabs { width: 100%; }
  .tab { flex: 1; justify-content: center; }
  .comp-grid { grid-template-columns: 1fr; }
  .er-table td { padding: 8px 12px; }
  .er-section td, .er-subtotal td, .er-total td, .er-meta td { padding: 10px 12px; }
}

/* IMPRESIÓN */
@media print {
  .no-print { display: none !important; }
  .estados-financieros-page { gap: 10px; }
  .card-cacao { box-shadow: none; border: 1px solid #ddd; page-break-inside: avoid; }
  .documento-header { background: #f5f5f5; }
  .er-table { font-size: 10pt; }
  .balance-grid { grid-template-columns: 1fr 1fr; }
  .verificacion-card { page-break-inside: avoid; }
}
</style>