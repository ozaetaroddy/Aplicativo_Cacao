// composables/usePermisos.js
import { ref } from 'vue'
import { api } from '../services/api'

// ============================================================
// ESTADO COMPARTIDO (singleton)
// Todas las llamadas a usePermisos() usan las MISMAS refs.
// ============================================================
const permisos = ref({})
const rol = ref(null)
const loading = ref(false)

// Variables internas del módulo
let promesaCarga = null
let usuarioCacheKey = null

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
  const cargarPermisos = async (forzar = false) => {
    const currentKey = getUserKey()

    // Si no hay usuario logueado, limpiar y salir
    if (!currentKey) {
      limpiarCache()
      return {}
    }

    // Si el usuario cambió, forzar recarga
    if (usuarioCacheKey && usuarioCacheKey !== currentKey) {
      forzar = true
    }

    // Si ya tenemos permisos cargados para este usuario, devolverlos
    if (!forzar && usuarioCacheKey === currentKey && Object.keys(permisos.value).length > 0) {
      return { permisos: permisos.value, rol: rol.value }
    }

    // Si ya hay una petición en curso para el mismo usuario, esperarla
    if (promesaCarga && usuarioCacheKey === currentKey) {
      return promesaCarga
    }

    loading.value = true
    usuarioCacheKey = currentKey

    promesaCarga = api.request('/auth/permisos', { method: 'GET' })
      .then(data => {
        // Verificar que el usuario no haya cambiado mientras esperábamos
        if (getUserKey() !== usuarioCacheKey) {
          return { permisos: {}, rol: null }
        }
        permisos.value = data.permisos || {}
        rol.value = data.rol || null
        return data
      })
      .catch(err => {
        console.error('Error cargando permisos:', err)
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

  const limpiarCache = () => {
    permisos.value = {}
    rol.value = null
    promesaCarga = null
    usuarioCacheKey = null
  }

  const puede = (modulo, accion = 'ver') => {
    if (!permisos.value || !permisos.value[modulo]) return false
    return permisos.value[modulo].includes(accion)
  }

  return {
    // Estado compartido (refs únicas del módulo)
    permisos,
    rol,
    loading,
    // Acciones
    cargarPermisos,
    limpiarCache,
    puede,
    puedeVer: (m) => puede(m, 'ver'),
    puedeCrear: (m) => puede(m, 'crear'),
    puedeEditar: (m) => puede(m, 'editar'),
    puedeEliminar: (m) => puede(m, 'eliminar')
  }
}