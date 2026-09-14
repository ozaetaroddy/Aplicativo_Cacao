// frontend/src/services/api.js
// Cliente HTTP con:
//  - cookies httpOnly (credentials: 'include')
//  - auto-refresh transparente en 401
//  - header CSRF (X-Requested-With)
//  - timeout configurable
//  - helper de descarga de archivos

import router from '../router'
import { useLoaderStore } from '../stores/loaderStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const DEFAULT_TIMEOUT = 30000

// ============================================================
// REFRESH COORDINADO (evita múltiples refresh en paralelo)
// ============================================================
let refreshPromise = null

async function intentarRefresh() {
  if (refreshPromise) return refreshPromise

  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { refreshPromise = null })

  return refreshPromise
}

/**
 * Limpia la sesión local y redirige a login.
 * El cache de permisos se limpia al recargar la página o al hacer login,
 * así que no hace falta importar usePermisos aquí (evita require en ESM).
 */
function limpiarSesionYRedirigir() {
  localStorage.removeItem('user')
  localStorage.removeItem('auth_hint')

  const currentPath = router.currentRoute.value.fullPath
  if (!currentPath.startsWith('/login')) {
    router.push({ path: '/login', query: { redirect: currentPath } })
  }
}

// ============================================================
// REQUEST PRINCIPAL
// ============================================================
async function baseRequest(endpoint, options = {}, esReintento = false) {
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers || {})
  }

  // Solo agregar Content-Type si hay body JSON (y no es FormData)
  const tieneBodyJson = options.body
    && !(options.body instanceof FormData)
    && !headers['Content-Type']

  if (tieneBodyJson) headers['Content-Type'] = 'application/json'

  const url = `${API_BASE_URL}${endpoint}`
  const {
    loaderMessage = 'Cargando...',
    skipLoader = false,
    timeout = DEFAULT_TIMEOUT,
    ...fetchOptions
  } = options

  const loaderStore = useLoaderStore()
  if (!skipLoader) loaderStore.increment(loaderMessage)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      signal: controller.signal
    })

    // ===== 401 → intentar refresh (una sola vez) =====
    const esAuthEndpoint = endpoint.startsWith('/auth/login')
      || endpoint.startsWith('/auth/register')
      || endpoint.startsWith('/auth/refresh')

    if (response.status === 401 && !esReintento && !esAuthEndpoint) {
      const ok = await intentarRefresh()
      if (ok) {
        if (!skipLoader) loaderStore.decrement()
        return baseRequest(endpoint, options, true)
      }
      limpiarSesionYRedirigir()
      throw new Error('Sesión expirada')
    }

    if (response.status === 204) return null

    let data = null
    const ct = response.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      data = await response.json().catch(() => null)
    } else {
      data = await response.text().catch(() => null)
    }

    if (response.status === 401) {
      const msg = data?.error || 'Credenciales inválidas'
      throw new Error(msg)
    }

    if (response.status === 423 && data?.periodo) {
      const err = new Error(data.error || 'Período cerrado')
      err.periodo = data.periodo
      err.code = 'PERIODO_CERRADO'
      throw err
    }

    if (!response.ok) {
      const errorMsg = data?.error
        || data?.message
        || (Array.isArray(data?.errors) ? data.errors.map(e => e.msg).join(', ') : null)
        || `Error ${response.status}`
      throw new Error(errorMsg)
    }

    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout: la petición a ${endpoint} tardó más de ${timeout / 1000}s`)
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('No se pudo conectar con el servidor. Verifique su conexión.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (!skipLoader) loaderStore.decrement()
  }
}

// ============================================================
// API PÚBLICA
// ============================================================
export const api = {
  request: baseRequest,

  get: (endpoint, options = {}) => baseRequest(endpoint, { ...options, method: 'GET' }),

  post: (endpoint, body, options = {}) => baseRequest(endpoint, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  }),

  put: (endpoint, body, options = {}) => baseRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  }),

  patch: (endpoint, body, options = {}) => baseRequest(endpoint, {
    ...options,
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  }),

  delete: (endpoint, options = {}) => baseRequest(endpoint, { ...options, method: 'DELETE' }),

  /**
   * Descarga un archivo binario (PDF, XML, backup, gzip).
   */
  async download(endpoint, filename, options = {}) {
    const doFetch = () => fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {})
      }
    })

    let response = await doFetch()

    if (response.status === 401) {
      const ok = await intentarRefresh()
      if (ok) {
        response = await doFetch()
      } else {
        limpiarSesionYRedirigir()
        throw new Error('Sesión expirada')
      }
    }

    if (!response.ok) {
      let msg = `Error ${response.status}`
      try {
        const data = await response.json()
        msg = data.error || msg
      } catch (_) { /* noop */ }
      throw new Error(msg)
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'archivo'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return true
  }
}