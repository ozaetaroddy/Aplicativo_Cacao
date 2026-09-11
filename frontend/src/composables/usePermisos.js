// composables/usePermisos.js
import { ref } from 'vue'
import { api } from '../services/api'

// Cache a nivel de módulo
let permisosCache = null
let promesaCarga = null
let usuarioCacheKey = null // identificador del usuario para el que se cachearon los permisos

/**
 * Calcula una clave única para identificar al usuario
 * Si cambia, se invalida el cache
 */
function getUserKey() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (!user) return null
    return user.id || user.email || null
  } catch {
    return null
  }
}

export function usePermisos() {
  const permisos = ref(permisosCache || {})
  const rol = ref(null)
  const loading = ref(false)

  const cargarPermisos = async (forzar = false) => {
    const currentKey = getUserKey()

    // Si no hay usuario, limpiar todo
    if (!currentKey) {
      permisosCache = null
      permisos.value = {}
      rol.value = null
      usuarioCacheKey = null
      return {}
    }

    // Si el usuario cambió (distinto al cacheado), forzar recarga
    const usuarioCambio = usuarioCacheKey && usuarioCacheKey !== currentKey
    if (usuarioCambio) {
      forzar = true
    }

    // Si hay cache válido y no forzamos, devolverlo
    if (permisosCache && !forzar && usuarioCacheKey === currentKey) {
      permisos.value = permisosCache
      return { permisos: permisosCache, rol: rol.value }
    }

    // Si ya hay una petición en curso para el mismo usuario, esperarla
    if (promesaCarga && usuarioCacheKey === currentKey) {
      return promesaCarga
    }

    loading.value = true

    // Marcar el usuario del cache ANTES de la petición, para evitar condiciones de carrera
    usuarioCacheKey = currentKey

    promesaCarga = api.request('/auth/permisos', { method: 'GET' })
      .then(data => {
        // Verificar que el usuario no haya cambiado durante la petición
        if (getUserKey() !== usuarioCacheKey) {
          // El usuario cambió mientras cargábamos; descartar respuesta
          return { permisos: {}, rol: null }
        }
        permisosCache = data.permisos || {}
        permisos.value = permisosCache
        rol.value = data.rol
        return data
      })
      .catch(err => {
        console.error('Error cargando permisos:', err)
        permisosCache = null
        permisos.value = {}
        rol.value = null
        usuarioCacheKey = null
        throw err
      })
      .finally(() => {
        loading.value = false
        promesaCarga = null
      })

    return promesaCarga
  }

  /**
   * Limpia el cache. Llamar al cerrar sesión.
   */
  const limpiarCache = () => {
    permisosCache = null
    promesaCarga = null
    usuarioCacheKey = null
    permisos.value = {}
    rol.value = null
  }

  const puede = (modulo, accion = 'ver') => {
    if (!permisos.value || !permisos.value[modulo]) return false
    return permisos.value[modulo].includes(accion)
  }

  const puedeVer = (modulo) => puede(modulo, 'ver')
  const puedeCrear = (modulo) => puede(modulo, 'crear')
  const puedeEditar = (modulo) => puede(modulo, 'editar')
  const puedeEliminar = (modulo) => puede(modulo, 'eliminar')

  return {
    permisos,
    rol,
    loading,
    cargarPermisos,
    limpiarCache,
    puede,
    puedeVer,
    puedeCrear,
    puedeEditar,
    puedeEliminar
  }
}