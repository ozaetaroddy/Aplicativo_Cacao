<template>

  <div class="row g-4 mt-2">
    <div class="col-12">
      <div class="card card-cacao">
        <div class="card-header">
          <i class="fas fa-file-export me-2"></i> Exportar / Importar Datos
        </div>
        <div class="card-body">
          <ExportImport />
        </div>
      </div>
    </div>
  </div>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Panel de Control</h4>

    <!-- Estado de carga -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Cargando...</span>
      </div>
      <p class="mt-2 text-muted">Cargando datos del dashboard...</p>
    </div>

    <!-- ===== TARJETAS DE ESTADÍSTICAS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #3498db;">
          <div class="stat-icon-wrapper" style="background: rgba(52,152,219,0.12);">
            <i class="fas fa-file-invoice" style="color:#3498db;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ ventasHoy.toFixed(2) }}</span>
            <span class="stat-label">Ventas Hoy</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #2ecc71;">
          <div class="stat-icon-wrapper" style="background: rgba(46,204,113,0.12);">
            <i class="fas fa-shopping-cart" style="color:#2ecc71;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ comprasHoy.toFixed(2) }}</span>
            <span class="stat-label">Compras Hoy</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #f39c12;">
          <div class="stat-icon-wrapper" style="background: rgba(243,156,18,0.12);">
            <i class="fas fa-calendar-alt" style="color:#f39c12;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ ventasMes.toFixed(2) }}</span>
            <span class="stat-label">Ventas del Mes</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #9b59b6;">
          <div class="stat-icon-wrapper" style="background: rgba(155,89,182,0.12);">
            <i class="fas fa-calendar-check" style="color:#9b59b6;"></i>
          </div>
          <div class="stat-info">
            <span class="stat-number">${{ comprasMes.toFixed(2) }}</span>
            <span class="stat-label">Compras del Mes</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== ACCESOS RÁPIDOS ===== -->
    <div class="row g-3 mb-4">
      <div class="col-12">
        <h5 class="section-subtitle"><i class="fas fa-bolt me-2"></i>Accesos Rápidos</h5>
      </div>
      <!-- ... (los mismos accesos rápidos, no los repito por brevedad) ... -->
    </div>

    <!-- ===== GRÁFICOS ===== -->
    <DashboardCharts
      :ventas-diarias="ventasDiarias"
      :compras-diarias="comprasDiarias"
      :dias="dias"
    />

    <!-- ===== TOP PRODUCTOS + ACTIVIDAD RECIENTE ===== -->
    <div class="row g-4 mt-2">
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header">
            <i class="fas fa-star me-2" style="color:#f1c40f;"></i>
            Top 5 Productos Más Vendidos
          </div>
          <div class="card-body table-responsive">
            <table class="table table-cacao">
              <thead>
                <tr>
                  <th style="width:50px;">#</th>
                  <th>Producto</th>
                  <th style="width:100px; text-align:right;">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in topProductos" :key="idx">
                  <td>
                    <span class="badge" :class="[
                      idx === 0 ? 'bg-warning' : 
                      idx === 1 ? 'bg-secondary' : 
                      idx === 2 ? 'bg-danger' : 'bg-primary'
                    ]" style="border-radius:50%; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; font-weight:700;">
                      {{ idx + 1 }}
                    </span>
                  </td>
                  <td>{{ obtenerNombreProducto(item[0]) }}</td>
                  <td class="text-end fw-bold">{{ item[1] }}</td>
                </tr>
                <tr v-if="topProductos.length === 0">
                  <td colspan="3" class="text-muted text-center">Sin datos de ventas</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header">
            <i class="fas fa-clock me-2" style="color:#3498db;"></i>
            Actividad Reciente
          </div>
          <div class="card-body p-0" style="max-height: 280px; overflow-y: auto;">
            <div v-if="actividades.length === 0" class="text-muted text-center py-4">
              <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
              No hay actividad reciente
            </div>
            <div v-for="(act, idx) in actividades" :key="idx" class="actividad-item">
              <div class="actividad-icon" :style="{ background: act.color }">
                <i :class="act.icono"></i>
              </div>
              <div class="actividad-info">
                <div class="actividad-descripcion">{{ act.descripcion }}</div>
                <div class="actividad-fecha"><i class="far fa-clock me-1"></i>{{ act.fecha }}</div>
              </div>
              <div class="actividad-monto" v-if="act.monto">
                ${{ act.monto.toFixed(2) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { useEstadisticas } from '../composables/useEstadisticas'
import DashboardCharts from './dashboard/DashboardCharts.vue'
import ExportImport from '../components/ExportImport.vue'

const { find } = useMongoDB()
const {
  ventasHoy,
  ventasMes,
  comprasHoy,
  comprasMes,
  ventasDiarias,
  comprasDiarias,
  dias,
  topProductos,
  cargarEstadisticas
} = useEstadisticas()

const productos = ref([])
const actividades = ref([])

const obtenerNombreProducto = (id) => {
  if (!id) return 'Producto eliminado'
  const prod = productos.value.find(p => p._id === id)
  return prod ? prod.nombre : 'Producto eliminado'
}

const cargarActividadReciente = async () => {
  try {
    const [ventas, compras] = await Promise.all([
      find('ventas'),
      find('compras')
    ])
    const items = [
      ...ventas.map(v => ({
        ...v,
        tipo: 'venta',
        fechaObj: new Date(v.fecha_emision),
        descripcion: `Factura ${v.numero_factura || 'N/A'} - ${v.cliente?.nombre || 'Sin cliente'}`,
        icono: 'fa-file-invoice',
        color: '#3498db',
        monto: v.total || 0
      })),
      ...compras.map(c => ({
        ...c,
        tipo: 'compra',
        fechaObj: new Date(c.fecha_emision),
        descripcion: `Compra ${c.numero_factura || 'N/A'} - ${c.proveedor?.nombre || 'Sin proveedor'}`,
        icono: 'fa-shopping-cart',
        color: '#27ae60',
        monto: c.total || 0
      }))
    ]
    items.sort((a, b) => b.fechaObj - a.fechaObj)
    actividades.value = items.slice(0, 10).map(item => ({
      descripcion: item.descripcion,
      fecha: item.fechaObj.toLocaleDateString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
      icono: item.icono,
      color: item.color,
      monto: item.monto
    }))
  } catch (e) {
    console.error('Error cargando actividad reciente:', e)
  }
}

const loading = ref(true)

onMounted(async () => {
  try {
    await Promise.all([
      cargarEstadisticas(),
      cargarActividadReciente(),
      find('productos').then(res => productos.value = res)
    ])
  } catch (e) { console.error(e) }
  finally { loading.value = false }
})

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) { console.error(e) }
  await cargarEstadisticas()
  await cargarActividadReciente()
})
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: all 0.3s ease;
  height: 90px;
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.10);
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
.stat-icon-wrapper i {
  font-size: 1.6rem;
}
.stat-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.stat-number {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1a2a3a;
  line-height: 1.2;
}
.stat-label {
  font-size: 0.75rem;
  color: #7f8c8d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.section-subtitle {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 12px;
  border-bottom: 2px solid #ecf0f1;
  padding-bottom: 6px;
}
.section-subtitle i {
  color: #3498db;
}

