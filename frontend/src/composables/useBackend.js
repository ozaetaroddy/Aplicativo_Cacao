
import { ref } from 'vue'
import { API_BASE_URL } from '../config'

export function useBackend() {
  const loading = ref(false)
  const error = ref(null)

  async function find(collection, filter = null) {
    loading.value = true
    error.value = null
    try {
      // Para reportes especiales
      if (filter && filter.fecha && filter.fecha.$gte && filter.fecha.$lte) {
        const fecha = new Date(filter.fecha.$gte).toISOString().split('T')[0]
        const response = await fetch(`${API_BASE_URL}/reportes/${fecha}`)
        if (!response.ok) throw new Error('Error al obtener reportes')
        const data = await response.json()
        // Devolvemos solo la colección solicitada
        return collection === 'compras' ? data.compras : data.ventas
      }

      // Consulta normal
      const url = filter ? `${API_BASE_URL}/${collection}` : `${API_BASE_URL}/${collection}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Error al obtener datos')
      return await response.json()
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function insertOne(collection, document) {
    loading.value = true
    error.value = null
    try {
      const response = await fetch(`${API_BASE_URL}/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document)
      })
      if (!response.ok) throw new Error('Error al insertar')
      return await response.json()
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  return { loading, error, find, insertOne }
}