<template>
    <Tooltip text="Editar cliente" position="top">
    <button class="btn btn-sm btn-outline-primary">
      <i class="fas fa-edit"></i>
    </button>
  </Tooltip>
  <span class="tooltip-wrapper" @mouseenter="show" @mouseleave="hide">
    <slot></slot>
    <span v-if="visible" class="tooltip-box" :style="positionStyle">
      {{ text }}
    </span>
  </span>
</template>

<script setup>
import { ref } from 'vue'
import Tooltip from './Tooltip.vue'

const props = defineProps({
  text: { type: String, required: true },
  position: { type: String, default: 'top' }
})

const visible = ref(false)

const show = () => { visible.value = true }
const hide = () => { visible.value = false }

const positionStyle = computed(() => {
  const styles = {
    top: { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
    left: { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
    right: { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }
  }
  return styles[props.position] || styles.top
})
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-block;
}
.tooltip-box {
  position: absolute;
  background: #1a2a3a;
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
  font-weight: 400;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  animation: fadeIn 0.2s ease;
}
.tooltip-box::after {
  content: '';
  position: absolute;
  border: 6px solid transparent;
}
.tooltip-wrapper .tooltip-box[style*="bottom"]::after {
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-color: #1a2a3a;
}
.tooltip-wrapper .tooltip-box[style*="top"]::after {
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: #1a2a3a;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
body.dark-mode .tooltip-box {
  background: #2d3748;
}
body.dark-mode .tooltip-box[style*="bottom"]::after {
  border-bottom-color: #2d3748;
}
body.dark-mode .tooltip-box[style*="top"]::after {
  border-top-color: #2d3748;
}
</style>