.actividad-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s ease;
}
.actividad-item:hover {
  background: #f8f9fa;
}
.actividad-item:last-child {
  border-bottom: none;
}
.actividad-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1rem;
  flex-shrink: 0;
}
.actividad-info {
  flex: 1;
  min-width: 0;
}
.actividad-descripcion {
  font-size: 0.9rem;
  font-weight: 500;
  color: #2d2d2d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actividad-fecha {
  font-size: 0.7rem;
  color: #7f8c8d;
}
.actividad-monto {
  font-weight: 700;
  color: #1a2a3a;
  font-size: 0.9rem;
  white-space: nowrap;
}

/* Dark mode para el dashboard */
body.dark-mode .stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}
body.dark-mode .stat-number {
  color: #e0e0e0;
}
body.dark-mode .stat-label {
  color: #a0aec0;
}
body.dark-mode .actividad-item {
  border-bottom-color: var(--border-color);
}
body.dark-mode .actividad-item:hover {
  background: rgba(255,255,255,0.03);
}
body.dark-mode .actividad-descripcion {
  color: #e0e0e0;
}
body.dark-mode .actividad-monto {
  color: #e0e0e0;
}
body.dark-mode .section-subtitle {
  border-bottom-color: var(--border-color);
  color: #e0e0e0;
}
</style>