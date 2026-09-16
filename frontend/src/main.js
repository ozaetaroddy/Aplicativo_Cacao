// frontend/src/main.js
// ============================================================
// Bootstrap de la aplicación Vue 3
// ------------------------------------------------------------
// Responsabilidades:
//   1. Registrar plugins globales (Chart.js, Pinia, Router, Toast).
//   2. Crear y gestionar la conexión Socket.IO.
//   3. Configurar manejo global de errores (Vue + window).
//   4. Inicializar el tema ANTES del mount (evita FOUC).
//   5. Registrar el Service Worker (PWA) con flujo de actualización.
//   6. Programar limpieza al cerrar la pestaña.
//
// ⚠️  El backend usa cookies httpOnly (`sc_at`, `sc_refresh`).
//     El frontend NO debe leer ni almacenar el JWT. Solo usa
//     `auth_hint` (flag no sensible) para saber si hay sesión.
// ============================================================

import { createApp, markRaw } from 'vue'
import { createPinia } from 'pinia'
import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'
import { Chart, registerables } from 'chart.js'
import io from 'socket.io-client'

import App from './App.vue'
import router from './router'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'
import { useThemeStore } from './stores/themeStore'

// ============================================================
// CONSTANTES
// ============================================================
const APP_TITLE = 'Sistema Contable'
const AUTH_HINT_KEY = 'auth_hint'
const SOCKET_DEFAULT_PORT = 5000

// ============================================================
// HELPERS
// ============================================================

/**
 * Resuelve la URL del servidor Socket.IO con la siguiente prioridad:
 *   1. `VITE_SOCKET_URL` (explícita).
 *   2. Derivada de `VITE_API_BASE_URL` quitando el sufijo `/api`.
 *   3. Mismo origen del navegador (si la API es relativa).
 *   4. Fallback dev: `window.location.hostname:5000`.
 *
 * Valida que la URL resultante sea absoluta y parseable.
 *
 * @returns {string} URL absoluta del servidor Socket.IO.
 */
function calcularSocketUrl() {
  const explicit = String(import.meta.env.VITE_SOCKET_URL || '').trim()
  if (explicit) return validarSocketUrl(explicit)

  const api = String(import.meta.env.VITE_API_BASE_URL || '').trim()

  // Sin API configurada → fallback de desarrollo.
  if (!api) {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:${SOCKET_DEFAULT_PORT}`
  }

  // API relativa (`/api`) → mismo origen del navegador.
  // Nota: Vercel/Netlify NO proxean WebSocket por defecto. En ese
  // caso el usuario DEBE definir VITE_SOCKET_URL explícitamente.
  if (api.startsWith('/')) {
    return window.location.origin
  }

  // API absoluta → quitar `/api` al final.
  const derivada = api.replace(/\/api\/?$/, '')
  return validarSocketUrl(derivada)
}

/**
 * Valida que una URL sea absoluta y parseable. Si no lo es,
 * cae al origen del navegador como red de seguridad.
 *
 * @param {string} url
 * @returns {string}
 */
function validarSocketUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Protocolo no soportado: ${parsed.protocol}`)
    }
    return parsed.origin
  } catch (err) {
    console.warn('[socket] URL inválida, usando origen del navegador:', url, err.message)
    return window.location.origin
  }
}

/**
 * Comprueba si hay un hint de sesión activa.
 * Es un flag NO sensible (no es el token). Solo se usa para
 * evitar abrir el socket cuando el usuario ni siquiera ha
 * iniciado sesión.
 *
 * @returns {boolean}
 */
