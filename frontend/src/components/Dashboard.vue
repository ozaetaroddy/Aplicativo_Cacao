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

    <!-- ===== GRÁFICOS ===== -->
    <DashboardCharts
      :ventas-diarias="ventasDiarias"
      :compras-diarias="comprasDiarias"
      :dias="dias"
    />

    <!-- ===== TOP PRODUCTOS Y ACCESOS RÁPIDOS ===== -->
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
          <div class="card-header"><i class="fas fa-clock me-2"></i> Accesos Rápidos</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-6">
                <router-link to="/ventas/nuevo?tipo=factura" class="btn btn-primary w-100">
                  <i class="fas fa-file-invoice"></i> Nueva Factura
                </router-link>
              </div>
              <div class="col-6">
                <router-link to="/compras/nuevo" class="btn btn-success w-100">
                  <i class="fas fa-shopping-cart"></i> Nueva Compra
                </router-link>
              </div>
              <div class="col-6">
                <router-link to="/clientes/nuevo" class="btn btn-info w-100">
                  <i class="fas fa-user-plus"></i> Nuevo Cliente
                </router-link>
              </div>
              <div class="col-6">
                <router-link to="/productos/nuevo" class="btn btn-warning w-100">
                  <i class="fas fa-box"></i> Nuevo Producto
                </router-link>
              </div>
              <div class="col-12">
                <router-link to="/consultar-documentos" class="btn btn-secondary w-100">
                  <i class="fas fa-search"></i> Consultar Documentos
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== ACCESOS RÁPIDOS ANTERIORES (se mantienen pero en un estilo más compacto) ===== -->
    <!-- Los accesos rápidos por categorías ya no son necesarios porque ya tenemos los botones de arriba -->
    <!-- pero si quieres mantenerlos, puedes dejarlos -->
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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

const obtenerNombreProducto = (id) => {
  const prod = productos.value.find(p => p._id === id)
  return prod ? prod.nombre : 'Producto eliminado'
}

onMounted(async () => {
  // Cargar lista de productos para resolver nombres
  try {
    productos.value = await find('productos')
  } catch (e) {
    console.error('Error cargando productos:', e)
  }
  // Cargar estadísticas
  await cargarEstadisticas()
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
</style>