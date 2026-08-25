<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Página Principal</h4>

    <!-- ===== ACCESOS RÁPIDOS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-md-3 col-sm-6">
        <router-link to="/ventas/nuevo" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-file-invoice fa-3x" style="color: #3498db;"></i>
            <h6 class="mt-2">Nueva Factura</h6>
            <small class="text-muted">Crear documento electrónico</small>
          </div>
        </router-link>
      </div>
      <div class="col-md-3 col-sm-6">
        <router-link to="/compras/nuevo" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-shopping-cart fa-3x" style="color: #27ae60;"></i>
            <h6 class="mt-2">Nueva Compra</h6>
            <small class="text-muted">Registrar ingreso de mercadería</small>
          </div>
        </router-link>
      </div>
      <div class="col-md-3 col-sm-6">
        <router-link to="/clientes/nuevo" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-user-plus fa-3x" style="color: #8e44ad;"></i>
            <h6 class="mt-2">Nuevo Cliente</h6>
            <small class="text-muted">Crear cliente o proveedor</small>
          </div>
        </router-link>
      </div>
      <div class="col-md-3 col-sm-6">
        <router-link to="/productos/nuevo" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-box fa-3x" style="color: #f39c12;"></i>
            <h6 class="mt-2">Nuevo Producto</h6>
            <small class="text-muted">Crear producto o servicio</small>
          </div>
        </router-link>
      </div>
    </div>

    <!-- ===== SEGUNDA FILA DE ACCESOS ===== -->
    <div class="row g-4 mb-4">
      <div class="col-md-3 col-sm-6">
        <router-link to="/ventas" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-search fa-3x" style="color: #2c3e50;"></i>
            <h6 class="mt-2">Consultar Documentos</h6>
            <small class="text-muted">Buscar facturas, compras, etc.</small>
          </div>
        </router-link>
      </div>
      <div class="col-md-3 col-sm-6">
        <router-link to="/compras" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-inbox fa-3x" style="color: #e74c3c;"></i>
            <h6 class="mt-2">Bandeja de Compras</h6>
            <small class="text-muted">Compras pendientes y recibidas</small>
          </div>
        </router-link>
      </div>
      <div class="col-md-3 col-sm-6">
        <router-link to="/ventas/nuevo?tipo=guia_remision" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-truck fa-3x" style="color: #2980b9;"></i>
            <h6 class="mt-2">Guía de Remisión</h6>
            <small class="text-muted">Documento de transporte</small>
          </div>
        </router-link>
      </div>
      <div class="col-md-3 col-sm-6">
        <router-link to="/ventas/nuevo?tipo=retencion" class="text-decoration-none">
          <div class="card card-cacao text-center p-3 h-100">
            <i class="fas fa-percent fa-3x" style="color: #d35400;"></i>
            <h6 class="mt-2">Comprobante de Retención</h6>
            <small class="text-muted">Retenciones de IVA y Renta</small>
          </div>
        </router-link>
      </div>
    </div>

    <!-- ===== ESTADÍSTICAS RÁPIDAS ===== -->
    <div class="row g-4">
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-file-invoice" style="color:#3498db;"></i> Facturas Hoy</h5>
          <div class="number">{{ facturasHoy }}</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-shopping-cart" style="color:#27ae60;"></i> Compras Hoy</h5>
          <div class="number">{{ comprasHoy }}</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-users" style="color:#8e44ad;"></i> Clientes</h5>
          <div class="number">{{ totalClientes }}</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-boxes" style="color:#f39c12;"></i> Productos</h5>
          <div class="number">{{ totalProductos }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'

const { find } = useMongoDB()
const facturasHoy = ref(0)
const comprasHoy = ref(0)
const totalClientes = ref(0)
const totalProductos = ref(0)

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

    // Contar facturas de hoy
    facturasHoy.value = ventas.filter(v => 
      v.fecha_emision && v.fecha_emision.startsWith(hoy)
    ).length

    // Contar compras de hoy
    comprasHoy.value = compras.filter(c => 
      c.fecha_emision && c.fecha_emision.startsWith(hoy)
    ).length
  } catch (e) {
    console.error(e)
  }
})
</script>

<style scoped>
.card-cacao {
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.card-cacao:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.12);
}
</style>