function haySesionHint() {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Lee un mensaje de error legible desde cualquier throw.
 * @param {*} err
 * @returns {string}
 */
function mensajeDeError(err) {
  if (!err) return 'Error desconocido'
  if (typeof err === 'string') return err
  if (err.message) return err.message
  return String(err)
}

// ============================================================
// CHART.JS — registro global (una sola vez)
// ============================================================
try {
  Chart.register(...registerables)
} catch (err) {
  console.error('[chart.js] No se pudieron registrar los componentes:', err)
}

// ============================================================
// CREAR APP + PLUGINS
// ============================================================
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// `markRaw` en el router evita que Vue lo haga reactivo (perf).
app.config.globalProperties.$router = markRaw(router)

app.use(Toast, {
  position: 'top-right',
  timeout: 5000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: 'button',
  icon: true,
  rtl: false,
  // Accesibilidad: anuncia los toasts a lectores de pantalla.
  containerClassName: 'toast-container-a11y'
})

// ============================================================
// MANEJO GLOBAL DE ERRORES
// ============================================================

/**
 * Error handler de Vue: captura errores en render, watchers,
 * lifecycle hooks y handlers de eventos. Nunca re-lanza (evita
 * que se propague al `unhandledRejection`).
 */
app.config.errorHandler = (err, instance, info) => {
  console.error('[vue] Error capturado:', info, err)
  // Aquí podrías enviar a Sentry/LogRocket en producción.
}

// Solo en dev: warnings de Vue con contexto.
if (import.meta.env.DEV) {
  app.config.warnHandler = (msg, instance, trace) => {
    console.warn('[vue:warn]', msg, trace)
  }
}

// ============================================================
// SOCKET.IO — servicio
// ============================================================

/**
 * Crea la conexión Socket.IO (inactiva hasta que se llame `connect`).
 *
 * @returns {import('socket.io-client').Socket}
 */
function crearSocket() {
  const socketUrl = calcularSocketUrl()

  const socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true,          // cookies httpOnly viajan
    autoConnect: false,             // conectamos manualmente
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000
  })

  // ---- Logs de diagnóstico (dev) ----
  if (import.meta.env.DEV) {
    socket.on('connect', () => console.debug('[socket] ✅ conectado', socket.id))
    socket.on('disconnect', (reason) => console.debug('[socket] ⛔ desconectado:', reason))
    socket.on('connect_error', (err) => console.debug('[socket] error:', err.message))
  }

  // ---- Auth: si el backend rechaza la sesión, limpiamos el hint ----
  socket.on('connect_error', (err) => {
    if (String(err?.message || '').toLowerCase().includes('autentic')) {
      try { localStorage.removeItem(AUTH_HINT_KEY) } catch { /* noop */ }
    }
  })

  return socket
}

const socket = crearSocket()

// Conectar solo si hay hint de sesión (evita handshakes anónimos).
if (haySesionHint()) {
  socket.connect()
}

// Exponer a la app vía provide + globalProperties.
app.provide('socket', socket)
app.config.globalProperties.$socket = socket

// Limpieza: al cerrar la pestaña, desconectar el socket.
window.addEventListener('beforeunload', () => {
  try { socket.disconnect() } catch { /* noop */ }
}, { once: true })

// ============================================================
// TEMA — antes del mount (evita FOUC)
// ============================================================
try {
  const themeStore = useThemeStore()
  themeStore.aplicarTema()
} catch (err) {
  console.error('[theme] No se pudo inicializar el tema:', err)
  // Fallback: respetar preferencia del sistema.
  const prefiereOscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute('data-theme', prefiereOscuro ? 'dark' : 'light')
}

// ============================================================
// TÍTULO DINÁMICO POR RUTA
// ============================================================
router.afterEach((to) => {
  const base = to.meta?.title
  document.title = base ? `${base} — ${APP_TITLE}` : APP_TITLE
})

// ============================================================
// MOUNT
// ============================================================
try {
  performance.mark?.('app:mount:start')
  app.mount('#app')
  performance.mark?.('app:mount:end')
  performance.measure?.('app:mount', 'app:mount:start', 'app:mount:end')
} catch (err) {
  console.error('[app] Error al montar:', err)
  // Fallback visual si algo explota en el arranque.
  const root = document.getElementById('app')
  if (root) {
    root.innerHTML = `
      <div style="padding:2rem;font-family:sans-serif;text-align:center">
        <h1>No se pudo iniciar la aplicación</h1>
        <p>Recarga la página o contacta al administrador.</p>
      </div>`
  }
}

// ============================================================
// MANEJO GLOBAL DE RECHAZOS NO CAPTURADOS
// ============================================================
window.addEventListener('unhandledrejection', (event) => {
  console.error('[promise] Rechazo no capturado:', event.reason)
})

// ============================================================
// PWA — Service Worker
// ============================================================
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.ready
      console.debug('[pwa] ✅ Service Worker listo:', registro.scope)

      // Detectar nueva versión disponible → recargar al activar.
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing
        if (!nuevo) return
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'activated' && navigator.serviceWorker.controller) {
            console.debug('[pwa] 🔄 Nueva versión disponible')
          }
        })
      })
    } catch (err) {
      console.warn('[pwa] Service Worker no disponible:', err)
    }
  })
}

// ============================================================
// EXPORTS (solo para tests)
// ============================================================
export { app, socket, calcularSocketUrl, haySesionHint }