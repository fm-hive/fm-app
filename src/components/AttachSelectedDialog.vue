<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-xl w-full mx-4 max-h-[80vh] flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-bold text-sm dark:text-white">{{ t('selected.attachTitle') }} ({{ items.length }})</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">&times;</button>
      </div>

      <div v-if="items.length === 0" class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
        {{ t('selected.empty') }}
      </div>

      <div v-else class="flex-1 overflow-y-auto space-y-2 mb-3">
        <label v-for="entry in items" :key="entry.entryId"
          class="border rounded p-2 text-sm dark:border-gray-700 flex items-start gap-2 cursor-pointer"
        >
          <input type="checkbox" v-model="chosen" :value="entry.entryId" class="mt-0.5 rounded text-blue-600 flex-shrink-0" />
          <span class="flex-1 min-w-0">
            <template v-if="entry.kind === 'attachment'">
              <span class="font-medium dark:text-gray-200 break-words">📎 {{ entry.name }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">{{ entry.type || 'file' }}</span>
            </template>
            <template v-else>
              <span class="font-medium dark:text-gray-200 break-words">{{ entry.subject || t('selected.noSubject') }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">{{ entry.sender_name || entry.sender_address }}</span>
            </template>
          </span>
        </label>
      </div>

      <div class="flex items-center gap-2 pt-3 border-t dark:border-gray-700">
        <button @click="selectAll" class="text-xs text-blue-500 hover:text-blue-700">{{ t('outbox.selectAll') }}</button>
        <button @click="chosen = []" class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">{{ t('outbox.deselectAll') }}</button>
        <div class="flex-1"></div>
        <button @click="$emit('close')" class="px-3 py-1.5 text-xs border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          {{ t('app.cancel') }}
        </button>
        <button @click="attach" :disabled="chosen.length === 0 || busy"
          class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {{ busy ? t('selected.preparing') : t('selected.attach') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSelectedMessages, resolveSelectedMessage, resolveSelectedAttachment } from '../composables/useSelectedMessages'
import { useNotificationsStore } from '../stores/notifications'
import { buildBundle, bundleAttachment } from '../utils/selectedBundle'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'attach'])

const { t } = useI18n()
const selectedStore = useSelectedMessages()
const notifications = useNotificationsStore()

const busy = ref(false)
const chosen = ref([])

const items = computed(() => selectedStore.items.value.map(entry => ({
  ...entry,
  entryId: selectedStore.entryId(entry),
})))

watch(() => props.visible, (visible) => {
  if (!visible) return
  // Pre-select the entries marked in the container
  chosen.value = items.value.filter(e => selectedStore.isChecked(e)).map(e => e.entryId)
}, { immediate: true })

function selectAll() {
  chosen.value = items.value.map(e => e.entryId)
}

/**
 * Build the attachments for the composer (#306): every chosen message becomes
 * its own JSON bundle file named `<Message-ID>.json`; chosen attachments are
 * attached as they are.
 */
async function attach() {
  if (busy.value || chosen.value.length === 0) return
  busy.value = true
  try {
    const selectedEntries = items.value.filter(e => chosen.value.includes(e.entryId))
    const attachments = []

    for (const entry of selectedEntries.filter(e => e.kind !== 'attachment')) {
      const message = await resolveSelectedMessage(entry)
      if (!message) continue
      const resolved = {
        ...message,
        echo_name: message.echo_name || entry.echo_name,
        echo_id: message.echo_id ?? entry.echo_id,
      }
      attachments.push(bundleAttachment(buildBundle([resolved]), 0, 1))
    }

    for (const entry of selectedEntries.filter(e => e.kind === 'attachment')) {
      const attachment = await resolveSelectedAttachment(entry)
      if (attachment) attachments.push(attachment)
    }

    if (attachments.length === 0) {
      notifications.warning(t('selected.nothingResolved'), t('selected.title'))
      return
    }
    emit('attach', { attachments })
    emit('close')
  } catch (err) {
    console.error('[selected] attach failed', err)
    notifications.error(err.message || t('selected.failed'), t('selected.title'))
  } finally {
    busy.value = false
  }
}
</script>
