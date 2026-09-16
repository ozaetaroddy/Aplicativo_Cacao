// composables/usePermisos.js
// ============================================================
// Cache de permisos del usuario actual.
// El backend expone `GET /api/auth/permisos` → { rol, permisos }
// donde `permisos[modulo]` es un array de acciones.
// ============================================================
'use strict'

import { ref, computed } from 'vue'
import { api } from '../services/api'

// ===== ESTADO COMPARTIDO (singleton) =====
const permisos = ref({})
const rol = ref(null)
const loading = ref(false)
const loaded = ref(false)

// ===== GUARDS INTERNOS =====
let promesaCarga = null
let abortController = null
let usuarioCacheKey = null

// ===== HELPERS =====
function getUserKey() {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const user = JSON.parse(raw)
    if (!user || typeof user !== 'object') return null
    return user.id || user.email || null
  } catch {
    return null
  }
}

/**
 * Normaliza el shape devuelto por el backend.
 * Siempre devuelve `{ [modulo]: string[] }`.
 */
function normalizarPermisos(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [modulo, acciones] of Object.entries(raw)) {
    if (!Array.isArray(acciones)) continue
    const limpias = acciones
      .filter((a) => typeof a === 'string' && a.trim())
      .map((a) => a.trim())
    if (limpias.length > 0) out[modulo] = limpias
  }
  return out
}

// ===== COMPOSABLE =====
export function usePermisos() {
  /**
   * Carga los permisos del usuario logueado.
   * Es idempotente: si ya están cargados y el usuario no cambió,
   * devuelve el cache sin hacer request.
   *
   * @param {boolean} [forzar=false]
   * @returns {Promise<{permisos: object, rol: string|null}>}
   */
  const cargarPermisos = async (forzar = false) => {
    const currentKey = getUserKey()

    // Sin usuario → limpiar y salir
    if (!currentKey) {
      limpiarCache()
      return { permisos: {}, rol: null }
    }

    // Usuario cambió → forzar recarga
    if (usuarioCacheKey && usuarioCacheKey !== currentKey) {
      forzar = true
    }

    // Cache hit válido
    if (
      !forzar &&
      usuarioCacheKey === currentKey &&
      loaded.value &&
      Object.keys(permisos.value).length > 0
    ) {
      return { permisos: permisos.value, rol: rol.value }
    }

    // Request en curso para el mismo usuario → reusar promesa
    if (promesaCarga && usuarioCacheKey === currentKey) {
      return promesaCarga
    }

    // Cancelar request previa si la había
    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
    }
    abortController = new AbortController()

    loading.value = true
    usuarioCacheKey = currentKey

    promesaCarga = api
      .request('/auth/permisos', {
        method: 'GET',
        skipLoader: true,
        signal: abortController.signal
      })
      .then((data) => {
        // El usuario pudo haber cambiado mientras esperábamos
        if (getUserKey() !== usuarioCacheKey) {
          return { permisos: {}, rol: null }
        }

        const permisosLimpios = normalizarPermisos(data?.permisos)
        permisos.value = permisosLimpios
        rol.value = data?.rol || null
        loaded.value = true

        return { permisos: permisosLimpios, rol: rol.value }
      })
      .catch((err) => {
        // Abort no es un error real
        const esAbort =
          err?.name === 'AbortError' || /aborted/i.test(err?.message || '')
        if (esAbort) return { permisos: {}, rol: null }

        console.error('Error cargando permisos:', err?.message || err)
        permisos.value = {}
        rol.value = null
        loaded.value = false
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
    loaded.value = false
    loading.value = false
    promesaCarga = null
    usuarioCacheKey = null
    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
      abortController = null
    }
  }

  /**
   * Verifica si el usuario actual puede ejecutar `accion` en `modulo`.
   * @param {string} modulo
   * @param {string} [accion='ver']
   * @returns {boolean}
   */
  const puede = (modulo, accion = 'ver') => {
    if (typeof modulo !== 'string' || !modulo) return false
    if (typeof accion !== 'string' || !accion) return false
    const acciones = permisos.value?.[modulo]
    if (!Array.isArray(acciones)) return false
    return acciones.includes(accion)
  }

  // Helpers de conveniencia — se memorizan a nivel módulo
  const puedeVer = (m) => puede(m, 'ver')
  const puedeCrear = (m) => puede(m, 'crear')
  const puedeEditar = (m) => puede(m, 'editar')
  const puedeEliminar = (m) => puede(m, 'eliminar')

  // Algunos módulos usan acciones no-estándar
  const puedeAjustar = (m) => puede(m, 'ajustar')
  const puedeAnular = (m) => puede(m, 'anular')
  const puedeExportar = (m) => puede(m, 'exportar')

  // Ref computada por conveniencia: rol actual
  const esAdmin = computed(() => rol.value === 'admin')

  return {
    // Estado
    permisos,
    rol,
    esAdmin,
    loading,
    loaded,
    // Acciones
    cargarPermisos,
    limpiarCache,
    puede,
    puedeVer,
    puedeCrear,
    puedeEditar,
    puedeEliminar,
    puedeAjustar,
    puedeAnular,
    puedeExportar
  }
}

// ---- Solo para tests ----
export const _normalizarPermisos = normalizarPermisos
export const _getUserKey = getUserKey