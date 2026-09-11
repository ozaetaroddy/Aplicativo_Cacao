// composables/usePermisos.js
import { ref, computed } from 'vue'
import { api } from '../services/api'

// Cache a nivel de módulo
let permisosCache = null
let promesaCarga = null

export function usePermisos() {
  const permisos = ref(permisosCache || {})
  const rol = ref(null)
  const loading = ref(false)

  const cargarPermisos = async (forzar = false) => {
    if (permisosCache && !forzar) {
      permisos.value = permisosCache
      return permisosCache
    }
    if (promesaCarga) return promesaCarga

    loading.value = true
    promesaCarga = api.request('/auth/permisos', { method: 'GET' })
      .then(data => {
        permisosCache = data.permisos || {}
        permisos.value = permisosCache
        rol.value = data.rol
        return data
      })
      .catch(err => {
        console.error('Error cargando permisos:', err)
        throw err
      })
      .finally(() => {
        loading.value = false
        promesaCarga = null
      })

    return promesaCarga
  }

  /**
   * Verifica si el usuario actual tiene un permiso
   * @param {string} modulo - ej: 'ventas', 'clientes'
   * @param {string} accion - ej: 'ver', 'crear', 'editar', 'eliminar'
   */
  const puede = (modulo, accion = 'ver') => {
    if (!permisos.value || !permisos.value[modulo]) return false
    return permisos.value[modulo].includes(accion)
  }

  const puedeVer = (modulo) => puede(modulo, 'ver')
  const puedeCrear = (modulo) => puede(modulo, 'crear')
  const puedeEditar = (modulo) => puede(modulo, 'editar')
  const puedeEliminar = (modulo) => puede(modulo, 'eliminar')

  const esAdmin = computed(() => rol.value === 'admin')

  return {
    permisos,
    rol,
    loading,
    cargarPermisos,
    puede,
    puedeVer,
    puedeCrear,
    puedeEditar,
    puedeEliminar,
    esAdmin
  }
}