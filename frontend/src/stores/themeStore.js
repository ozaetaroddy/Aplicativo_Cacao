// stores/themeStore.js
// ============================================================
// Tema de la aplicación: modo claro/oscuro + color de acento.
// ------------------------------------------------------------
// Características:
//   - Persistencia en localStorage (protegido con try/catch).
//   - Sincronización entre pestañas vía `storage` event.
//   - Detección del tema del sistema (prefers-color-scheme) al arrancar.
//   - Validación de colores (whitelist).
//   - `init()` debe llamarse desde main.js ANTES de montar la app.
// ============================================================
'use strict'

import { defineStore } from 'pinia'

// ===== CONSTANTES =====
const STORAGE_DARK_KEY = 'darkMode'
const STORAGE_COLOR_KEY = 'themeColor'

const COLORES_VALIDOS = Object.freeze({
  default: { primary: '#3498db', secondary: '#2c3e50', accent: '#f1c40f' },
  green:   { primary: '#27ae60', secondary: '#1a3a2a', accent: '#f39c12' },
  purple:  { primary: '#8e44ad', secondary: '#2a1a3a', accent: '#f1c40f' },
  red:     { primary: '#e74c3c', secondary: '#3a1a1a', accent: '#f1c40f' },
  orange:  { primary: '#e67e22', secondary: '#3a2a1a', accent: '#3498db' }
})

const COLOR_DEFAULT = 'default'

// ===== HELPERS DE STORAGE =====
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
  } catch { /* noop */ }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch { /* noop */ }
}

/**
 * Detecta si el SO prefiere modo oscuro.
 */
function sistemaPrefiereOscuro() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/**
 * Valida un color contra la whitelist. Devuelve el default si no es válido.
 */
function normalizarColor(color) {
  if (typeof color !== 'string') return COLOR_DEFAULT
  return Object.prototype.hasOwnProperty.call(COLORES_VALIDOS, color)
    ? color
    : COLOR_DEFAULT
}

// ===== ESTADO INICIAL =====
function getEstadoInicial() {
  const storedDark = storageGet(STORAGE_DARK_KEY)
  // Si no hay preferencia guardada, usamos la del SO
  const darkMode = storedDark === null
    ? sistemaPrefiereOscuro()
    : storedDark === 'true'

  const themeColor = normalizarColor(
    storageGet(STORAGE_COLOR_KEY) || COLOR_DEFAULT
  )

  return { darkMode, themeColor }
}

// ===== STORE =====
export const useThemeStore = defineStore('theme', {
  state: () => getEstadoInicial(),

  getters: {
    isDark: (state) => state.darkMode,
    currentColor: (state) => state.themeColor,
    palette: (state) =>
      COLORES_VALIDOS[state.themeColor] || COLORES_VALIDOS[COLOR_DEFAULT]
  },

  actions: {
    /**
     * Inicializa el tema aplicando el estado persistido al `<html>` y
     * `<body>`. Debe llamarse desde `main.js` antes de `app.mount()`
     * para evitar el "flash" de tema incorrecto.
     */
    init() {
      this.aplicarTema()
      this._setupCrossTabSync()
    },

    toggleDarkMode() {
      this.darkMode = !this.darkMode
      storageSet(STORAGE_DARK_KEY, String(this.darkMode))
      this.aplicarTema()
    },

    /**
     * Fuerza modo claro u oscuro sin toggle.
     */
    setDarkMode(activo) {
      const next = Boolean(activo)
      if (next === this.darkMode) return
      this.darkMode = next
      storageSet(STORAGE_DARK_KEY, String(next))
      this.aplicarTema()
    },

    setThemeColor(color) {
      const safe = normalizarColor(color)
      this.themeColor = safe
      storageSet(STORAGE_COLOR_KEY, safe)
      this.aplicarTema()
    },

    /**
     * Aplica el tema actual al DOM (clases, atributos y variables CSS).
     * Es seguro llamarlo múltiples veces (idempotente).
     */
    aplicarTema() {
      if (typeof document === 'undefined') return

      const html = document.documentElement
      const body = document.body

      // ---- Modo oscuro ----
      if (this.darkMode) {
        html.setAttribute('data-theme', 'dark')
        if (body) body.classList.add('dark-mode')
      } else {
        html.removeAttribute('data-theme')
        if (body) body.classList.remove('dark-mode')
      }

      // ---- Paleta de colores ----
      const palette = this.palette
      html.style.setProperty('--primary-color', palette.primary)
      html.style.setProperty('--primary-dark', palette.secondary)
      html.style.setProperty('--accent-color', palette.accent)
    },

    /**
     * Restablece el tema a los valores por defecto (útil en logout).
     */
    reset() {
      storageRemove(STORAGE_DARK_KEY)
      storageRemove(STORAGE_COLOR_KEY)
      this.darkMode = sistemaPrefiereOscuro()
      this.themeColor = COLOR_DEFAULT
      this.aplicarTema()
    },

    // ============================================================
    // INTERNO: sincronización entre pestañas
    // ============================================================
    _setupCrossTabSync() {
      if (typeof window === 'undefined') return
      if (this._syncListener) return

      this._syncListener = (ev) => {
        if (ev.key === STORAGE_DARK_KEY && ev.newValue !== null) {
          const nuevo = ev.newValue === 'true'
          if (nuevo !== this.darkMode) {
            this.darkMode = nuevo
            this.aplicarTema()
          }
        } else if (ev.key === STORAGE_COLOR_KEY && ev.newValue !== null) {
          const nuevo = normalizarColor(ev.newValue)
          if (nuevo !== this.themeColor) {
            this.themeColor = nuevo
            this.aplicarTema()
          }
        }
      }

      window.addEventListener('storage', this._syncListener)
    },

    /**
     * Limpieza completa. Útil en logout o al desmontar la app.
     */
    destroy() {
      if (this._syncListener && typeof window !== 'undefined') {
        window.removeEventListener('storage', this._syncListener)
        this._syncListener = null
      }
    }
  }
})