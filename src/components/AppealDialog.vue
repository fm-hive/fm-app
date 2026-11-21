<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="close">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
      <h3 class="text-lg font-semibold mb-4 dark:text-white">⚖️ {{ t('appeal.title') }}</h3>

      <div class="text-sm space-y-1 mb-4 dark:text-gray-300">
        <div><span class="text-gray-500">{{ t('appeal.moderator') }}:</span> {{ moderator }}</div>
        <div><span class="text-gray-500">{{ t('appeal.target') }}:</span> {{ targetAddress }}</div>
        <div><span class="text-gray-500">{{ t('appeal.echo') }}:</span> {{ punishmentEcho }}</div>
        <div><span class="text-gray-500">{{ t('appeal.severity') }}:</span> {{ t(`moderator.${severity}`) }}</div>
      </div>

      <MarkdownEditor v-model="reason" :label="t('appeal.reason')" :rows="3" :placeholder="t('appeal.reasonPlaceholder')" />

      <p class="text-xs text-gray-500 mt-2">{{ t('appeal.attachHint') }}</p>

      <div class="flex justify-end gap-3 pt-4">
        <button @click="close" class="px-4 py-2 border rounded dark:border-gray-600 dark:text-gray-300">
          {{ t('app.cancel') }}
        </button>
        <button
          @click="submit"
          :disabled="submitting"
          class="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
        >
          {{ submitting ? t('appeal.sending') : t('appeal.submit') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useMessageSender } from '../composables/useMessageSender'
import { getPolicyParams } from '../composables/useProtocolPhases'
import { buildBundle, bundleAttachment } from '../utils/selectedBundle'
import MarkdownEditor from '../components/MarkdownEditor.vue'

const { t } = useI18n()
const identity = useIdentityStore()
const messageSender = useMessageSender()

const props = defineProps({
  message: { type: Object, required: true },
  echoName: { type: String, default: '' },
})
const emit = defineEmits(['close', 'submitted'])

const reason = ref('')
const submitting = ref(false)

const data = computed(() => {
  try {
    return typeof props.message?.data === 'string' ? JSON.parse(props.message.data) : (props.message?.data || {})
  } catch {
    return {}
  }
})
const severity = computed(() => data.value.severity || 'punishment')
const targetAddress = computed(() => data.value.to || '')
const moderator = computed(() => props.message?.sender_address || '')
const punishmentEcho = computed(() => props.echoName || props.message?.echo_name || props.message?.echo || '')

const adminCouncilName = computed(() => {
  const params = getPolicyParams()
  return params?.special_echogroups?.admin || 'Admin council'
})

async function submit() {
  if (!props.message?.message_id) return
  submitting.value = true
  try {
    // The punishment travels with the appeal as a selected-messages bundle
    // (the same format the feed uses for «Отобранные»).
    const attachment = bundleAttachment(buildBundle([props.message]), 0, 1)
    const appealData = {
      proto: 'appeal',
      type: 'poster',
      from: identity.user?.address,
      to: 'all',
      message: reason.value || t('appeal.defaultReason'),
      date: new Date().toISOString(),
      echo: adminCouncilName.value,
      protoAddress: moderator.value,
      punishmentMessageId: props.message.message_id,
      punishmentEcho: punishmentEcho.value,
      severity: severity.value,
      targetAddress: targetAddress.value,
      attachments: [attachment],
    }
    await messageSender.sendToEcho(adminCouncilName.value, 'appeal', appealData)
    const { useNotificationsStore } = await import('../stores/notifications')
    useNotificationsStore().success(t('appeal.queued'), t('appeal.title'))
    emit('submitted')
    emit('close')
  } catch (err) {
    const { useNotificationsStore } = await import('../stores/notifications')
    useNotificationsStore().error(err.message || String(err), t('appeal.title'))
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('close')
}
</script>
