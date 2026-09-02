<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Panel de Control</h4>

    <!-- ===== ESTADÍSTICAS RÁPIDAS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #3498db;">
          <div class="stat-icon"><i class="fas fa-file-invoice" style="color:#3498db;"></i></div>
          <div class="stat-info">
            <span class="stat-number">{{ facturasHoy }}</span>
            <span class="stat-label">Facturas Hoy</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #27ae60;">
          <div class="stat-icon"><i class="fas fa-shopping-cart" style="color:#27ae60;"></i></div>
          <div class="stat-info">
            <span class="stat-number">{{ comprasHoy }}</span>
            <span class="stat-label">Compras Hoy</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #8e44ad;">
          <div class="stat-icon"><i class="fas fa-users" style="color:#8e44ad;"></i></div>
          <div class="stat-info">
            <span class="stat-number">{{ totalClientes }}</span>
            <span class="stat-label">Clientes</span>
          </div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="stat-card" style="border-left: 4px solid #f39c12;">
          <div class="stat-icon"><i class="fas fa-boxes" style="color:#f39c12;"></i></div>
          <div class="stat-info">
            <span class="stat-number">{{ totalProductos }}</span>
            <span class="stat-label">Productos</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== ACCESOS RÁPIDOS - FILA 1: DOCUMENTOS ===== -->
    <h5 class="section-subtitle"><i class="fas fa-file-invoice me-2"></i>Documentos</h5>
    <div class="row g-3 mb-4">
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
        <router-link to="/ventas/nuevo?tipo=liquidacion" class="quick-access">
          <div class="icon-circle" style="background: #f39c12;"><i class="fas fa-file-alt"></i></div>
          <span>Liquidación</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=nota_credito" class="quick-access">
          <div class="icon-circle" style="background: #e67e22;"><i class="fas fa-undo-alt"></i></div>
          <span>Nota Crédito</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=retencion" class="quick-access">
          <div class="icon-circle" style="background: #d35400;"><i class="fas fa-percent"></i></div>
          <span>Retención</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/ventas/nuevo?tipo=exportacion" class="quick-access">
          <div class="icon-circle" style="background: #1abc9c;"><i class="fas fa-globe-americas"></i></div>
          <span>Exportación</span>
        </router-link>
      </div>
    </div>

    <!-- ===== ACCESOS RÁPIDOS - FILA 2: MAESTROS ===== -->
    <h5 class="section-subtitle"><i class="fas fa-database me-2"></i>Maestros</h5>
    <div class="row g-3 mb-4">
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
          <div class="icon-circle" style="background: #27ae60;"><i class="fas fa-box"></i></div>
          <span>Producto</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/categorias" class="quick-access">
          <div class="icon-circle" style="background: #16a085;"><i class="fas fa-tags"></i></div>
          <span>Categorías</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/clientes" class="quick-access">
          <div class="icon-circle" style="background: #8e44ad;"><i class="fas fa-list"></i></div>
          <span>Lista Clientes</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/proveedores" class="quick-access">
          <div class="icon-circle" style="background: #2c3e50;"><i class="fas fa-list-ul"></i></div>
          <span>Lista Proveedores</span>
        </router-link>
      </div>
    </div>

    <!-- ===== ACCESOS RÁPIDOS - FILA 3: INVENTARIO ===== -->
    <h5 class="section-subtitle"><i class="fas fa-warehouse me-2"></i>Inventario</h5>
    <div class="row g-3 mb-4">
      <div class="col-md-2 col-4">
        <router-link to="/kardex" class="quick-access">
          <div class="icon-circle" style="background: #2980b9;"><i class="fas fa-clipboard-list"></i></div>
          <span>Kardex</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/stock" class="quick-access">
          <div class="icon-circle" style="background: #1abc9c;"><i class="fas fa-boxes"></i></div>
          <span>Stock Actual</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/ajustes" class="quick-access">
          <div class="icon-circle" style="background: #d35400;"><i class="fas fa-edit"></i></div>
          <span>Ajustes</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/conteo" class="quick-access">
          <div class="icon-circle" style="background: #8e44ad;"><i class="fas fa-clipboard-check"></i></div>
          <span>Conteo Físico</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/valorizado" class="quick-access">
          <div class="icon-circle" style="background: #f1c40f;"><i class="fas fa-dollar-sign"></i></div>
          <span>Valorizado</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/inventario/planificacion" class="quick-access">
          <div class="icon-circle" style="background: #e67e22;"><i class="fas fa-calendar-alt"></i></div>
          <span>Planificar</span>
        </router-link>
      </div>
    </div>

    <!-- ===== ACCESOS RÁPIDOS - FILA 4: REPORTES Y CONSULTAS ===== -->
    <h5 class="section-subtitle"><i class="fas fa-chart-bar me-2"></i>Reportes y Consultas</h5>
    <div class="row g-3 mb-4">
      <div class="col-md-2 col-4">
        <router-link to="/reportes/ventas" class="quick-access">
          <div class="icon-circle" style="background: #e74c3c;"><i class="fas fa-chart-line"></i></div>
          <span>Ventas</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/reportes/compras" class="quick-access">
          <div class="icon-circle" style="background: #2c3e50;"><i class="fas fa-chart-bar"></i></div>
          <span>Compras</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/consultar-documentos" class="quick-access">
          <div class="icon-circle" style="background: #2980b9;"><i class="fas fa-search"></i></div>
          <span>Consultar Docs</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/compras" class="quick-access">
          <div class="icon-circle" style="background: #e67e22;"><i class="fas fa-inbox"></i></div>
          <span>Bandeja Compras</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/productos" class="quick-access">
          <div class="icon-circle" style="background: #27ae60;"><i class="fas fa-list"></i></div>
          <span>Lista Productos</span>
        </router-link>
      </div>
      <div class="col-md-2 col-4">
        <router-link to="/" class="quick-access" style="opacity:0.5; pointer-events:none;">
          <div class="icon-circle" style="background: #bdc3c7;"><i class="fas fa-plus-circle"></i></div>
          <span>Próximamente...</span>
        </router-link>
      </div>
    </div>

    <!-- ===== ACTIVIDADES RECIENTES ===== -->
    <div class="row g-4 mt-2">
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-clock me-2"></i>Últimas Ventas</div>
          <div class="card-body table-responsive" style="max-height: 250px;">
            <table class="table table-sm table-cacao">
              <thead><tr><th>Factura</th><th>Cliente</th><th>Total</th></tr></thead>
              <tbody>
                <tr v-for="v in ultimasVentas" :key="v._id">
                  <td>{{ v.numero_factura }}</td>
                  <td>{{ v.cliente?.nombre || 'N/A' }}</td>
                  <td>{{ formatCurrency(v.total) }}</td>
                </tr>
                <tr v-if="ultimasVentas.length === 0"><td colspan="3" class="text-muted text-center">Sin ventas recientes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card card-cacao">
          <div class="card-header"><i class="fas fa-clock me-2"></i>Últimas Compras</div>
          <div class="card-body table-responsive" style="max-height: 250px;">
            <table class="table table-sm table-cacao">
              <thead><tr><th>Factura</th><th>Proveedor</th><th>Total</th></tr></thead>
              <tbody>
                <tr v-for="c in ultimasCompras" :key="c._id">
                  <td>{{ c.numero_factura }}</td>
                  <td>{{ c.proveedor?.nombre || 'N/A' }}</td>
                  <td>{{ formatCurrency(c.total) }}</td>
                </tr>
                <tr v-if="ultimasCompras.length === 0"><td colspan="3" class="text-muted text-center">Sin compras recientes</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { formatCurrency } from '../utils/formatters'

