<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Panel de Control</h4>

    <!-- ===== TARJETAS DE ESTADÍSTICAS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #3498db;">
          <div class="stat-icon"><i class="fas fa-file-invoice" style="color:#3498db;"></i></div>
          <div class="stat-info">
            <span class="stat-number">${{ ventasHoy.toFixed(2) }}</span>
            <span class="stat-label">Ventas Hoy</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #2ecc71;">
          <div class="stat-icon"><i class="fas fa-shopping-cart" style="color:#2ecc71;"></i></div>
          <div class="stat-info">
            <span class="stat-number">${{ comprasHoy.toFixed(2) }}</span>
            <span class="stat-label">Compras Hoy</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #f39c12;">
          <div class="stat-icon"><i class="fas fa-calendar-alt" style="color:#f39c12;"></i></div>
          <div class="stat-info">
            <span class="stat-number">${{ ventasMes.toFixed(2) }}</span>
            <span class="stat-label">Ventas del Mes</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #9b59b6;">
          <div class="stat-icon"><i class="fas fa-calendar-check" style="color:#9b59b6;"></i></div>
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
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=factura" class="quick-access">
          <div class="icon-circle" style="background: #3498db;"><i class="fas fa-file-invoice"></i></div>
          <span>Factura</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=guia_remision" class="quick-access">
          <div class="icon-circle" style="background: #2ecc71;"><i class="fas fa-truck"></i></div>
          <span>Guía Remisión</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=nota_credito" class="quick-access">
          <div class="icon-circle" style="background: #e67e22;"><i class="fas fa-undo-alt"></i></div>
          <span>Nota Crédito</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/compras/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #27ae60;"><i class="fas fa-shopping-cart"></i></div>
          <span>Compra</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/clientes/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #8e44ad;"><i class="fas fa-user-plus"></i></div>
          <span>Cliente</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/proveedores/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #2c3e50;"><i class="fas fa-truck-loading"></i></div>
          <span>Proveedor</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/productos/nuevo" class="quick-access">
          <div class="icon-circle" style="background: #f1c40f;"><i class="fas fa-box"></i></div>
          <span>Producto</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/consultar-documentos" class="quick-access">
          <div class="icon-circle" style="background: #2980b9;"><i class="fas fa-search"></i></div>
          <span>Consultar Docs</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/kardex" class="quick-access">
          <div class="icon-circle" style="background: #1abc9c;"><i class="fas fa-clipboard-list"></i></div>
          <span>Kardex</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/stock" class="quick-access">
          <div class="icon-circle" style="background: #16a085;"><i class="fas fa-boxes"></i></div>
          <span>Stock Actual</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/reportes/ventas" class="quick-access">
          <div class="icon-circle" style="background: #e74c3c;"><i class="fas fa-chart-line"></i></div>
          <span>Reporte Ventas</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/reportes/compras" class="quick-access">
          <div class="icon-circle" style="background: #d35400;"><i class="fas fa-chart-bar"></i></div>
          <span>Reporte Compras</span>
        </router-link>
      </div>
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
          <div class="card-header"><i class="fas fa-star me-2" style="color:#f1c40f;"></i> Top 5 Productos Más Vendidos</div>
          <div class="card-body table-responsive">
            <table class="table table-cacao">
              <thead>
                <tr><th>#</th><th>Producto</th><th>Cantidad</th></tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in topProductos" :key="idx">
                  <td>{{ idx + 1 }}</td>
                  <td>{{ obtenerNombreProducto(item[0]) }}</td>
                  <td>{{ item[1] }}</td>
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
          <div class="card-header"><i class="fas fa-clock me-2"></i> Actividad Reciente</div>
          <div class="card-body" style="max-height: 250px; overflow-y: auto;">
            <div v-if="actividades.length === 0" class="text-muted text-center py-3">
              No hay actividad reciente
            </div>
            <div v-for="(act, idx) in actividades" :key="idx" class="actividad-item">
              <div class="actividad-icon" :style="{ background: act.color }">
                <i :class="act.icono"></i>
              </div>
              <div class="actividad-info">
                <div class="actividad-descripcion">{{ act.descripcion }}</div>
                <div class="actividad-fecha">{{ act.fecha }}</div>
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
import { ref, onMounted, computed } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { useEstadisticas } from '../composables/useEstadisticas'
import DashboardCharts from './dashboard/DashboardCharts.vue'

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
  loading,
  cargarEstadisticas
} = useEstadisticas()

const productos = ref([])
const actividades = ref([])

const obtenerNombreProducto = (id) => {
  const prod = productos.value.find(p => p._id === id)
  return prod ? prod.nombre : 'Producto eliminado'
}

const cargarActividadReciente = async () => {
  try {
    const [ventas, compras] = await Promise.all([
      find('ventas'),
      find('compras')
    ])

    // Combinar y ordenar por fecha descendente
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

    // Ordenar por fecha descendente y tomar los últimos 10
    items.sort((a, b) => b.fechaObj - a.fechaObj)
    actividades.value = items.slice(0, 10).map(item => ({
      descripcion: item.descripcion,
      fecha: item.fechaObj.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      icono: item.icono,
      color: item.color,
      monto: item.monto
    }))
  } catch (e) {
    console.error('Error cargando actividad reciente:', e)
  }
}

onMounted(async () => {
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error('Error cargando productos:', e)
  }
  await cargarEstadisticas()
  await cargarActividadReciente()
})
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: all 0.2s;
  height: 80px;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.10);
}
.stat-icon {
  font-size: 2rem;
  width: 48px;
  text-align: center;
}
.stat-info {
  display: flex;
  flex-direction: column;
}
.stat-number {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1a2a3a;
  line-height: 1.2;
}
.stat-label {
  font-size: 0.8rem;
  color: #7f8c8d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quick-access {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: #2d2d2d;
  padding: 8px 4px;
  border-radius: 12px;
  transition: all 0.2s;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.quick-access:hover {
  background: #f8f9fa;
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.08);
  text-decoration: none;
  color: #1a2a3a;
}
.quick-access .icon-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.4rem;
  margin-bottom: 6px;
}
.quick-access span {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
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

/* ===== ACTIVIDAD RECIENTE ===== */
.actividad-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
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
  font-size: 0.75rem;
  color: #7f8c8d;
}
.actividad-monto {
  font-weight: 700;
  color: #1a2a3a;
  font-size: 0.9rem;
  white-space: nowrap;
}
</style>