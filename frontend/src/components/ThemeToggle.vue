<template>
  <div class="theme-controls" ref="wrapper">
    <!-- ===== TRIGGER COMPACTO ===== -->
    <button
      type="button"
      class="theme-trigger"
      :class="{ 'theme-trigger--open': panelOpen }"
      :aria-label="triggerLabel"
      :aria-expanded="panelOpen ? 'true' : 'false'"
      aria-haspopup="dialog"
      :title="triggerLabel"
      @click.stop="togglePanel"
    >
      <i
        :class="isDark ? 'fas fa-sun' : 'fas fa-moon'"
        aria-hidden="true"
      ></i>
      <span
        class="theme-trigger-color"
        :style="{ backgroundColor: currentColorHex }"
        aria-hidden="true"
      ></span>
      <i
        class="fas fa-chevron-down theme-trigger-caret"
        aria-hidden="true"
      ></i>
    </button>

    <!-- ===== PANEL POPOVER ===== -->
    <transition name="theme-pop">
      <div
        v-if="panelOpen"
        class="theme-panel"
        role="dialog"
        aria-label="Ajustes de apariencia"
      >
        <!-- Modo claro/oscuro -->
        <div class="theme-panel-section">
          <span class="theme-panel-label">Apariencia</span>
          <button
            type="button"
            class="theme-mode-btn"
            :aria-pressed="isDark ? 'true' : 'false'"
            @click="toggleTheme"
          >
            <i
              :class="isDark ? 'fas fa-sun' : 'fas fa-moon'"
              aria-hidden="true"
            ></i>
            <span class="theme-mode-btn-text">
              {{ isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro' }}
            </span>
            <span class="theme-mode-btn-badge">
              {{ isDark ? 'Oscuro' : 'Claro' }}
            </span>
          </button>
        </div>

        <!-- Colores -->
        <div class="theme-panel-section">
          <span class="theme-panel-label">Color del tema</span>
          <div
            class="theme-colors"
            role="radiogroup"
            aria-label="Color del tema"
          >
            <button
              v-for="color in colorOptions"
              :key="color.value"
              type="button"
              class="theme-color-dot"
              :class="{ active: currentColor === color.value }"
              :style="{ backgroundColor: color.hex }"
              :aria-label="`Color ${color.label}`"
              :aria-pressed="currentColor === color.value ? 'true' : 'false'"
              :title="color.label"
              @click="setColor(color.value)"
            >
              <i
                v-if="currentColor === color.value"
                class="fas fa-check"
                aria-hidden="true"
              ></i>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore } from '../stores/themeStore'

const themeStore = useThemeStore()

const wrapper = ref(null)
const panelOpen = ref(false)

const isDark = computed(() => Boolean(themeStore.isDark))
const currentColor = computed(() => themeStore.currentColor || 'default')

const colorOptions = [
  { value: 'default', label: 'Azul',    hex: '#3498db' },
  { value: 'green',   label: 'Verde',   hex: '#27ae60' },
  { value: 'purple',  label: 'Morado',  hex: '#8e44ad' },
  { value: 'red',     label: 'Rojo',    hex: '#e74c3c' },
  { value: 'orange',  label: 'Naranja', hex: '#e67e22' }
]

const currentColorHex = computed(() => {
  const opt = colorOptions.find((c) => c.value === currentColor.value)
  return opt?.hex || '#3498db'
})

const triggerLabel = computed(() =>
  isDark
    ? 'Ajustes de apariencia (modo oscuro activo)'
    : 'Ajustes de apariencia (modo claro activo)'
)

const togglePanel = () => {
  panelOpen.value = !panelOpen.value
}

const closePanel = () => {
  panelOpen.value = false
}

const toggleTheme = () => {
  try { themeStore.toggleDarkMode() } catch { /* noop */ }
}

const setColor = (color) => {
  try { themeStore.setThemeColor(color) } catch { /* noop */ }
}

// Cerrar al hacer click fuera
const handleClickOutside = (e) => {
  if (!panelOpen.value) return
  if (wrapper.value && !wrapper.value.contains(e.target)) closePanel()
}

// Cerrar con Escape
const handleKeydown = (e) => {
  if (e.key === 'Escape' && panelOpen.value) {
    closePanel()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
/* ============================================================
   CONTENEDOR
   ============================================================ */
.theme-controls {
  position: relative;
  flex-shrink: 0;
}

/* ============================================================
   TRIGGER COMPACTO
   ============================================================ */
.theme-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 11px 0 13px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}

.theme-trigger:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}

.theme-trigger:active {
  transform: scale(0.97);
}

.theme-trigger > i:first-child {
  font-size: 0.92rem;
  color: var(--accent-color, #f59e0b);
  transition: transform 0.4s ease;
}

.theme-trigger:hover > i:first-child {
  transform: rotate(20deg);
}

.theme-trigger-color {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.25),
    0 1px 3px rgba(0, 0, 0, 0.3);
  transition: background-color 0.25s ease;
}

.theme-trigger-caret {
  font-size: 0.6rem;
  opacity: 0.6;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.theme-trigger--open .theme-trigger-caret {
  transform: rotate(180deg);
  opacity: 1;
}

.theme-trigger:focus-visible {
  outline: 2px solid var(--accent-color, #f59e0b);
  outline-offset: 2px;
}

/* ============================================================
   PANEL POPOVER
   ============================================================ */
.theme-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 264px;
  max-width: min(320px, calc(100vw - 24px));
  background: rgba(20, 30, 48, 0.98);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  padding: 12px;
  z-index: 100;
  animation: theme-pop-in 0.18s ease-out;
}

@keyframes theme-pop-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.theme-panel-section + .theme-panel-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.theme-panel-label {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(245, 158, 11, 0.9);
  margin-bottom: 8px;
  padding-left: 4px;
}

/* Modo */
.theme-mode-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  text-align: left;
}

.theme-mode-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.16);
}

