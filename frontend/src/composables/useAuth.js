// frontend/src/composables/useAuth.js
// ============================================================
// Autenticación basada en cookies httpOnly (sin token en localStorage).
// El token real vive en la cookie `sc_at` inaccesible desde JS.
// ============================================================
'use strict'

import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { usePermisos } from './usePermisos'

// ===== CONSTANTES =====
const USER_KEY = 'user'
const HINT_KEY = 'auth_hint'
const BROADCAST_CHANNEL = 'auth'

// ===== ESTADO COMPARTIDO (singleton) =====
const user = ref(_leerUsuario())

// ===== HELPERS DE STORAGE =====
function _leerUsuario() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function _escribirUsuario(u) {
  try {
    if (u === null) {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(HINT_KEY)
    } else {
      localStorage.setItem(USER_KEY, JSON.stringify(u))
      localStorage.setItem(HINT_KEY, '1')
    }
  } catch { /* noop */ }
}

// ===== BROADCAST A OTRAS PESTAÑAS =====
let channel = null
function getChannel() {
  if (typeof window === 'undefined' || !window.BroadcastChannel) return null
  if (!channel) {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL)
      channel.addEventListener('message', (ev) => {
        if (ev?.data?.type === 'logout') {
          user.value = null
          try {
            usePermisos().limpiarCache()
          } catch { /* noop */ }
        } else if (ev?.data?.type === 'login') {
          user.value = _leerUsuario()
        }
      })
    } catch {
      channel = null
    }
  }
  return channel
}

function broadcast(type) {
  const ch = getChannel()
  if (ch) {
    try { ch.postMessage({ type }) } catch { /* noop */ }
  }
}

// ===== COMPOSABLE =====
export function useAuth() {
  // El router se obtiene perezosamente para no romper fuera de setup
  let _router = null
  const getRouter = () => {
    if (_router) return _router
    try {
      _router = useRouter()
    } catch {
      _router = null
    }
    return _router
  }

  const isAuthenticated = computed(() => Boolean(user.value))
  const isAdmin = computed(() => user.value?.rol === 'admin')

  // ===== LOGOUT =====
  let logoutEnCurso = false

  const logout = async ({ silent = false } = {}) => {
    if (logoutEnCurso) return
    logoutEnCurso = true

    // 1. Invalidar refresh token en el backend
    try {
      await api.request('/auth/logout', {
        method: 'POST',
        skipLoader: true
      })
    } catch {
      /* seguimos con el logout local aunque el server falle */
    }

    // 2. Limpiar estado local
    _escribirUsuario(null)
    user.value = null

    // 3. Limpiar cache de permisos
    try {
      usePermisos().limpiarCache()
    } catch { /* noop */ }

    // 4. Avisar a otras pestañas
    broadcast('logout')

    // 5. Redirigir
    if (!silent) {
      const router = getRouter()
      if (router) {
        try {
          router.push('/login')
        } catch { /* noop */ }
      }
    }

    logoutEnCurso = false
  }

  // ===== SET USER (después del login) =====
  const setUser = (newUser) => {
    if (!newUser || typeof newUser !== 'object') return
    _escribirUsuario(newUser)
    user.value = newUser
    broadcast('login')
  }

  // ===== UPDATE USER (merge parcial) =====
  const updateUser = (patch) => {
    if (!patch || typeof patch !== 'object') return
    const updated = { ...(user.value || {}), ...patch }
    _escribirUsuario(updated)
    user.value = updated
  }

  // ===== REFRESH USER =====
  const refreshUser = async () => {
    try {
      const data = await api.request('/auth/perfil', {
        method: 'GET',
        skipLoader: true
      })

      if (!data) return null

      const userData = {
        id: data._id || data.id,
        nombre: data.nombre,
        email: data.email,
        rol: data.rol,
        telefono: data.telefono || ''
      }

      _escribirUsuario(userData)
      user.value = userData
      return userData
    } catch (e) {
      const codigo = e?.codigo || e?.code || ''
      const status = e?.status
      const msg = String(e?.message || '')

      // Detectar cualquier error de sesión inválida
      const esSesionInvalida =
        status === 401 ||
        ['NO_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_MALFORMED',
         'PASSWORD_CHANGED', 'USER_NOT_FOUND', 'USER_INACTIVE'].includes(codigo) ||
        /sesión|expirada|token/i.test(msg)

      if (esSesionInvalida) {
        _escribirUsuario(null)
        user.value = null
        try {
          usePermisos().limpiarCache()
        } catch { /* noop */ }
      } else {
        console.warn('No se pudo refrescar el usuario:', msg)
      }

      return null
    }
  }

  // ===== SINCRONIZAR ENTRE PESTAÑAS =====
  // Escuchamos cambios de `storage` (fallback de BroadcastChannel)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (ev) => {
      if (ev.key === USER_KEY) {
        user.value = _leerUsuario()
      }
    })
    getChannel() // inicializar
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

// ---- Solo para tests ----
export const _leerUsuario = _leerUsuario
