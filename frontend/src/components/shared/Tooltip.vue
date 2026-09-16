<template>
  <span
    class="tooltip-wrapper"
    :aria-describedby="visible ? tooltipId : undefined"
    @mouseenter="onShow"
    @mouseleave="onHide"
    @focusin="onShow"
    @focusout="onHide"
    @keydown.escape="onEscape"
  >
    <slot></slot>

    <transition name="tooltip-fade">
      <span
        v-if="visible"
        :id="tooltipId"
        class="tooltip-box"
        :class="[`tooltip-${positionSafe}`, `tooltip-variant-${variantSafe}`]"
        role="tooltip"
      >
        {{ text }}
      </span>
    </transition>
  </span>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'

const props = defineProps({
  text: { type: String, required: true },
  position: { type: String, default: 'top' }, // top | bottom | left | right
  variant: { type: String, default: 'dark' }, // dark | light | success | warning | danger | info
  delay: { type: Number, default: 80 },       // ms antes de mostrar
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['show', 'hide'])

const POSITIONS = ['top', 'bottom', 'left', 'right']
const VARIANTS = ['dark', 'light', 'success', 'warning', 'danger', 'info']

const positionSafe = computed(() =>
  POSITIONS.includes(props.position) ? props.position : 'top'
)
const variantSafe = computed(() =>
  VARIANTS.includes(props.variant) ? props.variant : 'dark'
)

// ID único por instancia (para aria-describedby)
let globalSeq = 0
const tooltipId = `tooltip-${(++globalSeq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const visible = ref(false)
let showTimer = null
let unmounted = false

const onShow = () => {
  if (unmounted || props.disabled) return
  if (visible.value) return
  if (showTimer) clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    showTimer = null
    if (unmounted) return
    visible.value = true
    emit('show')
  }, Math.max(0, props.delay))
}

const onHide = () => {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (!visible.value) return
  visible.value = false
  emit('hide')
}

const onEscape = () => {
  if (!visible.value) return
  onHide()
}

onBeforeUnmount(() => {
  unmounted = true
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
})
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tooltip-box {
  position: absolute;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  z-index: 1080;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  line-height: 1.3;
  max-width: 260px;
  text-overflow: ellipsis;
  overflow: hidden;
}

/* ===== Posición ===== */
.tooltip-top {
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
}
.tooltip-bottom {
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
}
.tooltip-left {
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}
.tooltip-right {
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}

/* ===== Variantes (color) ===== */
.tooltip-variant-dark    { background: #1a2a3a; color: #fff; }
.tooltip-variant-light   { background: #fff;     color: #1a2a3a; border: 1px solid var(--border-color, #ddd); }
.tooltip-variant-success { background: #1e8449; color: #fff; }
.tooltip-variant-warning { background: #d68910; color: #fff; }
.tooltip-variant-danger  { background: #c0392b; color: #fff; }
.tooltip-variant-info    { background: #2980b9; color: #fff; }

/* ===== Flechita ===== */
.tooltip-box::after {
  content: '';
  position: absolute;
  border: 6px solid transparent;
}
.tooltip-top::after    { top: 100%;    left: 50%; margin-left: -6px; }
.tooltip-bottom::after { bottom: 100%; left: 50%; margin-left: -6px; }
.tooltip-left::after   { left: 100%;   top: 50%;  margin-top: -6px; }
.tooltip-right::after  { right: 100%;  top: 50%;  margin-top: -6px; }

/* Flechas por variante */
.tooltip-top.tooltip-variant-dark::after       { border-top-color: #1a2a3a; }
.tooltip-top.tooltip-variant-light::after      { border-top-color: #fff; }
.tooltip-top.tooltip-variant-success::after    { border-top-color: #1e8449; }
.tooltip-top.tooltip-variant-warning::after    { border-top-color: #d68910; }
.tooltip-top.tooltip-variant-danger::after     { border-top-color: #c0392b; }
.tooltip-top.tooltip-variant-info::after       { border-top-color: #2980b9; }

.tooltip-bottom.tooltip-variant-dark::after    { border-bottom-color: #1a2a3a; }
.tooltip-bottom.tooltip-variant-light::after   { border-bottom-color: #fff; }
.tooltip-bottom.tooltip-variant-success::after { border-bottom-color: #1e8449; }
.tooltip-bottom.tooltip-variant-warning::after { border-bottom-color: #d68910; }
.tooltip-bottom.tooltip-variant-danger::after  { border-bottom-color: #c0392b; }
.tooltip-bottom.tooltip-variant-info::after    { border-bottom-color: #2980b9; }

.tooltip-left.tooltip-variant-dark::after      { border-left-color: #1a2a3a; }
.tooltip-left.tooltip-variant-light::after     { border-left-color: #fff; }
.tooltip-left.tooltip-variant-success::after   { border-left-color: #1e8449; }
.tooltip-left.tooltip-variant-warning::after   { border-left-color: #d68910; }
.tooltip-left.tooltip-variant-danger::after    { border-left-color: #c0392b; }
.tooltip-left.tooltip-variant-info::after      { border-left-color: #2980b9; }

.tooltip-right.tooltip-variant-dark::after     { border-right-color: #1a2a3a; }
.tooltip-right.tooltip-variant-light::after    { border-right-color: #fff; }
.tooltip-right.tooltip-variant-success::after  { border-right-color: #1e8449; }
.tooltip-right.tooltip-variant-warning::after  { border-right-color: #d68910; }
.tooltip-right.tooltip-variant-danger::after   { border-right-color: #c0392b; }
.tooltip-right.tooltip-variant-info::after     { border-right-color: #2980b9; }

.tooltip-fade-enter-active,
.tooltip-fade-leave-active { transition: opacity 0.15s ease; }
.tooltip-fade-enter-from,
.tooltip-fade-leave-to { opacity: 0; }
</style>