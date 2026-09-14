<template>
  <span class="tooltip-wrapper" @mouseenter="show" @mouseleave="hide">
    <slot></slot>
    <transition name="tooltip-fade">
      <span
        v-if="visible"
        class="tooltip-box"
        :class="`tooltip-${position}`"
        role="tooltip"
      >
        {{ text }}
      </span>
    </transition>
  </span>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  text: { type: String, required: true },
  position: { type: String, default: 'top' } // top | bottom | left | right
})

const visible = ref(false)
const show = () => { visible.value = true }
const hide = () => { visible.value = false }
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tooltip-box {
  position: absolute;
  background: #1a2a3a;
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  z-index: 1080;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  line-height: 1.3;
}

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

/* Flechita */
.tooltip-box::after {
  content: '';
  position: absolute;
  border: 6px solid transparent;
}
.tooltip-top::after {
  top: 100%; left: 50%; margin-left: -6px;
  border-top-color: #1a2a3a;
}
.tooltip-bottom::after {
  bottom: 100%; left: 50%; margin-left: -6px;
  border-bottom-color: #1a2a3a;
}
.tooltip-left::after {
  left: 100%; top: 50%; margin-top: -6px;
  border-left-color: #1a2a3a;
}
.tooltip-right::after {
  right: 100%; top: 50%; margin-top: -6px;
  border-right-color: #1a2a3a;
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active { transition: opacity 0.15s ease; }
.tooltip-fade-enter-from,
.tooltip-fade-leave-to { opacity: 0; }
</style>