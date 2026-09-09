import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'

export function useInactivityTimeout(timeoutMinutes = 30) {
  const router = useRouter()
  const toast = useToast()
  let timer = null

  const resetTimer = () => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      // Cerrar sesión por inactividad
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      toast.warning('Sesión cerrada por inactividad (30 minutos)')
      router.push('/login')
    }, timeoutMinutes * 60 * 1000)
  }

  const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

  const startListening = () => {
    events.forEach(event => document.addEventListener(event, resetTimer))
    resetTimer()
  }

  const stopListening = () => {
    events.forEach(event => document.removeEventListener(event, resetTimer))
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  onMounted(() => {
    // Solo aplicar si hay token (usuario autenticado)
    if (localStorage.getItem('token')) {
      startListening()
    }
  })

  onBeforeUnmount(() => {
    stopListening()
  })

  return { resetTimer, stopListening }
}