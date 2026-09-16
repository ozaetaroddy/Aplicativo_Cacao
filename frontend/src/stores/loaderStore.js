// stores/loaderStore.js
// ============================================================
// Loader global con contador de peticiones concurrentes.
// ------------------------------------------------------------
// Características:
//   - Contador `activeRequests` (no booleano) → soporta N peticiones.
//   - Delay de aparición (`showDelay`) para no parpadear en peticiones rápidas.
//   - Tiempo mínimo visible (`minDisplayTime`) para no dar sensación de "flash".
//   - Timers FUERA del state de Pinia (son handles de host, no datos reactivos).
//   - Métodos de cleanup (`destroy`) para usarlos en logout o en tests.
// ============================================================
'use strict'

import { defineStore } from 'pinia'

// ===== CONFIGURACIÓN =====
const SHOW_DELAY_MS = 150
const MIN_DISPLAY_MS = 300

// ===== HELPERS =====
/**
 * setTimeout con `.unref()` cuando está disponible (Node) para no
 * bloquear el event loop en SSR/tests.
 */
function safeSetTimeout(fn, ms) {
  const t = setTimeout(fn, ms)
  if (t && typeof t.unref === 'function') t.unref()
  return t
}

// ===== STORE =====
export const useLoaderStore = defineStore('loader', {
  state: () => ({
    isLoading: false,
    message: 'Cargando...',
    activeRequests: 0
  }),

  getters: {
    // Por si algún componente quiere saber si hay algo en cola
    // aunque el overlay todavía no se haya mostrado.
    hayPendientes: (state) => state.activeRequests > 0
  },

  actions: {
    /**
     * Incrementa el contador de peticiones activas.
     * @param {string} [message='Cargando...']
     */
    increment(message = 'Cargando...') {
      this.activeRequests++

      // Solo el PRIMER mensaje "gana" para no parpadear con múltiples
      // mensajes distintos cuando hay peticiones paralelas.
      if (this.activeRequests === 1) {
        this.message = String(message || 'Cargando...')
      }

      // Si ya está visible, no hacemos nada más
      if (this.isLoading) {
        // Cancelar cualquier hide pendiente (por si acaso)
        if (this._hideTimer) {
          clearTimeout(this._hideTimer)
          this._hideTimer = null
        }
        return
      }

      // Programar aparición
      if (this._showTimer) clearTimeout(this._showTimer)
      this._showTimer = safeSetTimeout(() => {
        this._showTimer = null
        // Guard: si para cuando dispara ya no hay peticiones, no mostrar
        if (this.activeRequests > 0) {
          this.isLoading = true
        }
      }, SHOW_DELAY_MS)
    },

    /**
     * Decrementa el contador de peticiones activas.
     * Si llega a 0, programa el ocultamiento respetando `minDisplayTime`.
     */
    decrement() {
      if (this.activeRequests > 0) {
        this.activeRequests--
      } else {
        // Guard defensivo: decrement sin increment → log y no bajar de 0
        if (import.meta.env.DEV) {
          console.warn('loaderStore.decrement() llamado sin increment activo')
        }
        return
      }

      // Aún hay peticiones → no ocultar
      if (this.activeRequests > 0) return

      // Cancelar aparición pendiente (nunca se mostró)
      if (this._showTimer) {
        clearTimeout(this._showTimer)
        this._showTimer = null
      }

      // No está visible → no hay nada que ocultar
      if (!this.isLoading) return

      // Programar ocultamiento
      if (this._hideTimer) clearTimeout(this._hideTimer)
      this._hideTimer = safeSetTimeout(() => {
        this._hideTimer = null
        // Guard: si mientras esperábamos llegó una nueva petición, no ocultar
        if (this.activeRequests === 0) {
          this.isLoading = false
          this.message = 'Cargando...'
        }
      }, MIN_DISPLAY_MS)
    },

    /**
     * Oculta el loader INMEDIATAMENTE y resetea el contador.
     * Útil para logout, errores críticos, o al desmontar la app.
     */
    forceHide() {
      if (this._showTimer) {
        clearTimeout(this._showTimer)
        this._showTimer = null
      }
      if (this._hideTimer) {
        clearTimeout(this._hideTimer)
        this._hideTimer = null
      }
      this.activeRequests = 0
      this.isLoading = false
      this.message = 'Cargando...'
    },

    /**
     * Alias de forceHide. Llamar en logout o al cerrar la app
     * para no dejar timers huérfanos.
     */
    destroy() {
      this.forceHide()
    }
  }
})