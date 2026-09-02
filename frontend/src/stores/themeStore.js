import { defineStore } from 'pinia'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    darkMode: localStorage.getItem('darkMode') === 'true',
    themeColor: localStorage.getItem('themeColor') || 'default'
  }),
  actions: {
    toggleDarkMode() {
      this.darkMode = !this.darkMode
      localStorage.setItem('darkMode', this.darkMode)
      this.aplicarTema()
    },
    setThemeColor(color) {
      this.themeColor = color
      localStorage.setItem('themeColor', color)
      this.aplicarTema()
    },
    aplicarTema() {
      // Modo oscuro
      if (this.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark')
        document.body.classList.add('dark-mode')
      } else {
        document.documentElement.removeAttribute('data-theme')
        document.body.classList.remove('dark-mode')
      }
      // Color de acento
      const colors = {
        default: { primary: '#3498db', secondary: '#2c3e50', accent: '#f1c40f' },
        green: { primary: '#27ae60', secondary: '#1a3a2a', accent: '#f39c12' },
        purple: { primary: '#8e44ad', secondary: '#2a1a3a', accent: '#f1c40f' },
        red: { primary: '#e74c3c', secondary: '#3a1a1a', accent: '#f1c40f' },
        orange: { primary: '#e67e22', secondary: '#3a2a1a', accent: '#3498db' }
      }
      const palette = colors[this.themeColor] || colors.default
      document.documentElement.style.setProperty('--primary-light', palette.primary)
      document.documentElement.style.setProperty('--primary-dark', palette.secondary)
      document.documentElement.style.setProperty('--accent-gold', palette.accent)
    }
  },
  getters: {
    isDark: (state) => state.darkMode,
    currentColor: (state) => state.themeColor
  }
})