<template>
  <div v-if="requests.length > 0" class="space-y-2">
    <div v-for="req in requests" :key="req.messageId" class="text-xs border rounded p-2 dark:border-gray-600">
      <div class="font-medium text-gray-700 dark:text-gray-300">
        {{ t('refillDialog.requestFrom', { from: req.from || '' }) }}
      </div>
      <div class="text-gray-500 dark:text-gray-400 mt-0.5">
        {{ t('refillDialog.echo') }}: {{ req.echoName }}
      </div>
      <div class="text-gray-500 dark:text-gray-400">
        {{ t('refillDialog.before') }}: {{ formatDate(req.before) }}
      </div>
      <div class="text-gray-500 dark:text-gray-400">
        {{ t('refillDialog.messagesCount', { count: req.count }) }}
      </div>

      <div v-if="req.status === 'pending'" class="mt-2 flex gap-1 flex-wrap">
        <button @click="$emit('respond', req)" class="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">
          {{ t('refillDialog.yes') }}
        </button>
        <button @click="$emit('decline', req)" class="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600">
          {{ t('refillDialog.hide') }}
        </button>
        <button @click="$emit('postpone', req, 1)" class="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600">
          {{ t('refillDialog.postpone1') }}
        </button>
        <button @click="$emit('postpone', req, 2)" class="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600">
          {{ t('refillDialog.postpone2') }}
        </button>
        <button @click="$emit('postpone', req, 3)" class="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600">
          {{ t('refillDialog.postpone3') }}
        </button>
      </div>
      <div v-else class="mt-1 text-xs text-gray-400">
        {{ t('refillDialog.willAskAgain', { date: formatDate(req.askAgainAt) }) }}
      </div>
    </div>

  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  requests: { type: Array, default: () => [] },
})

defineEmits(['respond', 'decline', 'postpone'])

function formatDate(dateStr) {
  if (!dateStr) return ''
  try { return new Date(dateStr).toLocaleDateString() }
  catch { return dateStr }
}
</script>
