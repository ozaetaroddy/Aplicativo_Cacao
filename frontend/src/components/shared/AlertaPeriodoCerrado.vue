<template>
  <div v-if="periodoCerrado" class="alerta-periodo">
    <i class="fas fa-lock me-2"></i>
    <div>
      <strong>Período cerrado: {{ periodoCerrado.nombre }}</strong>
      <div class="small">
        No se pueden guardar cambios en esta fecha. Contacte al administrador si necesita modificar este documento.
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  periodoCerrado: { type: Object, default: null }
})
</script>

<style scoped>
.alerta-periodo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(231, 76, 60, 0.12);
  border-left: 4px solid #e74c3c;
  border-radius: 8px;
  color: #c0392b;
  margin-bottom: 16px;
}
.alerta-periodo i {
  font-size: 1.5rem;
}
body.dark-mode .alerta-periodo {
  background: rgba(231, 76, 60, 0.2);
  color: #ec7063;
}
</style>