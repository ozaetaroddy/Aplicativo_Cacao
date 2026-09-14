// src/composables/useInactivityTimeout.js
// Cierra la sesión tras N minutos de inactividad.
// ⚠️  Auth es por cookies httpOnly, NO hay token en localStorage.
// Usamos `auth_hint` (marcador no sensible) para saber si hay sesión probable.

import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { api } from '../services/api'

export function useInactivityTimeout(timeoutMinutes = 30) {
  const router = useRouter()
  const toast = useToast()
  let timer = null
  let activo = false

  const cerrarSesion = async () => {
    // 1. Invalidar refresh token en el backend
    try { await api.post('/auth/logout', {}, { skipLoader: true }) } catch (_) { /* noop */ }

    // 2. Limpiar estado local
    localStorage.removeItem('user')
    localStorage.removeItem('auth_hint')

    // 3. Limpiar cache de permisos
    try {
      const { usePermisos } = await import('./usePermisos')
      usePermisos().limpiarCache()
    } catch (_) { /* noop */ }

    // 4. Avisar y redirigir
    toast.warning(`Sesión cerrada por inactividad (${timeoutMinutes} minutos)`)
    router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
  }

  const resetTimer = () => {
    if (!activo) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(cerrarSesion, timeoutMinutes * 60 * 1000)
  }

  const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

  const startListening = () => {
    if (activo) return
    activo = true
    events.forEach(event => document.addEventListener(event, resetTimer, { passive: true }))
    resetTimer()
  }

  const stopListening = () => {
    activo = false
    events.forEach(event => document.removeEventListener(event, resetTimer))
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  onMounted(() => {
    // ✅ FIX: usar auth_hint en vez de 'token'
    if (localStorage.getItem('auth_hint')) {
      startListening()
    }
  })

  onBeforeUnmount(() => {
    stopListening()
  })

  return { resetTimer, stopListening, startListening }
}