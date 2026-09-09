// services/api.js
import router from '../router'
import { useLoaderStore } from '../stores/loaderStore'

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

    // Obtener store y incrementar contador con mensaje personalizado
    const loaderStore = useLoaderStore()
    const mensaje = options.loaderMessage || 'Cargando...'
    loaderStore.increment(mensaje)

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
      })

      const data = await response.json()

      if (response.status === 401) {
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
    } finally {
      // Decrementar contador (esto activa el ocultamiento si es la última)
      loaderStore.decrement()
    }
  },

  get: (endpoint, options = {}) => api.request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => api.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body, options = {}) => api.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint, options = {}) => api.request(endpoint, { ...options, method: 'DELETE' })
}