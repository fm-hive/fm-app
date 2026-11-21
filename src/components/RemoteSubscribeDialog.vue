<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('remoteSubscribe.title') }}</h3>

      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('remoteSubscribe.channelName') }}</label>
        <input v-model="echoName" class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" :placeholder="t('remoteSubscribe.channelNamePlaceholder')" />
      </div>

      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('remoteSubscribe.hostNode') }}</label>
        <input v-model="hostNode" class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" :placeholder="t('remoteSubscribe.hostNodePlaceholder')" />
        <p class="text-xs text-gray-500 mt-1">{{ t('remoteSubscribe.hostNodeHint') }}</p>
      </div>

      <div v-if="error" class="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-3 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-300 text-sm">{{ t('remoteSubscribe.success') }}</div>

      <div class="flex justify-end gap-3">
        <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('app.cancel') }}
        </button>
        <button @click="submit" :disabled="sending" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
          {{ sending ? t('remoteSubscribe.sending') : t('remoteSubscribe.subscribe') }}
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

const { t } = useI18n()
const identity = useIdentityStore()
const notifications = useNotificationsStore()

defineProps({ visible: Boolean })
const emit = defineEmits(['close'])

const echoName = ref('')
const hostNode = ref('')
const sending = ref(false)
const error = ref('')
const success = ref(false)

async function submit() {
  error.value = ''
  success.value = false
  if (!echoName.value.trim() || !hostNode.value.trim()) {
    error.value = t('remoteSubscribe.required')
    return
  }
  sending.value = true
  try {
    await identity.sendRemoteSubscribe(echoName.value.trim(), hostNode.value.trim())
    success.value = true
    notifications.success(t('remoteSubscribe.success'), t('remoteSubscribe.title'))
    echoName.value = ''
    hostNode.value = ''
  } catch (err) {
    error.value = err.message || t('remoteSubscribe.error')
  } finally {
    sending.value = false
  }
}
</script>
