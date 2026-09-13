// src/composables/useOnboarding.js
// Composable para gestionar el tour de bienvenida (onboarding).
// Persiste el estado en localStorage por usuario.

import { ref, computed } from 'vue'

const STORAGE_KEY = 'onboarding_completed_v3'
const DISMISSED_KEY = 'onboarding_dismissed_until_v3'

// Estado compartido (singleton a nivel de módulo)
const active = ref(false)
const currentStep = ref(0)
const steps = ref([])
const isFirstTime = ref(false)

function getUserKey() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    return user?.id || user?.email || 'anon'
  } catch {
    return 'anon'
  }
}

function storageKeyFor(key) {
  return `${key}:${getUserKey()}`
}

function yaCompleto() {
  return localStorage.getItem(storageKeyFor(STORAGE_KEY)) === 'true'
}

function fueDescartadoRecientemente() {
  const until = localStorage.getItem(storageKeyFor(DISMISSED_KEY))
  if (!until) return false
  return Date.now() < parseInt(until, 10)
}

export function useOnboarding() {
  const totalSteps = computed(() => steps.value.length)
  const isLastStep = computed(() => currentStep.value === totalSteps.value - 1)
  const isFirstStep = computed(() => currentStep.value === 0)
  const progress = computed(() =>
    totalSteps.value === 0 ? 0 : ((currentStep.value + 1) / totalSteps.value) * 100
  )

  /**
   * Inicia el tour con los pasos dados.
   * @param {Array} pasos - [{ target, title, description, position?, spotlightPadding? }]
   * @param {Object} opts - { force?: boolean }
   */
  const iniciar = (pasos, { force = false } = {}) => {
    if (!force && (yaCompleto() || fueDescartadoRecientemente())) return false
    steps.value = pasos
    currentStep.value = 0
    active.value = true
    document.documentElement.classList.add('tour-active')
    return true
  }

  const siguiente = () => {
    if (isLastStep.value) return completar()
    currentStep.value++
  }

  const anterior = () => {
    if (currentStep.value > 0) currentStep.value--
  }

  const irA = (idx) => {
    if (idx >= 0 && idx < totalSteps.value) currentStep.value = idx
  }

  const completar = () => {
    active.value = false
    currentStep.value = 0
    document.documentElement.classList.remove('tour-active')
    localStorage.setItem(storageKeyFor(STORAGE_KEY), 'true')
  }

  const descartar = () => {
    active.value = false
    currentStep.value = 0
    document.documentElement.classList.remove('tour-active')
    // No volver a mostrar por 7 días
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000
    localStorage.setItem(storageKeyFor(DISMISSED_KEY), String(until))
  }

  const reiniciar = () => {
    localStorage.removeItem(storageKeyFor(STORAGE_KEY))
    localStorage.removeItem(storageKeyFor(DISMISSED_KEY))
    isFirstTime.value = true
  }

  const verificarPrimeraVez = () => {
    const primera = !yaCompleto() && !fueDescartadoRecientemente()
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