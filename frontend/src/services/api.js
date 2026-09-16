// frontend/src/services/api.js
// ============================================================
// Cliente HTTP profesional:
//   - Cookies httpOnly (credentials: 'include')
//   - Auto-refresh transparente en 401 (coordinado, sin duplicados)
//   - Header CSRF (X-Requested-With)
//   - Timeout configurable con AbortController
//   - Retry automático en errores de red transitorios
//   - Dedupe de GETs concurrentes
//   - Descarga de archivos binarios
// ============================================================
'use strict'

import router from '../router'
import { useLoaderStore } from '../stores/loaderStore'

// ===== CONFIGURACIÓN =====
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const DEFAULT_TIMEOUT = 30_000
const RETRY_TIMEOUT = 15_000
const MAX_REINTENTOS = 1 // reintento único en errores de red
const RETRY_DELAY_MS = 800

// Endpoints que NO deben intentar refresh (evita bucle)
const AUTH_ENDPOINTS = Object.freeze([
  '/auth/login',
  '/auth/register',
  '/auth/refresh'
])

function esAuthEndpoint(endpoint) {
  return AUTH_ENDPOINTS.some((p) => endpoint.startsWith(p))
}

// ===== REFRESH COORDINADO =====
let refreshPromise = null

async function intentarRefresh() {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json'
        }
      })
      return r.ok
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ===== LIMPIAR SESIÓN =====
function limpiarSesionYRedirigir() {
  try {
    localStorage.removeItem('user')
    localStorage.removeItem('auth_hint')
  } catch { /* noop */ }

  // Router puede no estar listo (SSR, primer boot)
  try {
    const current = router?.currentRoute?.value
    const currentPath = current?.fullPath || '/'
    if (!currentPath.startsWith('/login')) {
      router.push({ path: '/login', query: { redirect: currentPath } })
    }
  } catch { /* noop */ }
}

// ===== DEDUPE DE GETs CONCURRENTES =====
// Key: METHOD + URL. Evita 3 componentes pidiendo lo mismo a la vez.
const inflightGets = new Map()

// ===== SLEEP =====
const dormir = (ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    if (t.unref) t.unref()
  })

// ===== HELPERS =====
/**
 * Clasifica si un error vale la pena reintentar (errores de red
 * transitorios: timeout, ECONNRESET, 502, 503, 504).
 */
function esErrorTransitorio(err, response) {
  if (err?.name === 'AbortError') return false
  if (response && [502, 503, 504].includes(response.status)) return true
  // TypeError de fetch = falla de red típica
  if (err instanceof TypeError) return true
  return false
}

/**
 * Construye un mensaje de error legible desde distintos shapes.
 */
function extraerMensajeError(data, status) {
  if (!data) return `Error ${status}`
  if (typeof data === 'string') return data
  if (data.error) return String(data.error)
  if (data.message) return String(data.message)
  if (Array.isArray(data.errors)) {
    const msgs = data.errors
      .map((e) => (typeof e === 'string' ? e : e?.msg))
      .filter(Boolean)
    if (msgs.length) return msgs.join(', ')
  }
  if (Array.isArray(data.detalles)) {
    const msgs = data.detalles
      .map((d) => d?.mensaje || d?.msg)
      .filter(Boolean)
    if (msgs.length) return msgs.join(', ')
  }
  return `Error ${status}`
}

