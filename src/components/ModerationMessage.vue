<template>
  <div class="moderation-message">
    <div class="flex items-center gap-2 mb-1">
      <span
        v-if="severity === 'warning'"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300"
      >
        ⚠ {{ t('moderator.warning') }}
      </span>
      <span
        v-else-if="severity === 'punishment'"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"
      >
        ⛔ {{ t('moderator.punishment') }}
      </span>
    </div>

    <div v-if="data.message" class="text-gray-700 dark:text-gray-300">
      <MarkdownRenderer :content="data.message" />
    </div>

    <div
      v-if="original"
      class="mt-2 p-2 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60"
    >
      <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {{ t('echoes.originalMessage') }}
      </div>
      <div v-if="original.from" class="text-xs text-gray-600 dark:text-gray-400">
        {{ t('netmail.from') }}:
        <SenderLabel :address="original.from" :name-from-message="original.fromName" />
      </div>
      <div v-if="original.date" class="text-xs text-gray-600 dark:text-gray-400">
        {{ t('protocol.date') }}: {{ formatDate(original.date) }}
      </div>
      <div v-if="original.subject" class="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">
        {{ original.subject }}
      </div>
      <div v-if="original.body" class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mt-1">
        {{ original.body }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SenderLabel from './SenderLabel.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { moderationSeverity, moderationOriginalMessage } from '../services/moderation'

const { t } = useI18n()

const props = defineProps({
  data: { type: Object, required: true },
})

const severity = computed(() => moderationSeverity(props.data))
const original = computed(() => moderationOriginalMessage(props.data))

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}
</script>
