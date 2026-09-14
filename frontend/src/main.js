// frontend/src/main.js
import { createApp } from 'vue'
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
// CHART.JS: registrar UNA sola vez
// ============================================================
Chart.register(...registerables)

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

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
  rtl: false
})

// ============================================================
// SOCKET.IO con cookies httpOnly
// ============================================================
// ✅ FIX: si VITE_SOCKET_URL está definido, usarlo. Si no, derivarlo
// del API_BASE_URL quitando el sufijo /api. NUNCA usar string vacío.
function calcularSocketUrl() {
  const explicit = (import.meta.env.VITE_SOCKET_URL || '').trim()
  if (explicit) return explicit

  const api = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (!api) {
    // Fallback dev
    return `${window.location.protocol}//${window.location.hostname}:5000`
  }

  // Si es relativo (/api), no podemos derivar un host absoluto del backend.
  // En ese caso usar el mismo origen del navegador (funciona si el rewrite
  // de Vercel también proxea WebSocket, que NO es el caso típico).
  if (api.startsWith('/')) {
    return window.location.origin
  }

  // URL absoluta: quitar /api al final
  return api.replace(/\/api\/?$/, '')
}

const socketUrl = calcularSocketUrl()

const socket = io(socketUrl, {
  transports: ['websocket', 'polling'],
  withCredentials: true,
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000
})

// Conectar solo si hay hint de sesión
if (localStorage.getItem('auth_hint')) {
  socket.connect()
}

app.provide('socket', socket)
app.config.globalProperties.$socket = socket

// ============================================================
// TEMA
// ============================================================
const themeStore = useThemeStore()
themeStore.aplicarTema()

app.mount('#app')

document.title = 'Sistema Contable'

// ============================================================
// PWA
// ============================================================
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.ready.then(() => {
      console.log('✅ PWA lista')
    })
  })
}