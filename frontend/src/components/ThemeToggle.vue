<template>
  <div class="theme-controls" role="group" aria-label="Controles de tema">
    <!-- Toggle claro/oscuro -->
    <button
      type="button"
      class="theme-toggle"
      :aria-label="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      :aria-pressed="isDark ? 'true' : 'false'"
      :title="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      @click="toggleTheme"
    >
      <i
        :class="isDark ? 'fas fa-sun' : 'fas fa-moon'"
        aria-hidden="true"
      ></i>
      <span class="toggle-label">{{ isDark ? 'Claro' : 'Oscuro' }}</span>
    </button>

    <!-- Selector de color -->
    <div
      class="color-selector"
      role="radiogroup"
      aria-label="Color del tema"
    >
      <button
        v-for="color in colorOptions"
        :key="color.value"
        type="button"
        class="color-dot"
        :class="{ active: currentColor === color.value }"
        :style="{ backgroundColor: color.hex }"
        :aria-label="`Color ${color.label}`"
        :aria-pressed="currentColor === color.value ? 'true' : 'false'"
        :title="color.label"
        @click="setColor(color.value)"
      >
        <i
          v-if="currentColor === color.value"
          class="fas fa-check color-dot-check"
          aria-hidden="true"
        ></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '../stores/themeStore'

const themeStore = useThemeStore()

const isDark = computed(() => Boolean(themeStore.isDark))
const currentColor = computed(() => themeStore.currentColor || 'default')

const colorOptions = [
  { value: 'default', label: 'Azul', hex: '#3498db' },
  { value: 'green', label: 'Verde', hex: '#27ae60' },
  { value: 'purple', label: 'Morado', hex: '#8e44ad' },
  { value: 'red', label: 'Rojo', hex: '#e74c3c' },
  { value: 'orange', label: 'Naranja', hex: '#e67e22' }
]

const toggleTheme = () => {
  try {
    themeStore.toggleDarkMode()
  } catch {
    /* noop */
  }
}

const setColor = (color) => {
  try {
    themeStore.setThemeColor(color)
  } catch {
    /* noop */
  }
}
</script>

<style scoped>
.theme-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ===== TOGGLE ===== */
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-family: inherit;
}
.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: scale(1.05);
}
.theme-toggle:focus-visible {
  outline: 2px solid var(--accent-color, #f1c40f);
  outline-offset: 2px;
}
.theme-toggle i {
  transition: transform 0.5s ease;
}
.theme-toggle:hover i {
  transform: rotate(30deg);
}
.toggle-label {
  white-space: nowrap;
}

/* ===== SELECTOR DE COLOR ===== */
.color-selector {
  display: flex;
  gap: 6px;
  align-items: center;
}

.color-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.7rem;
  position: relative;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
}
.color-dot-check {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
  pointer-events: none;
}

/* ===== MODO OSCURO GLOBAL ===== */
:global(body.dark-mode) .theme-toggle {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

:global(body.dark-mode) .color-dot.active {
  border-color: var(--accent-color, #f1c40f);
  box-shadow: 0 0 0 2px var(--accent-color, #f1c40f);
}

/* ===== RESPONSIVE ===== */
@media (max-width: 576px) {
  .toggle-label {
    display: none;
  }
  .theme-toggle {
    padding: 6px 10px;
  }
}

/* ===== ACCESIBILIDAD ===== */
@media (prefers-reduced-motion: reduce) {
  .theme-toggle,
  .theme-toggle i,
  .color-dot {
    transition: none;
  }
  .theme-toggle:hover,
  .color-dot:hover {
    transform: none;
  }
}
</style>