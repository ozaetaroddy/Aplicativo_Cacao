<template>
  <div class="row g-3">
    <div class="col-6">
      <div class="stat-mini">
        <span class="stat-mini-value">${{ ventasHoy.toFixed(2) }}</span>
        <span class="stat-mini-label">Ventas Hoy</span>
      </div>
    </div>
    <div class="col-6">
      <div class="stat-mini">
        <span class="stat-mini-value">${{ comprasHoy.toFixed(2) }}</span>
        <span class="stat-mini-label">Compras Hoy</span>
      </div>
    </div>
    <div class="col-6">
      <div class="stat-mini">
        <span class="stat-mini-value">${{ ventasMes.toFixed(2) }}</span>
        <span class="stat-mini-label">Ventas Mes</span>
      </div>
    </div>
    <div class="col-6">
      <div class="stat-mini">
        <span class="stat-mini-value">${{ comprasMes.toFixed(2) }}</span>
        <span class="stat-mini-label">Compras Mes</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useEstadisticas } from '../../../composables/useEstadisticas'
import { onMounted } from 'vue'

const { ventasHoy, comprasHoy, ventasMes, comprasMes, cargarEstadisticas } = useEstadisticas()

onMounted(() => cargarEstadisticas())
</script>

<style scoped>
.stat-mini {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}
.stat-mini-value {
  font-size: 1.2rem;
  font-weight: 700;
  display: block;
  color: #1a2a3a;
}
.stat-mini-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #7f8c8d;
  letter-spacing: 0.5px;
}
body.dark-mode .stat-mini {
  background: #1e2a4a;
}
body.dark-mode .stat-mini-value {
  color: #e0e0e0;
}
</style>