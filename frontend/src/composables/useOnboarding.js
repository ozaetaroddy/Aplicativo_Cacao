// src/composables/useOnboarding.js
// Composable para gestionar el tour de bienvenida (onboarding).
// Persiste el estado en localStorage por usuario.
// ============================================================
'use strict'

import { ref, computed } from 'vue'

// ===== CONSTANTES =====
const STORAGE_KEY = 'onboarding_completed_v3'
const DISMISSED_KEY = 'onboarding_dismissed_until_v3'
const DISMISS_DAYS = 7

// ===== ESTADO COMPARTIDO (singleton a nivel de módulo) =====
const active = ref(false)
const currentStep = ref(0)
const steps = ref([])
const isFirstTime = ref(false)

// ===== HELPERS DE STORAGE =====
/**
 * Acceso seguro a localStorage. Devuelve null si no está disponible
 * (incógnito estricto, políticas de cookies, etc).
 */
function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function getUserKey() {
  try {
    const raw = storageGet('user')
    if (!raw) return 'anon'
    const user = JSON.parse(raw)
    if (!user || typeof user !== 'object') return 'anon'
    return user.id || user.email || 'anon'
  } catch {
    return 'anon'
  }
}

function storageKeyFor(key) {
  return `${key}:${getUserKey()}`
}

function yaCompleto() {
  return storageGet(storageKeyFor(STORAGE_KEY)) === 'true'
}

function fueDescartadoRecientemente() {
  const raw = storageGet(storageKeyFor(DISMISSED_KEY))
  if (!raw) return false
  const until = parseInt(raw, 10)
  if (!Number.isFinite(until)) return false
  return Date.now() < until
}

/**
 * Marca/desmarca la clase global en `<html>` que algunos CSS
 * usan para deshabilitar scroll del body, etc.
 */
function setTourActiveClass(activo) {
  if (typeof document === 'undefined') return
  try {
    if (activo) document.documentElement.classList.add('tour-active')
    else document.documentElement.classList.remove('tour-active')
  } catch { /* noop */ }
}

// ===== COMPOSABLE =====
export function useOnboarding() {
  const totalSteps = computed(() => steps.value.length)
  const isLastStep = computed(
    () => totalSteps.value > 0 && currentStep.value === totalSteps.value - 1
  )
  const isFirstStep = computed(() => currentStep.value === 0)
  const progress = computed(() => {
    if (totalSteps.value === 0) return 0
    return ((currentStep.value + 1) / totalSteps.value) * 100
  })

  /**
   * Inicia el tour.
   * @param {Array} pasos - [{ target, title, description, position?, spotlightPadding? }]
   * @param {Object} [opts]
   * @param {boolean} [opts.force=false]  Ignora localStorage
   * @returns {boolean} `true` si el tour arrancó
   */
  const iniciar = (pasos, { force = false } = {}) => {
    if (!Array.isArray(pasos) || pasos.length === 0) return false
    if (active.value && !force) return false
    if (!force && (yaCompleto() || fueDescartadoRecientemente())) return false

    // Normalizar cada paso con defaults seguros
    steps.value = pasos.map((p) => ({
      target: typeof p?.target === 'string' ? p.target : null,
      title: String(p?.title || ''),
      description: String(p?.description || ''),
      bullets: Array.isArray(p?.bullets) ? [...p.bullets] : [],
      icon: typeof p?.icon === 'string' ? p.icon : null,
      position: ['top', 'bottom', 'left', 'right'].includes(p?.position)
        ? p.position
        : 'bottom',
      spotlightPadding:
        Number.isFinite(p?.spotlightPadding) && p.spotlightPadding >= 0
          ? p.spotlightPadding
          : 8
    }))

    currentStep.value = 0
    active.value = true
    setTourActiveClass(true)
    return true
  }

  const siguiente = () => {
    if (!active.value) return
    if (isLastStep.value) {
      completar()
      return
    }
    currentStep.value++
  }

  const anterior = () => {
    if (!active.value) return
    if (currentStep.value > 0) currentStep.value--
  }

  const irA = (idx) => {
    const n = Number(idx)
    if (!Number.isInteger(n)) return
    if (n < 0 || n >= totalSteps.value) return
    currentStep.value = n
  }

  /**
   * El usuario completó el tour (llegó al final).
   * No volverá a mostrarse nunca (a menos que se resetee).
   */
  const completar = () => {
    active.value = false
    currentStep.value = 0
    setTourActiveClass(false)
    storageSet(storageKeyFor(STORAGE_KEY), 'true')
    // Limpiar dismissed por si acaso
    storageRemove(storageKeyFor(DISMISSED_KEY))
    isFirstTime.value = false
  }

  /**
   * El usuario descartó el tour. No volver a mostrarlo por 7 días.
   */
  const descartar = () => {
    active.value = false
    currentStep.value = 0
    setTourActiveClass(false)
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
    storageSet(storageKeyFor(DISMISSED_KEY), String(until))
    isFirstTime.value = false
  }

  /**
   * Resetea el tour por completo. La próxima vez que se llame a
   * `verificarPrimeraVez()` dirá que sí es la primera vez.
   */
  const reiniciar = () => {
    storageRemove(storageKeyFor(STORAGE_KEY))
    storageRemove(storageKeyFor(DISMISSED_KEY))
    isFirstTime.value = true
  }

  /**
   * Consulta si es la primera vez.
   * @param {boolean} [force]  Fuerza el valor a `true` (útil tras reiniciar)
   */
  const verificarPrimeraVez = (force = false) => {
    const primera = force ? true : !yaCompleto() && !fueDescartadoRecientemente()
    isFirstTime.value = primera
    return primera
  }

  return {
    // Estado
    active,
    currentStep,
    steps,
    isFirstTime,
    // Computed
    totalSteps,
    isLastStep,
    isFirstStep,
    progress,
    // Acciones
    iniciar,
    siguiente,
    anterior,
    irA,
    completar,
    descartar,
    reiniciar,
    verificarPrimeraVez
  }
}

// ---- Solo para tests ----
export const _storageKeyFor = storageKeyFor
export const _yaCompleto = yaCompleto
export const _fueDescartadoRecientemente = fueDescartadoRecientemente