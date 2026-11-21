<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
      <h3 class="text-lg font-bold mb-2 dark:text-white">{{ t('policyEdit.title') }}</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ t('policyEdit.hint') }}</p>

      <div class="flex-1 overflow-y-auto space-y-4 pr-2">
        <!-- Policy Text -->
        <div>
          <MarkdownEditor v-model="editText" :label="t('policyEdit.policyText')" :rows="4" />
        </div>

        <!-- All-chunks-only toggle -->
        <div class="flex items-start gap-2 p-2 border rounded dark:border-gray-600">
          <input id="all-chunks-only" type="checkbox" v-model="allChunksOnly" class="mt-0.5 rounded" />
          <div>
            <label for="all-chunks-only" class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('policyEdit.allChunksOnly') }}</label>
            <p class="text-xs text-gray-500">{{ t('policyEdit.allChunksOnlyHint') }}</p>
          </div>
        </div>

        <!-- Parameters -->
        <div class="space-y-2">
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('policyEdit.policyParams') }}</div>
          <div v-for="param in paramDefs" :key="param.key" class="border rounded p-2 dark:border-gray-600">
            <div class="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono">{{ param.key }}</div>
            <div class="text-xs text-gray-500 mb-1">{{ t('policyEdit.params.' + param.key) }}</div>
            <div v-if="param.unknown" class="text-xs text-amber-600 dark:text-amber-400 mb-1">{{ t('policyEdit.unknownParam') }}</div>
            <input
              v-if="param.type === 'number'"
              v-model.number="editValues[param.key]"
              type="number" :min="param.min || 0"
              class="w-40 p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            />
            <select
              v-else-if="param.type === 'select'"
              v-model="editValues[param.key]"
              class="p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              <option v-for="opt in param.options" :key="opt" :value="opt">
                {{ t('policyEdit.select.' + opt) }}
              </option>
            </select>
            <input
              v-else
              v-model="editValues[param.key]"
              class="w-48 p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              :maxlength="param.maxLength || undefined"
              :placeholder="param.type === 'duration' ? t('policyEdit.durationPlaceholder') : ''"
            />
            <div v-if="param.type === 'duration'" class="text-xs text-gray-500 mt-1">
              {{ t('policyEdit.durationHint') }}
            </div>
          </div>

          <!-- Network rate limits (per address per day, 0 = disabled) -->
          <div class="border rounded p-2 dark:border-gray-600">
            <div class="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono">rate_limit</div>
            <div class="text-xs text-gray-500 mb-1">{{ t('policyEdit.rateLimitHint') }}</div>
            <div class="flex flex-wrap gap-3">
              <label v-for="key in rateLimitKeys" :key="key" class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                {{ t('rateLimit.kinds.' + key) }}
                <input
                  v-model="rateLimitValues[key]"
                  type="number" min="0"
                  class="w-20 p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                />
              </label>
            </div>
          </div>
        </div>

        <!-- Diff Preview -->
        <div v-if="showDiff" class="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
          <h4 class="font-medium mb-2 dark:text-gray-200">{{ t('policyEdit.diffPreview') }}</h4>

          <div v-if="textChanged" class="mb-2">
            <div class="text-xs text-gray-500 mb-1">{{ t('policyEdit.textChanged') }}:</div>
            <div class="bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300 text-xs whitespace-pre-wrap mb-1">- {{ originalText }}</div>
            <div class="bg-green-50 dark:bg-green-900/20 p-2 rounded text-green-700 dark:text-green-300 text-xs whitespace-pre-wrap">+ {{ editText }}</div>
          </div>

          <div v-if="paramDiffs.length > 0">
            <div class="text-xs text-gray-500 mb-1">{{ t('policyEdit.paramsChanged') }}:</div>
            <div v-for="(d, i) in paramDiffs" :key="i" class="text-xs py-0.5 font-mono">
              <span v-if="d.type === 'changed'" class="text-yellow-600 dark:text-yellow-400">~ {{ d.key }}: {{ d.old }} → {{ d.new }}</span>
              <span v-else-if="d.type === 'added'" class="text-green-600 dark:text-green-400">+ {{ d.key }}: {{ d.new }}</span>
              <span v-else class="text-red-500">- {{ d.key }}</span>
            </div>
          </div>

          <div v-if="!textChanged && paramDiffs.length === 0" class="text-xs text-gray-500">
            {{ t('policyEdit.noChanges') }}
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>

      <div class="flex justify-between mt-4 pt-3 border-t dark:border-gray-600">
        <button @click="previewDiff" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('policyEdit.preview') }}
        </button>
        <div class="flex gap-3">
          <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
            {{ t('app.cancel') }}
          </button>
          <button @click="submit" :disabled="sending" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm">
            {{ sending ? t('policyEdit.sending') : t('policyEdit.propose') }}
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
import { useNotificationsStore } from '../stores/notifications'
import { createSignedMessage } from '../services/message'
import { useOutbox } from '../composables/useOutbox'
import MarkdownEditor from './MarkdownEditor.vue'
import { specialEchoName } from '../utils/policyParams'
import { POLICY_PARAM_DEFS, RATE_LIMIT_KEYS, editablePolicyParams } from '../utils/policyParams'

