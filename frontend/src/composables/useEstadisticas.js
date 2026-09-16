// composables/useEstadisticas.js
// ============================================================
// Estadísticas del dashboard. Un solo request agregado del backend.
// Cache con TTL de 60s.
// ============================================================
'use strict'

import { ref } from 'vue'
import { api } from '../services/api'

// ===== CONFIGURACIÓN =====
const CACHE_TTL_MS = 60 * 1000 // 60s

// ===== COMPOSABLE =====
export function useEstadisticas() {
  // ===== STATE =====
  const ventasHoy = ref(0)
  const ventasAyer = ref(0)
  const ventasMes = ref(0)
  const ventasMesPrev = ref(0)
  const comprasHoy = ref(0)
  const comprasAyer = ref(0)
  const comprasMes = ref(0)
  const comprasMesPrev = ref(0)
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
  const error = ref(null)
  const loadedOnce = ref(false)

  // ===== GUARDS =====
  let ultimaCarga = 0
  let promesaCarga = null
  let abortController = null

  // ===== HELPERS =====
  const toNum = (v, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const toArr = (v) => (Array.isArray(v) ? v : [])

  const aplicarDatos = (data) => {
    if (!data || typeof data !== 'object') return

    ventasHoy.value = toNum(data.ventasHoy)
    ventasAyer.value = toNum(data.ventasAyer)
    ventasMes.value = toNum(data.ventasMes)
    ventasMesPrev.value = toNum(data.ventasMesPrev)
    facturasMes.value = toNum(data.facturasMes)

    comprasHoy.value = toNum(data.comprasHoy)
    comprasAyer.value = toNum(data.comprasAyer)
    comprasMes.value = toNum(data.comprasMes)
    comprasMesPrev.value = toNum(data.comprasMesPrev)
    comprasDelMes.value = toNum(data.comprasDelMes)

    tendenciaVentas.value = toNum(data.tendenciaVentas)
    tendenciaCompras.value = toNum(data.tendenciaCompras)

    ventasDiarias.value = toArr(data.ventasDiarias)
    comprasDiarias.value = toArr(data.comprasDiarias)
    dias.value = toArr(data.dias)
    topProductos.value = toArr(data.topProductos)

    cuentasPorPagar.value = toNum(data.cuentasPorPagar)
    stockBajo.value = toNum(data.stockBajo)

    sri.value = {
      pendientes: toNum(data.sri?.pendientes),
      firmados: toNum(data.sri?.firmados),
      autorizados: toNum(data.sri?.autorizados),
      rechazados: toNum(data.sri?.rechazados)
    }
  }

  /**
   * Carga las estadísticas.
   * - Con cache de 60s (a menos que `forzar` sea true).
   * - Deduplica requests concurrentes.
   *
   * @param {boolean} [forzar=false]
   */
  const cargarEstadisticas = async (forzar = false) => {
    const ahora = Date.now()
    const cacheVigente = loadedOnce.value && ahora - ultimaCarga < CACHE_TTL_MS

    if (cacheVigente && !forzar) return
    if (promesaCarga && !forzar) return promesaCarga

    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
    }
    abortController = new AbortController()

    loading.value = true
    error.value = null

    promesaCarga = api
      .request('/estadisticas/dashboard', {
        method: 'GET',
        skipLoader: true,
        signal: abortController.signal
      })
      .then((data) => {
        aplicarDatos(data)
        loadedOnce.value = true
        ultimaCarga = Date.now()
        return data
      })
      .catch((e) => {
        const esAbort =
          e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
        if (esAbort) return

        error.value = e?.message || 'Error cargando estadísticas'
        // NO marcamos loadedOnce = true en caso de error para permitir retry
        console.error('Error cargando estadísticas:', error.value)
        throw e
      })
      .finally(() => {
        loading.value = false
        promesaCarga = null
      })

    return promesaCarga
  }

  /**
   * Invalida la cache local. Próxima llamada a `cargarEstadisticas()`
   * hará request sí o sí.
   */
  const invalidarCache = () => {
    ultimaCarga = 0
  }

  return {
    // State
    ventasHoy,
    ventasAyer,
    ventasMes,
    ventasMesPrev,
    facturasMes,
    comprasHoy,
    comprasAyer,
    comprasMes,
    comprasMesPrev,
    comprasDelMes,
    tendenciaVentas,
    tendenciaCompras,
    ventasDiarias,
    comprasDiarias,
    dias,
    topProductos,
    cuentasPorPagar,
    stockBajo,
    sri,
    loading,
    error,
    // Acciones
    cargarEstadisticas,
    invalidarCache
  }
}