// ============================================================
// REQUEST PRINCIPAL
// ============================================================
async function baseRequest(endpoint, options = {}, esReintento = false) {
  const {
    loaderMessage = 'Cargando...',
    skipLoader = false,
    timeout = DEFAULT_TIMEOUT,
    signal: externalSignal,
    ...fetchOptions
  } = options

  const method = (fetchOptions.method || 'GET').toUpperCase()
  const url = `${API_BASE_URL}${endpoint}`

  // ===== DEDUPE DE GETs =====
  const esGet = method === 'GET'
  const dedupeKey = esGet ? `GET:${url}` : null

  if (esGet && inflightGets.has(dedupeKey)) {
    return inflightGets.get(dedupeKey)
  }

  // ===== HEADERS =====
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(fetchOptions.headers || {})
  }

  const tieneBodyJson =
    fetchOptions.body &&
    !(fetchOptions.body instanceof FormData) &&
    !headers['Content-Type']

  if (tieneBodyJson) headers['Content-Type'] = 'application/json'

  // ===== LOADER =====
  const loaderStore = useLoaderStore()
  if (!skipLoader) loaderStore.increment(loaderMessage)

  // ===== ABORTCONTROLLER =====
  const controller = new AbortController()

  // Permite que un caller externo también aborte
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), {
        once: true
      })
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response = null

  const ejecutarFetch = async () => {
    return fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      signal: controller.signal
    })
  }

  const promesa = (async () => {
    try {
      try {
        response = await ejecutarFetch()
      } catch (err) {
        // Retry único en errores de red
        if (!esReintento && esErrorTransitorio(err, null)) {
          await dormir(RETRY_DELAY_MS)
          return baseRequest(endpoint, options, true)
        }
        throw err
      }

      // ===== 401 → refresh + retry una vez =====
      if (
        response.status === 401 &&
        !esReintento &&
        !esAuthEndpoint(endpoint)
      ) {
        const ok = await intentarRefresh()
        if (ok) {
          // 🐛 BUG FIX: no hacer decrement manual aquí.
          // El finally del scope exterior se encargará.
          // Programar el retry en el próximo tick para no anidar el loader.
          return baseRequest(endpoint, options, true)
        }
        limpiarSesionYRedirigir()
        const err = new Error('Sesión expirada')
        err.codigo = 'SESION_EXPIRADA'
        err.status = 401
        throw err
      }

      // ===== 204 No Content =====
      if (response.status === 204) return null

      // ===== Parseo =====
      let data = null
      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null)
      } else {
        data = await response.text().catch(() => null)
      }

      // ===== 401 explícito (auth endpoint) =====
      if (response.status === 401) {
        const err = new Error(extraerMensajeError(data, 401))
        err.codigo = data?.codigo || 'NO_AUTORIZADO'
        err.status = 401
        throw err
      }

      // ===== 423 Período cerrado (caso especial del backend) =====
      if (response.status === 423 && data?.periodo) {
        const err = new Error(data.error || 'Período cerrado')
        err.periodo = data.periodo
        err.codigo = data.codigo || 'PERIODO_CERRADO'
        err.status = 423
        throw err
      }

      // ===== Cualquier otro !ok =====
      if (!response.ok) {
        const err = new Error(extraerMensajeError(data, response.status))
        err.codigo = data?.codigo || data?.code || `HTTP_${response.status}`
        err.status = response.status
        if (data?.detalles) err.detalles = data.detalles
        if (data?.reqId) err.reqId = data.reqId
        throw err
      }

      return data
    } finally {
      clearTimeout(timeoutId)
      if (!skipLoader) loaderStore.decrement()
    }
  })()

  // Registro de dedupe
  if (esGet) {
    inflightGets.set(dedupeKey, promesa)
    promesa.finally(() => {
      inflightGets.delete(dedupeKey)
    })
  }

  // Manejo de errores de red globales (más limpio que en el catch)
  return promesa.catch((err) => {
    // Timeout por AbortController
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(
        `Timeout: la petición a ${endpoint} tardó más de ${timeout / 1000}s`
      )
      timeoutErr.codigo = 'TIMEOUT'
      timeoutErr.status = 408
      throw timeoutErr
    }

    // Falla de red típica (fetch no pudo conectar)
    if (err instanceof TypeError && !err.status) {
      const netErr = new Error(
        'No se pudo conectar con el servidor. Verifique su conexión.'
      )
      netErr.codigo = 'NETWORK_ERROR'
      netErr.status = 0
      throw netErr
    }

    throw err
  })
}

// ============================================================
// API PÚBLICA
// ============================================================
export const api = {
  request: baseRequest,

  get(endpoint, options = {}) {
    return baseRequest(endpoint, { ...options, method: 'GET' })
  },

  post(endpoint, body, options = {}) {
    return baseRequest(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {})
    })
  },

  put(endpoint, body, options = {}) {
    return baseRequest(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {})
    })
  },

  patch(endpoint, body, options = {}) {
    return baseRequest(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {})
    })
  },

  delete(endpoint, options = {}) {
    return baseRequest(endpoint, { ...options, method: 'DELETE' })
  },

  /**
   * Descarga un archivo binario (PDF, XML, backup, gzip).
   * Maneja 401 con refresh + reintento único.
   *
   * @param {string} endpoint
   * @param {string} filename
   * @param {object} [options]
   * @returns {Promise<true>}
   */
  async download(endpoint, filename, options = {}) {
    const headers = {
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {})
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)

    const doFetch = () =>
      fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        credentials: 'include',
        headers,
        signal: controller.signal
      })

    let response

    try {
      try {
        response = await doFetch()
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new Error('Timeout al descargar el archivo')
        }
        throw new Error(
          'No se pudo conectar con el servidor para la descarga'
        )
      }

      // 401 → refresh + retry
      if (response.status === 401) {
        const ok = await intentarRefresh()
        if (!ok) {
          limpiarSesionYRedirigir()
          throw new Error('Sesión expirada')
        }
        response = await doFetch()
      }

      if (!response.ok) {
        let msg = `Error ${response.status}`
        try {
          const data = await response.json()
          msg = extraerMensajeError(data, response.status)
        } catch { /* noop */ }
        throw new Error(msg)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'archivo'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()

      // 🐛 BUG FIX: revocar en el próximo tick
      // (revocar inmediatamente puede fallar en archivos grandes)
      setTimeout(() => {
        try { URL.revokeObjectURL(url) } catch { /* noop */ }
      }, 1000)

      return true
    } finally {
      clearTimeout(timeoutId)
    }
  }
}