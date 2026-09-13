// frontend/src/composables/useAuth.js
// Autenticación basada en cookies httpOnly (sin token en localStorage).
// El token real vive en la cookie `sc_at` inaccesible desde JS.

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { usePermisos } from './usePermisos'

const USER_KEY = 'user'
const HINT_KEY = 'auth_hint'

export function useAuth() {
  const router = useRouter()
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.rol === 'admin')

  const logout = async () => {
    // 1. Invalidar refresh token en el backend
    try {
      await api.post('/auth/logout', {}, { skipLoader: true })
    } catch (_) { /* seguimos con el logout local */ }

    // 2. Limpiar estado local
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(HINT_KEY)
    user.value = null

    // 3. Limpiar cache de permisos
    try { usePermisos().limpiarCache() } catch (_) { /* noop */ }

    // 4. Redirigir
    router.push('/login')
  }

  const setUser = (newUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    localStorage.setItem(HINT_KEY, '1')
    user.value = newUser
  }

  const updateUser = (newUserData) => {
    const updated = { ...(user.value || {}), ...newUserData }
    localStorage.setItem(USER_KEY, JSON.stringify(updated))
    user.value = updated
  }

  /**
   * Refresca los datos del usuario desde el backend (sincroniza rol, nombre, etc).
   * Si el backend devuelve 401, cierra la sesión automáticamente.
   */
  const refreshUser = async () => {
    try {
      const data = await api.get('/auth/perfil', { skipLoader: true })
      const userData = {
        id: data._id,
        nombre: data.nombre,
        email: data.email,
        rol: data.rol,
        telefono: data.telefono || ''
      }
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
      user.value = userData
      return userData
    } catch (e) {
      console.warn('No se pudo refrescar el usuario:', e.message)
      if (/sesión|expirada|401/i.test(e.message)) {
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(HINT_KEY)
        user.value = null
      }
      return null
    }
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    logout,
    setUser,
    updateUser,
    refreshUser
  }
}