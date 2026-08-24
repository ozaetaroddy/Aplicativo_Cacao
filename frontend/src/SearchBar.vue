<template>
  <div class="search-bar">
    <div class="input-group">
      <span class="input-group-text"><i class="fas fa-search"></i></span>
      <input type="text" class="form-control" placeholder="Buscar funcionalidad (factura, reporte, producto...)" v-model="query" @keyup.enter="emitSearch" />
      <button class="btn btn-cacao-primary" @click="emitSearch">Ir</button>
    </div>
  </div>
</template>

<script setup>
import { ref, defineEmits } from 'vue'

const query = ref('')
const emit = defineEmits(['search'])

const emitSearch = () => {
  if (query.value.trim()) {
    emit('search', query.value.trim())
  }
}
</script>

<style scoped>
.search-bar {
  max-width: 600px;
  margin: 0 auto;
}
</style>