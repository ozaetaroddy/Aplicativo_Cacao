<template>
  <div class="skeleton-wrapper">
    <div v-for="n in count" :key="n" class="skeleton-item">
      <div class="skeleton-line" :style="{ width: getWidth() }"></div>
      <div class="skeleton-line short" :style="{ width: getWidth(60) }"></div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  count: { type: Number, default: 3 },
  lines: { type: Number, default: 2 }
})

const getWidth = (base = 80) => {
  const variation = Math.floor(Math.random() * 30) - 15
  return `${Math.min(100, Math.max(40, base + variation))}%`
}
</script>

<style scoped>
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 0;
}
.skeleton-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}
.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
.skeleton-line.short {
  height: 10px;
  width: 60%;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

body.dark-mode .skeleton-line {
  background: linear-gradient(90deg, #2d3748 25%, #3d4a5c 50%, #2d3748 75%);
}
</style>