<template>
  <div class="ats-page">
    <!-- HEADER -->
    <div class="page-header no-print">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-purple"><i class="fas fa-file-invoice"></i></span>
          Anexo Transaccional (ATS)
        </h1>
        <p class="page-subtitle">
          Resumen mensual de ventas, compras y retenciones para el SRI
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarCSV"
          :disabled="!data || loading"
          aria-label="Exportar CSV"
        >
          <i class="fas fa-file-csv"></i>
          CSV
        </button>
        <button
          class="btn-secondary"
          @click="exportarExcel"
          :disabled="!data || loading"
          aria-label="Exportar Excel"
        >
          <i class="fas fa-file-excel"></i>
          Excel
        </button>
        <button
          class="btn-danger"
          @click="exportarPDF"
          :disabled="!data || loading"
          aria-label="Exportar PDF"
        >
          <i class="fas fa-file-pdf"></i>
          PDF
        </button>
        <button
          class="btn-secondary"
          @click="imprimir"
          :disabled="!data || loading"
          aria-label="Imprimir"
        >
          <i class="fas fa-print"></i>
          Imprimir
        </button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="filters-card no-print">
      <div class="filters-grid">
        <div class="form-field">
          <label class="form-label" for="ats-anio">Año</label>
          <input
            id="ats-anio"
            type="number"
            class="form-input"
            v-model.number="anio"
            min="2020"
            max="2100"
            :disabled="loading"
          />
        </div>
        <div class="form-field">
          <label class="form-label" for="ats-mes">Mes</label>
          <select
            id="ats-mes"
            class="form-input"
            v-model.number="mes"
            :disabled="loading"
          >
            <option v-for="(nombre, idx) in MESES" :key="idx" :value="idx + 1">
              {{ nombre }}
            </option>
          </select>
        </div>
        <div class="nav-buttons">
          <button
            type="button"
            class="nav-btn"
            @click="mesAnterior"
            :disabled="loading"
            aria-label="Mes anterior"
          >
            <i class="fas fa-chevron-left"></i>
          </button>
          <button
            type="button"
            class="nav-btn"
            @click="mesActual"
            :disabled="loading"
          >
            Hoy
          </button>
          <button
            type="button"
            class="nav-btn"
            @click="mesSiguiente"
            :disabled="loading"
            aria-label="Mes siguiente"
          >
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="filters-actions">
          <button
            type="button"
            class="btn-primary"
            @click="cargar"
            :disabled="loading"
            aria-label="Generar ATS"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
            {{ loading ? 'Generando...' : 'Generar ATS' }}
          </button>
          <button
            type="button"
            class="btn-secondary"
            @click="descargarXML"
            :disabled="loading || !data || Boolean(requiereConfirmacion)"
            :title="requiereConfirmacion ? 'Corrige las advertencias para descargar el XML' : 'Descargar XML del ATS'"
            aria-label="Descargar XML"
          >
            <i class="fas fa-file-code"></i>
            XML
          </button>
        </div>
      </div>
      <div class="period-preview">
        <i class="fas fa-calendar-alt"></i>
        Período seleccionado: <strong>{{ nombrePeriodo }}</strong>
      </div>
    </div>

    <!-- INFO INICIAL -->
    <div v-if="!data && !loading" class="info-card no-print">
      <div class="info-icon"><i class="fas fa-info-circle"></i></div>
      <div class="info-body">
        <strong>¿Qué es el ATS?</strong>
        <div class="small">
          El Anexo Transaccional Simplificado es el reporte mensual que debes
          subir al SRI con todas tus ventas, compras y retenciones del mes.
          Selecciona el período y presiona <strong>Generar ATS</strong>.
        </div>
      </div>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="loading-block no-print">
      <div class="spinner-lg"></div>
      <p>Generando ATS de {{ nombrePeriodo }}...</p>
    </div>

    <!-- ADVERTENCIAS -->
    <div
      v-if="data && advertencias.length > 0"
      class="advertencias-card no-print"
    >
      <div class="advertencias-header">
        <i class="fas fa-exclamation-triangle"></i>
        <span>{{ advertencias.length }} advertencia(s) encontrada(s)</span>
      </div>
      <div class="advertencias-body">
        <div
          v-for="(adv, idx) in advertencias"
          :key="idx"
          class="advertencia-item"
          :class="`adv-${adv.severidad || 'media'}`"
        >
          <div class="adv-icon">
            <i
              :class="
                adv.severidad === 'alta'
                  ? 'fas fa-exclamation-circle'
                  : 'fas fa-info-circle'
              "
            ></i>
          </div>
          <div class="adv-content">
            <div class="adv-titulo">{{ adv.tipo }}</div>
            <div class="adv-mensaje">{{ adv.mensaje }}</div>
            <div v-if="adv.documentos?.length > 0" class="adv-docs">
              <details>
                <summary>{{ adv.documentos.length }} documento(s) afectado(s)</summary>
                <ul>
                  <li v-for="(doc, i) in adv.documentos.slice(0, 10)" :key="i">
                    {{ doc.numero_factura || doc.numero || 'Sin número' }} —
                    {{ doc.proveedor || doc.razon_social || 'Sin proveedor' }}
                  </li>
                  <li v-if="adv.documentos.length > 10" class="text-muted">
                    … y {{ adv.documentos.length - 10 }} más
                  </li>
                </ul>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CONTENIDO ATS -->
    <div v-if="data" ref="contenido">
      <!-- Encabezado -->
      <div class="documento-header">
        <h2 class="doc-title">ANEXO TRANSACCIONAL SIMPLIFICADO</h2>
        <div class="doc-subtitle">Período: {{ data.periodo?.nombre || nombrePeriodo }}</div>
        <div v-if="nombreEmpresa" class="doc-empresa">{{ nombreEmpresa }}</div>
        <div class="doc-meta">
          <span><i class="far fa-clock"></i> Generado: {{ formatFechaHora(data.generado) }}</span>
        </div>
      </div>

      <!-- KPIs -->
      <div class="stats-grid">
        <div class="stat-card stat-card-info">
          <div class="stat-icon azul"><i class="fas fa-hand-holding-usd"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(data.totales?.ventas?.total) }}</div>
            <div class="stat-label">Ventas del mes</div>
            <div class="stat-sub">{{ data.totales?.ventas?.cantidad || 0 }} comprobantes</div>
          </div>
        </div>
        <div class="stat-card stat-card-warning">
          <div class="stat-icon naranja"><i class="fas fa-shopping-cart"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(data.totales?.compras?.total) }}</div>
            <div class="stat-label">Compras del mes</div>
            <div class="stat-sub">{{ data.totales?.compras?.cantidad || 0 }} comprobantes</div>
          </div>
        </div>
        <div class="stat-card stat-card-purple">
          <div class="stat-icon morado"><i class="fas fa-percent"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(data.totales?.retenciones?.valor) }}</div>
            <div class="stat-label">Retenciones</div>
            <div class="stat-sub">{{ data.totales?.retenciones?.cantidad || 0 }} aplicadas</div>
          </div>
        </div>
        <div
          class="stat-card"
          :class="(data.totales?.ivaPorPagar || 0) > 0 ? 'stat-card-danger' : 'stat-card-success'"
        >
          <div
            class="stat-icon"
            :class="(data.totales?.ivaPorPagar || 0) > 0 ? 'rojo' : 'verde'"
          >
            <i class="fas fa-balance-scale"></i>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(data.totales?.ivaPorPagar) }}</div>
            <div class="stat-label">IVA por pagar</div>
            <div class="stat-sub">Ventas − Compras</div>
          </div>
        </div>
      </div>

      <!-- Resumen bases -->
      <div class="card-cacao">
        <div class="card-header">
          <i class="fas fa-calculator me-2"></i>
          Resumen de bases imponibles
        </div>
        <div class="card-body p-0">
          <table class="table-modern">
            <thead>
              <tr>
                <th>Concepto</th>
                <th class="text-end">Base 0%</th>
                <th class="text-end">Base IVA</th>
                <th class="text-end">IVA</th>
                <th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Ventas</strong></td>
                <td class="text-end money-num">{{ formatCurrency(data.totales?.ventas?.base0) }}</td>
                <td class="text-end money-num">{{ formatCurrency(data.totales?.ventas?.baseIVA) }}</td>
                <td class="text-end money-num">{{ formatCurrency(data.totales?.ventas?.iva) }}</td>
                <td class="text-end money-total">{{ formatCurrency(data.totales?.ventas?.total) }}</td>
              </tr>
              <tr>
                <td><strong>Compras</strong></td>
                <td class="text-end money-num">{{ formatCurrency(data.totales?.compras?.base0) }}</td>
                <td class="text-end money-num">{{ formatCurrency(data.totales?.compras?.baseIVA) }}</td>
                <td class="text-end money-num">{{ formatCurrency(data.totales?.compras?.iva) }}</td>
                <td class="text-end money-total">{{ formatCurrency(data.totales?.compras?.total) }}</td>
              </tr>
              <tr class="tfoot-totales">
                <td>DIFERENCIA (IVA por pagar)</td>
                <td class="text-end">—</td>
                <td class="text-end">—</td>
                <td
                  class="text-end"
                  :class="(data.totales?.ivaPorPagar || 0) > 0 ? 'text-danger' : 'text-success'"
                >
                  {{ formatCurrency(data.totales?.ivaPorPagar) }}
                </td>
                <td class="text-end">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sección 1: Ventas -->
      <div class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-hand-holding-usd me-2"></i>
            Sección 1 — VENTAS
            <span class="header-count">{{ data.ventas?.length || 0 }}</span>
          </div>
        </div>
        <div class="card-body p-0">
          <div v-if="!data.ventas || data.ventas.length === 0" class="empty-inline">
            <i class="fas fa-inbox"></i>
            <span>Sin ventas en el período</span>
          </div>
          <div v-else class="table-responsive">
            <table class="table-modern table-compact">
              <thead>
                <tr>
                  <th style="width:60px;">Tipo ID</th>
                  <th style="width:150px;">Identificación</th>
                  <th>Razón social</th>
                  <th style="width:70px;" class="text-center">Comp.</th>
                  <th style="width:140px;">N° Comprobante</th>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:100px;" class="text-end">Base 0%</th>
                  <th style="width:100px;" class="text-end">Base IVA</th>
                  <th style="width:90px;" class="text-end">IVA</th>
                  <th style="width:110px;" class="text-end">Total</th>
                  <th style="width:100px;" class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(v, idx) in data.ventas" :key="idx">
                  <td class="small">{{ v.tipo_id }}</td>
                  <td class="font-mono small">{{ v.identificacion }}</td>
                  <td class="small">{{ v.razon_social }}</td>
                  <td class="text-center small">{{ v.tipo_comprobante }}</td>
                  <td class="font-mono small">{{ v.numero_comprobante }}</td>
                  <td class="small">{{ formatFecha(v.fecha_emision) }}</td>
                  <td class="text-end small">{{ (v.base_0 || 0).toFixed(2) }}</td>
                  <td class="text-end small">{{ (v.base_iva || 0).toFixed(2) }}</td>
                  <td class="text-end small">{{ (v.iva || 0).toFixed(2) }}</td>
                  <td class="text-end small money-total">{{ (v.total || 0).toFixed(2) }}</td>
                  <td class="text-center small">
                    <span
                      class="badge-estado-sri"
                      :class="claseEstadoSRI(v.estado)"
                    >
                      {{ v.estado || 'N/A' }}
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="tfoot-totales">
                  <td colspan="6" class="text-end">TOTALES</td>
                  <td class="text-end">{{ (data.totales?.ventas?.base0 || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.ventas?.baseIVA || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.ventas?.iva || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.ventas?.total || 0).toFixed(2) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Sección 2: Compras -->
      <div class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-shopping-cart me-2"></i>
            Sección 2 — COMPRAS
            <span class="header-count">{{ data.compras?.length || 0 }}</span>
          </div>
        </div>
        <div class="card-body p-0">
          <div v-if="!data.compras || data.compras.length === 0" class="empty-inline">
            <i class="fas fa-inbox"></i>
            <span>Sin compras en el período</span>
          </div>
          <div v-else class="table-responsive">
            <table class="table-modern table-compact">
              <thead>
                <tr>
                  <th style="width:60px;">Tipo ID</th>
                  <th style="width:150px;">Identificación</th>
                  <th>Razón social</th>
                  <th style="width:140px;">N° Comprobante</th>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:100px;" class="text-end">Base 0%</th>
                  <th style="width:100px;" class="text-end">Base IVA</th>
                  <th style="width:90px;" class="text-end">IVA</th>
                  <th style="width:110px;" class="text-end">Total</th>
                  <th style="width:110px;" class="text-end">Retención</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, idx) in data.compras" :key="idx">
                  <td class="small">{{ c.tipo_id }}</td>
                  <td class="font-mono small">{{ c.identificacion }}</td>
                  <td class="small">{{ c.razon_social }}</td>
                  <td class="font-mono small">{{ c.numero_comprobante }}</td>
                  <td class="small">{{ formatFecha(c.fecha_emision) }}</td>
                  <td class="text-end small">{{ (c.base_0 || 0).toFixed(2) }}</td>
                  <td class="text-end small">{{ (c.base_iva || 0).toFixed(2) }}</td>
                  <td class="text-end small">{{ (c.iva || 0).toFixed(2) }}</td>
                  <td class="text-end small money-total">{{ (c.total || 0).toFixed(2) }}</td>
                  <td class="text-end small">
                    <span
                      v-if="(c.retencion_valor || 0) > 0"
                      class="text-purple"
                    >
                      {{ (c.retencion_valor || 0).toFixed(2) }}
                    </span>
                    <span v-else class="text-muted">—</span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="tfoot-totales">
                  <td colspan="5" class="text-end">TOTALES</td>
                  <td class="text-end">{{ (data.totales?.compras?.base0 || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.compras?.baseIVA || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.compras?.iva || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.compras?.total || 0).toFixed(2) }}</td>
                  <td class="text-end">{{ (data.totales?.compras?.retenciones || 0).toFixed(2) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Sección 3: Retenciones -->
      <div class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-percent me-2"></i>
            Sección 3 — RETENCIONES
            <span class="header-count">{{ data.retenciones?.length || 0 }}</span>
          </div>
        </div>
        <div class="card-body p-0">
          <div v-if="!data.retenciones || data.retenciones.length === 0" class="empty-inline">
            <i class="fas fa-inbox"></i>
            <span>Sin retenciones en el período</span>
          </div>
          <div v-else class="table-responsive">
            <table class="table-modern table-compact">
              <thead>
                <tr>
                  <th style="width:60px;">Tipo ID</th>
                  <th style="width:150px;">Identificación</th>
                  <th>Razón social</th>
                  <th style="width:140px;">N° Factura</th>
                  <th style="width:140px;">N° Retención</th>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:110px;">Tipo</th>
                  <th style="width:110px;" class="text-end">Base</th>
                  <th style="width:70px;" class="text-end">%</th>
                  <th style="width:110px;" class="text-end">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, idx) in data.retenciones" :key="idx">
                  <td class="small">{{ r.tipo_id }}</td>
                  <td class="font-mono small">{{ r.identificacion }}</td>
                  <td class="small">{{ r.razon_social }}</td>
                  <td class="font-mono small">{{ r.numero_factura }}</td>
                  <td class="font-mono small">{{ r.numero_retencion }}</td>
                  <td class="small">{{ formatFecha(r.fecha_retencion) }}</td>
                  <td class="small">{{ r.tipo_retencion || '—' }}</td>
                  <td class="text-end small">{{ (r.base_imponible || 0).toFixed(2) }}</td>
                  <td class="text-end small">{{ r.porcentaje || 0 }}%</td>
                  <td class="text-end small money-total">{{ (r.valor_retenido || 0).toFixed(2) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="tfoot-totales">
                  <td colspan="7" class="text-end">TOTALES</td>
                  <td class="text-end">{{ (data.totales?.retenciones?.base || 0).toFixed(2) }}</td>
                  <td></td>
                  <td class="text-end">{{ (data.totales?.retenciones?.valor || 0).toFixed(2) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Meta -->
      <div v-if="data._meta?.tiempoMs" class="meta-info no-print">
        <i class="far fa-clock"></i>
        Calculado en {{ data._meta.tiempoMs }}ms
      </div>

      <!-- Nota -->
      <div class="nota-legal no-print">
        <i class="fas fa-exclamation-triangle"></i>
        <div>
          <strong>Nota importante</strong>
          <div class="small">
            Este reporte es una aproximación del ATS oficial del SRI. Para subirlo
            al portal debes descargar el XML con el formato exacto y validarlo en
            el DIMM del SRI antes de enviarlo. Usa este reporte para
            <strong>verificar</strong> los datos antes de declarar.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { formatCurrency } from '../../utils/formatters'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const toast = useToast()

// ===== CONSTANTES =====
const MESES = Object.freeze([
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
])

// ===== STATE =====
const anio = ref(new Date().getFullYear())
const mes = ref(new Date().getMonth() + 1)
const data = ref(null)
const loading = ref(false)
const nombreEmpresa = ref('')

let unmounted = false

// ===== COMPUTED =====
const nombrePeriodo = computed(() => {
  const idx = Number(mes.value) - 1
  const nombre = MESES[idx] || `Mes ${mes.value}`
  return `${nombre} ${anio.value}`
})

const advertencias = computed(() => {
  const arr = data.value?.advertencias
  if (!Array.isArray(arr)) return []
  return arr.filter(a => a && typeof a === 'object')
})

const requiereConfirmacion = computed(() => Boolean(data.value?.requiere_confirmacion_ats))

// ===== HELPERS =====
const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch { return '—' }
}

const formatFechaHora = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleString('es-EC', {
      dateStyle: 'medium', timeStyle: 'short'
    })
  } catch { return '—' }
}

const claseEstadoSRI = (estado) => {
  if (!estado) return 'estado-neutral'
  const e = String(estado).toUpperCase()
  if (e === 'AUTORIZADO' || e === 'RECIBIDA') return 'estado-ok'
  if (e === 'ANULADO') return 'estado-neutral'
  if (e === 'RECHAZADA' || e === 'DEVUELTA') return 'estado-danger'
  return 'estado-warning'
}

// ===== NAVEGACIÓN MESES =====
const mesAnterior = () => {
  if (mes.value === 1) {
    mes.value = 12
    anio.value--
  } else {
    mes.value--
  }
  cargar()
}

const mesSiguiente = () => {
  if (mes.value === 12) {
    mes.value = 1
    anio.value++
  } else {
    mes.value++
  }
  cargar()
}

const mesActual = () => {
  const hoy = new Date()
  mes.value = hoy.getMonth() + 1
  anio.value = hoy.getFullYear()
  cargar()
}

// ===== CARGA =====
const cargar = async () => {
  if (!Number.isInteger(anio.value) || anio.value < 2000 || anio.value > 2100) {
    toast.error('Año fuera de rango (2000-2100)')
    return
  }
  if (!Number.isInteger(mes.value) || mes.value < 1 || mes.value > 12) {
    toast.error('Mes inválido (1-12)')
    return
  }
  if (loading.value) return

  loading.value = true
  try {
    const res = await api.request(`/anexos/ats/${anio.value}/${mes.value}`, {
      method: 'GET',
      loaderMessage: 'Generando ATS...'
    })
    if (unmounted) return

    data.value = res

    const totalVentas = res?.totales?.ventas?.cantidad || 0
    const totalCompras = res?.totales?.compras?.cantidad || 0

    if (totalVentas === 0 && totalCompras === 0) {
      toast.info('No hay movimientos en el período seleccionado')
    }

    if (res?.requiere_confirmacion_ats) {
      toast.warning(
        'Hay compras sin número de factura del SRI. Revisa las advertencias antes de descargar el XML.',
        { timeout: 8000 }
      )
    }
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'PERIODO_INVALIDO') {
      toast.error(e.message || 'Período inválido')
    } else if (codigo === 'SIN_CONFIG_EMPRESA') {
      toast.error('No hay configuración de empresa')
    } else {
      toast.error('Error al generar ATS: ' + e.message)
    }
    data.value = null
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== DESCARGAR XML =====
const descargarXML = async () => {
  if (!data.value) return

  try {
    const filename = `ATS_${anio.value}_${String(mes.value).padStart(2, '0')}.xml`
    await api.download(`/anexos/ats/${anio.value}/${mes.value}/xml`, filename)
    toast.success('XML descargado correctamente')
  } catch (e) {
    const codigo = e?.codigo || e?.code
    if (codigo === 'ATS_CON_PLACEHOLDERS') {
      toast.warning(
        'Hay compras sin número de factura SRI real. Corrígelas antes de descargar el XML.'
      )
    } else if (codigo === 'SIN_CONFIG_EMPRESA') {
      toast.error('No hay configuración de empresa')
    } else if (codigo === 'PERIODO_INVALIDO') {
      toast.error('Período inválido')
    } else {
      toast.error('Error al descargar XML: ' + e.message)
    }
  }
}

// ===== EXPORTAR CSV =====
const exportarCSV = () => {
  if (!data.value) return
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

  let csv = 'SECCIÓN,TIPO ID,IDENTIFICACIÓN,RAZÓN SOCIAL,COMPROBANTE,N° COMPROBANTE,FECHA,BASE 0%,BASE IVA,IVA,TOTAL\n'

  for (const v of data.value.ventas || []) {
    csv += `VENTA,${v.tipo_id},${v.identificacion},${esc(v.razon_social)},${v.tipo_comprobante},${v.numero_comprobante},${formatFecha(v.fecha_emision)},${(v.base_0 || 0).toFixed(2)},${(v.base_iva || 0).toFixed(2)},${(v.iva || 0).toFixed(2)},${(v.total || 0).toFixed(2)}\n`
  }
  for (const c of data.value.compras || []) {
    csv += `COMPRA,${c.tipo_id},${c.identificacion},${esc(c.razon_social)},,${c.numero_comprobante},${formatFecha(c.fecha_emision)},${(c.base_0 || 0).toFixed(2)},${(c.base_iva || 0).toFixed(2)},${(c.iva || 0).toFixed(2)},${(c.total || 0).toFixed(2)}\n`
  }

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ATS_${anio.value}_${String(mes.value).padStart(2, '0')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success('CSV generado correctamente')
}

// ===== EXPORTAR EXCEL =====
const exportarExcel = () => {
  if (!data.value) return

  const wb = XLSX.utils.book_new()

  // Hoja: Resumen
  const resumen = [
    ['ANEXO TRANSACCIONAL SIMPLIFICADO'],
    [`Período: ${data.value.periodo?.nombre || nombrePeriodo.value}`],
    [],
    ['RESUMEN DE BASES IMPONIBLES'],
    ['Concepto', 'Base 0%', 'Base IVA', 'IVA', 'Total'],
    [
      'Ventas',
      data.value.totales?.ventas?.base0 || 0,
      data.value.totales?.ventas?.baseIVA || 0,
      data.value.totales?.ventas?.iva || 0,
      data.value.totales?.ventas?.total || 0
    ],
    [
      'Compras',
      data.value.totales?.compras?.base0 || 0,
      data.value.totales?.compras?.baseIVA || 0,
      data.value.totales?.compras?.iva || 0,
      data.value.totales?.compras?.total || 0
    ],
    [],
    ['IVA POR PAGAR', data.value.totales?.ivaPorPagar || 0],
    [],
    ['RETENCIONES'],
    ['Cantidad', data.value.totales?.retenciones?.cantidad || 0],
    ['Base imponible', data.value.totales?.retenciones?.base || 0],
    ['Valor retenido', data.value.totales?.retenciones?.valor || 0]
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(resumen)
  ws1['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // Hoja: Ventas
  const ventas = (data.value.ventas || []).map(v => ({
    'Tipo ID': v.tipo_id,
    'Identificación': v.identificacion,
    'Razón social': v.razon_social,
    'Tipo Comp.': v.tipo_comprobante,
    'N° Comprobante': v.numero_comprobante,
    'Fecha': formatFecha(v.fecha_emision),
    'Base 0%': v.base_0 || 0,
    'Base IVA': v.base_iva || 0,
    'IVA': v.iva || 0,
    'Total': v.total || 0,
    'Forma Pago': v.forma_pago || '',
    'Estado': v.estado || ''
  }))
  const ws2 = XLSX.utils.json_to_sheet(ventas.length > 0 ? ventas : [{ Nota: 'Sin ventas' }])
  ws2['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Ventas')

  // Hoja: Compras
  const compras = (data.value.compras || []).map(c => ({
    'Tipo ID': c.tipo_id,
    'Identificación': c.identificacion,
    'Razón social': c.razon_social,
    'N° Comprobante': c.numero_comprobante,
    'Fecha': formatFecha(c.fecha_emision),
    'Base 0%': c.base_0 || 0,
    'Base IVA': c.base_iva || 0,
    'IVA': c.iva || 0,
    'Total': c.total || 0,
    'Retención': c.retencion_valor || 0,
    'Tipo Compra': c.tipo_compra || ''
  }))
  const ws3 = XLSX.utils.json_to_sheet(compras.length > 0 ? compras : [{ Nota: 'Sin compras' }])
  ws3['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(wb, ws3, 'Compras')

  // Hoja: Retenciones
  if ((data.value.retenciones || []).length > 0) {
    const rets = data.value.retenciones.map(r => ({
      'Tipo ID': r.tipo_id,
      'Identificación': r.identificacion,
      'Razón social': r.razon_social,
      'N° Factura': r.numero_factura,
      'N° Retención': r.numero_retencion,
      'Fecha': formatFecha(r.fecha_retencion),
      'Tipo Retención': r.tipo_retencion || '',
      'Base': r.base_imponible || 0,
      'Porcentaje': r.porcentaje || 0,
      'Valor': r.valor_retenido || 0
    }))
    const ws4 = XLSX.utils.json_to_sheet(rets)
    ws4['!cols'] = [
      { wch: 8 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 18 },
      { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, ws4, 'Retenciones')
  }

  XLSX.writeFile(wb, `ATS_${anio.value}_${String(mes.value).padStart(2, '0')}.xlsx`)
  toast.success('Excel generado correctamente')
}

// ===== EXPORTAR PDF =====
const exportarPDF = () => {
  if (!data.value) return

  const doc = new jsPDF('l', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ANEXO TRANSACCIONAL SIMPLIFICADO (ATS)', pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${data.value.periodo?.nombre || nombrePeriodo.value}`, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(
    `Generado: ${formatFechaHora(data.value.generado)}`,
    pageWidth / 2, y, { align: 'center' }
  )
  doc.setTextColor(0)
  y += 8

  // Ventas
  if ((data.value.ventas || []).length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`SECCIÓN 1 — VENTAS (${data.value.ventas.length})`, 10, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Tipo ID', 'Identificación', 'Razón Social', 'Comp.', 'N° Comp.', 'Fecha', 'Base 0%', 'Base IVA', 'IVA', 'Total']],
      body: data.value.ventas.map(v => [
        v.tipo_id, v.identificacion,
        (v.razon_social || '').slice(0, 25),
        v.tipo_comprobante, v.numero_comprobante,
        formatFecha(v.fecha_emision),
        (v.base_0 || 0).toFixed(2),
        (v.base_iva || 0).toFixed(2),
        (v.iva || 0).toFixed(2),
        (v.total || 0).toFixed(2)
      ]),
      foot: [[
        '', '', '', '', '', 'TOTALES',
        (data.value.totales?.ventas?.base0 || 0).toFixed(2),
        (data.value.totales?.ventas?.baseIVA || 0).toFixed(2),
        (data.value.totales?.ventas?.iva || 0).toFixed(2),
        (data.value.totales?.ventas?.total || 0).toFixed(2)
      ]],
      theme: 'striped',
      headStyles: { fillColor: [44, 62, 80], fontSize: 7 },
      footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1 },
      margin: { left: 8, right: 8 }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // Compras
  if ((data.value.compras || []).length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`SECCIÓN 2 — COMPRAS (${data.value.compras.length})`, 10, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Tipo ID', 'Identificación', 'Razón Social', 'N° Comp.', 'Fecha', 'Base 0%', 'Base IVA', 'IVA', 'Total', 'Retención']],
      body: data.value.compras.map(c => [
        c.tipo_id, c.identificacion,
        (c.razon_social || '').slice(0, 25),
        c.numero_comprobante,
        formatFecha(c.fecha_emision),
        (c.base_0 || 0).toFixed(2),
        (c.base_iva || 0).toFixed(2),
        (c.iva || 0).toFixed(2),
        (c.total || 0).toFixed(2),
        (c.retencion_valor || 0).toFixed(2)
      ]),
      foot: [[
        '', '', '', '', 'TOTALES',
        (data.value.totales?.compras?.base0 || 0).toFixed(2),
        (data.value.totales?.compras?.baseIVA || 0).toFixed(2),
        (data.value.totales?.compras?.iva || 0).toFixed(2),
        (data.value.totales?.compras?.total || 0).toFixed(2),
        (data.value.totales?.compras?.retenciones || 0).toFixed(2)
      ]],
      theme: 'striped',
      headStyles: { fillColor: [230, 126, 34], fontSize: 7 },
      footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1 },
      margin: { left: 8, right: 8 }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // Retenciones
  if ((data.value.retenciones || []).length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`SECCIÓN 3 — RETENCIONES (${data.value.retenciones.length})`, 10, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Tipo ID', 'Identificación', 'Razón Social', 'N° Factura', 'N° Retención', 'Fecha', 'Tipo', 'Base', '%', 'Valor']],
      body: data.value.retenciones.map(r => [
        r.tipo_id, r.identificacion,
        (r.razon_social || '').slice(0, 25),
        r.numero_factura, r.numero_retencion,
        formatFecha(r.fecha_retencion),
        r.tipo_retencion || '—',
        (r.base_imponible || 0).toFixed(2),
        `${r.porcentaje || 0}%`,
        (r.valor_retenido || 0).toFixed(2)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [155, 89, 182], fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1 },
      margin: { left: 8, right: 8 }
    })
  }

  doc.save(`ATS_${anio.value}_${String(mes.value).padStart(2, '0')}.pdf`)
  toast.success('PDF generado correctamente')
}

const imprimir = () => window.print()

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

// ===== LIFECYCLE =====
onMounted(async () => {
  await cargarEmpresa()
  // No cargamos automáticamente, esperamos acción del usuario
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.ats-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-purple { background: linear-gradient(135deg, #8e44ad, #6c3483); box-shadow: 0 6px 16px rgba(142,68,173,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary, .btn-danger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
  text-decoration: none;
}
.btn-primary { background: linear-gradient(135deg, #8e44ad, #6c3483); color: #fff; box-shadow: 0 4px 12px rgba(142,68,173,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(142,68,173,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

/* FILTROS */
.filters-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px 20px; }
.filters-grid { display: grid; grid-template-columns: 1fr 1.4fr auto 1fr; gap: 16px; align-items: end; }
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-input { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.form-input:focus { border-color: #8e44ad; box-shadow: 0 0 0 4px rgba(142,68,173,0.15); background: var(--bg-card); }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }

.nav-buttons { display: flex; gap: 4px; }
.nav-btn { padding: 10px 14px; background: var(--bg-table-stripe); border: 1.5px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-secondary); font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.nav-btn:hover:not(:disabled) { border-color: #8e44ad; color: #8e44ad; background: rgba(142,68,173,0.06); }
.nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.filters-actions { display: flex; justify-content: flex-end; gap: 8px; }
.filters-actions .btn-primary { padding: 11px 24px; }

.period-preview { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-light); font-size: 0.82rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
.period-preview i { color: #8e44ad; }
.period-preview strong { color: var(--text-primary); font-weight: 700; }

/* INFO CARD */
.info-card { display: flex; gap: 14px; padding: 16px 20px; background: rgba(52,152,219,0.06); border: 1px solid rgba(52,152,219,0.25); border-left: 4px solid #3498db; border-radius: var(--radius-lg); }
.info-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(52,152,219,0.15); color: #3498db; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.info-body { flex: 1; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; }
.info-body strong { color: var(--text-primary); display: block; margin-bottom: 4px; }

/* DOCUMENTO */
.documento-header { text-align: center; padding: 16px; background: var(--bg-table-stripe); border-radius: var(--radius-lg); }
.doc-title { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; letter-spacing: 0.5px; }
.doc-subtitle { font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 4px; }
.doc-empresa { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
.doc-meta { font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: center; gap: 12px; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); border-left: 4px solid transparent; transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-info { border-left-color: #3498db; }
.stat-card-warning { border-left-color: #f39c12; }
.stat-card-purple { border-left-color: #8e44ad; }
.stat-card-danger { border-left-color: #e74c3c; background: rgba(231,76,60,0.03); }
.stat-card-success { border-left-color: #27ae60; background: rgba(39,174,96,0.03); }

.stat-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }
.stat-icon.verde { background: rgba(39,174,96,0.12); color: #27ae60; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.3rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }
.stat-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }

/* ADVERTENCIAS */
.advertencias-card { background: rgba(243,156,18,0.06); border: 1px solid rgba(243,156,18,0.3); border-left: 4px solid #f39c12; border-radius: var(--radius-lg); overflow: hidden; }
.advertencias-header { padding: 12px 18px; background: rgba(243,156,18,0.12); font-weight: 700; color: #d68910; display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
.advertencias-body { padding: 12px 18px; display: flex; flex-direction: column; gap: 12px; }
.advertencia-item { display: flex; gap: 12px; padding: 12px 14px; background: var(--bg-card); border-radius: var(--radius-md); border-left: 3px solid #f39c12; }
.advertencia-item.adv-alta { border-left-color: #e74c3c; background: rgba(231,76,60,0.04); }
.adv-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; flex-shrink: 0; background: rgba(243,156,18,0.15); color: #f39c12; }
.adv-alta .adv-icon { background: rgba(231,76,60,0.15); color: #e74c3c; }
.adv-content { flex: 1; min-width: 0; }
.adv-titulo { font-weight: 800; color: var(--text-primary); font-size: 0.85rem; margin-bottom: 4px; }
.adv-mensaje { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; }
.adv-docs { margin-top: 8px; font-size: 0.78rem; }
.adv-docs summary { cursor: pointer; color: #8e44ad; font-weight: 600; padding: 4px 0; }
.adv-docs ul { margin: 6px 0 0; padding-left: 20px; color: var(--text-muted); line-height: 1.7; }

/* TABLA */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-count { margin-left: 6px; padding: 2px 10px; background: rgba(142,68,173,0.15); color: #6c3483; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern.table-compact { font-size: 0.78rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 12px 10px; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 10px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.font-mono { font-family: var(--font-mono, monospace); }
.money-num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text-secondary); }
.money-total { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text-primary); }
.text-purple { color: #8e44ad; font-weight: 700; font-variant-numeric: tabular-nums; }
.text-danger { color: #e74c3c; }
.text-success { color: #27ae60; }
.text-muted { color: var(--text-muted); }

.badge-estado-sri { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: var(--radius-full); font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }
.estado-ok { background: var(--success-bg); color: var(--success); }
.estado-warning { background: rgba(243,156,18,0.15); color: #d68910; }
.estado-danger { background: rgba(231,76,60,0.15); color: #c0392b; }
.estado-neutral { background: var(--bg-table-stripe); color: var(--text-muted); }

.tfoot-totales { background: var(--bg-table-stripe); font-weight: 800; color: var(--text-primary); }
.tfoot-totales td { padding: 12px 10px; border-top: 2px solid var(--border-color); }

/* EMPTY INLINE */
.empty-inline { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-inline i { font-size: 2rem; opacity: 0.35; }

/* LOADING */
.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #8e44ad; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* NOTA LEGAL */
.nota-legal { display: flex; gap: 14px; padding: 16px 20px; background: rgba(243,156,18,0.06); border: 1px solid rgba(243,156,18,0.3); border-left: 4px solid #f39c12; border-radius: var(--radius-lg); font-size: 0.85rem; color: var(--text-secondary); }
.nota-legal > i { color: #f39c12; font-size: 1.2rem; flex-shrink: 0; margin-top: 2px; }
.nota-legal strong { color: var(--text-primary); display: block; margin-bottom: 4px; }
.nota-legal .small { font-size: 0.78rem; line-height: 1.5; }

/* META */
.meta-info { font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 4px; }

/* RESPONSIVE */
@media (max-width: 992px) {
  .filters-grid { grid-template-columns: 1fr 1fr; }
  .nav-buttons, .filters-actions { grid-column: 1 / -1; }
  .filters-actions { justify-content: stretch; }
  .filters-actions .btn-primary, .filters-actions .btn-secondary { flex: 1; justify-content: center; }
}
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .table-modern.table-compact { font-size: 0.72rem; }
  .table-modern th, .table-modern td { padding: 8px 6px; }
}

/* IMPRESIÓN */
@media print {
  .no-print { display: none !important; }
  .ats-page { gap: 8px; }
  .card-cacao { box-shadow: none; border: 1px solid #ddd; page-break-inside: avoid; }
  .documento-header { background: #f5f5f5; }
  .table-modern.table-compact { font-size: 8pt; }
  .stats-grid { grid-template-columns: repeat(4, 1fr); }
  .badge-estado-sri { font-size: 7pt; }
}
</style>