<template>
  <div class="json-editor">
    <div class="flex justify-between items-center mb-2">
      <label class="block text-sm font-medium">{{ label }}</label>
      <div class="space-x-2">
        <button
          @click="formatJson"
          type="button"
          class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
          :disabled="disabled"
        >
          Format
        </button>
        <button
          @click="resetToTemplate"
          type="button"
          class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
          :disabled="disabled"
        >
          Reset
        </button>
      </div>
    </div>
    
    <textarea
      ref="textareaRef"
      v-model="localValue"
      :disabled="disabled"
      :rows="rows"
      class="w-full font-mono text-sm border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      :class="{ 'border-red-300': jsonError, 'bg-gray-50': disabled }"
      @input="handleInput"
      @blur="validateJson"
    ></textarea>
    
    <div v-if="jsonError" class="mt-1 text-sm text-red-600">
      {{ jsonError }}
    </div>
    
    <div v-if="hint" class="mt-1 text-xs text-gray-500">
      {{ hint }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  template: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: 'JSON'
  },
  placeholder: {
    type: String,
    default: 'Enter JSON...'
  },
  rows: {
    type: Number,
    default: 12
  },
  disabled: {
    type: Boolean,
    default: false
  },
  hint: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'valid', 'invalid'])

const textareaRef = ref(null)
const localValue = ref(props.modelValue || props.template)
const jsonError = ref('')

// Обновляем localValue при изменении modelValue извне
watch(() => props.modelValue, (newVal) => {
  if (newVal !== localValue.value) {
    localValue.value = newVal
  }
})

// Обновляем шаблон при изменении
watch(() => props.template, (newTemplate) => {
  if (!localValue.value || localValue.value === props.template) {
    localValue.value = newTemplate
  }
})

function handleInput() {
  emit('update:modelValue', localValue.value)
  validateJson()
}

function validateJson() {
  if (!localValue.value.trim()) {
    jsonError.value = ''
    emit('invalid', 'JSON is required')
    return false
  }
  
  try {
    JSON.parse(localValue.value)
    jsonError.value = ''
    emit('valid', localValue.value)
    return true
  } catch (error) {
    jsonError.value = `Invalid JSON: ${error.message}`
    emit('invalid', error.message)
    return false
  }
}

function formatJson() {
  try {
    const parsed = JSON.parse(localValue.value)
    localValue.value = JSON.stringify(parsed, null, 2)
    emit('update:modelValue', localValue.value)
    jsonError.value = ''
    emit('valid', localValue.value)
  } catch (error) {
    jsonError.value = `Cannot format invalid JSON: ${error.message}`
  }
}

function resetToTemplate() {
  localValue.value = props.template
  emit('update:modelValue', localValue.value)
  validateJson()
}

// Экспортируем методы для использования из родителя
defineExpose({
  validate: validateJson,
  format: formatJson,
  reset: resetToTemplate
})
</script>

<style scoped>
.json-editor textarea {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.4;
}
</style>