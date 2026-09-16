<template>
  <div class="valorizado-page">
    <!-- HEADER -->
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <span class="title-icon title-icon-green"><i class="fas fa-dollar-sign"></i></span>
          Inventario Valorizado
        </h1>
        <p class="page-subtitle">
          Valor total de tu inventario al costo y a precio de venta
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          @click="exportarCSV"
          :disabled="loading || productos.length === 0"
          aria-label="Exportar a CSV"
        >
          <i class="fas fa-file-csv"></i>
          Exportar
        </button>
        <button
          class="btn-secondary"
          @click="cargar"
          :disabled="loading"
          aria-label="Actualizar"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
          Actualizar
        </button>
      </div>
    </div>

    <!-- TARJETAS TOTALES -->
    <div class="totales-grid">
      <div class="total-card total-card-azul">
        <div class="total-icon"><i class="fas fa-cubes"></i></div>
        <div class="total-content">
          <div class="total-label">Productos totales</div>
          <div class="total-value">{{ productos.length.toLocaleString() }}</div>
          <div class="total-sub">{{ totalUnidades.toLocaleString() }} unidades en stock</div>
        </div>
      </div>

      <div class="total-card total-card-verde">
        <div class="total-icon"><i class="fas fa-shopping-cart"></i></div>
        <div class="total-content">
          <div class="total-label">Valor al costo</div>
          <div class="total-value">{{ formatCurrency(totalValorCompra) }}</div>
          <div class="total-sub">Lo que pagaste por el inventario</div>
        </div>
      </div>

      <div class="total-card total-card-naranja">
        <div class="total-icon"><i class="fas fa-tag"></i></div>
        <div class="total-content">
          <div class="total-label">Valor de venta</div>
          <div class="total-value">{{ formatCurrency(totalValorVenta) }}</div>
          <div class="total-sub">
            Margen potencial:
            <strong :class="margenPositivo ? 'text-success' : 'text-danger'">
              {{ formatCurrency(margenTotal) }}
              ({{ margenPorcentaje }}%)
            </strong>
          </div>
        </div>
      </div>
    </div>

    <!-- TABLA -->
    <div class="card-cacao">
      <div class="card-header">
        <i class="fas fa-list me-2"></i>
        Detalle por producto
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table-modern">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th>Producto</th>
                <th style="width:100px;" class="text-end">Stock</th>
                <th style="width:120px;" class="text-end">P. Compra</th>
                <th style="width:120px;" class="text-end">P. Venta</th>
                <th style="width:140px;" class="text-end">Valor costo</th>
                <th style="width:140px;" class="text-end">Valor venta</th>
                <th style="width:110px;" class="text-end">Margen</th>
              </tr>
            </thead>
            <tbody>
              <!-- Skeleton -->
              <template v-if="loading">
                <tr v-for="i in 6" :key="`sk-${i}`" class="skeleton-row">
                  <td><div class="skeleton-line w-40"></div></td>
                  <td><div class="skeleton-line w-100"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                  <td><div class="skeleton-line w-80 ms-auto"></div></td>
                  <td><div class="skeleton-line w-80 ms-auto"></div></td>
                  <td><div class="skeleton-line w-60 ms-auto"></div></td>
                </tr>
              </template>

              <!-- Empty -->
              <tr v-else-if="productos.length === 0">
                <td colspan="8" class="empty-cell">
                  <div class="empty-state">
                    <i class="fas fa-dollar-sign"></i>
                    <div class="empty-title">No hay productos en inventario</div>
                    <div class="empty-text">
                      Los productos aparecerán aquí cuando los crees
                    </div>
                  </div>
                </td>
              </tr>

              <!-- Datos -->
              <tr v-else v-for="(prod, idx) in productos" :key="prod._id">
                <td class="text-muted small">{{ idx + 1 }}</td>
                <td>
                  <div class="prod-cell">
                    <div class="prod-nombre" :title="prod.nombre">{{ prod.nombre }}</div>
                    <div v-if="prod.codigo" class="prod-codigo">{{ prod.codigo }}</div>
                  </div>
                </td>
                <td class="text-end">
                  <span class="stock-num">{{ formatCantidad(prod.stock) }}</span>
                </td>
                <td class="text-end">
                  <span class="money-num">{{ formatCurrency(prod.precio_compra) }}</span>
                </td>
                <td class="text-end">
                  <span class="money-num">{{ formatCurrency(prod.precio_venta) }}</span>
                </td>
                <td class="text-end">
                  <span class="money-num money-costo">{{ formatCurrency(valorCompra(prod)) }}</span>
                </td>
                <td class="text-end">
                  <span class="money-num money-venta">{{ formatCurrency(valorVenta(prod)) }}</span>
                </td>
                <td class="text-end">
                  <span class="margen-badge" :class="claseMargen(prod)">
                    {{ formatMargen(prod) }}
                  </span>
                </td>
              </tr>
            </tbody>

            <!-- FOOTER TOTALES -->
            <tfoot v-if="!loading && productos.length > 0">
              <tr class="tfoot-totales">
                <td colspan="5" class="text-end">TOTALES</td>
                <td class="text-end">{{ formatCurrency(totalValorCompra) }}</td>
                <td class="text-end">{{ formatCurrency(totalValorVenta) }}</td>
                <td class="text-end">
                  <span class="margen-badge" :class="margenPositivo ? 'margen-ok' : 'margen-danger'">
                    {{ margenPorcentaje }}%
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../../services/api'
import { useToast } from 'vue-toastification'
import { roundTo2, formatCurrency } from '../../utils/formatters'

