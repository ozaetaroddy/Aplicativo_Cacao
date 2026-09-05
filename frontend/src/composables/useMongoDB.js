import { ref } from 'vue'
import { api } from '../services/api'

export function useMongoDB() {
  const loading = ref(false)
  const error = ref(null)

  /**
   * Función base para hacer peticiones a la API
   * @param {string} endpoint - Ruta del endpoint (ej: '/clientes')
   * @param {object} options - Opciones de fetch (method, body, etc.)
   * @returns {Promise<any>} Datos de la respuesta
   */
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

  // ===== MÉTODOS CRUD GENÉRICOS =====

  /**
   * Obtener todos los documentos de una colección
   * @param {string} collection - Nombre de la colección (ej: 'clientes')
   * @returns {Promise<Array>} Lista de documentos
   */
  async function find(collection) {
    return request(`/${collection}`)
  }

  /**
   * Obtener un documento por su ID
   * @param {string} collection - Nombre de la colección
   * @param {string} id - ID del documento
   * @returns {Promise<object>} Documento encontrado
   */
  async function findById(collection, id) {
    return request(`/${collection}/${id}`)
  }

  /**
   * Insertar un nuevo documento
   * @param {string} collection - Nombre de la colección
   * @param {object} document - Datos del documento
   * @returns {Promise<object>} Documento insertado con su ID
   */
  async function insertOne(collection, document) {
    return request(`/${collection}`, {
      method: 'POST',
      body: JSON.stringify(document)
    })
  }

  /**
   * Actualizar un documento existente
   * @param {string} collection - Nombre de la colección
   * @param {string} id - ID del documento a actualizar
   * @param {object} document - Datos actualizados
   * @returns {Promise<object>} Resultado de la operación
   */
  async function updateOne(collection, id, document) {
    return request(`/${collection}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(document)
    })
  }

  /**
   * Eliminar un documento
   * @param {string} collection - Nombre de la colección
   * @param {string} id - ID del documento a eliminar
   * @returns {Promise<object>} Resultado de la operación
   */
  async function deleteOne(collection, id) {
    return request(`/${collection}/${id}`, {
      method: 'DELETE'
    })
  }

  // ===== MÉTODOS ESPECÍFICOS =====

  /**
   * Obtener productos con stock bajo (stock <= stock_minimo)
   * @returns {Promise<Array>} Lista de productos con stock bajo
   */
  async function getProductosStockBajo() {
    return request('/productos/stock/bajo')
  }

  /**
   * Obtener kardex por producto
   * @param {string} productoId - ID del producto
   * @param {string} desde - Fecha inicio (YYYY-MM-DD)
   * @param {string} hasta - Fecha fin (YYYY-MM-DD)
   * @returns {Promise<Array>} Movimientos del kardex
   */
  async function getKardexByProducto(productoId, desde, hasta) {
    let url = `/kardex/producto/${productoId}`
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  /**
   * Obtener kardex por cliente
   * @param {string} clienteId - ID del cliente
   * @param {string} desde - Fecha inicio
   * @param {string} hasta - Fecha fin
   * @returns {Promise<Array>} Movimientos del kardex del cliente
   */
  async function getKardexByCliente(clienteId, desde, hasta) {
    let url = `/kardex/cliente/${clienteId}`
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  /**
   * Obtener kardex por proveedor
   * @param {string} proveedorId - ID del proveedor
   * @param {string} desde - Fecha inicio
   * @param {string} hasta - Fecha fin
   * @returns {Promise<Array>} Movimientos del kardex del proveedor
   */
  async function getKardexByProveedor(proveedorId, desde, hasta) {
    let url = `/kardex/proveedor/${proveedorId}`
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  /**
   * Reporte de ventas por período
   * @param {string} desde - Fecha inicio (YYYY-MM-DD)
   * @param {string} hasta - Fecha fin (YYYY-MM-DD)
   * @returns {Promise<Array>} Lista de ventas en el período
   */
  async function reporteVentas(desde, hasta) {
    let url = '/reportes/ventas'
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  /**
   * Reporte de compras por período
   * @param {string} desde - Fecha inicio
   * @param {string} hasta - Fecha fin
   * @returns {Promise<Array>} Lista de compras en el período
   */
  async function reporteCompras(desde, hasta) {
    let url = '/reportes/compras'
    const params = []
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`)
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`)
    if (params.length) url += '?' + params.join('&')
    return request(url)
  }

  return {
    // Estado
    loading,
    error,
    // Método base
    request,
    // CRUD genérico
    find,
    findById,
    insertOne,
    updateOne,
    deleteOne,
    // Específicos
    getProductosStockBajo,
    getKardexByProducto,
    getKardexByCliente,
    getKardexByProveedor,
    reporteVentas,
    reporteCompras
  }
}