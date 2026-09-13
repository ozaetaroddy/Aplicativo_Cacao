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
const socketUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '')

const socket = io(socketUrl, {
  transports: ['websocket', 'polling'],
  withCredentials: true, // ← envía las cookies en el handshake
  autoConnect: false
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