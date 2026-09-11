import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePermisos } from './usePermisos'

export function useAuth() {
  const router = useRouter()
  const token = ref(localStorage.getItem('token'))
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.rol === 'admin')

  const logout = () => {
    // Limpiar TODO: token, usuario, cache de permisos y de catálogos
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    token.value = null
    user.value = null

    // Limpiar cache de permisos para que no se reutilice con otro usuario
    try {
      const { limpiarCache } = usePermisos()
      limpiarCache()
    } catch (e) {
      // Ignorar errores si Pinia aún no está listo
    }

    router.push('/login')
  }

  const setAuth = (newToken, newUser) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    token.value = newToken
    user.value = newUser
  }

  const updateUser = (newUserData) => {
    const updated = { ...(user.value || {}), ...newUserData }
    localStorage.setItem('user', JSON.stringify(updated))
    user.value = updated
  }

  /**
   * Refresca los datos del usuario desde el backend (sincroniza el rol)
   */
  const refreshUser = async () => {
    if (!token.value) return
    try {
      const { api } = await import('../services/api')
      const data = await api.request('/auth/perfil', { method: 'GET' })
      const userData = {
        id: data._id,
        nombre: data.nombre,
        email: data.email,
        rol: data.rol,
        telefono: data.telefono || ''
      }
      localStorage.setItem('user', JSON.stringify(userData))
      user.value = userData
    } catch (e) {
      console.warn('No se pudo refrescar el usuario:', e.message)
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    isAdmin,
    logout,
    setAuth,
    updateUser,
    refreshUser
  }
}