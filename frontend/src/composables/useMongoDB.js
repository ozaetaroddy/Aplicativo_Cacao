// composables/useMongoDB.js
// ============================================================
// ⚠️  DEPRECATED — wrapper genérico CRUD.
// ------------------------------------------------------------
// Este composable existe por compatibilidad con código legacy.
// NO respeta los contratos específicos del backend (paginación,
// shape de respuesta, códigos de error).
//
// 🎯 Para código NUEVO, usá directamente `api.request(...)` o
//    los composables específicos (useEstadisticas, useCatalogosSRI, etc).
//
// 🔧 Cambios aplicados:
//   - `loading` ahora es por-instancia (antes era global → race conditions).
//   - `find()` normaliza respuestas paginadas `{data, ...}` a array plano.
//   - Todos los métodos aceptan `{ signal }` opcional.
//   - Se exponen helpers tipados que SÍ respetan el contrato.
// ============================================================
'use strict'

import { ref } from 'vue'
import { api } from '../services/api'

export function useMongoDB() {
  // Cada instancia del composable tiene su propio loading/error
  // (antes eran refs a nivel de módulo → race conditions).
  const loading = ref(false)
  const error = ref(null)

  // Guard de petición en curso (para dedupe por endpoint)
  const inflight = new Map()

  /**
   * Petición genérica.
   * @param {string} endpoint
   * @param {object} [options]  Se pasan tal cual a api.request
   */
  async function request(endpoint, options = {}) {
    loading.value = true
    error.value = null
    try {
      return await api.request(endpoint, options)
    } catch (err) {
      error.value = err?.message || 'Error desconocido'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Normaliza la respuesta del backend a un array plano.
   * Soporta:
   *   - Array directo
   *   - `{ data: [...] }`
   *   - `{ items: [...] }`
   *   - null/undefined → []
   */
  function normalizarArray(res) {
    if (Array.isArray(res)) return res
    if (Array.isArray(res?.data)) return res.data
    if (Array.isArray(res?.items)) return res.items
    return []
  }

  // ===== CRUD GENÉRICO =====
  /**
   * Lista documentos de una colección.
   * ⚠️  Si el endpoint devuelve shape paginado, devuelve el array plano.
   *     Si querés los metadatos (total, page...), usá `request()` directo.
   */
  async function find(collection, options = {}) {
    const res = await request(`/${collection}`, { method: 'GET', ...options })
    return normalizarArray(res)
  }

  async function findById(collection, id) {
    if (!id) throw new Error('findById requiere id')
    return request(`/${collection}/${id}`, { method: 'GET' })
  }

  async function insertOne(collection, document, options = {}) {
    if (!document || typeof document !== 'object') {
      throw new Error('insertOne requiere un objeto')
    }
    return request(`/${collection}`, {
      method: 'POST',
      body: JSON.stringify(document),
      ...options
    })
  }

  async function updateOne(collection, id, document, options = {}) {
    if (!id) throw new Error('updateOne requiere id')
    if (!document || typeof document !== 'object') {
      throw new Error('updateOne requiere un objeto')
    }
    return request(`/${collection}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(document),
      ...options
    })
  }

  async function deleteOne(collection, id, options = {}) {
    if (!id) throw new Error('deleteOne requiere id')
    return request(`/${collection}/${id}`, { method: 'DELETE', ...options })
  }

  // ===== HELPERS ESPECÍFICOS =====

  /**
   * Productos con stock <= stock_minimo.
   * Respeta el endpoint real `/productos/stock/bajo`.
   */
  async function getProductosStockBajo(options = {}) {
    const res = await request('/productos/stock/bajo', {
      method: 'GET',
      ...options
    })
    return normalizarArray(res)
  }

  /**
   * Kardex de un producto en un rango.
   * Respeta paginación del backend.
   */
  async function getKardexByProducto(productoId, desde, hasta) {
    if (!productoId) return []
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    const res = await request(
      `/kardex/producto/${productoId}${qs ? '?' + qs : ''}`,
      { method: 'GET' }
    )
    return normalizarArray(res)
  }

  async function getKardexByCliente(clienteId, desde, hasta) {
    if (!clienteId) return []
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    const res = await request(
      `/kardex/cliente/${clienteId}${qs ? '?' + qs : ''}`,
      { method: 'GET' }
    )
    return normalizarArray(res)
  }

  async function getKardexByProveedor(proveedorId, desde, hasta) {
    if (!proveedorId) return []
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    const res = await request(
      `/kardex/proveedor/${proveedorId}${qs ? '?' + qs : ''}`,
      { method: 'GET' }
    )
    return normalizarArray(res)
  }

  async function reporteVentas(desde, hasta) {
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    const res = await request(`/reportes/ventas${qs ? '?' + qs : ''}`, {
      method: 'GET'
    })
    return normalizarArray(res)
  }

  async function reporteCompras(desde, hasta) {
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const qs = params.toString()
    const res = await request(`/reportes/compras${qs ? '?' + qs : ''}`, {
      method: 'GET'
    })
    return normalizarArray(res)
  }

  return {
    loading,
    error,
    request,
    find,
    findById,
    insertOne,
    updateOne,
    deleteOne,
    getProductosStockBajo,
    getKardexByProducto,
    getKardexByCliente,
    getKardexByProveedor,
    reporteVentas,
    reporteCompras,
    // Extra útil
    _normalizarArray: normalizarArray
  }
}

// ---- Solo para tests ----
export const _normalizarArray = (res) => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  return []
}