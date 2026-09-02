<template>
  <div class="search-container">
    <div class="search-input-wrapper">
      <i class="fas fa-search search-icon"></i>
      <input
        type="text"
        class="search-input"
        v-model="query"
        @input="onSearch"
        @focus="showResults = true"
        @blur="closeResults"
        placeholder="Buscar productos, clientes, facturas..."
        ref="searchInput"
      />
      <span v-if="query" class="clear-btn" @click="clearSearch">
        <i class="fas fa-times-circle"></i>
      </span>
    </div>

    <div v-if="showResults && results.length > 0" class="search-results">
      <div v-for="result in results" :key="result.id" class="result-item" @click="navigateTo(result)">
        <div class="result-icon">
          <i :class="result.icon"></i>
        </div>
        <div class="result-content">
          <div class="result-title">{{ result.title }}</div>
          <div class="result-subtitle">{{ result.subtitle }}</div>
        </div>
      </div>
      <div v-if="results.length === 0 && query.length > 1" class="no-results">
        No se encontraron resultados
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMongoDB } from '../composables/useMongoDB'
import Fuse from 'fuse.js'

const router = useRouter()
const { find } = useMongoDB()
const query = ref('')
const showResults = ref(false)
const results = ref([])
const searchData = ref({ clientes: [], productos: [], ventas: [], compras: [] })
const fuseInstances = ref({})

const loadData = async () => {
  try {
    const [clientes, productos, ventas, compras] = await Promise.all([
      find('clientes'),
      find('productos'),
      find('ventas'),
      find('compras')
    ])
    searchData.value = { clientes, productos, ventas, compras }

    // Configurar Fuse para cada tipo
    fuseInstances.value = {
      clientes: new Fuse(clientes, { keys: ['nombre', 'ruc', 'telefono', 'email'], threshold: 0.3 }),
      productos: new Fuse(productos, { keys: ['nombre', 'codigo', 'categoriaId'], threshold: 0.3 }),
      ventas: new Fuse(ventas, { keys: ['numero_factura', 'cliente.nombre'], threshold: 0.4 }),
      compras: new Fuse(compras, { keys: ['numero_factura', 'proveedor.nombre'], threshold: 0.4 })
    }
  } catch (e) {
    console.error('Error cargando datos de búsqueda:', e)
  }
}

const onSearch = () => {
  if (query.value.length < 2) {
    results.value = []
    return
  }
  const allResults = []
  const q = query.value.trim()
  
  // Buscar en cada fuse
  Object.keys(fuseInstances.value).forEach(key => {
    const fuse = fuseInstances.value[key]
    const items = fuse.search(q).map(r => r.item)
    items.forEach(item => {
      let icon, title, subtitle, routePath
      switch(key) {
        case 'clientes':
          icon = 'fas fa-user'
          title = item.nombre
          subtitle = `RUC: ${item.ruc} | ${item.telefono}`
          routePath = `/clientes/editar/${item._id}`
          break
        case 'productos':
          icon = 'fas fa-box'
          title = item.nombre
          subtitle = `Código: ${item.codigo} | Stock: ${item.stock}`
          routePath = `/productos/editar/${item._id}`
          break
        case 'ventas':
          icon = 'fas fa-file-invoice'
          title = `Factura ${item.numero_factura || 'N/A'}`
          subtitle = `Cliente: ${item.cliente?.nombre || 'N/A'} | Total: $${item.total?.toFixed(2)}`
          routePath = `/ventas/editar/${item._id}`
          break
        case 'compras':
          icon = 'fas fa-shopping-cart'
          title = `Compra ${item.numero_factura || 'N/A'}`
          subtitle = `Proveedor: ${item.proveedor?.nombre || 'N/A'} | Total: $${item.total?.toFixed(2)}`
          routePath = `/compras/editar/${item._id}`
          break
      }
      allResults.push({ id: item._id, icon, title, subtitle, routePath })
    })
  })

  // Limitar a 10 resultados
  results.value = allResults.slice(0, 10)
}

const navigateTo = (result) => {
  if (result.routePath) {
    router.push(result.routePath)
  }
  showResults.value = false
  query.value = ''
}

const clearSearch = () => {
  query.value = ''
  results.value = []
  showResults.value = false
  document.activeElement.blur()
}

const closeResults = () => {
  setTimeout(() => { showResults.value = false }, 200)
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.search-container {
  position: relative;
  width: 100%;
  max-width: 500px;
}
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 14px;
  color: #7f8c8d;
  font-size: 0.9rem;
}
.search-input {
  width: 100%;
  padding: 10px 40px 10px 40px;
  border-radius: 30px;
  border: 2px solid #e0e0e0;
  background: #fff;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  outline: none;
}
.search-input:focus {
  border-color: #3498db;
  box-shadow: 0 0 0 4px rgba(52,152,219,0.15);
}
.clear-btn {
  position: absolute;
  right: 14px;
  cursor: pointer;
  color: #bdc3c7;
  transition: color 0.2s;
}
.clear-btn:hover {
  color: #e74c3c;
}
.search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  max-height: 400px;
  overflow-y: auto;
  z-index: 1000;
  padding: 6px 0;
}
.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}
.result-item:hover {
  background: #f0f4f9;
}
.result-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ecf0f1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3498db;
  flex-shrink: 0;
}
.result-content {
  flex: 1;
  min-width: 0;
}
.result-title {
  font-weight: 500;
  color: #2d2d2d;
  font-size: 0.9rem;
}
.result-subtitle {
  font-size: 0.8rem;
  color: #7f8c8d;
}
.no-results {
  padding: 16px;
  text-align: center;
  color: #7f8c8d;
  font-size: 0.9rem;
}
body.dark-mode .search-input {
  background: #1e2a4a;
  border-color: #2d3748;
  color: #e0e0e0;
}
body.dark-mode .search-input:focus {
  border-color: #3498db;
}
body.dark-mode .search-results {
  background: #16213e;
}
body.dark-mode .result-item:hover {
  background: #1e2a4a;
}
body.dark-mode .result-title {
  color: #e0e0e0;
}
body.dark-mode .result-subtitle {
  color: #a0aec0;
}
body.dark-mode .result-icon {
  background: #1e2a4a;
}
body.dark-mode .clear-btn {
  color: #4a5568;
}
body.dark-mode .clear-btn:hover {
  color: #e74c3c;
}
</style>