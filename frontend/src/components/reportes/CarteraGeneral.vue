<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h4 class="section-title"><i class="fas fa-chart-pie"></i> Cartera General</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" @click="cargar" :disabled="loading">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i> Actualizar
        </button>
        <button class="btn btn-danger" @click="exportarPDF" :disabled="!data">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="btn btn-success" @click="exportarExcel" :disabled="!data">
          <i class="fas fa-file-excel"></i> Excel
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div v-if="data" class="row g-3 mb-4">
      <div class="col-md-6">
        <div class="stat-card" style="border-left: 4px solid #e74c3c;">
          <div class="stat-icon-wrapper" style="background: rgba(231,76,60,0.12);">
            <i class="fas fa-hand-holding-usd" style="color:#e74c3c;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">{{ formatCurrency(data.totalCartera) }}</span>
            <span class="stat-label">Total en Cartera</span>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="stat-card" style="border-left: 4px solid #f39c12;">
          <div class="stat-icon-wrapper" style="background: rgba(243,156,18,0.12);">
            <i class="fas fa-users" style="color:#f39c12;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">{{ data.clientesConDeuda }}</span>
            <span class="stat-label">Clientes con deuda</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabla -->
    <div class="card card-cacao">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-cacao">
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Cliente</th>
                <th style="width:150px;">RUC/Cédula</th>
                <th style="width:100px;">Teléfono</th>
                <th style="width:90px;" class="text-center">Facturas</th>
                <th style="width:130px;" class="text-end">Débitos</th>
                <th style="width:130px;" class="text-end">Créditos</th>
                <th style="width:130px;" class="text-end">Saldo</th>
                <th style="width:120px;">Última factura</th>
                <th style="width:100px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="10" class="text-center py-4">
                  <i class="fas fa-spinner fa-spin"></i> Cargando...
                </td>
              </tr>
              <tr v-else-if="!data || data.clientes.length === 0">
                <td colspan="10" class="text-center text-muted py-4">
                  No hay clientes con saldo pendiente
                </td>
              </tr>
              <tr v-else v-for="(c, idx) in data.clientes" :key="c.clienteId">
                <td>{{ idx + 1 }}</td>
                <td>
                  <div class="fw-bold">{{ c.clienteNombre || 'N/A' }}</div>
                </td>
                <td class="small">{{ c.clienteRuc || 'N/A' }}</td>
                <td class="small">{{ c.clienteTelefono || '—' }}</td>
                <td class="text-center">{{ c.cantidadFacturas }}</td>
                <td class="text-end small">{{ formatCurrency(c.totalDebitos) }}</td>
                <td class="text-end small" style="color: #27ae60;">{{ formatCurrency(c.totalCreditos) }}</td>
                <td class="text-end fw-bold" :style="{ color: c.saldo > 0 ? '#e74c3c' : '#27ae60' }">
                  {{ formatCurrency(c.saldo) }}
                </td>
                <td class="small">{{ c.ultimaFactura ? formatFecha(c.ultimaFactura) : '—' }}</td>
                <td class="text-center">
                  <router-link
                    :to="`/reportes/estado-cuenta?clienteId=${c.clienteId}`"
                    class="btn btn-sm btn-outline-primary"
                    title="Ver estado de cuenta"
                  >
                    <i class="fas fa-file-invoice-dollar"></i>
                  </router-link>
                </td>
              </tr>
            </tbody>
            <tfoot v-if="data && data.clientes.length > 0">
              <tr class="table-light fw-bold">
                <td colspan="5" class="text-end">TOTALES</td>
                <td class="text-end">{{ formatCurrency(totalDebitos) }}</td>
                <td class="text-end" style="color: #27ae60;">{{ formatCurrency(totalCreditos) }}</td>
                <td class="text-end">{{ formatCurrency(data.totalCartera) }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { api } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from 'vue-toastification'

const toast = useToast()
const data = ref(null)
const loading = ref(false)

const totalDebitos = computed(() =>
  (data.value?.clientes || []).reduce((sum, c) => sum + (c.totalDebitos || 0), 0)
)
const totalCreditos = computed(() =>
  (data.value?.clientes || []).reduce((sum, c) => sum + (c.totalCreditos || 0), 0)
)

const formatFecha = (fecha) => {
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-EC')
}

const cargar = async () => {
  loading.value = true
  try {
    data.value = await api.request('/estado-cuenta', {
      method: 'GET',
      loaderMessage: 'Calculando cartera...'
    })
  } catch (e) {
    toast.error('Error: ' + e.message)
  } finally {
    loading.value = false
  }
}

const exportarPDF = () => {
  if (!data.value) return

  const doc = new jsPDF('l', 'mm', 'a4') // landscape
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('CARTERA GENERAL POR CLIENTE', pageWidth / 2, 15, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, pageWidth / 2, 22, { align: 'center' })

  doc.autoTable({
    startY: 28,
    head: [['#', 'Cliente', 'RUC/Cédula', 'Teléfono', 'Facturas', 'Débitos', 'Créditos', 'Saldo', 'Última factura']],
    body: data.value.clientes.map((c, i) => [
      i + 1,
      c.clienteNombre || 'N/A',
      c.clienteRuc || 'N/A',
      c.clienteTelefono || '-',
      c.cantidadFacturas,
      (c.totalDebitos || 0).toFixed(2),
      (c.totalCreditos || 0).toFixed(2),
      (c.saldo || 0).toFixed(2),
      c.ultimaFactura ? formatFecha(c.ultimaFactura) : '-'
    ]),
    foot: [[
      '', '', '', 'TOTALES', '',
      totalDebitos.value.toFixed(2),
      totalCreditos.value.toFixed(2),
      data.value.totalCartera.toFixed(2),
      ''
    ]],
    theme: 'striped',
    headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8 },
    margin: { left: 10, right: 10 }
  })

  doc.save(`cartera_general_${new Date().toISOString().slice(0, 10)}.pdf`)
  toast.success('PDF generado correctamente')
}

const exportarExcel = () => {
  if (!data.value) return

  const datos = data.value.clientes.map((c, i) => ({
    '#': i + 1,
    Cliente: c.clienteNombre || 'N/A',
    'RUC/Cédula': c.clienteRuc || 'N/A',
    Teléfono: c.clienteTelefono || '',
    Facturas: c.cantidadFacturas,
    Débitos: c.totalDebitos,
    Créditos: c.totalCreditos,
    Saldo: c.saldo,
    'Última factura': c.ultimaFactura ? formatFecha(c.ultimaFactura) : ''
  }))

  const ws = XLSX.utils.json_to_sheet(datos)
  ws['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cartera')
  XLSX.writeFile(wb, `cartera_general_${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Excel generado correctamente')
}

onMounted(cargar)
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
.stat-icon-wrapper i { font-size: 1.6rem; }
.stat-info { display: flex; flex-direction: column; flex: 1; }
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
</style>