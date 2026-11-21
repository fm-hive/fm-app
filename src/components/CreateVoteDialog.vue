<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('createVote.title') }}</h3>

      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('protocol.echo') }}</label>
        <input :value="echoName" disabled class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300" />
      </div>

      <div class="mb-3">
        <MarkdownEditor v-model="question" :label="t('createVote.question')" :rows="3" :placeholder="t('createVote.questionPlaceholder')" />
      </div>

      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('createVote.options') }}</label>
        <div v-for="(opt, i) in options" :key="i" class="flex gap-2 mb-1">
          <input v-model="options[i]" class="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300" :placeholder="t('createVote.optionPlaceholder', { n: i + 1 })" />
          <button v-if="options.length > 2" @click="options.splice(i, 1)" class="px-2 text-red-500 hover:text-red-700">✕</button>
        </div>
        <button @click="options.push('')" class="mt-1 text-sm text-blue-500 hover:text-blue-700">+ {{ t('createVote.addOption') }}</button>
      </div>

      <div v-if="error" class="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>

      <div class="flex justify-end gap-3">
        <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">{{ t('app.cancel') }}</button>
        <button @click="submit" :disabled="sending" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
          <span v-if="!sending">{{ t('createVote.submit') }}</span>
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
import { createSignedMessage } from '../services/message'
import { useOutbox } from '../composables/useOutbox'
import MarkdownEditor from '../components/MarkdownEditor.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  echoName: { type: String, required: true }
})

const emit = defineEmits(['close', 'sent'])

const { t } = useI18n()
const question = ref('')
const options = ref(['Yes', 'No'])
const sending = ref(false)
const error = ref('')

const identity = useIdentityStore()
const notifications = useNotificationsStore()

async function submit() {
  error.value = ''
  if (!question.value.trim()) {
    error.value = t('createVote.questionRequired')
    return
  }
  const validOptions = options.value.filter(o => o.trim())
  if (validOptions.length < 2) {
    error.value = t('createVote.minOptions')
    return
  }

  sending.value = true
  try {
    const voteData = {
      echo: props.echoName,
      proto: 'vote',
      type: 'poster',
      from: identity.user.address,
      to: 'all',
      message: question.value.trim(),
      variants: validOptions,
      date: new Date().toISOString()
    }

    const signedMessage = await createSignedMessage('vote', voteData, {
      echo_name: props.echoName
    })

    const outbox = useOutbox()
    outbox.add({
      type: 'vote',
      echoName: props.echoName,
      message: signedMessage,
      label: question.value.trim(),
      detail: validOptions.join(', '),
    })
    notifications.success(t('createVote.submitted'), t('createVote.title'))
    emit('sent')
    emit('close')
  } catch (err) {
    error.value = err.message || t('createVote.submitError')
  } finally {
    sending.value = false
  }
}
</script>
