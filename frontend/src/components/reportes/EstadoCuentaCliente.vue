<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 no-print">
      <h4 class="section-title">
        <i class="fas fa-file-invoice-dollar"></i> Estado de Cuenta
      </h4>
      <div class="d-flex gap-2">
        <router-link to="/reportes/cartera" class="btn btn-outline-primary">
          <i class="fas fa-chart-pie"></i> Ver cartera general
        </router-link>
        <button class="btn btn-danger" @click="exportarPDF" :disabled="!estado">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="btn btn-success" @click="exportarExcel" :disabled="!estado">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn btn-outline-secondary" @click="imprimir" :disabled="!estado">
          <i class="fas fa-print"></i> Imprimir
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card card-cacao mb-3 no-print">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-md-4">
            <label class="form-label"><span class="text-danger">*</span> Cliente</label>
            <select class="form-select" v-model="clienteId">
              <option value="">Seleccione un cliente...</option>
              <option v-for="c in clientes" :key="c._id" :value="c._id">
                {{ c.nombre }} — {{ c.ruc }}
              </option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label">Desde</label>
            <input type="date" class="form-control" v-model="desde" />
          </div>
          <div class="col-md-2">
            <label class="form-label">Hasta</label>
            <input type="date" class="form-control" v-model="hasta" />
          </div>
          <div class="col-md-4 d-flex gap-2">
            <button class="btn btn-primary flex-grow-1" @click="cargar" :disabled="!clienteId || loading">
              <i class="fas fa-search" :class="{ 'fa-spin': loading }"></i>
              {{ loading ? 'Cargando...' : 'Generar' }}
            </button>
            <button class="btn btn-outline-secondary" @click="limpiar">
              <i class="fas fa-undo"></i> Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alerta de bienvenida -->
    <div v-if="!estado && !loading" class="card card-cacao">
      <div class="card-body text-center py-5">
        <i class="fas fa-file-invoice-dollar fa-3x text-muted mb-3"></i>
        <h5>Estado de Cuenta por Cliente</h5>
        <p class="text-muted">
          Seleccione un cliente y presione <strong>Generar</strong> para ver su estado de cuenta completo con saldo corrido, edades de cartera y exportación a PDF/Excel.
        </p>
      </div>
    </div>

    <!-- Contenido imprimible -->
    <div v-if="estado" ref="contenidoPDF">
      <!-- Encabezado -->
      <div class="card card-cacao mb-3">
        <div class="card-body">
          <div class="row">
            <div class="col-md-8">
              <h5 class="mb-1">
                <i class="fas fa-user-circle me-2" style="color: var(--primary-color);"></i>
                {{ estado.cliente.nombre }}
              </h5>
              <div class="small text-muted">
                <div><strong>RUC/Cédula:</strong> {{ estado.cliente.ruc }}</div>
                <div v-if="estado.cliente.direccion"><strong>Dirección:</strong> {{ estado.cliente.direccion }}</div>
                <div v-if="estado.cliente.telefono"><strong>Teléfono:</strong> {{ estado.cliente.telefono }}</div>
                <div v-if="estado.cliente.email"><strong>Email:</strong> {{ estado.cliente.email }}</div>
              </div>
            </div>
            <div class="col-md-4 text-md-end">
              <div class="small text-muted">
                <div><strong>Período:</strong>
                  {{ estado.periodo.desde ? formatFecha(estado.periodo.desde) : 'Inicio' }}
                  —
                  {{ estado.periodo.hasta ? formatFecha(estado.periodo.hasta) : 'Hoy' }}
                </div>
                <div><strong>Generado:</strong> {{ formatFechaHora(estado.periodo.generado) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="row g-3 mb-3">
        <div class="col-md-3 col-6">
          <div class="kpi-box" style="border-left-color: #e74c3c;">
            <div class="kpi-label">Total Débitos</div>
            <div class="kpi-value" style="color: #e74c3c;">{{ formatCurrency(estado.totales.totalDebitos) }}</div>
          </div>
        </div>
        <div class="col-md-3 col-6">
          <div class="kpi-box" style="border-left-color: #27ae60;">
            <div class="kpi-label">Total Créditos</div>
            <div class="kpi-value" style="color: #27ae60;">{{ formatCurrency(estado.totales.totalCreditos) }}</div>
          </div>
        </div>
        <div class="col-md-3 col-6">
          <div class="kpi-box" :style="{ borderLeftColor: estado.totales.saldoFinal > 0 ? '#e74c3c' : '#27ae60' }">
            <div class="kpi-label">Saldo Pendiente</div>
            <div class="kpi-value" :style="{ color: estado.totales.saldoFinal > 0 ? '#e74c3c' : '#27ae60' }">
              {{ formatCurrency(estado.totales.saldoFinal) }}
            </div>
          </div>
        </div>
        <div class="col-md-3 col-6">
          <div class="kpi-box" style="border-left-color: #3498db;">
            <div class="kpi-label">Movimientos</div>
            <div class="kpi-value" style="color: #3498db;">{{ estado.totales.cantidadMovimientos }}</div>
          </div>
        </div>
      </div>

      <!-- Aging (Edades de cartera) -->
      <div class="card card-cacao mb-3">
        <div class="card-header"><i class="fas fa-hourglass-half me-2"></i> Edades de Cartera</div>
        <div class="card-body">
          <div class="row g-2">
            <div class="col-md-3 col-6">
              <div class="aging-box" :class="{ 'aging-active': estado.aging['0-30'] > 0 }">
                <div class="aging-label">0 - 30 días</div>
                <div class="aging-value">{{ formatCurrency(estado.aging['0-30']) }}</div>
              </div>
            </div>
            <div class="col-md-3 col-6">
              <div class="aging-box aging-warning" :class="{ 'aging-active': estado.aging['31-60'] > 0 }">
                <div class="aging-label">31 - 60 días</div>
                <div class="aging-value">{{ formatCurrency(estado.aging['31-60']) }}</div>
              </div>
            </div>
            <div class="col-md-3 col-6">
              <div class="aging-box aging-orange" :class="{ 'aging-active': estado.aging['61-90'] > 0 }">
                <div class="aging-label">61 - 90 días</div>
                <div class="aging-value">{{ formatCurrency(estado.aging['61-90']) }}</div>
              </div>
            </div>
            <div class="col-md-3 col-6">
              <div class="aging-box aging-danger" :class="{ 'aging-active': estado.aging['+90'] > 0 }">
                <div class="aging-label">+ 90 días</div>
                <div class="aging-value">{{ formatCurrency(estado.aging['+90']) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla de movimientos -->
      <div class="card card-cacao mb-3">
        <div class="card-header"><i class="fas fa-list me-2"></i> Detalle de Movimientos</div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-cacao table-sm">
              <thead>
                <tr>
                  <th style="width:100px;">Fecha</th>
                  <th style="width:130px;">Documento</th>
                  <th>Descripción</th>
                  <th style="width:110px;" class="text-end">Débito</th>
                  <th style="width:110px;" class="text-end">Crédito</th>
                  <th style="width:120px;" class="text-end">Saldo</th>
                  <th style="width:80px;" class="text-center">Días</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, idx) in estado.movimientos" :key="idx">
                  <td class="small">{{ formatFecha(m.fecha) }}</td>
                  <td class="small">
                    <span class="badge-tipo-doc" :class="`tipo-${m.tipo}`">
                      {{ m.numero || m.descripcion }}
                    </span>
                  </td>
                  <td class="small">
                    {{ m.descripcion }}
                    <span v-if="m.estado_pago === 'pagado'" class="badge bg-success ms-2">Pagado</span>
                    <span v-else-if="m.estado_pago === 'pendiente' && m.dias_vencidos > 30" class="badge bg-danger ms-2">
                      Vencido
                    </span>
                  </td>
                  <td class="text-end">
                    <span v-if="m.debito > 0">{{ formatCurrency(m.debito) }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="text-end">
                    <span v-if="m.credito > 0" style="color: #27ae60;">{{ formatCurrency(m.credito) }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="text-end fw-bold">{{ formatCurrency(m.saldo) }}</td>
                  <td class="text-center small">{{ m.dias_vencidos }}</td>
                </tr>
                <tr v-if="estado.movimientos.length === 0">
                  <td colspan="7" class="text-center text-muted py-4">
                    No hay movimientos en el período seleccionado
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="estado.movimientos.length > 0">
                <tr class="table-light fw-bold">
                  <td colspan="3" class="text-end">Totales</td>
                  <td class="text-end">{{ formatCurrency(estado.totales.totalDebitos) }}</td>
                  <td class="text-end" style="color: #27ae60;">{{ formatCurrency(estado.totales.totalCreditos) }}</td>
                  <td class="text-end">{{ formatCurrency(estado.totales.saldoFinal) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Resumen por tipo -->
      <div v-if="Object.keys(estado.resumenPorTipo).length > 0" class="card card-cacao mb-3">
        <div class="card-header"><i class="fas fa-chart-pie me-2"></i> Resumen por Tipo de Documento</div>
        <div class="card-body">
          <div class="row g-2">
            <div v-for="(r, tipo) in estado.resumenPorTipo" :key="tipo" class="col-md-3 col-6">
              <div class="resumen-box">
                <div class="resumen-tipo">{{ describeTipo(tipo) }}</div>
                <div class="resumen-cantidad">{{ r.cantidad }} doc.</div>
                <div class="resumen-total">{{ formatCurrency(r.total) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Firma -->
      <div class="firma-section mt-5">
        <div class="row">
          <div class="col-md-6">
            <div class="firma-line"></div>
            <div class="text-center small text-muted mt-1">Firma del cliente</div>
          </div>
          <div class="col-md-6">
            <div class="firma-line"></div>
            <div class="text-center small text-muted mt-1">
              System Ozaet's Electronics
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { api } from '../../services/api'
import { useMongoDB } from '../../composables/useMongoDB'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { find } = useMongoDB()

const clientes = ref([])
const clienteId = ref('')
const desde = ref('')
const hasta = ref('')
const estado = ref(null)
const loading = ref(false)
const contenidoPDF = ref(null)

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

const formatFecha = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-EC')
}

const formatFechaHora = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleString('es-EC')
}

const cargarClientes = async () => {
  try {
    clientes.value = await find('clientes')
  } catch (e) {
    toast.error('Error al cargar clientes: ' + e.message)
  }
}

const cargar = async () => {
  if (!clienteId.value) {
    toast.warning('Seleccione un cliente')
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (desde.value) params.set('desde', desde.value)
    if (hasta.value) params.set('hasta', hasta.value)

    const url = `/estado-cuenta/${clienteId.value}${params.toString() ? '?' + params.toString() : ''}`
    estado.value = await api.request(url, {
      method: 'GET',
      loaderMessage: 'Generando estado de cuenta...'
    })
  } catch (e) {
    toast.error('Error: ' + e.message)
    estado.value = null
  } finally {
    loading.value = false
  }
}

const limpiar = () => {
  clienteId.value = ''
  desde.value = ''
  hasta.value = ''
  estado.value = null
  router.replace('/reportes/estado-cuenta')
}

const exportarPDF = () => {
  if (!estado.value) return

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  // Encabezado
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTADO DE CUENTA', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text("System Ozaet's Electronics", pageWidth / 2, y, { align: 'center' })
  y += 10

  // Datos del cliente
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

  doc.setFont('helvetica', 'bold')
  doc.text('Período:', pageWidth - 80, y - 15)
  doc.setFont('helvetica', 'normal')
  const periodo = `${estado.value.periodo.desde ? formatFecha(estado.value.periodo.desde) : 'Inicio'} - ${estado.value.periodo.hasta ? formatFecha(estado.value.periodo.hasta) : 'Hoy'}`
  doc.text(periodo, pageWidth - 80, y - 10)
  doc.setFont('helvetica', 'bold')
  doc.text('Generado:', pageWidth - 80, y - 5)
  doc.setFont('helvetica', 'normal')
  doc.text(formatFechaHora(estado.value.periodo.generado), pageWidth - 80, y)

  y += 8

  // Tabla de movimientos
  const tableData = estado.value.movimientos.map(m => [
    formatFecha(m.fecha),
    m.numero || '',
    m.descripcion,
    m.debito > 0 ? m.debito.toFixed(2) : '',
    m.credito > 0 ? m.credito.toFixed(2) : '',
    m.saldo.toFixed(2),
    m.dias_vencidos
  ])

  doc.autoTable({
    startY: y,
    head: [['Fecha', 'Documento', 'Descripción', 'Débito', 'Crédito', 'Saldo', 'Días']],
    body: tableData,
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
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 25 },
      2: { cellWidth: 60 },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 14, halign: 'center' }
    },
    margin: { left: 14, right: 14 }
  })

  y = doc.lastAutoTable.finalY + 10

  // Aging
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('EDADES DE CARTERA', 14, y)
  y += 6

  doc.autoTable({
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
  doc.setFont('helvetica', 'normal')
  doc.text('Firma del cliente', 50, y + 5, { align: 'center' })
  doc.text("System Ozaet's Electronics", pageWidth - 50, y + 5, { align: 'center' })

  // Pie de página
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(
      `Documento generado por Sistema Contable - Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    )
  }

  const nombreArchivo = `estado_cuenta_${estado.value.cliente.ruc}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(nombreArchivo)
  toast.success('PDF generado correctamente')
}

const exportarExcel = () => {
  if (!estado.value) return

  const wb = XLSX.utils.book_new()

  // Hoja 1: Movimientos
  const datosMovimientos = estado.value.movimientos.map(m => ({
    Fecha: formatFecha(m.fecha),
    Documento: m.numero || '',
    Descripción: m.descripcion,
    Débito: m.debito || 0,
    Crédito: m.credito || 0,
    Saldo: m.saldo || 0,
    Días: m.dias_vencidos,
    Estado: m.estado_pago || ''
  }))
  const ws1 = XLSX.utils.json_to_sheet(datosMovimientos)

  // Ajustar ancho de columnas
  ws1['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 30 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 12 }
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Movimientos')

  // Hoja 2: Resumen
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

  const nombreArchivo = `estado_cuenta_${estado.value.cliente.ruc}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, nombreArchivo)
  toast.success('Excel generado correctamente')
}

const imprimir = () => {
  window.print()
}

onMounted(async () => {
  await cargarClientes()
  // Si viene un clienteId por query, cargarlo automáticamente
  if (route.query.clienteId) {
    clienteId.value = route.query.clienteId
    await cargar()
  }
})
</script>

<style scoped>
.kpi-box {
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 4px solid #3498db;
  border-radius: 10px;
  transition: var(--transition);
}
.kpi-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--shadow-hover);
}
.kpi-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
}
.kpi-value {
  font-size: 1.3rem;
  font-weight: 700;
  margin-top: 4px;
}

.aging-box {
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-table-stripe);
  border: 2px solid transparent;
  text-align: center;
  transition: var(--transition);
}
.aging-box.aging-active {
  border-color: currentColor;
}
.aging-warning { color: #f39c12; }
.aging-orange { color: #e67e22; }
.aging-danger { color: #e74c3c; }
.aging-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--text-muted);
}
.aging-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 6px;
}

.badge-tipo-doc {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--bg-table-stripe);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}
.tipo-factura { background: rgba(52,152,219,0.15); color: #3498db; }
.tipo-nota_credito { background: rgba(39,174,96,0.15); color: #27ae60; }
.tipo-pago { background: rgba(155,89,182,0.15); color: #8e44ad; }
.tipo-exportacion { background: rgba(243,156,18,0.15); color: #d68910; }

.resumen-box {
  padding: 10px 12px;
  background: var(--bg-table-stripe);
  border-radius: 8px;
  text-align: center;
  transition: var(--transition);
}
.resumen-tipo {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
}
.resumen-cantidad {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}
.resumen-total {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 4px;
}

.firma-line {
  border-bottom: 1px solid var(--text-primary);
  height: 40px;
}

/* Impresión */
@media print {
  .no-print { display: none !important; }
  .section-title { font-size: 18pt; }
  .card-cacao { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
  .table-cacao { font-size: 9pt; }
  body { background: #fff; }
}
</style>