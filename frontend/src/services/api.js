// services/api.js
import { useToast } from 'vue-toastification'

const toast = useToast()
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export const api = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    console.log('📡 Petición a:', url, options)

    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      })

      const data = await response.json()

      // Manejo de errores de validación (400 con errors)
      if (response.status === 400 && data.errors) {
        const mensajes = data.errors.map(err => err.msg).join(', ')
        toast.error(`Validación fallida: ${mensajes}`)
        throw new Error(mensajes)
      }

      if (!response.ok) {
        const errorMsg = data.error || data.message || `Error ${response.status}`
        toast.error(errorMsg)
        throw new Error(errorMsg)
      }

      console.log('✅ Datos recibidos:', data)
      return data
    } catch (err) {
      console.error('❌ Error en request:', err)
      if (err.message && !err.message.includes('Validación')) {
        toast.error(`Error: ${err.message}`)
      }
      throw err
    }
  },

  get: (endpoint) => api.request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => api.request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => api.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => api.request(endpoint, { method: 'DELETE' })
}