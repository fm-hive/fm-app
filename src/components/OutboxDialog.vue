<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold dark:text-white">{{ t('outbox.title') }} ({{ queue.length }})</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
      </div>

      <div v-if="queue.length === 0" class="text-center py-8 text-gray-500">
        {{ t('outbox.empty') }}
      </div>

      <div v-else class="flex-1 overflow-y-auto space-y-2 mb-4">
        <div v-for="entry in entriesWithKeyStatus" :key="entry.id"
          class="flex items-start gap-3 p-3 border rounded dark:border-gray-600"
        >
          <input type="checkbox" :checked="entry.selected" :disabled="!entry.hasKey" @change="outbox.toggle(entry.id)" class="mt-0.5 rounded" :class="{ 'opacity-40 cursor-not-allowed': !entry.hasKey }" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="px-1.5 py-0.5 text-xs rounded font-medium text-white"
                :class="badgeClass(entry.type)">
                {{ entry.type }}
              </span>
              <SenderLabel v-if="entry.type === 'netmail' && entry.recipient" :address="entry.recipient" compact class="text-xs text-gray-500" />
              <span v-else class="text-xs text-gray-500">{{ entry.echoName }}</span>
              <span v-if="entry.rateLimitOverride" class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                :title="t('outbox.rateLimitOverrideHint')">
                <span>⚠</span>
                <span>{{ t('outbox.rateLimitOverride') }}</span>
              </span>
              <span v-else-if="entry.rateLimitBlocked" class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                :title="t('outbox.rateLimitBlockedHint')">
                <span>⚠</span>
                <span>{{ t('outbox.rateLimitBlockedShort') }}</span>
              </span>
              <span v-if="entry.noKey" class="flex items-center gap-1 text-xs"
                :class="entry.hasKey ? 'text-green-600' : 'text-red-500'">
                <span>{{ entry.hasKey ? '🔑' : '🚫🔑' }}</span>
                <span>{{ entry.hasKey ? t('outbox.keyReady') : t('outbox.noKey') }}</span>
              </span>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ entry.label }}</div>
            <div class="text-xs text-gray-400 mt-0.5">{{ entry.detail }}</div>
          </div>
          <div class="flex flex-col gap-1 shrink-0">
            <button v-if="entry.rawData" @click="startEdit(entry)" class="text-xs text-blue-500 hover:text-blue-700">✏️</button>
            <button v-if="entry.noKey && !hasKeyOf(entry)" @click="requestKeyFor(entry)" class="text-xs text-yellow-600 hover:text-yellow-800">🔑 {{ t('outbox.requestKey') }}</button>
            <button @click="outbox.remove(entry.id)" class="text-xs text-gray-400 hover:text-red-500">✕</button>
          </div>
        </div>
      </div>

      <!-- Inline edit dialog -->
      <div v-if="editingEntry" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" @click.self="editingEntry = null">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
          <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('outbox.edit') }}</h3>
          <div class="mb-3">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('netmail.subject') }}</label>
            <input v-model="editSubject" class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
          </div>
          <div class="mb-3 flex-1 flex flex-col min-h-0">
            <MarkdownEditor v-model="editBody" :label="t('editor.body')" :rows="8" />
          </div>
          <div class="flex justify-end gap-3">
            <button @click="editingEntry = null" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
              {{ t('app.cancel') }}
            </button>
            <button @click="saveEdit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">{{ t('outbox.save') }}</button>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>

      <div class="flex justify-between items-center pt-3 border-t dark:border-gray-600">
        <div class="flex gap-2">
          <button @click="outbox.selectAll()" class="text-xs text-blue-500 hover:text-blue-700">{{ t('outbox.selectAll') }}</button>
          <button @click="outbox.deselectAll()" class="text-xs text-gray-500 hover:text-gray-700">{{ t('outbox.deselectAll') }}</button>
        </div>
        <div class="flex gap-3">
          <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
            {{ t('app.cancel') }}
          </button>
          <button @click="doSend" :disabled="sending || queue.filter(e => e.selected).length === 0"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
            {{ sending ? t('outbox.sending') : t('outbox.sendSelected') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SenderLabel from './SenderLabel.vue'
import { useOutbox } from '../composables/useOutbox'
import { apiErrorMessage } from '../utils/apiErrors'
import { keyService } from '../services/keyService'
import MarkdownEditor from './MarkdownEditor.vue'

const { t } = useI18n()
const outbox = useOutbox()
const { queue } = outbox

defineProps({ visible: Boolean })
const emit = defineEmits(['close', 'sent'])

const sending = ref(false)
const error = ref('')
const editingEntry = ref(null)
const editSubject = ref('')
const editBody = ref('')

function startEdit(entry) {
  editingEntry.value = entry
  const d = entry.rawData || {}
  editSubject.value = d.subject || ''
  editBody.value = d.body || ''
}

function saveEdit() {
  const entry = editingEntry.value
  if (!entry) return
  entry.rawData = { ...entry.rawData, subject: editSubject.value, body: editBody.value }
  entry.label = editSubject.value || entry.type
  entry.detail = editBody.value?.slice(0, 120) || ''
  editingEntry.value = null
}

// Реактивная проверка наличия ключа для noKey-писем
const entriesWithKeyStatus = computed(() => {
  // Зависимость от версии кеша — пересчитывается при приходе ключа
  const version = keyService.keyCacheVersion.value
  return queue.value.map(e => ({
    ...e,
    hasKey: e.noKey ? keyService.hasPublicKey(e.recipient) : true,
  }))
})

function hasKeyOf(entry) {
  return keyService.hasPublicKey(entry.recipient)
}

async function requestKeyFor(entry) {
  if (!entry.recipient) return
  try {
    await keyService.requestPublicKey(entry.recipient, false)
    entry.noKey = true
  } catch (err) {
    error.value = apiErrorMessage(err, t) || t('outbox.sendError')
  }
}

function badgeClass(type) {
  const cls = {
    echomail: 'bg-green-500', vote: 'bg-blue-500', election: 'bg-yellow-500',
    excommunicate: 'bg-red-500', change_policy: 'bg-indigo-500',
  }
  return cls[type] || 'bg-gray-500'
}

async function doSend() {
  error.value = ''
  sending.value = true
  try {
    // Если выбраны noKey-письма и авто-запрос включён — запрашиваем ключи автоматически
    const { useSettingsStore } = await import('../stores/settings')
    const settingsStore = useSettingsStore()
    if (settingsStore.privacy.autoRequestPubkeys) {
      const noKeySelected = queue.value.filter(e => e.selected && e.noKey && e.recipient)
      for (const entry of noKeySelected) {
        if (!keyService.hasRequestedKey(entry.recipient)) {
          try { await keyService.requestPublicKey(entry.recipient, true) } catch (e) { console.warn('[outbox] auto-request failed', e) }
        }
      }
    }
    await outbox.send()
    emit('sent')
    emit('close')
  } catch (err) {
    if (err.noKeyPending) {
      error.value = t('outbox.noKeyError')
    } else if (err.rateLimitBlocked) {
      error.value = t('outbox.rateLimitBlocked', { count: err.rateLimitBlocked })
    } else {
      error.value = apiErrorMessage(err, t) || t('outbox.sendError')
    }
  } finally {
    sending.value = false
  }
}
</script>