const toast = useToast()

// ===== STATE =====
const productos = ref([])
const loading = ref(false)
let unmounted = false

// ===== COMPUTED =====
const totalUnidades = computed(() =>
  productos.value.reduce((acc, p) => acc + (Number(p.stock) || 0), 0)
)

const totalValorCompra = computed(() =>
  roundTo2(
    productos.value.reduce(
      (acc, p) => acc + (Number(p.stock) || 0) * (Number(p.precio_compra) || 0),
      0
    )
  )
)

const totalValorVenta = computed(() =>
  roundTo2(
    productos.value.reduce(
      (acc, p) => acc + (Number(p.stock) || 0) * (Number(p.precio_venta) || 0),
      0
    )
  )
)

const margenTotal = computed(() => roundTo2(totalValorVenta.value - totalValorCompra.value))
const margenPositivo = computed(() => margenTotal.value >= 0)
const margenPorcentaje = computed(() => {
  if (totalValorCompra.value === 0) return 0
  return roundTo2((margenTotal.value / totalValorCompra.value) * 100)
})

// ===== HELPERS =====
const valorCompra = (p) =>
  roundTo2((Number(p.stock) || 0) * (Number(p.precio_compra) || 0))

const valorVenta = (p) =>
  roundTo2((Number(p.stock) || 0) * (Number(p.precio_venta) || 0))

const claseMargen = (p) => {
  const costo = valorCompra(p)
  const venta = valorVenta(p)
  if (costo === 0 && venta === 0) return 'margen-neutral'
  const m = venta - costo
  if (m > 0) return 'margen-ok'
  if (m < 0) return 'margen-danger'
  return 'margen-neutral'
}

const formatMargen = (p) => {
  const costo = valorCompra(p)
  if (costo === 0) return '—'
  const m = venta(p) - costo
  const pct = roundTo2((m / costo) * 100)
  return `${pct}%`
}

const formatCantidad = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString('es-EC') : v.toFixed(2)
}

const valorVentaP = valorVenta

// ===== CARGA =====
const cargar = async () => {
  if (unmounted) return
  loading.value = true
  try {
    const res = await api.request('/productos?limit=5000&sortBy=nombre&sortDir=asc', {
      method: 'GET',
      skipLoader: true
    })
    if (unmounted) return

    const data = Array.isArray(res) ? res : (res?.data || [])
    // Solo productos con stock > 0 (evita ruido)
    productos.value = data.filter(p => (Number(p.stock) || 0) !== 0)
  } catch (e) {
    if (!unmounted) toast.error('Error al cargar inventario: ' + e.message)
  } finally {
    if (!unmounted) loading.value = false
  }
}

