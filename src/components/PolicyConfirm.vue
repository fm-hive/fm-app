<template>
  <div v-if="visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-auto dark:bg-gray-800 dark:shadow-gray-900">
      <div class="p-6">
          <h2 class="text-xl font-bold mb-4 dark:text-gray-100">{{ t('policyConfirm.networkPolicyConfirmation') }}</h2>
        
        <div class="mb-6">
            <p class="text-gray-600 dark:text-gray-400 mb-4 dark:text-gray-300">
              {{ t('policyConfirm.nodeRequiresAcceptance') }}
            </p>
          
          <div class="space-y-6">
            <!-- Policy changed: show the diff against the last accepted policy, with a toggle to the full text -->
            <div v-if="hasPreviousPolicy" class="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg w-fit">
              <button
                type="button"
                class="px-3 py-1 text-sm rounded-md transition-colors"
                :class="mode === 'changes' ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'"
                @click="selectMode('changes')"
              >
                {{ t('policyConfirm.changesTab') }}
              </button>
              <button
                type="button"
                class="px-3 py-1 text-sm rounded-md transition-colors"
                :class="mode === 'full' ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'"
                @click="selectMode('full')"
              >
                {{ t('policyConfirm.fullPolicyTab') }}
              </button>
            </div>
            <PolicyDiff
              v-if="hasPreviousPolicy && mode === 'changes'"
              :previous-policy="previousPolicy"
              :policy-data="policyData"
            />
            <PolicyDisplay
              v-else
              :policy-data="policyData"
              :signature-verified="signatureVerified"
              :node-public-key-base64="nodePublicKeyBase64"
              :use-markdown="true"
            />
          </div>
        </div>
        
        <!-- Display Name (only for new keys) -->
        <div v-if="showNameInput" class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('policyConfirm.displayName') }}</label>
          <input
            v-model="displayName"
            type="text"
            :placeholder="t('policyConfirm.displayNamePlaceholder')"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:focus:ring-blue-400"
            maxlength="64"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ t('policyConfirm.displayNameHint') }}</p>
        </div>

        <!-- Verification Toggle -->
        <div class="mb-6 flex items-center">
          <input
            v-model="verifySignature"
            type="checkbox"
            id="verify-signature"
             class="h-4 w-4 text-blue-600 border-gray-300 rounded dark:text-blue-500 dark:border-gray-600"
          />
          <label for="verify-signature" class="ml-2 text-sm text-gray-600 dark:text-gray-400">
             {{ t('policyConfirm.verifyNodeSignature') }}
          </label>
        </div>
        
        <!-- Actions -->
        <div class="flex justify-end space-x-3">
           <button
             @click="cancel"
             class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-400"
           >
            {{ t('passwordDialog.cancel') }}
          </button>
           <button
             @click="confirm"
             :disabled="loading"
             class="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-blue-700 dark:hover:bg-blue-600 dark:focus:ring-blue-400"
           >
            {{ loading ? t('passwordDialog.processing') : t('policyConfirm.acceptPolicy') }}
          </button>
        </div>
        
        <!-- Error Message -->
         <div v-if="error" class="mt-4 p-3 bg-red-50 text-red-700 rounded-md text-sm dark:bg-red-900/30 dark:text-red-400">
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PolicyDisplay from './PolicyDisplay.vue'
import PolicyDiff from './PolicyDiff.vue'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  policyData: {
    type: Object,
    default: () => ({})
  },
  nodePublicKeyBase64: {
    type: String,
    default: ''
  },
  signatureVerified: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  showNameInput: {
    type: Boolean,
    default: false
  },
  currentName: {
    type: String,
    default: ''
  },
  previousPolicy: {
    type: Object,
    default: null
  }
})
const emit = defineEmits(['confirm', 'cancel'])

const verifySignature = ref(true)
const displayName = ref('')
const error = ref('')
const mode = ref('changes')
// True once the user clicked a tab, so a baseline arriving after mount does not
// override their explicit choice.
const modeTouched = ref(false)

const hasPreviousPolicy = computed(() => !!(props.previousPolicy && props.previousPolicy.policy))

function selectMode(next) {
  modeTouched.value = true
  mode.value = next
}

// Debug logging
onMounted(() => {
  console.log('[PolicyConfirm] mounted, props:', {
    visible: props.visible,
    policyData: props.policyData,
    nodePublicKeyBase64: props.nodePublicKeyBase64,
    signatureVerified: props.signatureVerified,
    loading: props.loading,
    hasPreviousPolicy: hasPreviousPolicy.value
  })
})

watch(() => props.visible, (newVal) => {
  console.log('[PolicyConfirm] visible changed:', newVal)
  if (newVal) {
    verifySignature.value = true
    error.value = ''
    modeTouched.value = false
    mode.value = hasPreviousPolicy.value ? 'changes' : 'full'
    // Prefill the known display name so accepting the policy (e.g. after an
    // import) does not overwrite it with an empty value (#290).
    if (!displayName.value) displayName.value = (props.currentName || '').trim()
  }
})

// The diff baseline is set during the policy fetch and usually arrives before
// the dialog opens. If it lands after (async re-sign), switch to the changes
// view unless the user already picked a tab.
watch(hasPreviousPolicy, (has) => {
  if (has && !modeTouched.value) mode.value = 'changes'
})

watch(() => props.policyData, (newVal) => {
  console.log('[PolicyConfirm] policyData changed:', newVal)
}, { deep: true })

watch(() => props.loading, (newVal) => {
  console.log('[PolicyConfirm] loading changed:', newVal)
})



function confirm() {
  if (verifySignature.value && !props.signatureVerified) {
    error.value = t('policyConfirm.signatureVerificationError')
    return
  }
  const trimmedName = displayName.value.trim()
  if (props.showNameInput && !trimmedName) {
    error.value = t('policyConfirm.displayNameRequired')
    return
  }
  emit('confirm', {
    verifySignature: verifySignature.value,
    name: trimmedName
  })
}

function cancel() {
  error.value = ''
  emit('cancel')
}
</script>