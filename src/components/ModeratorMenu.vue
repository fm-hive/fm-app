<template>
  <div class="moderator-menu fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-semibold mb-4">{{ t('moderator.moderateMessage') }}</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">{{ t('moderator.action') }}</label>
          <div class="space-x-4">
            <label class="inline-flex items-center">
              <input
                v-model="severity"
                type="radio"
                value="warning"
                class="mr-2"
              />
              {{ t('moderator.warning') }}
            </label>
            <label class="inline-flex items-center">
              <input
                v-model="severity"
                type="radio"
                value="punishment"
                class="mr-2"
              />
              {{ t('moderator.punishment') }}
            </label>
          </div>
        </div>
        
        <div v-if="severity === 'punishment'">
          <label class="block text-sm font-medium mb-1">{{ t('moderator.durationHours') }}</label>
          <input
            v-model.number="durationHours"
            type="number"
            min="1"
            max="720"
            class="w-full border rounded px-3 py-2"
          />
          <p class="text-xs text-gray-500 mt-1">
            {{ t('moderator.durationHelp') }}
          </p>
        </div>
        
        <div>
          <MarkdownEditor v-model="reason" :label="t('moderator.reason')" :rows="3" :placeholder="t('moderator.explainReason')" />
        </div>
        
        <div class="flex justify-end space-x-3 pt-4">
          <button
            @click="cancel"
            class="px-4 py-2 border rounded"
          >
            {{ t('app.cancel') }}
          </button>
          <button
            @click="submit"
            :disabled="submitting"
            class="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
          >
            {{ submitting ? t('moderator.submitting') : t('moderator.submit') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useMessageSender } from '../composables/useMessageSender'
import MarkdownEditor from '../components/MarkdownEditor.vue'

const { t } = useI18n()

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
  initialSeverity: {
    type: String,
    default: 'warning',
    validator: (value) => ['warning', 'punishment'].includes(value)
  }
})

const emit = defineEmits(['close', 'submitted'])

const identity = useIdentityStore()
const echoStore = useEchoStore()
const messageSender = useMessageSender()

const severity = ref(props.initialSeverity)
const durationHours = ref(24)
const reason = ref('')
const submitting = ref(false)

const echoName = computed(() => {
  if (!props.message.echo_id) return ''
  const echo = echoStore.echoes.find(e => e.id === props.message.echo_id)
  return echo?.name || props.message.echo_id.toString()
})

// Обновляем severity при изменении initialSeverity
watch(() => props.initialSeverity, (newVal) => {
  severity.value = newVal
})

async function submit() {
  if (!severity.value) return
  
  submitting.value = true
  try {
    const moderatorData = {
      severity: severity.value,
      to: props.message.sender_address,
      message: reason.value || `Moderation: ${severity.value}`,
      echo: echoName.value,
      originalMessage: props.message,
      rules: {}, // TODO: include current network rules
    }
    
    // Additional fields for punishment
    if (severity.value === 'punishment') {
      moderatorData.duration_hours = durationHours.value
    }
    
    await messageSender.sendToEcho(echoName.value, 'echomail', moderatorData)
    
    emit('submitted', moderatorData)
    emit('close')
    
  } catch (err) {
    console.error('Moderator action failed:', err)
    alert(`Moderation failed: ${err.message}`)
  } finally {
    submitting.value = false
  }
}

function cancel() {
  emit('close')
}
</script>