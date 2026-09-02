<template>
  <nav aria-label="breadcrumb" class="breadcrumb-nav">
    <ol class="breadcrumb">
      <li class="breadcrumb-item">
        <router-link to="/"><i class="fas fa-home"></i> Inicio</router-link>
      </li>
      <li v-for="(crumb, index) in crumbs" :key="index" class="breadcrumb-item"
          :class="{ active: index === crumbs.length - 1 }">
        <span v-if="index === crumbs.length - 1">{{ crumb }}</span>
        <router-link v-else :to="getPath(crumb)">{{ crumb }}</router-link>
      </li>
    </ol>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// Mapeo de rutas a nombres legibles
const routeMap = {
  '/': 'Inicio',
  '/productos': 'Productos',
  '/productos/nuevo': 'Nuevo Producto',
  '/categorias': 'Categorías',
  '/clientes': 'Clientes',
  '/proveedores': 'Proveedores',
  '/compras': 'Compras',
  '/ventas': 'Ventas',
  '/kardex': 'Kardex',
  '/consultar-documentos': 'Consultar Documentos',
  '/reportes/ventas': 'Reporte Ventas',
  '/reportes/compras': 'Reporte Compras',
  '/inventario/stock': 'Stock Actual',
  '/inventario/conteo': 'Conteo Físico',
  '/inventario/valorizado': 'Inventario Valorizado',
  '/inventario/planificacion': 'Planificación Inventarios',
  '/inventario/ajustes': 'Ajustes Inventario'
}

const crumbs = computed(() => {
  const path = route.path
  const basePath = path.split('/').slice(0, 2).join('/')
  const name = routeMap[path] || routeMap[basePath] || 'Sección'
  const parts = []
  if (basePath === '/ventas/nuevo') {
    const tipo = route.query.tipo || 'factura'
    const tipos = {
      factura: 'Nueva Factura',
      guia_remision: 'Guía de Remisión',
      exportacion: 'Factura Exportación',
      reembolso: 'Factura Reembolso',
      retencion: 'Comprobante Retención',
      liquidacion: 'Liquidación Compra',
      nota_credito: 'Nota de Crédito',
      proforma: 'Proforma'
    }
    parts.push('Documentos', tipos[tipo] || 'Nuevo Documento')
    return parts
  }
  if (path.includes('/editar/')) {
    const base = path.split('/editar/')[0]
    const baseName = routeMap[base] || 'Editar'
    parts.push(baseName, 'Editar')
    return parts
  }
  if (path.includes('/nuevo')) {
    const base = path.replace('/nuevo', '')
    const baseName = routeMap[base] || 'Nuevo'
    parts.push(baseName, 'Nuevo')
    return parts
  }
  parts.push(name)
  return parts
})

const getPath = (crumb) => {
  // Lógica simple para encontrar ruta
  const entries = Object.entries(routeMap)
  const found = entries.find(([_, value]) => value === crumb)
  return found ? found[0] : '/'
}
</script>

<style scoped>
.breadcrumb-nav {
  padding: 8px 0 16px 0;
  font-size: 0.9rem;
}
.breadcrumb {
  background: transparent;
  padding: 0;
  margin: 0;
}
.breadcrumb-item a {
  color: #3498db;
  text-decoration: none;
  transition: color 0.2s;
}
.breadcrumb-item a:hover {
  color: #1a2a3a;
  text-decoration: underline;
}
.breadcrumb-item.active {
  color: #6c757d;
  font-weight: 500;
}
body.dark-mode .breadcrumb-item a {
  color: #63b4e0;
}
body.dark-mode .breadcrumb-item a:hover {
  color: #e0e0e0;
}
body.dark-mode .breadcrumb-item.active {
  color: #a0aec0;
}
.breadcrumb-item + .breadcrumb-item::before {
  content: "›";
  font-size: 1.2rem;
}
</style>