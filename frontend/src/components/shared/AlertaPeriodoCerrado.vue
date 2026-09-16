<template>
  <div
    v-if="periodo"
    class="alerta-periodo"
    :class="{ 'alerta-compact': compact }"
    role="alert"
  >
    <i class="fas fa-lock alerta-icon" aria-hidden="true"></i>
    <div class="alerta-body">
      <strong class="alerta-titulo">Período cerrado: {{ nombrePeriodo }}</strong>
      <div class="alerta-msg">{{ mensaje }}</div>
      <div v-if="fechaCierreFmt" class="alerta-meta">
        <i class="fas fa-calendar-times" aria-hidden="true"></i>
        Cerrado el {{ fechaCierreFmt }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  periodoCerrado: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  mensaje: {
    type: String,
    default:
      'No se pueden guardar cambios en esta fecha. Contacte al administrador si necesita modificar este documento.'
  }
})

const periodo = computed(() => props.periodoCerrado || null)

const nombrePeriodo = computed(() => {
  const p = periodo.value
  if (!p) return ''
  if (p.nombre) return p.nombre
  if (p.mes && p.anio) return `${p.mes}/${p.anio}`
  return 'desconocido'
})

const fechaCierreFmt = computed(() => {
  const f = periodo.value?.fecha_cierre
  if (!f) return ''
  try {
    return new Date(f).toLocaleString('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  } catch {
    return ''
  }
})
</script>

<style scoped>
.alerta-periodo {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(231, 76, 60, 0.12);
  border-left: 4px solid #e74c3c;
  border-radius: 8px;
  color: #c0392b;
  margin-bottom: 16px;
}
.alerta-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  margin-top: 2px;
}
.alerta-body { flex: 1; min-width: 0; }
.alerta-titulo { display: block; margin-bottom: 2px; }
.alerta-msg { font-size: 0.82rem; line-height: 1.4; }
.alerta-meta {
  margin-top: 6px;
  font-size: 0.72rem;
  opacity: 0.85;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Variante compacta */
.alerta-compact {
  padding: 8px 12px;
  margin-bottom: 8px;
}
.alerta-compact .alerta-icon { font-size: 1.1rem; }
.alerta-compact .alerta-msg { display: none; }

body.dark-mode .alerta-periodo {
  background: rgba(231, 76, 60, 0.2);
  color: #ec7063;
}
</style>