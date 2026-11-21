<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
      <h3 class="text-lg font-bold mb-2 dark:text-white">{{ t('rulesEdit.title') }}</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ t('rulesEdit.hint') }}</p>

      <div class="flex-1 overflow-y-auto space-y-4 pr-2">
        <!-- Optional conference rename -->
        <div v-if="allowRename">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('rulesEdit.newName') }}</label>
          <input v-model="newName" :placeholder="echoName"
            class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
          <p class="text-xs text-gray-500 mt-1">{{ t('rulesEdit.newNameHint') }}</p>
        </div>
        <p v-else class="text-xs text-gray-500">{{ t('rulesEdit.systemEchoNoRename') }}</p>

        <!-- Rules text + parameters via RulesEditor -->
        <RulesEditor v-model="rulesObject" :rows="4" />

        <!-- All-chunks-only toggle -->
        <div class="flex items-start gap-2 p-2 border rounded dark:border-gray-600">
          <input id="rules-all-chunks" type="checkbox" v-model="allChunksOnly" class="mt-0.5 rounded" />
          <div>
            <label for="rules-all-chunks" class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('rulesEdit.allChunksOnly') }}</label>
            <p class="text-xs text-gray-500">{{ t('rulesEdit.allChunksOnlyHint') }}</p>
          </div>
        </div>
      </div>

      <div v-if="error" class="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>

      <div class="flex justify-end mt-4 pt-3 border-t dark:border-gray-600">
        <div class="flex gap-3">
          <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
            {{ t('app.cancel') }}
          </button>
          <button @click="submit" :disabled="sending" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm">
            {{ sending ? t('rulesEdit.sending') : t('rulesEdit.propose') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useNotificationsStore } from '../stores/notifications'
import { createSignedMessage } from '../services/message'
import { useOutbox } from '../composables/useOutbox'
import RulesEditor from './RulesEditor.vue'

const { t } = useI18n()
const identity = useIdentityStore()
const notifications = useNotificationsStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  echoName: { type: String, default: '' },
  currentRules: { type: [Object, String], default: null },
  allowRename: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])

const rulesObject = ref({ text: '', parameters: {} })
const newName = ref('')
const allChunksOnly = ref(false)
const sending = ref(false)
const error = ref('')

watch(() => props.visible, (v) => {
  if (!v) return
  error.value = ''
  allChunksOnly.value = false
  newName.value = props.allowRename ? props.echoName : ''
  let obj = props.currentRules
  if (typeof obj === 'string') { try { obj = JSON.parse(obj) } catch { obj = null } }
  if (obj && obj.parameters) {
    rulesObject.value = { text: obj.text || '', parameters: { ...obj.parameters } }
  } else if (obj) {
    const { text, ...rest } = obj
    rulesObject.value = { text: text || '', parameters: { ...rest } }
  } else {
    rulesObject.value = { text: '', parameters: {} }
  }
})

async function submit() {
  error.value = ''
  const text = rulesObject.value?.text || ''
  const params = rulesObject.value?.parameters || {}
  if (!text && Object.keys(params).length === 0) {
    error.value = t('rulesEdit.invalidParams')
    return
  }
  sending.value = true
  try {
    const renameTo = props.allowRename ? newName.value.trim() : ''
    const changeData = {
      proto: 'change_rules',
      from: identity.user.address,
      to: 'all',
      subject: 'Change rules',
      message: 'Rules change proposal',
      date: new Date().toISOString(),
      node1: identity.user.address,
      echo: props.echoName,
      all_chunks_only: allChunksOnly.value,
      proposed_rules: {
        text: text,
        parameters: params,
      },
    }
    if (renameTo && renameTo !== props.echoName) {
      changeData.new_name = renameTo
    }
    const signedMessage = await createSignedMessage('change_rules', changeData, {
      echo_name: props.echoName,
    })
    const outbox = useOutbox()
    outbox.add({
      type: 'change_rules',
      echoName: props.echoName,
      message: signedMessage,
      label: 'Change rules',
      detail: `Rules change proposal for ${props.echoName}`,
    })
    notifications.success(t('rulesEdit.proposalAdded'), t('rulesEdit.title'))
    emit('close')
  } catch (err) {
    error.value = err.message || t('rulesEdit.sendError')
  } finally {
    sending.value = false
  }
}
</script>
