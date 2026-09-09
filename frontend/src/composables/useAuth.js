import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

export function useAuth() {
  const router = useRouter()
  const token = ref(localStorage.getItem('token'))
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.rol === 'admin')

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    token.value = null
    user.value = null
    router.push('/login')
  }

  const setAuth = (newToken, newUser) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    token.value = newToken
    user.value = newUser
  }

  const updateUser = (newUserData) => {
    const updated = { ...user.value, ...newUserData }
    localStorage.setItem('user', JSON.stringify(updated))
    user.value = updated
  }

  return { token, user, isAuthenticated, isAdmin, logout, setAuth, updateUser }
}