<template>
  <div
    class="skeleton-wrapper"
    role="status"
    aria-live="polite"
    :aria-label="ariaLabel"
  >
    <div
      v-for="(item, idx) in items"
      :key="idx"
      class="skeleton-item"
    >
      <div
        v-for="(line, lineIdx) in item.lines"
        :key="lineIdx"
        class="skeleton-line"
        :class="{ 'skeleton-line--last': lineIdx === item.lines.length - 1 }"
        :style="{ width: line.width + '%' }"
      ></div>
    </div>
    <span class="sr-only">{{ ariaLabel }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  count: { type: Number, default: 3 },
  lines: { type: Number, default: 2 },
  ariaLabel: { type: String, default: 'Cargando contenido…' }
})

const MAX_COUNT = 50
const MAX_LINES = 10

/**
 * PRNG determinista: mismo seed → mismo valor en (0..1).
 *
 * 🐛 BUG FIX: el original llamaba a `getWidth()` dentro del template.
 * Cada re-render recalculaba los anchos aleatorios → el skeleton "saltaba"
 * en cada tick. Ahora los anchos se calculan UNA sola vez por combinación
 * de (count, lines) y se mantienen estables durante toda la carga.
 */
function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function ancho(seed, min, max) {
  return Math.round(min + pseudoRandom(seed) * (max - min))
}

const items = computed(() => {
  const total = Math.min(Math.max(1, Math.floor(props.count) || 1), MAX_COUNT)
  const lineas = Math.min(Math.max(1, Math.floor(props.lines) || 1), MAX_LINES)

  const out = []
  for (let i = 0; i < total; i++) {
    const lineDefs = []
    for (let j = 0; j < lineas; j++) {
      const esUltima = j === lineas - 1 && lineas > 1
      // La última línea es más corta (estética de "párrafo")
      const width = esUltima
        ? ancho(i * 17 + j * 3 + 1, 45, 70)
        : ancho(i * 17 + j * 3, 80, 100)
      lineDefs.push({ width })
    }
    out.push({ lines: lineDefs })
  }
  return out
})
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
  gap: 6px;
  padding: 8px 0;
}
.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
.skeleton-line--last {
  height: 11px;
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Accesibilidad: oculto visualmente pero leído por screen-readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Modo oscuro */
body.dark-mode .skeleton-line {
  background: linear-gradient(90deg, #2d3748 25%, #3d4a5c 50%, #2d3748 75%);
  background-size: 200% 100%;
}

/* Respeta `prefers-reduced-motion` */
@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
    background: #e0e0e0;
  }
  body.dark-mode .skeleton-line {
    background: #2d3748;
  }
}
</style>