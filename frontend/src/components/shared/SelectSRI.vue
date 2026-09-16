<template>
  <select
    :id="id"
    :name="name"
    class="form-select"
    :class="{ 'is-invalid': error }"
    :value="modelValue"
    :disabled="disabled"
    :required="required"
    :aria-invalid="error ? 'true' : undefined"
    :aria-required="required ? 'true' : undefined"
    @change="onChange"
  >
    <option value="">{{ placeholder }}</option>
    <option
      v-for="item in lista"
      :key="item.codigo"
      :value="item.codigo"
      :disabled="item.disabled === true"
    >
      {{ formatLabel(item) }}
    </option>
  </select>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  lista: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Seleccione…' },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  id: { type: String, default: undefined },
  name: { type: String, default: undefined },
  /**
   * Función opcional para construir el texto de cada opción.
   * Default: `${codigo} - ${nombre}`.
   */
  labelTemplate: { type: Function, default: null }
})

const emit = defineEmits(['update:modelValue', 'change'])

const onChange = (event) => {
  const v = event?.target?.value ?? ''
  emit('update:modelValue', v)
  emit('change', v)
}

const formatLabel = (item) => {
  if (!item || typeof item !== 'object') return ''
  if (typeof props.labelTemplate === 'function') {
    try {
      return String(props.labelTemplate(item) ?? '')
    } catch {
      // fallback
    }
  }
  const codigo = item.codigo ?? ''
  const nombre = item.nombre ?? ''
  if (!codigo && !nombre) return ''
  if (!codigo) return String(nombre)
  if (!nombre) return String(codigo)
  return `${codigo} - ${nombre}`
}
</script>