// services/api.js
import router from '../router' // Importa el router

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('token')
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }

    const url = `${API_BASE_URL}${endpoint}`
    console.log('📡 Petición a:', url, options)

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
      })

      const data = await response.json()

      if (response.status === 401) {
        // Token expirado: limpiar y redirigir sin recargar
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
        throw new Error('Sesión expirada, inicie sesión nuevamente')
      }

      if (!response.ok) {
        const errorMsg = data.error || data.message || `Error ${response.status}`
        throw new Error(errorMsg)
      }

      return data
    } catch (err) {
      console.error('❌ Error en request:', err)
      throw err
    }
  },

  get: (endpoint) => api.request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => api.request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => api.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => api.request(endpoint, { method: 'DELETE' })
}