// stores/configStore.js
// ============================================================
// Configuración de la empresa.
// ------------------------------------------------------------
// Prioridad:
//   1. localStorage (cambios en runtime)          ← más reciente
//   2. Variables de entorno VITE_*                ← valores de build
//   3. Fallbacks hardcodeados                     ← últimos recursos
//
// Cambios en runtime se persisten en localStorage y se validan
// antes de aplicarse.
// ============================================================
'use strict'

import { defineStore } from 'pinia'

// ===== CONSTANTES =====
const STORAGE_KEY = 'config_empresa_v1'

// ===== HELPERS DE ENV =====
/**
 * Lee un número desde env con fallback, SIN el bug de `|| fallback`
 * (que convierte el 0 en el fallback).
 */
function envNum(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Lee un string desde env con fallback y trim.
 */
function envStr(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback
  return String(raw).trim() || fallback
}

// ===== VALORES POR DEFECTO (mezcla env + fallback) =====
function valoresPorDefecto() {
  return {
    companyName: envStr(
      import.meta.env.VITE_COMPANY_NAME,
      "System Ozaet's Electronics"
    ),
    // 🐛 BUG FIX: antes era `parseFloat(x) || 15`, que convertía "0" → 15.
    //   Ahora `envNum("0", 15)` devuelve correctamente 0.
    ivaPercentage: envNum(import.meta.env.VITE_IVA_PERCENTAGE, 15),
    // 🐛 BUG FIX: RUC default vacío en vez de "1234567890001" inválido.
    ruc: envStr(import.meta.env.VITE_COMPANY_RUC, ''),
    phone: envStr(import.meta.env.VITE_COMPANY_PHONE, ''),
    address: envStr(import.meta.env.VITE_COMPANY_ADDRESS, 'Quito, Ecuador'),
    email: envStr(import.meta.env.VITE_COMPANY_EMAIL, 'info@ozaet.com')
  }
}

// ===== STORAGE SEGURO =====
function leerStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function escribirStorage(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch { /* noop */ }
}

// ===== VALIDACIÓN =====
const CAMPOS_TEXTO = Object.freeze([
  'companyName',
  'ruc',
  'phone',
  'address',
  'email'
])

function validarConfig(payload = {}) {
  const out = {}

  // Textos: trim + slice
  for (const campo of CAMPOS_TEXTO) {
    if (payload[campo] !== undefined) {
      out[campo] = String(payload[campo] ?? '').trim().slice(0, 500)
    }
  }

  // IVA: número entre 0 y 100
  if (payload.ivaPercentage !== undefined) {
    const n = Number(payload.ivaPercentage)
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      // Redondear a 2 decimales (evita 14.999999)
      out.ivaPercentage = Math.round((n + Number.EPSILON) * 100) / 100
    }
  }

  return out
}

// ===== ESTADO INICIAL =====
function estadoInicial() {
  const defaults = valoresPorDefecto()
  const stored = leerStorage()
  if (!stored) return defaults

  // Merge: stored overrides defaults, todo validado
  return { ...defaults, ...validarConfig(stored) }
}

// ===== STORE =====
export const useConfigStore = defineStore('config', {
  state: () => estadoInicial(),

  getters: {
    companyInfo: (state) => ({
      name: state.companyName,
      ruc: state.ruc,
      phone: state.phone,
      address: state.address,
      email: state.email
    }),

    /**
     * ¿La empresa tiene un RUC cargado?
     */
    tieneRuc: (state) => String(state.ruc || '').length === 13,

    /**
     * IVA como decimal para cálculos (15 → 0.15).
     */
    ivaDecimal: (state) => Number(state.ivaPercentage) / 100
  },

  actions: {
    /**
     * Actualiza campos de configuración validados.
     * @param {object} payload  Campos a actualizar
     * @returns {object}  Campos realmente aplicados
     */
    updateConfig(payload = {}) {
      const limpio = validarConfig(payload)
      if (Object.keys(limpio).length === 0) return {}

      Object.assign(this.$state, limpio)

      // Persistir snapshot completo (no solo el diff)
      escribirStorage({
        companyName: this.companyName,
        ivaPercentage: this.ivaPercentage,
        ruc: this.ruc,
        phone: this.phone,
        address: this.address,
        email: this.email
      })

      return limpio
    },

    /**
     * Restablece a los valores por defecto (env + fallback).
     */
    reset() {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch { /* noop */ }
      Object.assign(this.$state, valoresPorDefecto())
    },

    /**
     * Recarga desde localStorage (útil si otra pestaña cambió la config).
     */
    recargar() {
      const stored = leerStorage()
      if (!stored) return
      Object.assign(this.$state, validarConfig(stored))
    }
  }
})

// ---- Solo para tests ----
export const _validarConfig = validarConfig
export const _valoresPorDefecto = valoresPorDefecto