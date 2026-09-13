<template>
  <Teleport to="body">
    <transition name="tour-fade">
      <div v-if="active" class="tour-root" @click.self="noop">

        <!-- Overlay oscuro con hole (spotlight) -->
        <div class="tour-overlay" :style="overlayStyle"></div>

        <!-- Highlight del elemento activo -->
        <div
          v-if="targetRect"
          class="tour-highlight"
          :style="highlightStyle"
        ></div>

        <!-- Card del paso -->
        <transition name="tour-pop" mode="out-in">
          <div
            v-if="currentStepData"
            :key="currentStep"
            class="tour-card"
            :style="cardStyle"
            :class="`tour-card-${currentStepData.position || 'bottom'}`"
          >
            <!-- Progreso -->
            <div class="tour-progress">
              <div class="tour-progress-bar" :style="{ width: progress + '%' }"></div>
            </div>

            <!-- Header -->
            <div class="tour-header">
              <div class="tour-step-info">
                <div class="tour-step-badge">
                  <i :class="currentStepData.icon || 'fas fa-info-circle'"></i>
                </div>
                <div>
                  <div class="tour-step-label">
                    Paso {{ currentStep + 1 }} de {{ totalSteps }}
                  </div>
                  <h3 class="tour-title">{{ currentStepData.title }}</h3>
                </div>
              </div>
              <button class="tour-close" @click="descartar" title="Cerrar tour">
                <i class="fas fa-times"></i>
              </button>
            </div>

            <!-- Body -->
            <div class="tour-body">
              <p class="tour-description">{{ currentStepData.description }}</p>

              <!-- Bullets opcionales -->
              <ul v-if="currentStepData.bullets?.length" class="tour-bullets">
                <li v-for="(b, i) in currentStepData.bullets" :key="i">
                  <i class="fas fa-check-circle"></i>
                  <span>{{ b }}</span>
                </li>
              </ul>
            </div>

            <!-- Footer -->
            <div class="tour-footer">
              <button
                v-if="!isFirstStep"
                class="tour-btn tour-btn-ghost"
                @click="anterior"
              >
                <i class="fas fa-arrow-left"></i>
                <span>Atrás</span>
              </button>
              <div v-else class="tour-btn-placeholder"></div>

              <div class="tour-footer-right">
                <button
                  v-if="!isLastStep"
                  class="tour-btn tour-btn-text"
                  @click="descartar"
                >
                  Saltar
                </button>
                <button
                  class="tour-btn tour-btn-primary"
                  @click="siguiente"
                >
                  <span>{{ isLastStep ? 'Empezar' : 'Siguiente' }}</span>
                  <i :class="isLastStep ? 'fas fa-rocket' : 'fas fa-arrow-right'"></i>
                </button>
              </div>
            </div>

            <!-- Puntos de navegación -->
            <div class="tour-dots">
              <button
                v-for="(s, i) in steps"
                :key="i"
                class="tour-dot"
                :class="{ active: i === currentStep, done: i < currentStep }"
                @click="irA(i)"
                :title="s.title"
              ></button>
            </div>
          </div>
        </transition>

      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useOnboarding } from '../composables/useOnboarding'

const {
  active,
  currentStep,
  steps,
  totalSteps,
  isLastStep,
  isFirstStep,
  progress,
  siguiente,
  anterior,
  irA,
  descartar
} = useOnboarding()

const targetRect = ref(null)
const viewport = ref({ w: window.innerWidth, h: window.innerHeight })

const currentStepData = computed(() => steps.value[currentStep.value] || null)

function noop() {}

function actualizarViewport() {
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
}

function calcularTargetRect() {
  const data = currentStepData.value
  if (!data?.target) {
    targetRect.value = null
    return
  }
  const el = document.querySelector(data.target)
  if (!el) {
    targetRect.value = null
    return
  }
  const rect = el.getBoundingClientRect()
  targetRect.value = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right
  }
}

// Overlay con hole: usamos box-shadow gigante para crear el "hueco"
const overlayStyle = computed(() => {
  const pad = currentStepData.value?.spotlightPadding ?? 8
  const r = targetRect.value
  if (!r) return { background: 'rgba(15, 23, 42, 0.72)' }
  return {
    background: 'transparent',
    boxShadow: `0 0 0 9999px rgba(15, 23, 42, 0.72)`,
    borderRadius: '12px',
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`
  }
})

const highlightStyle = computed(() => {
  const pad = currentStepData.value?.spotlightPadding ?? 8
  const r = targetRect.value
  if (!r) return {}
  return {
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`
  }
})

const cardStyle = computed(() => {
  const r = targetRect.value
  const w = viewport.value.w
  const h = viewport.value.h
  const position = currentStepData.value?.position || 'bottom'
  const cardW = 420
  const cardH = 340
  const gap = 16
  const safePad = 20

  // Si no hay target → centro
  if (!r) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: '460px'
    }
  }

  let top = 0
  let left = 0
  let transform = ''

  switch (position) {
    case 'top':
      top = r.top - cardH - gap
      left = r.left + r.width / 2 - cardW / 2
      break
    case 'left':
      top = r.top + r.height / 2 - cardH / 2
      left = r.left - cardW - gap
      break
    case 'right':
      top = r.top + r.height / 2 - cardH / 2
      left = r.right + gap
      break
    case 'bottom':
    default:
      top = r.bottom + gap
      left = r.left + r.width / 2 - cardW / 2
      break
  }

  // Ajustar si se sale de pantalla
  if (left < safePad) left = safePad
  if (left + cardW > w - safePad) left = w - cardW - safePad
  if (top < safePad) top = r.bottom + gap
  if (top + cardH > h - safePad) top = r.top - cardH - gap
  if (top < safePad) top = safePad

  return {
    top: `${top}px`,
    left: `${left}px`,
    maxWidth: `${cardW}px`
  }
})

