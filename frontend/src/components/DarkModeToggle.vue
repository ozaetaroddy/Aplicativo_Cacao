<template>
  <button class="dark-mode-toggle" @click="toggleDarkMode" :title="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
    <i :class="isDark ? 'fas fa-sun' : 'fas fa-moon'"></i>
  </button>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const isDark = ref(false)

// Cargar preferencia guardada o detectar sistema
const loadPreference = () => {
  const saved = localStorage.getItem('darkMode')
  if (saved !== null) {
    isDark.value = saved === 'true'
  } else {
    // Detectar preferencia del sistema (opcional)
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    isDark.value = prefersDark
  }
  applyTheme()
}

const applyTheme = () => {
  if (isDark.value) {
    document.documentElement.classList.add('dark-mode')
  } else {
    document.documentElement.classList.remove('dark-mode')
  }
  localStorage.setItem('darkMode', isDark.value)
}

const toggleDarkMode = () => {
  isDark.value = !isDark.value
  applyTheme()
}

onMounted(() => {
  loadPreference()
  // Escuchar cambios en la preferencia del sistema (opcional)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleChange = (e) => {
    if (localStorage.getItem('darkMode') === null) {
      isDark.value = e.matches
      applyTheme()
    }
  }
  mediaQuery.addEventListener('change', handleChange)
})
</script>

<style scoped>
.dark-mode-toggle {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.3rem;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 30px;
  transition: background 0.3s, color 0.3s;
}
.dark-mode-toggle:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
</style>