<template>
  <div class="theme-controls">
    <div class="theme-toggle" @click="toggleTheme">
      <i :class="isDark ? 'fas fa-sun' : 'fas fa-moon'"></i>
      <span class="toggle-label">{{ isDark ? 'Claro' : 'Oscuro' }}</span>
    </div>
    <div class="color-selector">
      <span v-for="color in colorOptions" :key="color.value"
            class="color-dot"
            :class="{ active: currentColor === color.value }"
            :style="{ backgroundColor: color.hex }"
            @click="setColor(color.value)"
            :title="color.label">
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '../stores/themeStore'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)
const currentColor = computed(() => themeStore.currentColor)

const colorOptions = [
  { value: 'default', label: 'Azul', hex: '#3498db' },
  { value: 'green', label: 'Verde', hex: '#27ae60' },
  { value: 'purple', label: 'Morado', hex: '#8e44ad' },
  { value: 'red', label: 'Rojo', hex: '#e74c3c' },
  { value: 'orange', label: 'Naranja', hex: '#e67e22' }
]

const toggleTheme = () => themeStore.toggleDarkMode()
const setColor = (color) => themeStore.setThemeColor(color)
</script>

<style scoped>
.theme-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 30px;
  background: rgba(255,255,255,0.1);
  transition: all 0.3s ease;
  color: rgba(255,255,255,0.85);
  font-size: 0.9rem;
  font-weight: 500;
}
.theme-toggle:hover {
  background: rgba(255,255,255,0.2);
}
.color-selector {
  display: flex;
  gap: 6px;
  align-items: center;
}
.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.25s ease;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.5);
}
body.dark-mode .color-dot.active {
  border-color: #f1c40f;
}
</style>