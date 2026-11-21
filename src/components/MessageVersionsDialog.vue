<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-2xl w-full mx-2 sm:mx-4 max-h-[85vh] flex flex-col">
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="text-lg font-bold dark:text-white">{{ t('messageActions.versionsTitle') }}</h3>
          <div v-if="subject" class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ subject }}</div>
        </div>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-3">
        <div v-if="versions.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('messageActions.noVersions') }}
        </div>
        <div v-for="(v, i) in versions" :key="i" class="border rounded-lg p-3 dark:border-gray-700">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span class="font-medium">{{ t('messageActions.version', { n: i + 1 }) }}</span>
            <span v-if="v.timestamp"> · {{ formatTimestamp(v.timestamp) }}</span>
            <span v-if="v.replaced_at"> → {{ formatTimestamp(v.replaced_at) }}</span>
          </div>
          <div v-if="v.subject" class="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-1">{{ v.subject }}</div>
          <div class="text-sm text-gray-700 dark:text-gray-300">
            <MarkdownRenderer :content="v.body" :attachments="v.attachments" />
          </div>
          <AttachmentsGallery v-if="v.attachments" :attachments="v.attachments" :content="v.body" />
        </div>
      </div>

      <div class="flex justify-end pt-3 mt-3 border-t dark:border-gray-600">
        <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('app.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from './MarkdownRenderer.vue'
import AttachmentsGallery from './AttachmentsGallery.vue'

const { t } = useI18n()

const props = defineProps({
  visible: { type: Boolean, default: false },
  // The edited message (carries `_versions`).
  message: { type: Object, default: null },
})

defineEmits(['close'])

function parse(data) {
  try { return typeof data === 'string' ? JSON.parse(data) : (data || {}) } catch { return {} }
}

const current = computed(() => parse(props.message?.data))

const subject = computed(() => current.value.subject || '')

/** Previous copies, oldest first, with the parsed body/attachments. */
const versions = computed(() => {
  const list = Array.isArray(props.message?._versions) ? props.message._versions : []
  return list.map(v => {
    const d = parse(v.data)
    return {
      timestamp: v.timestamp || null,
      replaced_at: v.replaced_at || null,
      subject: d.subject || '',
      body: d.body || d.message || '',
      attachments: Array.isArray(d.attachments) ? d.attachments : null,
    }
  })
})

function formatTimestamp(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}
</script>
