import { defineStore } from 'pinia'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    darkMode: localStorage.getItem('darkMode') === 'true'
  }),
  actions: {
    toggleDarkMode() {
      this.darkMode = !this.darkMode
      localStorage.setItem('darkMode', this.darkMode)
      this.aplicarTema()
    },
    aplicarTema() {
      if (this.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark')
        document.body.classList.add('dark-mode')
      } else {
        document.documentElement.removeAttribute('data-theme')
        document.body.classList.remove('dark-mode')
      }
    }
  },
  getters: {
    isDark: (state) => state.darkMode
  }
})