.theme-mode-btn:focus-visible {
  outline: 2px solid var(--accent-color, #f59e0b);
  outline-offset: 2px;
}

.theme-mode-btn > i {
  color: var(--accent-color, #f59e0b);
  font-size: 0.95rem;
  transition: transform 0.3s ease;
}

.theme-mode-btn:hover > i {
  transform: rotate(20deg);
}

.theme-mode-btn-text {
  flex: 1;
  white-space: nowrap;
}

.theme-mode-btn-badge {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

/* Colores */
.theme-colors {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 0 2px;
}

.theme-color-dot {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.72rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.theme-color-dot:hover {
  transform: scale(1.12);
}

.theme-color-dot:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.theme-color-dot.active {
  border-color: #fff;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.3),
    0 0 0 3px rgba(255, 255, 255, 0.22);
}

.theme-color-dot i {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  pointer-events: none;
}

/* Modo oscuro global: refuerza el contraste de los dots */
:global(body.dark-mode) .theme-color-dot.active {
  border-color: #fff;
  box-shadow:
    0 0 0 2px var(--accent-color, #f59e0b),
    inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}

/* ============================================================
   TRANSICIÓN DEL POPOVER
   ============================================================ */
.theme-pop-enter-active,
.theme-pop-leave-active {
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;
}

.theme-pop-enter-from,
.theme-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

/* ============================================================
   ACCESIBILIDAD
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .theme-trigger,
  .theme-trigger > i:first-child,
  .theme-mode-btn,
  .theme-mode-btn > i,
  .theme-color-dot {
    transition: none;
  }
  .theme-trigger:hover,
  .theme-trigger:hover > i:first-child,
  .theme-mode-btn:hover > i,
  .theme-color-dot:hover {
    transform: none;
  }
  .theme-panel { animation: none; }
  .theme-pop-enter-active,
  .theme-pop-leave-active { transition: none; }
}
</style>