<template>
  <div>
    <h4 class="section-title"><i class="fas fa-home"></i> Página Principal</h4>
    <div class="row g-4">
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-boxes" style="color:#3498db;"></i> Productos</h5>
          <div class="number">{{ totalProductos }}</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-users" style="color:#3498db;"></i> Clientes</h5>
          <div class="number">{{ totalClientes }}</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-truck" style="color:#3498db;"></i> Proveedores</h5>
          <div class="number">{{ totalProveedores }}</div>
        </div>
      </div>
      <div class="col-lg-3 col-md-6">
        <div class="total-box">
          <h5><i class="fas fa-exclamation-triangle" style="color:#e74c3c;"></i> Stock Bajo</h5>
          <div class="number">{{ stockBajoCount }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'

const { find, getProductosStockBajo } = useMongoDB()
const totalProductos = ref(0)
const totalClientes = ref(0)
const totalProveedores = ref(0)
const stockBajoCount = ref(0)

onMounted(async () => {
  try {
    const [productos, clientes, proveedores, stockBajo] = await Promise.all([
      find('productos'),
      find('clientes'),
      find('proveedores'),
      getProductosStockBajo()
    ])
    totalProductos.value = productos.length
    totalClientes.value = clientes.length
    totalProveedores.value = proveedores.length
    stockBajoCount.value = stockBajo.length
  } catch (e) {
    console.error(e)
  }
})
</script>