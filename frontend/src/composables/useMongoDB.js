import { ref } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export function useMongoDB() {
  const loading = ref(false)
  const error = ref(null)

  async function request(endpoint, options = {}) {
    loading.value = true
    error.value = null
    try {
      const url = `${API_BASE_URL}${endpoint}`
      console.log('📡 Petición a:', url, options)
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      })
      if (!response.ok) {
        const err = await response.json()
        console.error('❌ Error respuesta:', err)
        throw new Error(err.error || 'Error en la petición')
      }
      const data = await response.json()
      console.log('✅ Datos recibidos:', data)
      return data
    } catch (err) {
      error.value = err.message
      console.error('❌ Error en request:', err)
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

  // Métodos específicos
  async function getProductosStockBajo() {
    return request('/productos/stock/bajo')
  }

  async function getKardexByProducto(productoId, desde, hasta) {
    let url = `/kardex/producto/${productoId}`
    const params = []
    if (desde) params.push(`desde=${desde}`)
    if (hasta) params.push(`hasta=${hasta}`)
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
async function consultarCedula(cedula) {
  return request('/registro-civil/cedula', {
    method: 'POST',
    body: JSON.stringify({ cedula })
  });
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
    reporteVentas,
    reporteCompras,
    getKardexByCliente,
  getKardexByProveedor,
  consultarCedula
  }
}