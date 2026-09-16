// composables/useCatalogosSRI.js
// ============================================================
// Catálogos oficiales del SRI (TIPO_IDENTIFICACION, FORMA_PAGO,
// TARIFA_IVA, TIPO_RETENCION, etc).
// Cache en memoria con TTL.
// ============================================================
'use strict'

import { ref, computed } from 'vue'
import { api } from '../services/api'

// ===== CONFIGURACIÓN =====
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h (los catálogos del SRI cambian muy rara vez)

// ===== CACHE A NIVEL DE MÓDULO =====
let catalogosCache = null
let cacheExpiresAt = 0
let promesaCarga = null
let abortController = null

// Índices por nombre para búsquedas O(1)
let indicesPorNombre = null // { TARIFA_IVA: Map, ... }

function buildIndices(catalogos) {
  const out = {}
  for (const [nombre, lista] of Object.entries(catalogos || {})) {
    if (!Array.isArray(lista)) continue
    out[nombre] = {
      porCodigo: new Map(lista.map((x) => [String(x.codigo), x])),
      porNombre: new Map(lista.map((x) => [String(x.nombre), x]))
    }
  }
  return out
}

function normalizarCatalogos(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [nombre, lista] of Object.entries(raw)) {
    if (Array.isArray(lista)) out[nombre] = lista
  }
  return out
}

// ===== COMPOSABLE =====
export function useCatalogosSRI() {
  const catalogos = ref(catalogosCache || {})
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(Boolean(catalogosCache))

  /**
   * Carga los catálogos desde el backend.
   * - Idempotente: reusa cache vigente.
   * - Deduplica requests concurrentes.
   * - Con TTL: la cache expira a las 24h.
   *
   * @param {boolean} [forzar=false]  Ignora el cache
   */
  const cargarCatalogos = async (forzar = false) => {
    const ahora = Date.now()
    const cacheVigente = catalogosCache && cacheExpiresAt > ahora

    if (cacheVigente && !forzar) {
      if (catalogos.value !== catalogosCache) {
        catalogos.value = catalogosCache
      }
      return catalogosCache
    }

    // Request en curso → reusar
    if (promesaCarga) return promesaCarga

    // Cancelar request previa si la había
    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
    }
    abortController = new AbortController()

    loading.value = true
    error.value = null

    promesaCarga = api
      .request('/catalogos', {
        method: 'GET',
        signal: abortController.signal
      })
      .then((data) => {
        const limpios = normalizarCatalogos(data)
        catalogosCache = limpios
        cacheExpiresAt = Date.now() + CACHE_TTL_MS
        indicesPorNombre = buildIndices(limpios)
        catalogos.value = limpios
        loaded.value = true
        return limpios
      })
      .catch((err) => {
        const esAbort =
          err?.name === 'AbortError' || /aborted/i.test(err?.message || '')
        if (esAbort) return catalogosCache || {}

        error.value = err?.message || 'Error cargando catálogos'
        throw err
      })
      .finally(() => {
        loading.value = false
        promesaCarga = null
      })

    return promesaCarga
  }

  /**
   * Limpia la cache. Útil en logout o testing.
   */
  const limpiarCache = () => {
    catalogosCache = null
    cacheExpiresAt = 0
    indicesPorNombre = null
    catalogos.value = {}
    loaded.value = false
    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
      abortController = null
    }
  }

  /**
   * Obtiene el nombre legible a partir del código.
   * @param {Array} lista
   * @param {string} codigo
   * @returns {string}
   */
  const getNombre = (lista, codigo) => {
    if (!Array.isArray(lista) || codigo === undefined || codigo === null) {
      return codigo
    }
    const c = String(codigo)
    const item = lista.find((x) => String(x.codigo) === c)
    return item ? item.nombre : codigo
  }

  /**
   * Obtiene el código a partir del nombre.
   * @param {Array} lista
   * @param {string} nombre
   * @returns {string|null}
   */
  const getCodigo = (lista, nombre) => {
    if (!Array.isArray(lista) || !nombre) return null
    const item = lista.find((x) => String(x.nombre) === String(nombre))
    return item ? item.codigo : null
  }

  /**
   * Devuelve el porcentaje de IVA a partir del `codigo` interno
   * ('0', '5', '15', 'NA', 'EX') o del `codigoPorcentaje` del SRI ('0','4','5','6','7').
   */
  const getPorcentajeIVA = (tarifa) => {
    const lista = catalogos.value?.TARIFA_IVA
    if (!Array.isArray(lista)) return 0
    const t = String(tarifa)
    const item = lista.find(
      (x) => String(x.codigo) === t || String(x.codigoPorcentaje) === t
    )
    return item ? Number(item.porcentaje) || 0 : 0
  }

  /**
   * Busca por código usando los índices pre-construidos.
   * Más rápido que `getNombre` en bucles grandes.
   */
  const buscarPorCodigo = (nombreCatalogo, codigo) => {
    const idx = indicesPorNombre?.[nombreCatalogo]?.porCodigo
    if (!idx) return null
    return idx.get(String(codigo)) || null
  }

  // Atajo para `TARIFA_IVA`
  const tarifasIVA = computed(() => catalogos.value?.TARIFA_IVA || [])

  return {
    catalogos,
    tarifasIVA,
    loading,
    loaded,
    error,
    cargarCatalogos,
    limpiarCache,
    getNombre,
    getCodigo,
    getPorcentajeIVA,
    buscarPorCodigo
  }
}

// ---- Solo para tests ----
export const _normalizarCatalogos = normalizarCatalogos
export const _buildIndices = buildIndices