const { t } = useI18n()
const identity = useIdentityStore()
const notifications = useNotificationsStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  policyData: { type: Object, default: null },
})
const emit = defineEmits(['close'])

// Fields for the known parameters plus a generic field for any parameter the
// node adds that this list does not know yet (#83).
const paramDefs = computed(() => editablePolicyParams(props.policyData?.policy?.parameters || {}))

const editText = ref('')
const editValues = ref({})
const showDiff = ref(false)
const sending = ref(false)
const error = ref('')
const allChunksOnly = ref(false)

// Network rate limit (issue #175): nested map, edited separately from the flat
// paramDefs list.
const rateLimitKeys = RATE_LIMIT_KEYS
const rateLimitValues = ref({})

function loadRateLimits(params) {
  const values = {}
  const limits = params?.rate_limit || {}
  for (const key of rateLimitKeys) {
    const val = limits[key]
    values[key] = val !== undefined && val !== null ? String(val) : ''
  }
  return values
}

const originalRateLimits = computed(() => loadRateLimits(props.policyData?.policy?.parameters))

const originalText = computed(() => props.policyData?.policy?.text || '')

const originalValues = computed(() => {
  const params = props.policyData?.policy?.parameters || {}
  const result = {}
  for (const def of paramDefs.value) {
    const val = params[def.key]
    if (val !== undefined && val !== null) result[def.key] = String(val)
    else result[def.key] = ''
  }
  return result
})

const textChanged = computed(() => editText.value !== originalText.value)

const paramDiffs = computed(() => {
  const diffs = []
  for (const def of paramDefs.value) {
    const oldVal = originalValues.value[def.key] || ''
    const newVal = String(editValues.value[def.key] || '')
    if (newVal && oldVal === '') {
      diffs.push({ type: 'added', key: def.key, new: newVal })
    } else if (!newVal && oldVal !== '') {
      diffs.push({ type: 'removed', key: def.key })
    } else if (newVal !== oldVal) {
      diffs.push({ type: 'changed', key: def.key, old: oldVal, new: newVal })
    }
  }
  for (const key of rateLimitKeys) {
    const oldVal = originalRateLimits.value[key] || ''
    const newVal = String(rateLimitValues.value[key] || '')
    const label = `rate_limit.${key}`
    if (newVal && oldVal === '') {
      diffs.push({ type: 'added', key: label, new: newVal })
    } else if (!newVal && oldVal !== '') {
      diffs.push({ type: 'removed', key: label })
    } else if (newVal !== oldVal) {
      diffs.push({ type: 'changed', key: label, old: oldVal, new: newVal })
    }
  }
  return diffs
})

watch(() => props.visible, (v) => {
  if (v) {
    editText.value = originalText.value
    showDiff.value = false
    error.value = ''
    const params = props.policyData?.policy?.parameters || {}
    const vals = {}
    for (const def of paramDefs.value) {
      const val = params[def.key]
      if (val !== undefined && val !== null) vals[def.key] = String(val)
      else vals[def.key] = ''
    }
    editValues.value = vals
    rateLimitValues.value = loadRateLimits(params)
  }
})

function previewDiff() {
  showDiff.value = true
}

async function submit() {
  error.value = ''
  sending.value = true

  // Build params from individual fields
  const params = {}
  for (const def of paramDefs.value) {
    const val = editValues.value[def.key]
    if (val || val === 0) {
      if (def.type === 'number') {
        params[def.key] = String(val)
      } else {
        params[def.key] = val
      }
    }
  }

  // Preserve special_echogroups from original
  if (props.policyData?.policy?.parameters?.special_echogroups) {
    params.special_echogroups = props.policyData.policy.parameters.special_echogroups
  }

  // Network rate limits (issue #175): keep the nested map shape.
  const rateLimits = {}
  let hasRateLimit = false
  for (const key of rateLimitKeys) {
    const val = rateLimitValues.value[key]
    if (val !== '' && val !== null && val !== undefined) {
      rateLimits[key] = String(val)
      hasRateLimit = true
    }
  }
  if (hasRateLimit) {
    params.rate_limit = rateLimits
  } else if (props.policyData?.policy?.parameters?.rate_limit) {
    params.rate_limit = props.policyData.policy.parameters.rate_limit
  }

  try {
    const changeData = {
      proto: 'change_policy',
      from: identity.user.address,
      to: 'all',
      subject: 'Change policy',
      message: 'Policy change proposal',
      date: new Date().toISOString(),
      node1: identity.user.address,
      all_chunks_only: allChunksOnly.value,
      proposed_policy: {
        text: editText.value,
        parameters: params,
      },
    }

    const council = specialEchoName(props.policyData?.policy?.parameters, 'admin', 'Admin council')
    const signedMessage = await createSignedMessage('change_policy', changeData, {
      echo_name: council,
    })

    const outbox = useOutbox()
    outbox.add({
      type: 'change_policy',
      echoName: council,
      message: signedMessage,
      label: 'Change policy',
      detail: `Policy change proposal`,
    })
    notifications.success(t('policyEdit.proposalAdded'), t('policyEdit.title'))
    emit('close')
  } catch (err) {
    error.value = err.message || t('policyEdit.sendError')
  } finally {
    sending.value = false
  }
}
</script>
