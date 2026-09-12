// composables/useEstadisticas.js
import { ref } from 'vue'
import { api } from '../services/api'

/**
 * Estadísticas del dashboard. Ahora hace UN solo request
 * que el backend agrega, en lugar de descargar toda la BD.
 */
export function useEstadisticas() {
  const ventasHoy = ref(0)
  const ventasAyer = ref(0)
  const ventasMes = ref(0)
  const comprasHoy = ref(0)
  const comprasAyer = ref(0)
  const comprasMes = ref(0)
  const facturasMes = ref(0)
  const comprasDelMes = ref(0)
  const tendenciaVentas = ref(0)
  const tendenciaCompras = ref(0)
  const ventasDiarias = ref([])
  const comprasDiarias = ref([])
  const dias = ref([])
  const topProductos = ref([])
  const cuentasPorPagar = ref(0)
  const stockBajo = ref(0)
  const sri = ref({ pendientes: 0, firmados: 0, autorizados: 0, rechazados: 0 })
  const loading = ref(false)
  const loadedOnce = ref(false)

  const cargarEstadisticas = async (forzar = false) => {
    // Evitar recargas innecesarias si ya se cargó hace poco
    if (loadedOnce.value && !forzar) return

    loading.value = true
    try {
      const data = await api.request('/estadisticas/dashboard', {
        method: 'GET',
        skipLoader: true // silencioso: no molestar con overlay
      })
      ventasHoy.value = data.ventasHoy || 0
      ventasAyer.value = data.ventasAyer || 0
      ventasMes.value = data.ventasMes || 0
      facturasMes.value = data.facturasMes || 0
      comprasHoy.value = data.comprasHoy || 0
      comprasAyer.value = data.comprasAyer || 0
      comprasMes.value = data.comprasMes || 0
      comprasDelMes.value = data.comprasDelMes || 0
      tendenciaVentas.value = data.tendenciaVentas || 0
      tendenciaCompras.value = data.tendenciaCompras || 0
      ventasDiarias.value = data.ventasDiarias || []
      comprasDiarias.value = data.comprasDiarias || []
      dias.value = data.dias || []
      topProductos.value = data.topProductos || []
      cuentasPorPagar.value = data.cuentasPorPagar || 0
      stockBajo.value = data.stockBajo || 0
      sri.value = data.sri || { pendientes: 0, firmados: 0, autorizados: 0, rechazados: 0 }
      loadedOnce.value = true
    } catch (e) {
      console.error('Error cargando estadísticas:', e)
    } finally {
      loading.value = false
    }
  }

  return {
    ventasHoy, ventasAyer, ventasMes, facturasMes,
    comprasHoy, comprasAyer, comprasMes, comprasDelMes,
    tendenciaVentas, tendenciaCompras,
    ventasDiarias, comprasDiarias, dias,
    topProductos, cuentasPorPagar, stockBajo, sri,
    loading,
    cargarEstadisticas
  }
}