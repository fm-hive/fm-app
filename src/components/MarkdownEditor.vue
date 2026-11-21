<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2">
        <label v-if="label" class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ label }}</label>
        <MarkdownHelp />
      </div>
      <button @click="previewMode = !previewMode" class="text-xs text-blue-500 hover:text-blue-700">
        {{ previewMode ? t('editor.edit') : t('editor.preview') }}
      </button>
    </div>
    <textarea v-if="!previewMode" :value="modelValue" @input="onInput" :rows="rows"
      class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm"
      :placeholder="placeholder" />
    <div v-else class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm min-h-[120px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
      <MarkdownBody :content="modelValue || ''" :attachments="attachments" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownHelp from './MarkdownHelp.vue'
import MarkdownBody from './MarkdownBody.vue'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 6 },
  attachments: { type: Array, default: null },
})
const emit = defineEmits(['update:modelValue'])

const previewMode = ref(false)


function onInput(e) {
  emit('update:modelValue', e.target.value)
}
</script>
