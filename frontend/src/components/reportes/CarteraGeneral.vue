<template>
  <div class="cartera-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-red"><i class="fas fa-chart-pie"></i></span>
          Cartera General
        </h1>
        <p class="page-subtitle">
          Saldo pendiente por cliente y antigüedad de deuda consolidada
        </p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="exportarCSV" :disabled="!data || loading" aria-label="Exportar CSV">
          <i class="fas fa-file-csv"></i> CSV
        </button>
        <button class="btn-secondary" @click="exportarExcel" :disabled="!data || loading" aria-label="Exportar Excel">
          <i class="fas fa-file-excel"></i> Excel
        </button>
        <button class="btn-danger" @click="exportarPDF" :disabled="!data || loading" aria-label="Exportar PDF">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="btn-primary" @click="cargar" :disabled="loading" aria-label="Actualizar">
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
      </div>
    </div>

    <!-- STATS -->
    <div v-if="data && !loading" class="stats-grid">
      <div class="stat-card stat-card-danger">
        <div class="stat-icon rojo"><i class="fas fa-hand-holding-usd"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ formatCurrency(data.totalCartera) }}</div>
          <div class="stat-label">Total en cartera</div>
        </div>
      </div>
      <div class="stat-card stat-card-warning">
        <div class="stat-icon naranja"><i class="fas fa-users"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ data.clientesConDeuda || 0 }}</div>
          <div class="stat-label">Clientes con deuda</div>
        </div>
      </div>
      <div class="stat-card stat-card-info">
        <div class="stat-icon azul"><i class="fas fa-file-invoice"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ totalFacturas.toLocaleString() }}</div>
          <div class="stat-label">Facturas pendientes</div>
        </div>
      </div>
      <div class="stat-card stat-card-purple">
        <div class="stat-icon morado"><i class="fas fa-chart-line"></i></div>
        <div class="stat-info">
          <div class="stat-value">{{ formatCurrency(promedioPorCliente) }}</div>
          <div class="stat-label">Promedio por cliente</div>
        </div>
      </div>
    </div>

    <!-- SEARCH -->
    <div v-if="data && !loading && data.clientes?.length > 0" class="search-bar">
      <div class="search-wrapper">
        <i class="fas fa-search search-icon"></i>
        <input
          type="text"
          class="search-input"
          v-model="search"
          placeholder="Buscar cliente por nombre, RUC o teléfono..."
          aria-label="Buscar cliente en cartera"
        />
        <button v-if="search" type="button" class="search-clear" @click="search = ''" aria-label="Limpiar">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="search-info">
        <span v-if="search">{{ clientesFiltrados.length }} resultado(s) para "{{ search }}"</span>
        <span v-else>{{ data.clientes.length }} cliente(s) con saldo</span>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header card-header-flex">
        <div>
          <i class="fas fa-list me-2"></i>
          Detalle por cliente
          <span v-if="!loading && data" class="header-count">{{ clientesFiltrados.length }}</span>
        </div>
        <span v-if="data?._meta?.truncado" class="header-warning">
          <i class="fas fa-exclamation-triangle"></i> Truncado a {{ data._meta.maxClientes }}
        </span>
      </div>
      <div class="card-body p-0">
        <!-- Loading -->
        <div v-if="loading" class="loading-block">
          <div class="spinner-lg"></div>
          <p>Calculando cartera...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="!data || data.clientes?.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-check-circle"></i></div>
          <div class="empty-title">Sin clientes con deuda</div>
          <div class="empty-text">
            Todos tus clientes tienen su cartera al día. ¡Excelente!
          </div>
        </div>

        <!-- Sin resultados de búsqueda -->
        <div v-else-if="clientesFiltrados.length === 0" class="empty-block">
          <div class="empty-icon"><i class="fas fa-search"></i></div>
          <div class="empty-title">Sin resultados</div>
          <div class="empty-text">No hay clientes que coincidan con "{{ search }}"</div>
          <button class="empty-action" @click="search = ''">
            <i class="fas fa-times"></i> Limpiar búsqueda
          </button>
        </div>

        <!-- Tabla -->
        <div v-else class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Cliente</th>
                <th style="width:150px;">RUC/Cédula</th>
                <th style="width:120px;">Teléfono</th>
                <th style="width:80px;" class="text-center">Facturas</th>
                <th style="width:120px;" class="text-end">Débitos</th>
                <th style="width:120px;" class="text-end">Créditos</th>
                <th style="width:130px;" class="text-end">Saldo</th>
                <th style="width:120px;">Última factura</th>
                <th style="width:90px;" class="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, idx) in clientesFiltrados" :key="c.clienteId">
                <td class="text-muted small">{{ idx + 1 }}</td>
                <td>
                  <div class="cliente-cell">
                    <div class="cliente-avatar">{{ inicial(c.clienteNombre) }}</div>
                    <div class="cliente-nombre" :title="c.clienteNombre">
                      {{ c.clienteNombre || 'N/A' }}
                    </div>
                  </div>
                </td>
                <td><code class="ruc-badge">{{ c.clienteRuc || '—' }}</code></td>
                <td class="small">{{ c.clienteTelefono || '—' }}</td>
                <td class="text-center">{{ c.cantidadFacturas || 0 }}</td>
                <td class="text-end money-num">{{ formatCurrency(c.totalDebitos) }}</td>
                <td class="text-end money-num money-green">{{ formatCurrency(c.totalCreditos) }}</td>
                <td class="text-end">
                  <span class="saldo-badge" :class="c.saldo > 0 ? 'saldo-danger' : 'saldo-ok'">
                    {{ formatCurrency(c.saldo) }}
                  </span>
                </td>
                <td>
                  <div class="fecha-cell">
                    <div class="fecha-main">{{ c.ultimaFactura ? formatFecha(c.ultimaFactura) : '—' }}</div>
                    <div v-if="c.diasUltimaFactura !== null && c.diasUltimaFactura !== undefined" class="fecha-sub">
                      hace {{ c.diasUltimaFactura }}d
                    </div>
                  </div>
                </td>
                <td class="text-center">
                  <router-link
                    :to="`/reportes/estado-cuenta?clienteId=${c.clienteId}`"
                    class="btn-icon-ver"
                    title="Ver estado de cuenta"
                    :aria-label="`Ver estado de cuenta de ${c.clienteNombre}`"
                  >
                    <i class="fas fa-file-invoice-dollar"></i>
                  </router-link>
                </td>
              </tr>
            </tbody>
            <tfoot v-if="clientesFiltrados.length > 0">
              <tr class="tfoot-totales">
                <td colspan="5" class="text-end">TOTALES</td>
                <td class="text-end">{{ formatCurrency(totalDebitos) }}</td>
                <td class="text-end money-green">{{ formatCurrency(totalCreditos) }}</td>
                <td class="text-end">{{ formatCurrency(data.totalCartera) }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- META -->
    <div v-if="data?._meta?.tiempoMs" class="meta-info">
      <i class="far fa-clock"></i>
      Calculado en {{ data._meta.tiempoMs }}ms
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { formatCurrency, roundTo2 } from '../../utils/formatters'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const toast = useToast()

// ===== STATE =====
const data = ref(null)
const loading = ref(false)
const search = ref('')

let unmounted = false

// ===== COMPUTED =====
const clientesFiltrados = computed(() => {
  const lista = data.value?.clientes || []
  const q = String(search.value || '').trim().toLowerCase()
  if (!q) return lista
  return lista.filter(c => {
    const n = String(c.clienteNombre || '').toLowerCase()
    const r = String(c.clienteRuc || '').toLowerCase()
    const t = String(c.clienteTelefono || '').toLowerCase()
    return n.includes(q) || r.includes(q) || t.includes(q)
  })
})

const totalFacturas = computed(
  () => (data.value?.clientes || []).reduce((s, c) => s + (c.cantidadFacturas || 0), 0)
)

const totalDebitos = computed(
  () => (data.value?.clientes || []).reduce((s, c) => s + (Number(c.totalDebitos) || 0), 0)
)

const totalCreditos = computed(
  () => (data.value?.clientes || []).reduce((s, c) => s + (Number(c.totalCreditos) || 0), 0)
)

const promedioPorCliente = computed(() => {
  const n = data.value?.clientes?.length || 0
  if (n === 0) return 0
  return roundTo2((data.value.totalCartera || 0) / n)
})

// ===== HELPERS =====
const inicial = (nombre) => {
  const s = String(nombre || '').trim()
  return s ? s[0].toUpperCase() : '?'
}

const formatFecha = (f) => {
  if (!f) return '—'
  try {
    return new Date(f).toLocaleDateString('es-EC', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  } catch { return '—' }
}

// ===== CARGA =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/estado-cuenta', {
      method: 'GET',
      loaderMessage: 'Calculando cartera...'
    })
    if (unmounted) return
    data.value = res
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar cartera: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== EXPORTAR CSV =====
const exportarCSV = () => {
  if (!data.value?.clientes?.length) {
    toast.warning('No hay datos para exportar')
    return
  }

  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = ['#', 'Cliente', 'RUC', 'Teléfono', 'Facturas', 'Débitos', 'Créditos', 'Saldo', 'Última factura']

  const rows = clientesFiltrados.value.map((c, i) => [
    i + 1,
    c.clienteNombre || '',
    c.clienteRuc || '',
    c.clienteTelefono || '',
    c.cantidadFacturas || 0,
    (c.totalDebitos || 0).toFixed(2),
    (c.totalCreditos || 0).toFixed(2),
    (c.saldo || 0).toFixed(2),
    c.ultimaFactura ? formatFecha(c.ultimaFactura) : ''
  ])

  rows.push([
    '', 'TOTALES', '', '', '', totalDebitos.value.toFixed(2),
    totalCreditos.value.toFixed(2), (data.value.totalCartera || 0).toFixed(2), ''
  ])

  const csv = [
    headers.map(escapar).join(','),
    ...rows.map(r => r.map(escapar).join(','))
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cartera_general_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success(`CSV generado (${clientesFiltrados.value.length} clientes)`)
}

// ===== EXPORTAR EXCEL =====
const exportarExcel = () => {
  if (!data.value?.clientes?.length) {
    toast.warning('No hay datos para exportar')
    return
  }

  const rows = clientesFiltrados.value.map((c, i) => ({
    '#': i + 1,
    Cliente: c.clienteNombre || 'N/A',
    'RUC/Cédula': c.clienteRuc || '',
    'Teléfono': c.clienteTelefono || '',
    'Facturas': c.cantidadFacturas || 0,
    'Débitos': roundTo2(c.totalDebitos || 0),
    'Créditos': roundTo2(c.totalCreditos || 0),
    'Saldo': roundTo2(c.saldo || 0),
    'Última factura': c.ultimaFactura ? formatFecha(c.ultimaFactura) : ''
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cartera')
  XLSX.writeFile(wb, `cartera_general_${new Date().toISOString().slice(0, 10)}.xlsx`)
  toast.success('Excel generado correctamente')
}

// ===== EXPORTAR PDF =====
const exportarPDF = () => {
  if (!data.value?.clientes?.length) {
    toast.warning('No hay datos para exportar')
    return
  }

  const doc = new jsPDF('l', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('CARTERA GENERAL POR CLIENTE', pageWidth / 2, 15, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, pageWidth / 2, 22, { align: 'center' })

  autoTable(doc, {
    startY: 28,
    head: [['#', 'Cliente', 'RUC/Cédula', 'Teléfono', 'Facturas', 'Débitos', 'Créditos', 'Saldo', 'Última factura']],
    body: clientesFiltrados.value.map((c, i) => [
      i + 1,
      (c.clienteNombre || 'N/A').slice(0, 35),
      c.clienteRuc || '—',
      c.clienteTelefono || '—',
      c.cantidadFacturas || 0,
      (c.totalDebitos || 0).toFixed(2),
      (c.totalCreditos || 0).toFixed(2),
      (c.saldo || 0).toFixed(2),
      c.ultimaFactura ? formatFecha(c.ultimaFactura) : '—'
    ]),
    foot: [[
      '', '', '', 'TOTALES', '',
      totalDebitos.value.toFixed(2),
      totalCreditos.value.toFixed(2),
      (data.value.totalCartera || 0).toFixed(2),
      ''
    ]],
    theme: 'striped',
    headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7 },
    margin: { left: 10, right: 10 }
  })

  doc.save(`cartera_general_${new Date().toISOString().slice(0, 10)}.pdf`)
  toast.success('PDF generado correctamente')
}

// ===== LIFECYCLE =====
onMounted(cargar)
onBeforeUnmount(() => { unmounted = true })
</script>

<style scoped>
.cartera-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
.page-title { font-size: clamp(1.35rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 12px; margin-bottom: 4px; letter-spacing: -0.03em; }
.title-icon { width: 42px; height: 42px; border-radius: 12px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.title-icon-red { background: linear-gradient(135deg, #e74c3c, #c0392b); box-shadow: 0 6px 16px rgba(231,76,60,0.3); }
.page-subtitle { color: var(--text-muted); font-size: 0.85rem; margin: 0; padding-left: 54px; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-primary, .btn-secondary, .btn-danger {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: var(--radius-md);
  font-weight: 600; font-size: 0.85rem; cursor: pointer;
  transition: all var(--transition); font-family: inherit; border: none;
}
.btn-primary { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { border-color: #e74c3c; color: #e74c3c; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger { background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; box-shadow: 0 4px 12px rgba(231,76,60,0.3); }
.btn-danger:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(231,76,60,0.4); }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); border-left: 4px solid transparent; transition: all var(--transition); }
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card-danger { border-left-color: #e74c3c; background: rgba(231,76,60,0.03); }
.stat-card-warning { border-left-color: #f39c12; }
.stat-card-info { border-left-color: #3498db; }
.stat-card-purple { border-left-color: #8e44ad; }

.stat-icon { width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }
.stat-icon.rojo { background: rgba(231,76,60,0.12); color: #e74c3c; }
.stat-icon.naranja { background: rgba(243,156,18,0.12); color: #f39c12; }
.stat-icon.azul { background: rgba(52,152,219,0.12); color: #3498db; }
.stat-icon.morado { background: rgba(142,68,173,0.12); color: #8e44ad; }
.stat-info { flex: 1; min-width: 0; }
.stat-value { font-size: 1.45rem; font-weight: 800; color: var(--text-primary); line-height: 1.15; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; margin-top: 4px; }

/* SEARCH */
.search-bar { display: flex; flex-direction: column; gap: 8px; }
.search-wrapper { position: relative; display: flex; align-items: center; }
.search-icon { position: absolute; left: 16px; color: var(--text-muted); font-size: 0.9rem; pointer-events: none; }
.search-input { width: 100%; padding: 12px 42px 12px 44px; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary); font-size: 0.9rem; font-family: inherit; outline: none; transition: all var(--transition-fast); }
.search-input:focus { border-color: #e74c3c; box-shadow: 0 0 0 4px rgba(231,76,60,0.12); background: var(--bg-card); }
.search-clear { position: absolute; right: 10px; width: 28px; height: 28px; border-radius: 50%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.search-clear:hover { color: var(--danger); background: var(--bg-table-stripe); }
.search-info { font-size: 0.75rem; color: var(--text-muted); padding-left: 4px; }

/* TABLA */
.card-header-flex { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-count { margin-left: 6px; padding: 2px 10px; background: rgba(231,76,60,0.15); color: #c0392b; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 800; }
.header-warning { font-size: 0.72rem; color: #d68910; display: inline-flex; align-items: center; gap: 4px; }

.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th { padding: 14px 12px; text-align: left; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border-color); white-space: nowrap; }
.table-modern td { padding: 12px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.cliente-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cliente-avatar { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(231,76,60,0.25); }
.cliente-nombre { font-weight: 700; color: var(--text-primary); font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }

.ruc-badge { background: var(--bg-table-stripe); padding: 3px 10px; border-radius: 6px; font-family: var(--font-mono, monospace); font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.money-num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text-secondary); font-size: 0.82rem; }
.money-green { color: #27ae60; }

.saldo-badge { display: inline-block; padding: 4px 12px; border-radius: var(--radius-full); font-weight: 800; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.saldo-danger { background: rgba(231,76,60,0.15); color: #c0392b; }
.saldo-ok { background: var(--success-bg); color: var(--success); }

.fecha-cell .fecha-main { font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; }
.fecha-cell .fecha-sub { font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; }

.btn-icon-ver { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 0.82rem; transition: all var(--transition-fast); text-decoration: none; }
.btn-icon-ver:hover { border-color: #3498db; color: #3498db; background: rgba(52,152,219,0.08); }

.tfoot-totales { background: var(--bg-table-stripe); font-weight: 800; color: var(--text-primary); }
.tfoot-totales td { padding: 14px 12px; border-top: 2px solid var(--border-color); }

/* LOADING/EMPTY */
.loading-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
.spinner-lg { width: 44px; height: 44px; border: 4px solid var(--border-color); border-top-color: #e74c3c; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-block { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--bg-table-stripe); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 1.8rem; margin: 0 auto 14px; }
.empty-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; }
.empty-text { font-size: 0.85rem; margin-bottom: 16px; }
.empty-action { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(231,76,60,0.1); border: 1px solid rgba(231,76,60,0.3); border-radius: var(--radius-md); color: #c0392b; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.empty-action:hover { background: #e74c3c; color: #fff; border-color: #e74c3c; }
.meta-info { font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 4px; }

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .cliente-nombre { max-width: 140px; }
}
</style>