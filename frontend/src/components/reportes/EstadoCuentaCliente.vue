<template>
  <div class="estado-cuenta-page">
    <!-- HEADER -->
    <div class="page-header no-print">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-indigo"><i class="fas fa-file-invoice-dollar"></i></span>
          Estado de Cuenta
        </h1>
        <p class="page-subtitle">
          Movimientos, aging y saldo corrido por cliente
        </p>
      </div>
      <div class="header-actions">
        <router-link to="/reportes/cartera" class="btn-secondary">
          <i class="fas fa-chart-pie"></i>
          Cartera general
        </router-link>
        <button class="btn-secondary" @click="exportarExcel" :disabled="!estado || loading" aria-label="Exportar Excel">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn-danger" @click="exportarPDF" :disabled="!estado || loading" aria-label="Exportar PDF">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="btn-secondary" @click="imprimir" :disabled="!estado || loading" aria-label="Imprimir">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="card-cacao no-print">
      <div class="card-header">
        <i class="fas fa-filter me-2"></i>
        Seleccionar cliente y período
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-field form-field-full">
            <label class="form-label" for="ec-cliente">
              <span class="required">*</span> Cliente
            </label>
            <div class="search-wrapper">
              <i class="fas fa-search search-icon"></i>
              <input
                id="ec-cliente"
                type="text"
                class="form-input"
                :placeholder="clienteActual ? clienteActual.nombre : 'Buscar cliente por nombre o RUC...'"
                v-model="busquedaCliente"
                @focus="mostrarLista = true"
                @blur="cerrarLista"
                :disabled="loading || Boolean(clienteActual)"
                readonly
                @click="abrirLista"
              />
              <button v-if="clienteActual" type="button" class="search-clear" @click="limpiarCliente" aria-label="Limpiar cliente">
                <i class="fas fa-times"></i>
              </button>
            </div>

            <transition name="dropdown">
              <div v-if="mostrarLista && clientesFiltrados.length > 0" class="search-dropdown">
                <div
                  v-for="c in clientesFiltrados.slice(0, 10)"
                  :key="c._id"
                  class="dropdown-row"
                  @mousedown.prevent="seleccionarCliente(c)"
                >
                  <div class="row-avatar">{{ inicial(c.nombre) }}</div>
                  <div class="row-content">
                    <div class="row-title">{{ c.nombre }}</div>
                    <div class="row-meta">
                      <code>{{ c.ruc }}</code>
                      <span v-if="c.telefono"><i class="fas fa-phone"></i> {{ c.telefono }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <div class="form-field">
            <label class="form-label" for="ec-desde">Desde</label>
            <input id="ec-desde" type="date" class="form-input" v-model="desde" :disabled="loading" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ec-hasta">Hasta</label>
            <input id="ec-hasta" type="date" class="form-input" v-model="hasta" :disabled="loading" />
          </div>
          <div class="quick-dates">
            <span class="quick-dates-label">Rápido:</span>
            <button
              v-for="q in quickDates"
              :key="q.label"
              type="button"
              class="quick-chip"
              :disabled="loading"
              @click="aplicarQuickDate(q)"
            >
              {{ q.label }}
            </button>
          </div>
          <div class="form-actions">
            <button
              class="btn-primary"
              @click="cargar"
              :disabled="!clienteId || loading"
              aria-label="Generar estado de cuenta"
            >
              <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
              {{ loading ? 'Generando...' : 'Generar' }}
            </button>
            <button class="btn-secondary" @click="limpiar" :disabled="loading">
              <i class="fas fa-undo"></i> Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- EMPTY -->
    <div v-if="!estado && !loading" class="empty-block no-print">
      <div class="empty-icon"><i class="fas fa-file-invoice-dollar"></i></div>
      <div class="empty-title">Estado de Cuenta por Cliente</div>
      <div class="empty-text">
        Selecciona un cliente y presiona <strong>Generar</strong> para ver su estado
        de cuenta completo con saldo corrido, edades de cartera y exportación.
      </div>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="loading-block no-print">
      <div class="spinner-lg"></div>
      <p>Generando estado de cuenta...</p>
    </div>

    <!-- CONTENIDO -->
    <div v-if="estado" ref="contenidoPDF">
      <!-- Header del documento -->
      <div class="documento-header">
        <div class="doc-cliente">
          <div class="cliente-avatar-lg">{{ inicial(estado.cliente.nombre) }}</div>
          <div class="cliente-info-doc">
            <div class="cliente-name-doc">{{ estado.cliente.nombre }}</div>
            <div class="cliente-meta-doc">
              <span><strong>RUC/Cédula:</strong> {{ estado.cliente.ruc }}</span>
              <span v-if="estado.cliente.direccion"><strong>Dirección:</strong> {{ estado.cliente.direccion }}</span>
              <span v-if="estado.cliente.telefono"><strong>Teléfono:</strong> {{ estado.cliente.telefono }}</span>
              <span v-if="estado.cliente.email"><strong>Email:</strong> {{ estado.cliente.email }}</span>
            </div>
          </div>
        </div>
        <div class="doc-periodo">
          <div><strong>Período:</strong>
            {{ estado.periodo.desde ? formatFecha(estado.periodo.desde) : 'Inicio' }}
            —
            {{ estado.periodo.hasta ? formatFecha(estado.periodo.hasta) : 'Hoy' }}
          </div>
          <div><strong>Generado:</strong> {{ formatFechaHora(estado.periodo.generado) }}</div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="stats-grid">
        <div class="stat-card stat-card-danger">
          <div class="stat-icon rojo"><i class="fas fa-arrow-up"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(estado.totales.totalDebitos) }}</div>
            <div class="stat-label">Total débitos</div>
          </div>
        </div>
        <div class="stat-card stat-card-success">
          <div class="stat-icon verde"><i class="fas fa-arrow-down"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(estado.totales.totalCreditos) }}</div>
            <div class="stat-label">Total créditos</div>
          </div>
        </div>
        <div class="stat-card" :class="estado.totales.saldoFinal > 0 ? 'stat-card-danger' : 'stat-card-success'">
          <div class="stat-icon" :class="estado.totales.saldoFinal > 0 ? 'rojo' : 'verde'">
            <i class="fas fa-balance-scale"></i>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ formatCurrency(estado.totales.saldoFinal) }}</div>
            <div class="stat-label">Saldo pendiente</div>
          </div>
        </div>
        <div class="stat-card stat-card-info">
          <div class="stat-icon azul"><i class="fas fa-list"></i></div>
          <div class="stat-info">
            <div class="stat-value">{{ estado.totales.cantidadMovimientos }}</div>
            <div class="stat-label">Movimientos</div>
          </div>
        </div>
      </div>

      <!-- Aging -->
      <div class="card-cacao">
        <div class="card-header">
          <i class="fas fa-hourglass-half me-2"></i>
          Edades de cartera
        </div>
        <div class="card-body">
          <div class="aging-grid">
            <div class="aging-box" :class="{ 'aging-active': estado.aging['0-30'] > 0 }">
              <div class="aging-label">0 - 30 días</div>
              <div class="aging-value">{{ formatCurrency(estado.aging['0-30']) }}</div>
            </div>
            <div class="aging-box aging-warning" :class="{ 'aging-active': estado.aging['31-60'] > 0 }">
              <div class="aging-label">31 - 60 días</div>
              <div class="aging-value">{{ formatCurrency(estado.aging['31-60']) }}</div>
            </div>
            <div class="aging-box aging-orange" :class="{ 'aging-active': estado.aging['61-90'] > 0 }">
              <div class="aging-label">61 - 90 días</div>
              <div class="aging-value">{{ formatCurrency(estado.aging['61-90']) }}</div>
            </div>
            <div class="aging-box aging-danger" :class="{ 'aging-active': estado.aging['+90'] > 0 }">
              <div class="aging-label">+ 90 días</div>
              <div class="aging-value">{{ formatCurrency(estado.aging['+90']) }}</div>
            </div>
          </div>
          <div v-if="estado.agingDetalle?.creditoAFavor > 0" class="saldo-favor">
            <i class="fas fa-info-circle"></i>
            Saldo a favor del cliente:
            <strong>{{ formatCurrency(estado.agingDetalle.creditoAFavor) }}</strong>
          </div>
        </div>
      </div>

      <!-- Movimientos -->
      <div class="card-cacao">
        <div class="card-header card-header-flex">
          <div>
            <i class="fas fa-list me-2"></i>
            Detalle de movimientos
            <span class="header-count">{{ estado.movimientos.length }}</span>
          </div>
        </div>
        <div class="card-body p-0">
          <div v-if="estado.movimientos.length === 0" class="empty-inline">
            <i class="fas fa-inbox"></i>
            <span>No hay movimientos en el período seleccionado</span>
          </div>
          <div v-else class="table-responsive">
            <table class="table-modern">
              <thead>
                <tr>
                  <th style="width:110px;">Fecha</th>
                  <th style="width:150px;">Documento</th>
                  <th>Descripción</th>
                  <th style="width:110px;" class="text-end">Débito</th>
                  <th style="width:110px;" class="text-end">Crédito</th>
                  <th style="width:120px;" class="text-end">Saldo</th>
                  <th style="width:70px;" class="text-center">Días</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, idx) in estado.movimientos" :key="idx">
                  <td class="small">{{ formatFecha(m.fecha) }}</td>
                  <td>
                    <span class="badge-tipo-doc" :class="`tipo-${m.tipo}`">
                      {{ m.numero || m.descripcion }}
                    </span>
                  </td>
                  <td>
                    <div class="descripcion-cell">
                      {{ m.descripcion }}
                      <span v-if="m.estado_pago === 'pagado'" class="badge-estado badge-pagado">Pagado</span>
                      <span v-else-if="m.dias_vencidos > 30 && m.debito > 0" class="badge-estado badge-vencido">Vencido</span>
                    </div>
                  </td>
                  <td class="text-end">
                    <span v-if="m.debito > 0" class="money-debito">{{ formatCurrency(m.debito) }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="text-end">
                    <span v-if="m.credito > 0" class="money-credito">{{ formatCurrency(m.credito) }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="text-end">
                    <span class="money-saldo">{{ formatCurrency(m.saldo) }}</span>
                  </td>
                  <td class="text-center small">{{ m.dias_vencidos }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="tfoot-totales">
                  <td colspan="3" class="text-end">TOTALES</td>
                  <td class="text-end">{{ formatCurrency(estado.totales.totalDebitos) }}</td>
                  <td class="text-end money-credito">{{ formatCurrency(estado.totales.totalCreditos) }}</td>
                  <td class="text-end">{{ formatCurrency(estado.totales.saldoFinal) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Resumen por tipo -->
      <div v-if="Object.keys(estado.resumenPorTipo || {}).length > 0" class="card-cacao">
        <div class="card-header">
          <i class="fas fa-chart-pie me-2"></i>
          Resumen por tipo de documento
        </div>
        <div class="card-body">
          <div class="resumen-grid">
            <div v-for="(r, tipo) in estado.resumenPorTipo" :key="tipo" class="resumen-box">
              <div class="resumen-tipo">{{ describeTipo(tipo) }}</div>
              <div class="resumen-cantidad">{{ r.cantidad }} doc.</div>
              <div class="resumen-total">{{ formatCurrency(r.total) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Firma -->
      <div class="firma-section">
        <div class="firma-fila">
          <div class="firma-item">
            <div class="firma-line"></div>
            <div class="firma-label">Firma del cliente</div>
          </div>
          <div class="firma-item">
            <div class="firma-line"></div>
            <div class="firma-label">Emisor</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { formatCurrency } from '../../utils/formatters'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const toast = useToast()
const route = useRoute()
const router = useRouter()

// ===== CONSTANTES =====
const QUICK_DATES = Object.freeze([
  { label: 'Este mes', tipo: 'mes' },
  { label: 'Últimos 30 días', tipo: 'dias', dias: 30 },
  { label: 'Este año', tipo: 'anio' },
  { label: 'Todo', tipo: 'todo' }
])

// ===== STATE =====
const clientes = ref([])
const clienteId = ref('')
const busquedaCliente = ref('')
const mostrarLista = ref(false)
const desde = ref('')
const hasta = ref('')
const estado = ref(null)
const loading = ref(false)

let unmounted = false

const quickDates = QUICK_DATES

// ===== COMPUTED =====
const clienteActual = computed(() =>
  clientes.value.find(c => c._id === clienteId.value) || null
)

const clientesFiltrados = computed(() => {
  const q = String(busquedaCliente.value || '').trim().toLowerCase()
  const list = clientes.value
  if (!q) return list.slice(0, 30)
  return list.filter(c => {
    const n = String(c.nombre || '').toLowerCase()
    const r = String(c.ruc || '').toLowerCase()
    return n.includes(q) || r.includes(q)
  }).slice(0, 30)
})

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

const formatFecha = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch { return '' }
}

const formatFechaHora = (f) => {
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC', {
      dateStyle: 'medium', timeStyle: 'short'
    })
  } catch { return '' }
}

const describeTipo = (tipo) => {
  const map = {
    factura: 'Factura',
    nota_credito: 'Nota de Crédito',
    guia_remision: 'Guía de Remisión',
    exportacion: 'Factura Exportación',
    reembolso: 'Factura Reembolso',
    retencion: 'Comprobante Retención',
    liquidacion: 'Liquidación',
    proforma: 'Proforma',
    pago: 'Pago'
  }
  return map[tipo] || tipo
}

const toISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const aplicarQuickDate = (q) => {
  const hoy = new Date()
  if (q.tipo === 'mes') {
    desde.value = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
    hasta.value = toISODate(hoy)
  } else if (q.tipo === 'dias') {
    const i = new Date(hoy)
    i.setDate(i.getDate() - (q.dias || 0))
    desde.value = toISODate(i)
    hasta.value = toISODate(hoy)
  } else if (q.tipo === 'anio') {
    desde.value = toISODate(new Date(hoy.getFullYear(), 0, 1))
    hasta.value = toISODate(hoy)
  } else if (q.tipo === 'todo') {
    desde.value = ''
    hasta.value = ''
  }
}

// ===== LISTA CLIENTES =====
const abrirLista = () => {
  if (clienteActual.value) return
  mostrarLista.value = true
}

const cerrarLista = () => {
  setTimeout(() => { mostrarLista.value = false }, 200)
}

const seleccionarCliente = (c) => {
  clienteId.value = c._id
  busquedaCliente.value = ''
  mostrarLista.value = false
}

const limpiarCliente = () => {
  clienteId.value = ''
  busquedaCliente.value = ''
  estado.value = null
}

const limpiar = () => {
  limpiarCliente()
  desde.value = ''
  hasta.value = ''
  router.replace('/reportes/estado-cuenta')
}

// ===== CARGA =====
const cargarClientes = async () => {
  try {
    const res = await api.request('/clientes', { method: 'GET', skipLoader: true })
    if (unmounted) return
    clientes.value = Array.isArray(res) ? res : (res?.data || [])
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar clientes: ' + e.message)
  }
}

const cargar = async () => {
  if (!clienteId.value) {
    toast.warning('Selecciona un cliente')
    return
  }
  if (loading.value) return

  loading.value = true
  try {
    const params = new URLSearchParams()
    if (desde.value) params.set('desde', desde.value)
    if (hasta.value) params.set('hasta', hasta.value)

    const url = `/estado-cuenta/${clienteId.value}${params.toString() ? '?' + params.toString() : ''}`
    const res = await api.request(url, {
      method: 'GET',
      loaderMessage: 'Generando estado de cuenta...'
    })
    if (unmounted) return
    estado.value = res
  } catch (e) {
    if (unmounted) return
    const codigo = e?.codigo || e?.code
    if (codigo === 'CLIENTE_NOT_FOUND') toast.error('Cliente no encontrado')
    else if (codigo === 'ID_INVALIDO') toast.error('ID de cliente inválido')
    else toast.error('Error: ' + e.message)
    estado.value = null
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== EXPORTAR PDF =====
const exportarPDF = () => {
  if (!estado.value) return

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE CUENTA', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Del ${estado.value.periodo.desde ? formatFecha(estado.value.periodo.desde) : 'Inicio'} al ${estado.value.periodo.hasta ? formatFecha(estado.value.periodo.hasta) : 'Hoy'}`,
    pageWidth / 2, y, { align: 'center' }
  )
  y += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Cliente:', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text(estado.value.cliente.nombre || '', 35, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('RUC/Cédula:', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text(estado.value.cliente.ruc || '', 35, y)
  y += 5

  if (estado.value.cliente.direccion) {
    doc.setFont('helvetica', 'bold')
    doc.text('Dirección:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(estado.value.cliente.direccion, 35, y)
    y += 5
  }
  if (estado.value.cliente.telefono) {
    doc.setFont('helvetica', 'bold')
    doc.text('Teléfono:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(estado.value.cliente.telefono, 35, y)
    y += 5
  }
  y += 5

  // Movimientos
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Documento', 'Descripción', 'Débito', 'Crédito', 'Saldo', 'Días']],
    body: estado.value.movimientos.map(m => [
      formatFecha(m.fecha),
      m.numero || '',
      (m.descripcion || '').slice(0, 40),
      m.debito > 0 ? m.debito.toFixed(2) : '',
      m.credito > 0 ? m.credito.toFixed(2) : '',
      (m.saldo || 0).toFixed(2),
      m.dias_vencidos
    ]),
    foot: [[
      '', '', 'TOTALES',
      estado.value.totales.totalDebitos.toFixed(2),
      estado.value.totales.totalCreditos.toFixed(2),
      estado.value.totales.saldoFinal.toFixed(2),
      ''
    ]],
    theme: 'striped',
    headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7 },
    margin: { left: 14, right: 14 }
  })

  y = doc.lastAutoTable.finalY + 10

  // Aging
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('EDADES DE CARTERA', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['0-30 días', '31-60 días', '61-90 días', '+ 90 días']],
    body: [[
      estado.value.aging['0-30'].toFixed(2),
      estado.value.aging['31-60'].toFixed(2),
      estado.value.aging['61-90'].toFixed(2),
      estado.value.aging['+90'].toFixed(2)
    ]],
    theme: 'grid',
    headStyles: { fillColor: [230, 126, 34], fontSize: 9 },
    styles: { fontSize: 9, halign: 'center' },
    margin: { left: 14, right: 14 }
  })

  y = doc.lastAutoTable.finalY + 20

  // Firmas
  doc.setDrawColor(0, 0, 0)
  doc.line(20, y, 80, y)
  doc.line(pageWidth - 80, y, pageWidth - 20, y)
  doc.setFontSize(8)
  doc.text('Firma del cliente', 50, y + 5, { align: 'center' })
  doc.text('Emisor', pageWidth - 50, y + 5, { align: 'center' })

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(
      `Estado de cuenta — Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
  }

  const ruc = estado.value.cliente.ruc || 'sin_ruc'
  doc.save(`estado_cuenta_${ruc}_${new Date().toISOString().slice(0, 10)}.pdf`)
  toast.success('PDF generado correctamente')
}

// ===== EXPORTAR EXCEL =====
const exportarExcel = () => {
  if (!estado.value) return

  const wb = XLSX.utils.book_new()

  const movimientos = estado.value.movimientos.map(m => ({
    Fecha: formatFecha(m.fecha),
    Documento: m.numero || '',
    Descripción: m.descripcion,
    Débito: m.debito || 0,
    Crédito: m.credito || 0,
    Saldo: m.saldo || 0,
    Días: m.dias_vencidos,
    Estado: m.estado_pago || ''
  }))
  const ws1 = XLSX.utils.json_to_sheet(movimientos)
  ws1['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 40 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Movimientos')

  const resumen = [
    ['ESTADO DE CUENTA'],
    [],
    ['Cliente', estado.value.cliente.nombre],
    ['RUC/Cédula', estado.value.cliente.ruc],
    ['Período',
      `${estado.value.periodo.desde ? formatFecha(estado.value.periodo.desde) : 'Inicio'} - ${estado.value.periodo.hasta ? formatFecha(estado.value.periodo.hasta) : 'Hoy'}`],
    ['Generado', formatFechaHora(estado.value.periodo.generado)],
    [],
    ['RESUMEN'],
    ['Total Débitos', estado.value.totales.totalDebitos],
    ['Total Créditos', estado.value.totales.totalCreditos],
    ['Saldo Final', estado.value.totales.saldoFinal],
    ['Movimientos', estado.value.totales.cantidadMovimientos],
    [],
    ['EDADES DE CARTERA'],
    ['0-30 días', estado.value.aging['0-30']],
    ['31-60 días', estado.value.aging['31-60']],
    ['61-90 días', estado.value.aging['61-90']],
    ['+90 días', estado.value.aging['+90']]
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(resumen)
  ws2['!cols'] = [{ wch: 20 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen')

  const ruc = estado.value.cliente.ruc || 'sin_ruc'
  XLSX.writeFile(wb, `estado_cuenta_${ruc}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Excel generado correctamente')
}

const imprimir = () => window.print()

// ===== LIFECYCLE =====
onMounted(async () => {
  await cargarClientes()
  if (route.query.clienteId) {
    clienteId.value = route.query.clienteId
    await cargar()
  }
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<style scoped>
.estado-cuenta-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-indigo { background: linear-gradient(135deg, #5b6fd8, #4a5fc1); box-shadow: 0 6px 16px rgba(91,111,216,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary, .btn-danger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
  text-decoration: none;
}
.btn-primary { background: linear-gradient(135deg, #5b6fd8, #4a5fc1); color: #fff; box-shadow: 0 4px 12px rgba(91,111,216,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(91,111,216,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #5b6fd8; color: #5b6fd8; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

/* FILTROS */
.form-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; align-items: end; }
.form-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-field-full { grid-column: 1 / -1; }
.form-label { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.form-label .required { color: var(--danger); margin-right: 2px; }
.form-input { width: 100%; padding: 11px 14px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.9rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.form-input:focus { border-color: #5b6fd8; box-shadow: 0 0 0 4px rgba(91,111,216,0.15); background: var(--bg-card); }
.form-input:disabled { opacity: 0.6; cursor: not-allowed; }
.form-input[readonly] { cursor: pointer; }

.search-wrapper { position: relative; }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem; pointer-events: none; }
.search-wrapper .form-input { padding-left: 40px; padding-right: 40px; }
.search-clear { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.search-clear:hover { color: var(--danger); background: var(--bg-table-stripe); }

.search-dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 100; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: 0 20px 40px rgba(0,0,0,0.15); max-height: 400px; overflow-y: auto; padding: 6px; }
.dropdown-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-md); cursor: pointer; transition: background var(--transition-fast); }
.dropdown-row:hover { background: var(--bg-table-stripe); }
.row-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #5b6fd8, #4a5fc1); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82rem; flex-shrink: 0; }
.row-content { flex: 1; min-width: 0; }
.row-title { font-weight: 600; color: var(--text-primary); font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-meta { display: flex; gap: 10px; font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; flex-wrap: wrap; }
.row-meta code { background: var(--bg-table-stripe); padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono, monospace); }

.quick-dates { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; grid-column: 1 / -1; }
.quick-dates-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
.quick-chip { padding: 6px 12px; background: var(--bg-table-stripe); border: 1px solid var(--border-color); border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.quick-chip:hover:not(:disabled) { border-color: #5b6fd8; color: #5b6fd8; background: rgba(91,111,216,0.06); }
.quick-chip:disabled { opacity: 0.5; cursor: not-allowed; }

.form-actions { display: flex; gap: 8px; justify-content: flex-end; grid-column: 1 / -1; }

/* DOCUMENTO HEADER */
.documento-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding: 20px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); flex-wrap: wrap; }
.doc-cliente { display: flex; align-items: flex-start; gap: 14px; flex: 1; min-width: 240px; }
.cliente-avatar-lg { width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, #5b6fd8, #4a5fc1); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.4rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(91,111,216,0.3); }
.cliente-info-doc { flex: 1; min-width: 0; }
.cliente-name-doc { font-weight: 800; font-size: 1.15rem; color: var(--text-primary); margin-bottom: 6px; }
.cliente-meta-doc { display: flex; flex-direction: column; gap: 3px; font-size: 0.8rem; color: var(--text-secondary); }
.cliente-meta-doc strong { color: var(--text-muted); font-weight: 600; margin-right: 4px; }

.doc-periodo { text-align: right; font-size: 0.8rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; }
.doc-periodo strong { color: var(--text-secondary); }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); border-left: 4px solid transparent; transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-danger { border-left-color: #e74c3c; background: rgba(231,76,60,0.03); }
.stat-card-success { border-left-color: #27ae60; background: rgba(39,174,96,0.03); }
.stat-card-info { border-left-color: #3498db; }

.stat-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }
.stat-icon.verde { background: rgba(39,174,96,0.12); color: #27ae60; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.35rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

/* AGING */
.aging-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.aging-box { padding: 14px 16px; border-radius: 10px; background: var(--bg-table-stripe); border: 2px solid transparent; text-align: center; transition: all var(--transition); }
.aging-box.aging-active { border-color: currentColor; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
.aging-box:not(.aging-warning):not(.aging-orange):not(.aging-danger) { color: #3498db; }
.aging-warning { color: #f39c12; }
.aging-orange { color: #e67e22; }
.aging-danger { color: #e74c3c; }
.aging-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-muted); }
.aging-value { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-top: 6px; font-variant-numeric: tabular-nums; }

.saldo-favor { margin-top: 12px; padding: 10px 14px; background: rgba(52,152,219,0.06); border-left: 4px solid #3498db; border-radius: var(--radius-md); font-size: 0.85rem; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.saldo-favor i { color: #3498db; }
.saldo-favor strong { color: #2980b9; font-weight: 800; }

/* TABLA */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-count { margin-left: 6px; padding: 2px 10px; background: rgba(91,111,216,0.15); color: #4a5fc1; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.badge-tipo-doc { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; background: var(--bg-table-stripe); color: var(--text-secondary); font-family: var(--font-mono, monospace); }
.tipo-factura { background: rgba(52,152,219,0.15); color: #2980b9; }
.tipo-nota_credito { background: rgba(39,174,96,0.15); color: #1e8449; }
.tipo-pago { background: rgba(142,68,173,0.15); color: #6c3483; }
.tipo-exportacion { background: rgba(243,156,18,0.15); color: #d68910; }

.descripcion-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge-estado { font-size: 0.65rem; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.badge-pagado { background: var(--success-bg); color: var(--success); }
.badge-vencido { background: rgba(231,76,60,0.15); color: #c0392b; }

.money-debito { color: #c0392b; font-weight: 700; font-variant-numeric: tabular-nums; }
.money-credito { color: #1e8449; font-weight: 700; font-variant-numeric: tabular-nums; }
.money-saldo { font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.tfoot-totales { background: var(--bg-table-stripe); font-weight: 800; }
.tfoot-totales td { padding: 14px 12px; border-top: 2px solid var(--border-color); }

/* RESUMEN */
.resumen-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.resumen-box { padding: 12px 14px; background: var(--bg-table-stripe); border-radius: 10px; text-align: center; }
.resumen-tipo { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px; }
.resumen-cantidad { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.resumen-total { font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-top: 4px; font-variant-numeric: tabular-nums; }

/* FIRMAS */
.firma-section { padding: 20px 0; }
.firma-fila { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 40px; }
.firma-item { text-align: center; }
.firma-line { border-bottom: 1px solid var(--text-primary); height: 40px; margin-bottom: 6px; }
.firma-label { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }

/* EMPTY/LOADING */
.empty-block { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 2px dashed var(--border-color); border-radius: var(--radius-lg); }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(91,111,216,0.08); color: #5b6fd8; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 16px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; color: var(--text-muted); max-width: 460px; margin: 0 auto; line-height: 1.5; }

.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #5b6fd8; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-inline { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-inline i { font-size: 2rem; opacity: 0.35; }

/* TRANSITIONS */
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 992px) {
  .form-grid { grid-template-columns: 1fr 1fr; }
  .aging-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .doc-periodo { text-align: left; }
  .form-actions { justify-content: stretch; }
  .form-actions .btn-primary, .form-actions .btn-secondary { flex: 1; justify-content: center; }
}

@media print {
  .no-print { display: none !important; }
  .estado-cuenta-page { gap: 10px; }
  .card-cacao { box-shadow: none; border: 1px solid #ddd; page-break-inside: avoid; }
  .table-modern { font-size: 8pt; }
  .firma-section { page-break-before: auto; }
}
</style>