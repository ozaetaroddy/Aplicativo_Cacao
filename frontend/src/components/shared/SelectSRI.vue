<template>
  <select
    class="form-select"
    :value="modelValue"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option value="">{{ placeholder }}</option>
    <option
      v-for="item in lista"
      :key="item.codigo"
      :value="item.codigo"
    >
      {{ item.codigo }} - {{ item.nombre }}
    </option>
  </select>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  lista: { type: Array, required: true },
  placeholder: { type: String, default: 'Seleccione...' }
})
defineEmits(['update:modelValue'])
</script>