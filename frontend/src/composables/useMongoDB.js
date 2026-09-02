import { ref } from 'vue'
import { api } from '../services/api'

export function useMongoDB() {
  const loading = ref(false)
  const error = ref(null)

  async function request(endpoint, options = {}) {
    loading.value = true
    error.value = null
    try {
      const data = await api.request(endpoint, options)
      return data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // Métodos genéricos
  async function find(collection) {
    return request(`/${collection}`)
  }

  async function findById(collection, id) {
    return request(`/${collection}/${id}`)
  }

  async function insertOne(collection, document) {
    return request(`/${collection}`, {
      method: 'POST',
      body: JSON.stringify(document)
    })
  }

  async function updateOne(collection, id, document) {
    return request(`/${collection}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(document)
    })
  }

  async function deleteOne(collection, id) {
    return request(`/${collection}/${id}`, {
      method: 'DELETE'
    })
  }

  // Métodos específicos (Kardex, Reportes, etc.)
  async function getProductosStockBajo() {
    return request('/productos/stock/bajo')
  }

  async function getKardexByProducto(productoId, desde, hasta) {
    let url = `/kardex/producto/${productoId}`
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  async function getKardexByCliente(clienteId, desde, hasta) {
    let url = `/kardex/cliente/${clienteId}`
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  async function getKardexByProveedor(proveedorId, desde, hasta) {
    let url = `/kardex/proveedor/${proveedorId}`
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  async function reporteVentas(desde, hasta) {
    let url = '/reportes/ventas'
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  async function reporteCompras(desde, hasta) {
    let url = '/reportes/compras'
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  return {
    loading,
    error,
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
    reporteCompras
  }
}