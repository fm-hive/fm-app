<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('specialMessages.election') }}</h3>

      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('protocol.echo') }}</label>
        <input :value="echoName" disabled class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300" />
      </div>

      <div class="mb-3">
        <MarkdownEditor v-model="message" :label="t('election.candidateMessage')" :rows="3" :placeholder="t('election.candidateMessagePlaceholder')" />
      </div>

      <div v-if="error" class="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>

      <div class="flex justify-end gap-3">
        <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">{{ t('app.cancel') }}</button>
        <button @click="submit" :disabled="sending" class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50">
          <span v-if="!sending">{{ t('specialMessages.election') }}</span>
          <span v-else class="animate-spin">⟳</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useNotificationsStore } from '../stores/notifications'
import { apiService } from '../services/api'
import { createSignedMessage } from '../services/message'
import { useOutbox } from '../composables/useOutbox'
import MarkdownEditor from '../components/MarkdownEditor.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  echoName: { type: String, required: true }
})

const emit = defineEmits(['close', 'sent'])

const { t } = useI18n()
const identity = useIdentityStore()
const notifications = useNotificationsStore()

const message = ref('')
const sending = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!message.value.trim()) {
    error.value = t('election.messageRequired')
    return
  }

  sending.value = true
  try {
    const electionData = {
      echo: props.echoName,
      proto: 'election',
      type: 'poster',
      from: identity.user.address,
      to: 'all',
      message: message.value.trim(),
      date: new Date().toISOString()
    }

    const signedMessage = await createSignedMessage('election', electionData, {
      echo_name: props.echoName
    })

    const outbox = useOutbox()
    outbox.add({
      type: 'election',
      echoName: props.echoName,
      message: signedMessage,
      label: t('specialMessages.election'),
      detail: message.value.trim(),
    })
    notifications.success(t('election.requestSubmitted'), t('specialMessages.election'))
    emit('sent')
    emit('close')
  } catch (err) {
    error.value = err.message || t('election.submitError')
  } finally {
    sending.value = false
  }
}
</script>
