// stores/loaderStore.js
import { defineStore } from 'pinia'

export const useLoaderStore = defineStore('loader', {
  state: () => ({
    isLoading: false,
    message: 'Cargando...',
    activeRequests: 0,
    showTimer: null,
    hideTimer: null,
    minDisplayTime: 300, // tiempo mínimo visible en ms
    showDelay: 150       // retraso antes de mostrar (ms)
  }),
  actions: {
    /**
     * Incrementa el contador de peticiones activas.
     * Si es la primera, programa la aparición del loader.
     */
    increment(message = 'Cargando...') {
      this.activeRequests++
      this.message = message

      // Si ya está visible o hay timer de ocultación, no hacemos nada
      if (this.isLoading) return
      if (this.hideTimer) {
        clearTimeout(this.hideTimer)
        this.hideTimer = null
        // Si ya estaba visible, no necesitamos volver a mostrarlo
        return
      }

      // Programar la aparición después del retraso
      if (this.showTimer) clearTimeout(this.showTimer)
      this.showTimer = setTimeout(() => {
        this.isLoading = true
        this.showTimer = null
      }, this.showDelay)
    },

    /**
     * Decrementa el contador de peticiones activas.
     * Si llega a 0, programa el ocultamiento con tiempo mínimo.
     */
    decrement() {
      if (this.activeRequests > 0) {
        this.activeRequests--
      }

      // Si aún hay peticiones activas, no ocultamos
      if (this.activeRequests > 0) return

      // Cancelar cualquier timer de aparición pendiente
      if (this.showTimer) {
        clearTimeout(this.showTimer)
        this.showTimer = null
      }

      // Si ya no está visible, no hacemos nada
      if (!this.isLoading) return

      // Programar ocultamiento con tiempo mínimo
      if (this.hideTimer) clearTimeout(this.hideTimer)
      this.hideTimer = setTimeout(() => {
        this.isLoading = false
        this.hideTimer = null
        this.message = 'Cargando...'
      }, this.minDisplayTime)
    },

    /**
     * Forzar ocultamiento inmediato (para errores críticos)
     */
    forceHide() {
      this.activeRequests = 0
      if (this.showTimer) {
        clearTimeout(this.showTimer)
        this.showTimer = null
      }
      if (this.hideTimer) {
        clearTimeout(this.hideTimer)
        this.hideTimer = null
      }
      this.isLoading = false
      this.message = 'Cargando...'
    }
  }
})