// Recalcular al cambiar de paso
watch(currentStep, async () => {
  await nextTick()
  calcularTargetRect()
  // Pequeño delay por si el DOM tarda en aparecer
  setTimeout(calcularTargetRect, 60)
})

watch(active, async (val) => {
  if (val) {
    await nextTick()
    setTimeout(calcularTargetRect, 80)
  }
})

let resizeTimer = null
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    actualizarViewport()
    calcularTargetRect()
  }, 100)
}

function onKeydown(e) {
  if (!active.value) return
  if (e.key === 'Escape') descartar()
  if (e.key === 'ArrowRight' || e.key === 'Enter') siguiente()
  if (e.key === 'ArrowLeft') anterior()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', calcularTargetRect, true)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', calcularTargetRect, true)
  window.removeEventListener('keydown', onKeydown)
  document.documentElement.classList.remove('tour-active')
})
</script>

<style scoped>
.tour-root {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: auto;
}

.tour-overlay {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.tour-highlight {
  position: fixed;
  border: 3px solid #60a5fa;
  border-radius: 12px;
  box-shadow:
    0 0 0 4px rgba(96, 165, 250, 0.25),
    0 0 40px 8px rgba(96, 165, 250, 0.35);
  pointer-events: none;
  z-index: 10001;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  animation: tourPulse 2s infinite;
}

@keyframes tourPulse {
  0%, 100% {
    box-shadow:
      0 0 0 4px rgba(96, 165, 250, 0.25),
      0 0 40px 8px rgba(96, 165, 250, 0.35);
  }
  50% {
    box-shadow:
      0 0 0 8px rgba(96, 165, 250, 0.15),
      0 0 60px 12px rgba(96, 165, 250, 0.45);
  }
}

.tour-card {
  position: fixed;
  background: #ffffff;
  border-radius: 20px;
  box-shadow:
    0 32px 64px rgba(15, 23, 42, 0.28),
    0 8px 16px rgba(15, 23, 42, 0.12);
  z-index: 10002;
  overflow: hidden;
  width: 420px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Modo oscuro opcional */
@media (prefers-color-scheme: dark) {
  .tour-card {
    background: #131a2b;
    border-color: rgba(30, 41, 59, 0.8);
    color: #f1f5f9;
  }
}

.tour-progress {
  height: 4px;
  background: #eef2f7;
  position: relative;
  overflow: hidden;
}
.tour-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 0 4px 4px 0;
}

.tour-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 24px 14px;
}

.tour-step-info {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}

.tour-step-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.tour-step-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 4px;
}

.tour-title {
  font-size: 1.125rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
}

@media (prefers-color-scheme: dark) {
  .tour-title { color: #f1f5f9; }
  .tour-step-label { color: #94a3b8; }
}

.tour-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.tour-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.tour-body {
  padding: 0 24px 8px;
}

.tour-description {
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.55;
  margin: 0 0 12px;
}

@media (prefers-color-scheme: dark) {
  .tour-description { color: #cbd5e1; }
}

.tour-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tour-bullets li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.4;
}

.tour-bullets li i {
  color: #10b981;
  font-size: 0.9rem;
  margin-top: 2px;
  flex-shrink: 0;
}

@media (prefers-color-scheme: dark) {
  .tour-bullets li { color: #cbd5e1; }
}

.tour-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 18px 24px 12px;
}

.tour-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.tour-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 10px;
  border: none;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  height: 40px;
  white-space: nowrap;
}

.tour-btn-primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}
.tour-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
}

.tour-btn-ghost {
  background: transparent;
  color: #64748b;
  border: 1.5px solid #e2e8f0;
}
.tour-btn-ghost:hover {
  background: #f8fafc;
  color: #0f172a;
  border-color: #cbd5e1;
}

.tour-btn-text {
  background: transparent;
  color: #64748b;
  padding: 9px 10px;
}
.tour-btn-text:hover { color: #0f172a; }

@media (prefers-color-scheme: dark) {
  .tour-btn-ghost { border-color: #334155; color: #cbd5e1; }
  .tour-btn-ghost:hover { background: #1e293b; color: #f1f5f9; }
  .tour-btn-text { color: #94a3b8; }
  .tour-btn-text:hover { color: #f1f5f9; }
}

.tour-btn-placeholder { width: 80px; }

.tour-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 4px 24px 16px;
}

.tour-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: #cbd5e1;
  cursor: pointer;
  transition: all 0.25s ease;
  padding: 0;
}
.tour-dot:hover { background: #94a3b8; transform: scale(1.2); }
.tour-dot.done { background: #93c5fd; }
.tour-dot.active {
  background: #2563eb;
  width: 22px;
  border-radius: 4px;
}

/* Transiciones */
.tour-fade-enter-active,
.tour-fade-leave-active {
  transition: opacity 0.3s ease;
}
.tour-fade-enter-from,
.tour-fade-leave-to { opacity: 0; }

.tour-pop-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tour-pop-leave-active {
  transition: all 0.2s ease;
}
.tour-pop-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}
.tour-pop-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* Responsive */
@media (max-width: 640px) {
  .tour-card {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    left: 12px !important;
    right: 12px;
    top: auto !important;
    bottom: 12px !important;
    transform: none !important;
  }
  .tour-highlight { display: none; }
}
</style>