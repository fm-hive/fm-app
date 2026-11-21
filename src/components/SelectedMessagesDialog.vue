<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-bold text-sm dark:text-white">{{ t('selected.title') }} ({{ items.length }})</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">&times;</button>
      </div>

      <div v-if="items.length === 0" class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
        {{ t('selected.empty') }}
      </div>

      <div v-else class="flex-1 overflow-y-auto space-y-2 mb-3">
        <div v-for="entry in items" :key="selectedStore.entryId(entry)"
          class="border rounded p-2 text-sm dark:border-gray-700"
        >
          <div class="flex items-start gap-2">
            <input
              type="checkbox"
              class="mt-0.5 rounded text-blue-600 flex-shrink-0"
              :checked="selectedStore.isChecked(entry)"
              @change="selectedStore.toggleChecked(selectedStore.entryId(entry))"
            />
            <div class="flex-1 min-w-0">
              <template v-if="entry.kind === 'attachment'">
                <span class="font-medium dark:text-gray-200 break-words">📎 {{ entry.name }}</span>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{{ entry.type || 'file' }}</span>
                  <span v-if="entry.size">· {{ formatSize(entry.size) }}</span>
                  <span v-if="entry.echo_name">· {{ entry.echo_name }}</span>
                </div>
              </template>
              <template v-else>
                <router-link
                  v-if="entry.echo_id && entry.message_id"
                  :to="`/echoes/${entry.echo_id}/${entry.message_id}`"
                  class="font-medium text-blue-600 hover:underline dark:text-blue-400 break-words"
                >{{ entry.subject || t('selected.noSubject') }}</router-link>
                <span v-else class="font-medium dark:text-gray-200 break-words">{{ entry.subject || t('selected.noSubject') }}</span>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{{ entry.sender_name || entry.sender_address }}</span>
                  <span v-if="entry.echo_name">· {{ entry.echo_name }}</span>
                  <span v-if="entry.timestamp">· {{ formatTimestamp(entry.timestamp) }}</span>
                </div>
              </template>
            </div>
            <button @click="removeEntry(entry)" class="text-gray-400 hover:text-red-500 text-sm flex-shrink-0"
              :title="t('selected.remove')">✕</button>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 pt-3 border-t dark:border-gray-700">
        <button @click="clearAll" :disabled="items.length === 0"
          class="px-3 py-1.5 text-xs border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50">
          {{ t('selected.clear') }}
        </button>
        <div class="flex-1"></div>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('selected.manageHint') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSelectedMessages } from '../composables/useSelectedMessages'

defineProps({
  visible: { type: Boolean, default: false },
})
defineEmits(['close'])

const { t } = useI18n()
const selectedStore = useSelectedMessages()

const items = computed(() => selectedStore.items.value)

function formatSize(size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

function removeEntry(entry) {
  if (entry.kind === 'attachment') selectedStore.remove(entry.attachment_id, 'attachment')
  else selectedStore.remove(entry.message_id)
}

function clearAll() {
  selectedStore.clear()
}
</script>
