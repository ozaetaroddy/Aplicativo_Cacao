<template>
  <Teleport to="body">
    <transition name="tour-fade">
      <div
        v-if="active"
        class="tour-root"
        role="dialog"
        aria-modal="true"
        aria-label="Tour guiado"
        @click.self="noop"
      >
        <!-- Overlay con spotlight -->
        <div class="tour-overlay" :style="overlayStyle" aria-hidden="true"></div>

        <!-- Highlight del target -->
        <div
          v-if="targetRect"
          class="tour-highlight"
          :style="highlightStyle"
          aria-hidden="true"
        ></div>

        <!-- Card del paso -->
        <transition name="tour-pop" mode="out-in">
          <div
            v-if="currentStepData"
            :key="currentStep"
            class="tour-card"
            :style="cardStyle"
            role="document"
          >
            <!-- Progreso -->
            <div class="tour-progress" aria-hidden="true">
              <div class="tour-progress-bar" :style="{ width: progress + '%' }"></div>
            </div>

            <!-- Header -->
            <div class="tour-header">
              <div class="tour-step-info">
                <div class="tour-step-badge" aria-hidden="true">
                  <i :class="currentStepData.icon || 'fas fa-info-circle'"></i>
                </div>
                <div>
                  <div class="tour-step-label">
                    Paso {{ currentStep + 1 }} de {{ totalSteps }}
                  </div>
                  <h3 class="tour-title">{{ currentStepData.title }}</h3>
                </div>
              </div>
              <button
                type="button"
                class="tour-close"
                @click="descartar"
                title="Cerrar tour"
                aria-label="Cerrar tour"
              >
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>

            <!-- Body -->
            <div class="tour-body">
              <p class="tour-description">{{ currentStepData.description }}</p>

              <ul v-if="currentStepData.bullets?.length" class="tour-bullets">
                <li v-for="(b, i) in currentStepData.bullets" :key="i">
                  <i class="fas fa-check-circle" aria-hidden="true"></i>
                  <span>{{ b }}</span>
                </li>
              </ul>
            </div>

            <!-- Footer -->
            <div class="tour-footer">
              <button
                v-if="!isFirstStep"
                type="button"
                class="tour-btn tour-btn-ghost"
                @click="anterior"
                aria-label="Paso anterior"
              >
                <i class="fas fa-arrow-left" aria-hidden="true"></i>
                <span>Atrás</span>
              </button>
              <div v-else class="tour-btn-placeholder" aria-hidden="true"></div>

              <div class="tour-footer-right">
                <button
                  v-if="!isLastStep"
                  type="button"
                  class="tour-btn tour-btn-text"
                  @click="descartar"
                >
                  Saltar
                </button>
                <button
                  type="button"
                  class="tour-btn tour-btn-primary"
                  @click="siguiente"
                  :aria-label="isLastStep ? 'Empezar a usar el sistema' : 'Siguiente paso'"
                >
                  <span>{{ isLastStep ? 'Empezar' : 'Siguiente' }}</span>
                  <i
                    :class="isLastStep ? 'fas fa-rocket' : 'fas fa-arrow-right'"
                    aria-hidden="true"
                  ></i>
                </button>
              </div>
            </div>

            <!-- Puntos de navegación -->
            <div class="tour-dots" role="tablist" aria-label="Navegación del tour">
              <button
                v-for="(s, i) in steps"
                :key="i"
                type="button"
                class="tour-dot"
                :class="{ active: i === currentStep, done: i < currentStep }"
                @click="irA(i)"
                :title="s.title"
                :aria-label="`Ir al paso ${i + 1}: ${s.title}`"
                :aria-current="i === currentStep ? 'step' : undefined"
                role="tab"
              ></button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick
} from 'vue'
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

// ===== STATE =====
const targetRect = ref(null)
const viewport = ref({
  w: typeof window !== 'undefined' ? window.innerWidth : 1024,
  h: typeof window !== 'undefined' ? window.innerHeight : 768
})

// ===== GUARDS =====
let unmounted = false
let resizeTimer = null
let scrollRafId = null
let recalcTimer = null

// ===== COMPUTED =====
const currentStepData = computed(() => steps.value[currentStep.value] || null)

