// services/api.js
import router from '../router'
import { useLoaderStore } from '../stores/loaderStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const DEFAULT_TIMEOUT = 30000

export const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('token')
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }

    const url = `${API_BASE_URL}${endpoint}`
    const {
      loaderMessage = 'Cargando...',
      skipLoader = false,
      timeout = DEFAULT_TIMEOUT,
      ...fetchOptions
    } = options

    // Soporte para FormData (no aplicar Content-Type)
    if (fetchOptions.body instanceof FormData) {
      delete headers['Content-Type']
    }

    const loaderStore = useLoaderStore()
    if (!skipLoader) loaderStore.increment(loaderMessage)

    // Timeout con AbortController
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal
      })

      // 204 No Content
      if (response.status === 204) return null

      let data = null
      const ct = response.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        data = await response.json().catch(() => null)
      } else {
        data = await response.text().catch(() => null)
      }

      // 401 → sesión expirada
      if (response.status === 401) {
        const isAuthEndpoint = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register')
        if (!isAuthEndpoint) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          const currentPath = router.currentRoute.value.fullPath
          if (!currentPath.startsWith('/login')) {
            router.push({ path: '/login', query: { redirect: currentPath } })
          }
        }
        throw new Error(data?.error || 'Credenciales inválidas')
      }

      // 423 → período cerrado
      if (response.status === 423 && data?.periodo) {
        const err = new Error(data.error || 'Período cerrado')
        err.periodo = data.periodo
        err.code = 'PERIODO_CERRADO'
        throw err
      }

      // Otros errores
      if (!response.ok) {
        const errorMsg = data?.error
          || data?.message
          || (Array.isArray(data?.errors) ? data.errors.map(e => e.msg).join(', ') : null)
          || `Error ${response.status}`
        throw new Error(errorMsg)
      }

      return data
    } catch (err) {
      // Abort por timeout
      if (err.name === 'AbortError') {
        throw new Error(`Timeout: la petición a ${endpoint} tardó más de ${timeout / 1000}s`)
      }
      // Error de red
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('No se pudo conectar con el servidor. Verifique su conexión.')
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
      if (!skipLoader) loaderStore.decrement()
    }
  },

  get: (endpoint, options = {}) => api.request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => api.request(endpoint, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  put: (endpoint, body, options = {}) => api.request(endpoint, {
    ...options,
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  patch: (endpoint, body, options = {}) => api.request(endpoint, {
    ...options,
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  delete: (endpoint, options = {}) => api.request(endpoint, { ...options, method: 'DELETE' })
}