<template>
  <div class="theme-toggle" @click="toggleTheme">
    <i :class="isDark ? 'fas fa-sun' : 'fas fa-moon'"></i>
    <span class="toggle-label">{{ isDark ? 'Claro' : 'Oscuro' }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '../stores/themeStore'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)

const toggleTheme = () => {
  themeStore.toggleDarkMode()
}
</script>

<style scoped>
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
.theme-toggle i {
  font-size: 1.1rem;
}
</style>