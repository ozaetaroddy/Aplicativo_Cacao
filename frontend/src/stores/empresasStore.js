// stores/empresasStore.js
// ============================================================
// Store de empresas del usuario logueado.
// ------------------------------------------------------------
// - Cache en memoria (sin TTL, se refresca bajo demanda)
// - Dedupe de cargas concurrentes
// - Persiste la empresa activa en `services/empresaActiva.js`
// ============================================================
'use strict'

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../services/api'
import {
  getEmpresaId,
  setEmpresaId,
  clearEmpresaId
} from '../services/empresaActiva'

// ===== GUARDS A NIVEL DE MÓDULO =====
let promesaCarga = null
let abortController = null

export const useEmpresasStore = defineStore('empresas', () => {
  // ===== STATE =====
  const empresas = ref([])
  const empresaActivaId = ref(getEmpresaId())
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref(null)

  // ===== GETTERS =====
  const tieneEmpresas = computed(() => empresas.value.length > 0)
  const multiplesEmpresas = computed(() => empresas.value.length > 1)

  const empresaActiva = computed(() => {
    if (!empresaActivaId.value) return null
    return (
      empresas.value.find((e) => String(e._id) === String(empresaActivaId.value)) ||
      null
    )
  })

  const empresaActivaNombre = computed(() => {
    const e = empresaActiva.value
    if (!e) return null
    return e.nombre_comercial || e.razon_social || e.ruc || 'Empresa'
  })

  // ===== ACCIONES =====

  /**
   * Carga la lista de empresas del usuario.
   * Idempotente: si ya están cargadas y no se fuerza, no hace request.
   *
   * @param {boolean} [forzar=false]
   */
  const cargarEmpresas = async (forzar = false) => {
    if (!forzar && loaded.value && empresas.value.length > 0) {
      return empresas.value
    }
    if (promesaCarga && !forzar) return promesaCarga

    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
    }
    abortController = new AbortController()

    loading.value = true
    error.value = null

    promesaCarga = api
      .request('/empresas', {
        method: 'GET',
        skipLoader: true,
        signal: abortController.signal
      })
      .then((data) => {
        const arr = Array.isArray(data) ? data : (data?.data || [])
        empresas.value = arr
        loaded.value = true

        // Si la empresa activa ya no existe en la lista → limpiarla
        if (
          empresaActivaId.value &&
          !arr.some((e) => String(e._id) === String(empresaActivaId.value))
        ) {
          activarEmpresaLocal(null)
        }

        return arr
      })
      .catch((e) => {
        const esAbort = e?.name === 'AbortError' || /aborted/i.test(e?.message || '')
        if (esAbort) return empresas.value
        error.value = e?.message || 'Error cargando empresas'
        throw e
      })
      .finally(() => {
        loading.value = false
        promesaCarga = null
      })

    return promesaCarga
  }

  /**
   * Activa una empresa (solo estado local + persistencia).
   * NO llama al backend — para eso usar `activarEmpresa()`.
   */
  const activarEmpresaLocal = (id) => {
    empresaActivaId.value = id ? String(id) : null
    setEmpresaId(empresaActivaId.value)
  }

  /**
   * Activa una empresa y notifica al backend.
   * @param {string} id
   */
  const activarEmpresa = async (id) => {
    if (!id) throw new Error('activarEmpresa requiere un id')
    await api.request(`/empresas/${id}/activar`, {
      method: 'POST',
      skipLoader: true
    })
    activarEmpresaLocal(id)
  }

  /**
   * Crea una empresa nueva.
   * @param {object} payload
   */
  const crearEmpresa = async (payload) => {
    const res = await api.request('/empresas', {
      method: 'POST',
      body: JSON.stringify(payload),
      loaderMessage: 'Creando empresa...'
    })
    // Insertar al principio y actualizar cache
    if (res && res._id) {
      empresas.value = [res, ...empresas.value]
    }
    loaded.value = true
    return res
  }

  /**
   * Actualiza una empresa.
   */
  const actualizarEmpresa = async (id, payload) => {
    const res = await api.request(`/empresas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      loaderMessage: 'Actualizando empresa...'
    })
    const idx = empresas.value.findIndex((e) => String(e._id) === String(id))
    if (idx !== -1) {
      empresas.value[idx] = { ...empresas.value[idx], ...res }
    }
    return res
  }

  /**
   * Elimina una empresa.
   * Si era la activa, limpia la activa.
   */
  const eliminarEmpresa = async (id) => {
    await api.request(`/empresas/${id}`, {
      method: 'DELETE',
      loaderMessage: 'Eliminando empresa...'
    })
    empresas.value = empresas.value.filter((e) => String(e._id) !== String(id))
    if (String(empresaActivaId.value) === String(id)) {
      activarEmpresaLocal(null)
    }
  }

  /**
   * Limpia todo el estado. Llamar en logout.
   */
  const limpiar = () => {
    empresas.value = []
    loaded.value = false
    error.value = null
    activarEmpresaLocal(null)
    clearEmpresaId()

    if (abortController) {
      try { abortController.abort() } catch { /* noop */ }
      abortController = null
    }
    promesaCarga = null
  }

  return {
    // State
    empresas,
    empresaActivaId,
    loading,
    loaded,
    error,
    // Getters
    tieneEmpresas,
    multiplesEmpresas,
    empresaActiva,
    empresaActivaNombre,
    // Acciones
    cargarEmpresas,
    activarEmpresa,
    activarEmpresaLocal,
    crearEmpresa,
    actualizarEmpresa,
    eliminarEmpresa,
    limpiar
  }
})