// src/composables/useInactivityTimeout.js
// ============================================================
// Cierra la sesión tras N minutos de inactividad.
// ⚠️  Auth es por cookies httpOnly, NO hay token en localStorage.
// Usamos `auth_hint` (marcador no sensible) para saber si hay sesión.
// ============================================================
'use strict'

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { api } from '../services/api'

// ===== CONSTANTES =====
const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'wheel',
  'pointerdown'
]

const BROADCAST_CHANNEL = 'inactivity'

// ===== COMPOSABLE =====
export function useInactivityTimeout(timeoutMinutes = 30) {
  const router = useRouter()
  const toast = useToast()

  // ===== STATE =====
  const isActive = ref(false)

  // ===== GUARDS =====
  let timer = null
  let channel = null
  let cerrandoSesion = false

  // ===== BROADCAST A OTRAS PESTAÑAS =====
  const initChannel = () => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) return null
    if (channel) return channel
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL)
      channel.addEventListener('message', (ev) => {
        // Si otra pestaña detectó actividad, reseteamos este timer también
        if (ev?.data?.type === 'activity') resetTimer()
      })
    } catch {
      channel = null
    }
    return channel
  }

  const broadcastActivity = () => {
    if (!channel) return
    try { channel.postMessage({ type: 'activity' }) } catch { /* noop */ }
  }

  // ===== CERRAR SESIÓN =====
  const cerrarSesion = async () => {
    if (cerrandoSesion) return
    cerrandoSesion = true

    // 1. Invalidar refresh token en el backend
    try {
      await api.request('/auth/logout', {
        method: 'POST',
        skipLoader: true
      })
    } catch { /* noop */ }

    // 2. Limpiar estado local
    try {
      localStorage.removeItem('user')
      localStorage.removeItem('auth_hint')
    } catch { /* noop */ }

    // 3. Limpiar cache de permisos
    try {
      const { usePermisos } = await import('./usePermisos')
      usePermisos().limpiarCache()
    } catch { /* noop */ }

    // 4. Avisar al usuario
    try {
      toast.warning(`Sesión cerrada por inactividad (${timeoutMinutes} minutos)`)
    } catch { /* noop */ }

    // 5. Redirigir con `redirect` a la ruta actual (si podemos leerla)
    try {
      const current = router.currentRoute?.value
      const redirect = current?.fullPath && current.fullPath !== '/login'
        ? current.fullPath
        : undefined

      router.push(redirect ? { path: '/login', query: { redirect } } : '/login')
    } catch {
      try { router.push('/login') } catch { /* noop */ }
    }

    cerrandoSesion = false
  }

  // ===== TIMER =====
  const resetTimer = () => {
    if (!isActive.value) return
    if (timer) clearTimeout(timer)

    const ms = Math.max(1, Number(timeoutMinutes)) * 60 * 1000
    timer = setTimeout(cerrarSesion, ms)
  }

  // ===== LISTENERS =====
  const handleActivity = () => {
    resetTimer()
    broadcastActivity()
  }

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Al volver a la pestaña, reseteamos el timer
      resetTimer()
    }
  }

  const startListening = () => {
    if (isActive.value) return
    isActive.value = true

    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, handleActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', handleVisibility)

    resetTimer()
    initChannel()
  }

  const stopListening = () => {
    isActive.value = false

    for (const ev of ACTIVITY_EVENTS) {
      document.removeEventListener(ev, handleActivity)
    }
    document.removeEventListener('visibilitychange', handleVisibility)

    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const pausar = () => stopListening()
  const reanudar = () => {
    // Solo reanudar si hay sesión probable
    if (localStorage.getItem('auth_hint')) startListening()
  }

  // ===== LIFECYCLE =====
  onMounted(() => {
    if (localStorage.getItem('auth_hint')) {
      startListening()
    }
  })

  onBeforeUnmount(() => {
    stopListening()
    if (channel) {
      try { channel.close() } catch { /* noop */ }
      channel = null
    }
  })

  return {
    isActive,
    resetTimer,
    startListening,
    stopListening,
    pausar,
    reanudar
  }
}