// ===== EXPORTAR =====
const exportarCSV = () => {
  if (productos.value.length === 0) {
    toast.warning('No hay datos para exportar')
    return
  }

  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'Código',
    'Producto',
    'Stock',
    'P. Compra',
    'P. Venta',
    'Valor Costo',
    'Valor Venta',
    'Margen %'
  ]

  const rows = productos.value.map(p => [
    p.codigo || '',
    p.nombre || '',
    formatCantidad(p.stock),
    formatCurrency(p.precio_compra),
    formatCurrency(p.precio_venta),
    formatCurrency(valorCompra(p)),
    formatCurrency(valorVenta(p)),
    formatMargen(p)
  ])

  // Fila de totales
  rows.push([
    '',
    'TOTALES',
    formatCantidad(totalUnidades.value),
    '',
    '',
    formatCurrency(totalValorCompra.value),
    formatCurrency(totalValorVenta.value),
    `${margenPorcentaje.value}%`
  ])

  const csv = [
    headers.map(escapar).join(','),
    ...rows.map(r => r.map(escapar).join(','))
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inventario_valorizado_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  toast.success(`CSV exportado (${productos.value.length} productos)`)
}

// ===== LIFECYCLE =====
onMounted(cargar)
onBeforeUnmount(() => { unmounted = true })
</script>

<style scoped>
.valorizado-page { display: flex; flex-direction: column; gap: 20px; }

/* HEADER */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}
.page-title {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  letter-spacing: -0.03em;
}
.title-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}
.title-icon-green {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  box-shadow: 0 6px 16px rgba(39,174,96,0.3);
}
.page-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
  padding-left: 54px;
}
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.btn-secondary:hover:not(:disabled) { border-color: #27ae60; color: #27ae60; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

/* TARJETAS TOTALES */
.totales-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.total-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  transition: all var(--transition);
  position: relative;
  overflow: hidden;
}
.total-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 5px;
  height: 100%;
}
.total-card-azul::before { background: linear-gradient(180deg, #3498db, #2980b9); }
.total-card-verde::before { background: linear-gradient(180deg, #27ae60, #1e8449); }
.total-card-naranja::before { background: linear-gradient(180deg, #f39c12, #d68910); }

.total-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }

.total-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
}
.total-card-azul .total-icon { background: rgba(52,152,219,0.15); color: #3498db; }
.total-card-verde .total-icon { background: rgba(39,174,96,0.15); color: #27ae60; }
.total-card-naranja .total-icon { background: rgba(243,156,18,0.15); color: #f39c12; }

.total-content { flex: 1; min-width: 0; }
.total-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
  margin-bottom: 4px;
}
.total-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}
.total-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 4px;
}
.total-sub strong { font-weight: 800; }

/* TABLA */
.table-modern { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-modern thead { background: var(--bg-table-stripe); }
.table-modern th {
  padding: 14px 12px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}
.table-modern td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
.table-modern tbody tr:hover { background: var(--bg-table-stripe); }

.prod-cell { min-width: 0; }
.prod-nombre {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-codigo {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  margin-top: 2px;
}

.stock-num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.money-num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-secondary);
}
.money-costo { color: #2980b9; }
.money-venta { color: #16a085; font-weight: 700; }

.margen-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.margen-ok { background: var(--success-bg); color: var(--success); }
.margen-danger { background: var(--danger-bg); color: var(--danger); }
.margen-neutral { background: var(--bg-table-stripe); color: var(--text-muted); }

.tfoot-totales {
  background: var(--bg-table-stripe);
  font-weight: 800;
  color: var(--text-primary);
  font-size: 0.9rem;
}
.tfoot-totales td {
  padding: 14px 12px;
  border-top: 2px solid var(--border-color);
  border-bottom: none;
}

.text-success { color: var(--success); }
.text-danger { color: var(--danger); }

/* EMPTY */
.empty-cell { padding: 0 !important; }
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state i { font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 12px; }
.empty-title {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 4px;
}
.empty-text { font-size: 0.85rem; }

/* SKELETON */
.skeleton-row td { padding: 16px 12px; }
.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, var(--bg-table-stripe) 25%, var(--border-color) 50%, var(--bg-table-stripe) 75%);
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.w-40 { width: 40%; }
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-80 { width: 80%; }
.skeleton-line.w-100 { width: 100%; }
.ms-auto { margin-left: auto; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (max-width: 768px) {
  .page-subtitle { padding-left: 0; }
  .total-value { font-size: 1.3rem; }
}
</style>