const { find } = useMongoDB()
const facturasHoy = ref(0)
const comprasHoy = ref(0)
const totalClientes = ref(0)
const totalProductos = ref(0)
const ultimasVentas = ref([])
const ultimasCompras = ref([])

onMounted(async () => {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    const [clientes, productos, ventas, compras] = await Promise.all([
      find('clientes'),
      find('productos'),
      find('ventas'),
      find('compras')
    ])

    totalClientes.value = clientes.length
    totalProductos.value = productos.length

    // Ventas de hoy (solo facturas)
    const ventasHoy = ventas.filter(v => 
      v.fecha_emision?.startsWith(hoy) && 
      v.tipo_documento === 'factura'
    )
    facturasHoy.value = ventasHoy.length

    // Compras de hoy
    comprasHoy.value = compras.filter(c => c.fecha_emision?.startsWith(hoy)).length

    // Últimas 5 ventas y compras
    ultimasVentas.value = ventas.sort((a,b) => new Date(b.fecha_emision) - new Date(a.fecha_emision)).slice(0, 5)
    ultimasCompras.value = compras.sort((a,b) => new Date(b.fecha_emision) - new Date(a.fecha_emision)).slice(0, 5)
  } catch (e) {
    console.error('Error cargando datos del dashboard:', e)
  }
})
</script>

<style scoped>
/* ===== ESTADÍSTICAS ===== */
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

/* ===== ACCESOS RÁPIDOS ===== */
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
</style>