<template>
  <div v-if="visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
      <div class="p-6">
        <h2 class="text-xl font-bold mb-4">{{ title }}</h2>
        
        <div class="mb-6">
          <p class="text-gray-600 mb-4">{{ message }}</p>
          
          <div class="space-y-4">
            <div>
               <label class="block text-sm font-medium text-gray-700 mb-1">
                 {{ t('passwordDialog.password') }}
               </label>
              <input
                v-model="password"
                type="password"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                 :placeholder="t('passwordDialog.enterYourPassword')"
                @keyup.enter="submit"
                ref="passwordInput"
              />
            </div>
            
            <div v-if="showRemember" class="flex items-center">
              <input
                v-model="rememberPassword"
                type="checkbox"
                id="remember-password"
                class="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <label for="remember-password" class="ml-2 text-sm text-gray-600">
                 {{ t('passwordDialog.rememberPassword') }}
              </label>
            </div>
          </div>
        </div>

        <div v-if="showImport" class="mb-4">
          <button
            @click="$emit('import')"
            class="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
          >
            {{ t('passwordDialog.importBackup') }}
          </button>
        </div>

        <div v-if="showInviteScan" class="mb-4">
          <QRScanner mode="invite" @invite="onInvite" />
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ t('invite.scanHint') }}
          </p>
        </div>

        <div class="flex justify-end space-x-3">
          <button
            @click="cancel"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            {{ t('passwordDialog.cancel') }}
          </button>
          <button
            @click="submit"
            :disabled="!password || loading"
            class="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {{ loading ? t('passwordDialog.processing') : t('passwordDialog.confirm') }}
          </button>
        </div>
        
        <div v-if="error || bootError" class="mt-4 p-3 bg-red-50 text-red-700 rounded-md text-sm dark:bg-red-900/30 dark:text-red-400">
          {{ error || bootError }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRScanner from './QRScanner.vue'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: 'Enter Password'
  },
  message: {
    type: String,
    default: 'Your private key is encrypted. Please enter your password to continue.'
  },
  // Error from the boot flow (e.g. the node refused the policy request).
  bootError: {
    type: String,
    default: ''
  },
  showRemember: {
    type: Boolean,
    default: true
  },
  showImport: {
    type: Boolean,
    default: true
  },
  showInviteScan: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm', 'cancel', 'import', 'invite'])

const password = ref('')
const rememberPassword = ref(false)
const error = ref('')
const passwordInput = ref(null)

// Focus password input when dialog appears
onMounted(() => {
  if (props.visible && passwordInput.value) {
    passwordInput.value.focus()
  }
})

watch(() => props.visible, (newVal) => {
  if (newVal && passwordInput.value) {
    passwordInput.value.focus()
  } else {
    password.value = ''
    error.value = ''
  }
})

function submit() {
  if (!password.value) {
    error.value = t('passwordDialog.pleaseEnterPassword')
    return
  }
  emit('confirm', {
    password: password.value,
    remember: rememberPassword.value
  })
}

function cancel() {
  password.value = ''
  error.value = ''
  emit('cancel')
}

function onInvite(invite) {
  emit('invite', invite)
}
</script>