<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 no-print">
      <h4 class="section-title"><i class="fas fa-chart-line"></i> Estados Financieros</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-danger" @click="exportarPDF" :disabled="!datosListos">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="btn btn-success" @click="exportarExcel" :disabled="!datosListos">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-outline-secondary" @click="imprimir" :disabled="!datosListos">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3 no-print">
      <li class="nav-item">
        <a
          class="nav-link"
          :class="{ active: tab === 'resultados' }"
          href="#"
          @click.prevent="tab = 'resultados'"
        >
          <i class="fas fa-chart-line me-2"></i> Estado de Resultados
        </a>
      </li>
      <li class="nav-item">
        <a
          class="nav-link"
          :class="{ active: tab === 'balance' }"
          href="#"
          @click.prevent="tab = 'balance'"
        >
          <i class="fas fa-balance-scale me-2"></i> Balance General
        </a>
      </li>
    </ul>

    <!-- ===== TAB: ESTADO DE RESULTADOS ===== -->
    <div v-if="tab === 'resultados'">
      <!-- Filtros -->
      <div class="card card-cacao mb-3 no-print">
        <div class="card-body">
          <div class="row g-3 align-items-end">
            <div class="col-md-3">
              <label class="form-label">Desde</label>
              <input type="date" class="form-control" v-model="filtros.desde" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Hasta</label>
              <input type="date" class="form-control" v-model="filtros.hasta" />
            </div>
            <div class="col-md-2">
              <label class="form-label">Comparar</label>
              <div class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="chkComparar" v-model="filtros.comparar" />
                <label class="form-check-label" for="chkComparar">Con período anterior</label>
              </div>
            </div>
            <div class="col-md-4 d-flex gap-2">
              <button class="btn btn-primary flex-grow-1" @click="cargarResultados" :disabled="loadingRes">
                <i class="fas fa-sync" :class="{ 'fa-spin': loadingRes }"></i>
                {{ loadingRes ? 'Calculando...' : 'Generar' }}
              </button>
              <button class="btn btn-outline-secondary" @click="atajosRapidos('mes')">Este mes</button>
              <button class="btn btn-outline-secondary" @click="atajosRapidos('anio')">Este año</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="resultados" ref="contenidoResultados">
        <!-- Encabezado -->
        <div class="reporte-header mb-3">
          <h5 class="text-center mb-1">ESTADO DE RESULTADOS</h5>
          <p class="text-center text-muted small mb-0">
            Del {{ formatFecha(resultados.periodo.desde) }} al {{ formatFecha(resultados.periodo.hasta) }}
          </p>
          <p class="text-center text-muted small">
            System Ozaet's Electronics — RUC: 1234567890001
          </p>
        </div>

        <!-- Comparación -->
        <div v-if="resultados.comparacion" class="card card-cacao mb-3">
          <div class="card-header"><i class="fas fa-exchange-alt me-2"></i> Comparación con período anterior</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4">
                <div class="comp-box">
                  <div class="comp-label">Ingresos actuales</div>
                  <div class="comp-value">{{ formatCurrency(resultados.ingresos.ingresosNetos) }}</div>
                  <div class="comp-sub">{{ resultados.ingresos.cantidadFacturas }} facturas</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="comp-box">
                  <div class="comp-label">Ingresos anteriores</div>
                  <div class="comp-value">{{ formatCurrency(resultados.comparacion.ingresosNetos) }}</div>
                  <div class="comp-sub">Período previo</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="comp-box">
                  <div class="comp-label">Variación</div>
                  <div class="comp-value" :style="{ color: variacionColor(resultados.ingresos.ingresosNetos, resultados.comparacion.ingresosNetos) }">
                    {{ variacionPct(resultados.ingresos.ingresosNetos, resultados.comparacion.ingresosNetos) }}
                  </div>
                  <div class="comp-sub">
                    {{ variacionAbsoluta(resultados.ingresos.ingresosNetos, resultados.comparacion.ingresosNetos) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Estado de Resultados -->
        <div class="card card-cacao">
          <div class="card-body">
            <table class="table table-borderless er-table">
              <tbody>
                <tr class="er-section">
                  <td colspan="2">INGRESOS OPERACIONALES</td>
                </tr>
                <tr>
                  <td>Ventas brutas ({{ resultados.ingresos.cantidadFacturas }} facturas)</td>
                  <td class="text-end">{{ formatCurrency(resultados.ingresos.subtotal) }}</td>
                </tr>
                <tr v-if="resultados.ingresos.devoluciones > 0">
                  <td class="ps-4 text-muted">(-) Devoluciones / Notas de crédito</td>
                  <td class="text-end text-danger">-{{ formatCurrency(resultados.ingresos.devoluciones) }}</td>
                </tr>
                <tr class="fw-bold er-subtotal">
                  <td>(=) INGRESOS NETOS</td>
                  <td class="text-end">{{ formatCurrency(resultados.ingresos.ingresosNetos) }}</td>
                </tr>

                <tr class="er-section">
                  <td colspan="2">COSTO DE VENTAS</td>
                </tr>
                <tr>
                  <td>Costo de los productos vendidos</td>
                  <td class="text-end">{{ formatCurrency(resultados.costos.costoDeVentas) }}</td>
                </tr>
                <tr class="fw-bold er-subtotal">
                  <td>(=) UTILIDAD BRUTA</td>
                  <td class="text-end" :style="{ color: resultados.utilidad.utilidadBruta > 0 ? '#27ae60' : '#e74c3c' }">
                    {{ formatCurrency(resultados.utilidad.utilidadBruta) }}
                  </td>
                </tr>
                <tr class="text-muted small">
                  <td>Margen bruto</td>
                  <td class="text-end">{{ resultados.costos.margenBruto.toFixed(2) }}%</td>
                </tr>

                <tr class="er-section">
                  <td colspan="2">GASTOS OPERATIVOS</td>
                </tr>
                <tr>
                  <td>Gastos administrativos y otros ({{ resultados.gastos.cantidadCompras }} compras)</td>
                  <td class="text-end text-danger">-{{ formatCurrency(resultados.gastos.gastosOperativos) }}</td>
                </tr>
                <tr class="fw-bold er-subtotal">
                  <td>(=) UTILIDAD OPERATIVA</td>
                  <td class="text-end">{{ formatCurrency(resultados.utilidad.utilidadBruta - resultados.gastos.gastosOperativos) }}</td>
                </tr>

                <tr class="er-section">
                  <td colspan="2">RESULTADO DEL EJERCICIO</td>
                </tr>
                <tr class="fw-bold er-total">
                  <td class="h5 mb-0">(=) UTILIDAD NETA DEL PERÍODO</td>
                  <td class="text-end h5 mb-0" :style="{ color: resultados.utilidad.utilidadNeta > 0 ? '#27ae60' : '#e74c3c' }">
                    {{ formatCurrency(resultados.utilidad.utilidadNeta) }}
                  </td>
                </tr>
                <tr class="text-muted small">
                  <td>Margen neto</td>
                  <td class="text-end">{{ resultados.utilidad.margenNeto.toFixed(2) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- IVA informativo -->
        <div class="card card-cacao mt-3">
          <div class="card-header"><i class="fas fa-percent me-2"></i> Resumen de IVA (informativo)</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4">
                <div class="iva-box">
                  <div class="iva-label">IVA en Ventas</div>
                  <div class="iva-value">{{ formatCurrency(resultados.iva.ivaVentas) }}</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="iva-box">
                  <div class="iva-label">IVA en Compras</div>
                  <div class="iva-value">{{ formatCurrency(resultados.iva.ivaCompras) }}</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="iva-box" :style="{ borderLeftColor: resultados.iva.ivaPorPagar > 0 ? '#e74c3c' : '#27ae60' }">
                  <div class="iva-label">IVA por Pagar</div>
                  <div class="iva-value" :style="{ color: resultados.iva.ivaPorPagar > 0 ? '#e74c3c' : '#27ae60' }">
                    {{ formatCurrency(resultados.iva.ivaPorPagar) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gastos por proveedor -->
        <div v-if="resultados.gastos.desglosePorProveedor.length > 0" class="card card-cacao mt-3">
          <div class="card-header"><i class="fas fa-list me-2"></i> Gastos por Proveedor (Top 10)</div>
          <div class="card-body">
            <table class="table table-cacao table-sm">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>RUC</th>
                  <th class="text-center">Compras</th>
                  <th class="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in resultados.gastos.desglosePorProveedor" :key="g._id">
                  <td>{{ g.proveedorNombre || 'N/A' }}</td>
                  <td class="small">{{ g.proveedorRuc || '—' }}</td>
                  <td class="text-center">{{ g.cantidad }}</td>
                  <td class="text-end fw-bold">{{ formatCurrency(g.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else-if="!loadingRes" class="card card-cacao">
        <div class="card-body text-center py-5">
          <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
          <h5>Estado de Resultados</h5>
          <p class="text-muted">Selecciona un período y presiona <strong>Generar</strong>.</p>
        </div>
      </div>
    </div>

    <!-- ===== TAB: BALANCE GENERAL ===== -->
    <div v-if="tab === 'balance'">
      <!-- Filtros -->
      <div class="card card-cacao mb-3 no-print">
        <div class="card-body">
          <div class="row g-3 align-items-end">
            <div class="col-md-4">
              <label class="form-label">Fecha de corte</label>
              <input type="date" class="form-control" v-model="filtros.fechaBalance" />
            </div>
            <div class="col-md-8 d-flex gap-2">
              <button class="btn btn-primary flex-grow-1" @click="cargarBalance" :disabled="loadingBal">
                <i class="fas fa-sync" :class="{ 'fa-spin': loadingBal }"></i>
                {{ loadingBal ? 'Calculando...' : 'Generar Balance' }}
              </button>
              <button class="btn btn-outline-secondary" @click="atajosBalance('hoy')">Hoy</button>
              <button class="btn btn-outline-secondary" @click="atajosBalance('mes')">Fin de mes</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="balance" ref="contenidoBalance">
        <div class="reporte-header mb-3">
          <h5 class="text-center mb-1">BALANCE GENERAL</h5>
          <p class="text-center text-muted small mb-0">
            Al {{ formatFecha(balance.fecha_corte) }}
          </p>
          <p class="text-center text-muted small">
            System Ozaet's Electronics — RUC: 1234567890001
          </p>
        </div>

        <div class="row g-3">
          <!-- ACTIVOS -->
          <div class="col-md-6">
            <div class="card card-cacao h-100">
              <div class="card-header" style="border-bottom-color: #3498db;">
                <i class="fas fa-coins me-2" style="color: #3498db;"></i> ACTIVOS
              </div>
              <div class="card-body">
                <div class="balance-section-title">ACTIVO CORRIENTE</div>
                <div class="balance-row">
                  <span>Inventario (valor de compra)</span>
                  <span class="fw-bold">{{ formatCurrency(balance.activos.inventario) }}</span>
                </div>
                <div class="balance-row">
                  <span>Cuentas por cobrar ({{ balance.activos.cantidadCxC }})</span>
                  <span class="fw-bold">{{ formatCurrency(balance.activos.cuentasPorCobrar) }}</span>
                </div>
                <div class="balance-row">
                  <span>IVA crédito tributario</span>
                  <span class="fw-bold">{{ formatCurrency(balance.activos.ivaCreditoTributario) }}</span>
                </div>
                <div class="balance-total">
                  <span>TOTAL ACTIVOS</span>
                  <span>{{ formatCurrency(balance.activos.total) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- PASIVOS + PATRIMONIO -->
          <div class="col-md-6">
            <div class="card card-cacao h-100">
              <div class="card-header" style="border-bottom-color: #e74c3c;">
                <i class="fas fa-hand-holding-usd me-2" style="color: #e74c3c;"></i> PASIVOS Y PATRIMONIO
              </div>
              <div class="card-body">
                <div class="balance-section-title" style="color: #e74c3c;">PASIVO CORRIENTE</div>
                <div class="balance-row">
                  <span>Cuentas por pagar ({{ balance.pasivos.cantidadCxP }})</span>
                  <span class="fw-bold">{{ formatCurrency(balance.pasivos.cuentasPorPagar) }}</span>
                </div>
                <div class="balance-row">
                  <span>IVA por pagar</span>
                  <span class="fw-bold">{{ formatCurrency(balance.pasivos.ivaPorPagar) }}</span>
                </div>
                <div class="balance-subtotal">
                  <span>TOTAL PASIVOS</span>
                  <span>{{ formatCurrency(balance.pasivos.total) }}</span>
                </div>

                <div class="balance-section-title mt-3" style="color: #27ae60;">PATRIMONIO</div>
                <div class="balance-row">
                  <span>Utilidades acumuladas</span>
                  <span class="fw-bold">{{ formatCurrency(balance.patrimonio.utilidadesAcumuladas) }}</span>
                </div>
                <div class="balance-subtotal" style="border-color: #27ae60;">
                  <span>TOTAL PATRIMONIO</span>
                  <span>{{ formatCurrency(balance.patrimonio.total) }}</span>
                </div>

                <div class="balance-total" style="background: linear-gradient(135deg, rgba(52,152,219,0.15), rgba(39,174,96,0.15));">
                  <span>TOTAL PASIVO + PATRIMONIO</span>
                  <span>{{ formatCurrency(balance.pasivos.total + balance.patrimonio.total) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Verificación contable -->
        <div class="card card-cacao mt-3" :style="{ borderLeft: `4px solid ${balance.verificacion.cuadra ? '#27ae60' : '#e74c3c'}` }">
          <div class="card-body d-flex align-items-center gap-3">
            <i
              :class="balance.verificacion.cuadra ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle'"
              :style="{ fontSize: '2rem', color: balance.verificacion.cuadra ? '#27ae60' : '#e74c3c' }"
            ></i>
            <div>
              <div class="fw-bold">
                {{ balance.verificacion.cuadra ? 'Ecuación contable cuadra correctamente' : 'La ecuación contable NO cuadra' }}
              </div>
              <div class="small text-muted">
                Activos: {{ formatCurrency(balance.verificacion.totalActivos) }} |
                Pasivos + Patrimonio: {{ formatCurrency(balance.verificacion.totalPasivoPatrimonio) }}
                <span v-if="!balance.verificacion.cuadra">
                  | Diferencia: {{ formatCurrency(balance.verificacion.diferencia) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!loadingBal" class="card card-cacao">
        <div class="card-body text-center py-5">
          <i class="fas fa-balance-scale fa-3x text-muted mb-3"></i>
          <h5>Balance General</h5>
          <p class="text-muted">Selecciona una fecha de corte y presiona <strong>Generar</strong>.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'

const toast = useToast()

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

const contenidoResultados = ref(null)
const contenidoBalance = ref(null)

const datosListos = computed(() => {
  return (tab.value === 'resultados' && resultados.value) || (tab.value === 'balance' && balance.value)
})

const formatFecha = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const variacionPct = (actual, anterior) => {
  if (!anterior || anterior === 0) return actual > 0 ? '+∞' : '0%'
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100
  const signo = pct >= 0 ? '+' : ''
  return `${signo}${pct.toFixed(2)}%`
}

const variacionAbsoluta = (actual, anterior) => {
  const diff = actual - anterior
  const signo = diff >= 0 ? '+' : ''
  return `${signo}${formatCurrency(diff)}`
}

const variacionColor = (actual, anterior) => {
  if (actual > anterior) return '#27ae60'
  if (actual < anterior) return '#e74c3c'
  return 'var(--text-muted)'
}

const atajosRapidos = (tipo) => {
  const hoy = new Date()
  if (tipo === 'mes') {
    filtros.value.desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    filtros.value.hasta = hoy.toISOString().slice(0, 10)
  } else if (tipo === 'anio') {
    filtros.value.desde = new Date(hoy.getFullYear(), 0, 1).toISOString().slice(0, 10)
    filtros.value.hasta = hoy.toISOString().slice(0, 10)
  }
}

const atajosBalance = (tipo) => {
  const hoy = new Date()
  if (tipo === 'hoy') {
    filtros.value.fechaBalance = hoy.toISOString().slice(0, 10)
  } else if (tipo === 'mes') {
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    filtros.value.fechaBalance = finMes.toISOString().slice(0, 10)
  }
}

const cargarResultados = async () => {
  if (!filtros.value.desde || !filtros.value.hasta) {
    toast.warning('Complete las fechas "desde" y "hasta"')
    return
  }
  loadingRes.value = true
  try {
    const params = new URLSearchParams()
    params.set('desde', filtros.value.desde)
    params.set('hasta', filtros.value.hasta)
    if (filtros.value.comparar) params.set('comparar', 'true')

    resultados.value = await api.request(`/estados-financieros/resultados?${params.toString()}`, {
      method: 'GET',
      loaderMessage: 'Generando estado de resultados...'
    })
  } catch (e) {
    toast.error('Error: ' + e.message)
    resultados.value = null
  } finally {
    loadingRes.value = false
  }
}

const cargarBalance = async () => {
  if (!filtros.value.fechaBalance) {
    toast.warning('Seleccione una fecha de corte')
    return
  }
  loadingBal.value = true
  try {
    balance.value = await api.request(`/estados-financieros/balance?fecha=${filtros.value.fechaBalance}`, {
      method: 'GET',
      loaderMessage: 'Generando balance general...'
    })
  } catch (e) {
    toast.error('Error: ' + e.message)
    balance.value = null
  } finally {
    loadingBal.value = false
  }
}

const exportarPDF = () => {
  if (tab.value === 'resultados' && resultados.value) {
    exportarResultadosPDF()
  } else if (tab.value === 'balance' && balance.value) {
    exportarBalancePDF()
  }
}

const exportarResultadosPDF = () => {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE RESULTADOS', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Del ${formatFecha(resultados.value.periodo.desde)} al ${formatFecha(resultados.value.periodo.hasta)}`,
    pageWidth / 2, y, { align: 'center' }
  )
  y += 5
  doc.text("System Ozaet's Electronics", pageWidth / 2, y, { align: 'center' })
  y += 12

  const rows = [
    ['INGRESOS OPERACIONALES', ''],
    [`Ventas brutas (${resultados.value.ingresos.cantidadFacturas} facturas)`, resultados.value.ingresos.subtotal.toFixed(2)],
    ...(resultados.value.ingresos.devoluciones > 0
      ? [['(-) Devoluciones / Notas de crédito', `-${resultados.value.ingresos.devoluciones.toFixed(2)}`]]
      : []),
    ['(=) INGRESOS NETOS', resultados.value.ingresos.ingresosNetos.toFixed(2)],
    ['', ''],
    ['COSTO DE VENTAS', ''],
    ['Costo de los productos vendidos', resultados.value.costos.costoDeVentas.toFixed(2)],
    ['(=) UTILIDAD BRUTA', resultados.value.utilidad.utilidadBruta.toFixed(2)],
    [`Margen bruto: ${resultados.value.costos.margenBruto.toFixed(2)}%`, ''],
    ['', ''],
    ['GASTOS OPERATIVOS', ''],
    [`Gastos administrativos y otros (${resultados.value.gastos.cantidadCompras} compras)`, `-${resultados.value.gastos.gastosOperativos.toFixed(2)}`],
    ['(=) UTILIDAD OPERATIVA', (resultados.value.utilidad.utilidadBruta - resultados.value.gastos.gastosOperativos).toFixed(2)],
    ['', ''],
    ['RESULTADO DEL EJERCICIO', ''],
    ['(=) UTILIDAD NETA DEL PERÍODO', resultados.value.utilidad.utilidadNeta.toFixed(2)],
    [`Margen neto: ${resultados.value.utilidad.margenNeto.toFixed(2)}%`, '']
  ]

  doc.autoTable({
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
      const text = data.cell.raw || ''
      if (typeof text === 'string') {
        if (text.startsWith('INGRESOS') || text.startsWith('COSTO') || text.startsWith('GASTOS') || text.startsWith('RESULTADO')) {
          data.cell.styles.fillColor = [240, 240, 240]
          data.cell.styles.fontStyle = 'bold'
        }
        if (text.startsWith('(=)')) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [250, 250, 250]
        }
      }
    }
  })

  y = doc.lastAutoTable.finalY + 10

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('RESUMEN DE IVA (informativo)', 14, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(`IVA en Ventas: ${resultados.value.iva.ivaVentas.toFixed(2)}`, 14, y)
  y += 5
  doc.text(`IVA en Compras: ${resultados.value.iva.ivaCompras.toFixed(2)}`, 14, y)
  y += 5
  doc.text(`IVA por Pagar: ${resultados.value.iva.ivaPorPagar.toFixed(2)}`, 14, y)

  doc.save(`estado_resultados_${filtros.value.desde}_${filtros.value.hasta}.pdf`)
  toast.success('PDF generado')
}

const exportarBalancePDF = () => {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('BALANCE GENERAL', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Al ${formatFecha(balance.value.fecha_corte)}`, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.text("System Ozaet's Electronics", pageWidth / 2, y, { align: 'center' })
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ACTIVOS', 14, y)
  doc.text('PASIVOS Y PATRIMONIO', pageWidth / 2 + 5, y)
  y += 6

  // Renderizar lado a lado con autoTable
  const startY = y
  doc.autoTable({
    startY,
    head: [['Activo', 'Valor']],
    body: [
      ['Inventario', balance.value.activos.inventario.toFixed(2)],
      [`CxC (${balance.value.activos.cantidadCxC})`, balance.value.activos.cuentasPorCobrar.toFixed(2)],
      ['IVA crédito', balance.value.activos.ivaCreditoTributario.toFixed(2)],
      ['TOTAL ACTIVOS', balance.value.activos.total.toFixed(2)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [52, 152, 219], fontSize: 9 },
    styles: { fontSize: 8 },
    footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold' },
    margin: { left: 14, right: pageWidth / 2 + 2 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 30, halign: 'right' }
    }
  })

  doc.autoTable({
    startY,
    head: [['Pasivo / Patrimonio', 'Valor']],
    body: [
      [`CxP (${balance.value.pasivos.cantidadCxP})`, balance.value.pasivos.cuentasPorPagar.toFixed(2)],
      ['IVA por pagar', balance.value.pasivos.ivaPorPagar.toFixed(2)],
      ['TOTAL PASIVOS', balance.value.pasivos.total.toFixed(2)],
      ['Utilidades acumuladas', balance.value.patrimonio.utilidadesAcumuladas.toFixed(2)],
      ['TOTAL PATRIMONIO', balance.value.patrimonio.total.toFixed(2)],
      ['TOTAL PASIVO + PATRIMONIO', (balance.value.pasivos.total + balance.value.patrimonio.total).toFixed(2)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [231, 76, 60], fontSize: 9 },
    styles: { fontSize: 8 },
    footStyles: { fillColor: [230, 230, 230], fontStyle: 'bold' },
    margin: { left: pageWidth / 2 + 2, right: 14 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 30, halign: 'right' }
    }
  })

  doc.save(`balance_general_${filtros.value.fechaBalance}.pdf`)
  toast.success('PDF generado')
}

const exportarExcel = () => {
  const wb = XLSX.utils.book_new()

  if (tab.value === 'resultados' && resultados.value) {
    const rows = [
      ['ESTADO DE RESULTADOS'],
      [`Del ${formatFecha(resultados.value.periodo.desde)} al ${formatFecha(resultados.value.periodo.hasta)}`],
      [],
      ['CONCEPTO', 'VALOR'],
      ['INGRESOS OPERACIONALES', ''],
      [`Ventas brutas (${resultados.value.ingresos.cantidadFacturas})`, resultados.value.ingresos.subtotal],
      ['(-) Devoluciones', -resultados.value.ingresos.devoluciones],
      ['(=) INGRESOS NETOS', resultados.value.ingresos.ingresosNetos],
      [],
      ['COSTO DE VENTAS', resultados.value.costos.costoDeVentas],
      ['(=) UTILIDAD BRUTA', resultados.value.utilidad.utilidadBruta],
      ['Margen Bruto (%)', resultados.value.costos.margenBruto],
      [],
      ['GASTOS OPERATIVOS', resultados.value.gastos.gastosOperativos],
      ['(=) UTILIDAD OPERATIVA', resultados.value.utilidad.utilidadBruta - resultados.value.gastos.gastosOperativos],
      [],
      ['(=) UTILIDAD NETA', resultados.value.utilidad.utilidadNeta],
      ['Margen Neto (%)', resultados.value.utilidad.margenNeto],
      [],
      ['IVA EN VENTAS', resultados.value.iva.ivaVentas],
      ['IVA EN COMPRAS', resultados.value.iva.ivaCompras],
      ['IVA POR PAGAR', resultados.value.iva.ivaPorPagar]
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 45 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Estado Resultados')

    const ws2 = XLSX.utils.json_to_sheet(resultados.value.gastos.desglosePorProveedor.map(g => ({
      Proveedor: g.proveedorNombre || 'N/A',
      RUC: g.proveedorRuc || '',
      Compras: g.cantidad,
      Total: g.total
    })))
    XLSX.utils.book_append_sheet(wb, ws2, 'Gastos por proveedor')
  } else if (tab.value === 'balance' && balance.value) {
    const rows = [
      ['BALANCE GENERAL'],
      [`Al ${formatFecha(balance.value.fecha_corte)}`],
      [],
      ['ACTIVOS', ''],
      ['Inventario', balance.value.activos.inventario],
      ['Cuentas por cobrar', balance.value.activos.cuentasPorCobrar],
      ['IVA crédito', balance.value.activos.ivaCreditoTributario],
      ['TOTAL ACTIVOS', balance.value.activos.total],
      [],
      ['PASIVOS', ''],
      ['Cuentas por pagar', balance.value.pasivos.cuentasPorPagar],
      ['IVA por pagar', balance.value.pasivos.ivaPorPagar],
      ['TOTAL PASIVOS', balance.value.pasivos.total],
      [],
      ['PATRIMONIO', ''],
      ['Utilidades acumuladas', balance.value.patrimonio.utilidadesAcumuladas],
      ['TOTAL PATRIMONIO', balance.value.patrimonio.total],
      [],
      ['TOTAL PASIVO + PATRIMONIO', balance.value.pasivos.total + balance.value.patrimonio.total],
      ['Verificación contable', balance.value.verificacion.cuadra ? 'OK' : 'NO CUADRA']
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Balance General')
  }

  XLSX.writeFile(wb, `estados_financieros_${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Excel generado')
}

const imprimir = () => window.print()

onMounted(() => {
  // Default: mes actual
  const hoy = new Date()
  filtros.value.desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  filtros.value.hasta = hoy.toISOString().slice(0, 10)
})
</script>

<style scoped>
.nav-tabs {
  border-bottom: 2px solid var(--border-color);
}
.nav-tabs .nav-link {
  color: var(--text-muted);
  font-weight: 600;
  border: none;
  border-bottom: 3px solid transparent;
  padding: 10px 20px;
}
.nav-tabs .nav-link:hover {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}
.nav-tabs .nav-link.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  background: transparent;
}

.reporte-header {
  padding: 12px;
  background: var(--bg-table-stripe);
  border-radius: 10px;
}

.er-table {
  font-size: 0.95rem;
  margin: 0;
}
.er-table td {
  padding: 8px 6px;
  border: none;
}
.er-section {
  background: var(--bg-table-stripe);
  font-weight: 700;
  color: var(--primary-dark);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}
.er-section td {
  padding: 8px 6px !important;
  letter-spacing: 0.5px;
  font-size: 0.85rem;
}
.er-subtotal {
  background: rgba(52,152,219,0.05);
  border-top: 1px dashed var(--border-color);
}
.er-total {
  background: linear-gradient(135deg, rgba(52,152,219,0.1), rgba(39,174,96,0.1));
  padding: 12px 6px !important;
  border-top: 2px solid var(--primary-color);
  border-bottom: 2px solid var(--primary-color);
}

.comp-box {
  padding: 14px;
  background: var(--bg-table-stripe);
  border-radius: 10px;
  text-align: center;
}
.comp-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
}
.comp-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 4px 0;
}
.comp-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.iva-box {
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid #3498db;
  border-radius: 10px;
}
.iva-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
}
.iva-value {
  font-size: 1.3rem;
  font-weight: 700;
  margin-top: 4px;
  color: var(--text-primary);
}

.balance-section-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary-dark);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}
.balance-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 0.9rem;
}
.balance-subtotal {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  margin-top: 6px;
  border-top: 2px solid var(--primary-color);
  font-weight: 700;
  font-size: 0.95rem;
}
.balance-total {
  display: flex;
  justify-content: space-between;
  padding: 12px 10px;
  margin-top: 10px;
  background: rgba(52,152,219,0.1);
  border-radius: 8px;
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--primary-dark);
}

@media print {
  .no-print { display: none !important; }
  .card-cacao { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
}
</style>