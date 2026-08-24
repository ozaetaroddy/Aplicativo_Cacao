<template>
  <div v-if="productosBajoStock.length > 0" class="stock-alert" @click="verProductos">
    <i class="fas fa-exclamation-triangle"></i>
    <span>{{ productosBajoStock.length }} productos con stock bajo</span>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMongoDB } from '../composables/useMongoDB'
import { useRouter } from 'vue-router'

const { find } = useMongoDB()
const router = useRouter()
const productosBajoStock = ref([])

const checkStock = async () => {
  try {
    const productos = await find('productos', {})
    productosBajoStock.value = productos.filter(p => p.stock <= p.stock_minimo)
  } catch (e) {
    console.error('Error al verificar stock:', e)
  }
}

const verProductos = () => {
  router.push('/productos')
}

onMounted(checkStock)
</script>

<style scoped>
.stock-alert {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #dc3545;
  color: white;
  padding: 12px 20px;
  border-radius: 50px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  cursor: pointer;
  z-index: 999;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: transform 0.2s;
}
.stock-alert:hover {
  transform: scale(1.05);
}
</style>