const isReducedMotion = computed(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

// ===== HELPERS =====
const noop = () => { /* bloquea clicks de fondo */ }

const actualizarViewport = () => {
  if (typeof window === 'undefined') return
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
}

const calcularTargetRect = () => {
  const data = currentStepData.value
  if (!data?.target) {
    targetRect.value = null
    return
  }

  let el = null
  try {
    el = document.querySelector(data.target)
  } catch {
    el = null
  }

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

  // Si el target está fuera de la ventana, hacer scroll suave
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      el.scrollIntoView()
    }
  }
}

// ===== ESTILOS DINÁMICOS =====
const overlayStyle = computed(() => {
  const pad = currentStepData.value?.spotlightPadding ?? 8
  const r = targetRect.value

  if (!r) {
    return { background: 'rgba(15, 23, 42, 0.72)' }
  }

  return {
    background: 'transparent',
    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
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
  if (!r) return { display: 'none' }
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

  // Sin target → centrado
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

  // Ajustes para que quede dentro de la pantalla
  if (left < safePad) left = safePad
  if (left + cardW > w - safePad) left = w - cardW - safePad

  if (top < safePad) {
    top = r.bottom + gap
  }
  if (top + cardH > h - safePad) {
    top = Math.max(safePad, r.top - cardH - gap)
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
    maxWidth: `${cardW}px`
  }
})

// ===== BLOQUEO DE SCROLL =====
const bloquearScroll = (bloquear) => {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (bloquear) {
    if (!body.dataset.tourScrollLock) {
      body.dataset.tourScrollLock = body.style.overflow || ''
    }
    body.style.overflow = 'hidden'
  } else {
    if (body.dataset.tourScrollLock !== undefined) {
      body.style.overflow = body.dataset.tourScrollLock || ''
      delete body.dataset.tourScrollLock
    }
  }
}

// ===== WATCHERS =====
watch(
  currentStep,
  async () => {
    await nextTick()
    if (unmounted) return
    calcularTargetRect()
    // Segundo intento por si el DOM tarda (elementos lazy)
    if (recalcTimer) clearTimeout(recalcTimer)
    recalcTimer = setTimeout(() => {
      if (!unmounted) calcularTargetRect()
      recalcTimer = null
    }, 80)
  }
)

watch(
  active,
  async (val) => {
    bloquearScroll(val)
    if (val) {
      // Marca el HTML para CSS global si lo necesita
      try {
        document.documentElement.classList.add('tour-active')
      } catch { /* noop */ }
      await nextTick()
      if (unmounted) return
      if (recalcTimer) clearTimeout(recalcTimer)
      recalcTimer = setTimeout(() => {
        if (!unmounted) calcularTargetRect()
        recalcTimer = null
      }, 100)
    } else {
      try {
        document.documentElement.classList.remove('tour-active')
      } catch { /* noop */ }
      targetRect.value = null
    }
  },
  { immediate: false }
)

// ===== HANDLERS =====
const onResize = () => {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    if (unmounted) return
    actualizarViewport()
    calcularTargetRect()
  }, 100)
}

const onScroll = () => {
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    if (unmounted || !active.value) return
    calcularTargetRect()
  })
}

const onKeydown = (e) => {
  if (!active.value) return

  if (e.key === 'Escape') {
    e.preventDefault()
    descartar()
    return
  }
  if (e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault()
    siguiente()
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    anterior()
  }
}

// ===== LIFECYCLE =====
onMounted(() => {
  actualizarViewport()

  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  unmounted = true

  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('keydown', onKeydown)

  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  if (recalcTimer) {
    clearTimeout(recalcTimer)
    recalcTimer = null
  }
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = null
  }

  bloquearScroll(false)

  try {
    document.documentElement.classList.remove('tour-active')
  } catch { /* noop */ }
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
  transition: all 0.2s ease-out;
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

/* Accesibilidad */
@media (prefers-reduced-motion: reduce) {
  .tour-highlight,
  .tour-progress-bar,
  .tour-card,
  .tour-dot {
    transition: none;
    animation: none;
  }
  .tour-pop-enter-active,
  .tour-pop-leave-active {
    transition: opacity 0.15s ease;
  }
  .tour-pop-enter-from,
  .tour-pop-leave-to {
    transform: none;
  }
}
</style>