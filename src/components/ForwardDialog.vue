<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
      <div class="p-6">
        <h3 class="text-lg font-semibold mb-4">{{ t('messageActions.selectDestination') }}</h3>
        
        <!-- Forward Type Selection -->
        <div class="mb-6">
          <div class="space-y-2">
            <label class="flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer">
              <input 
                type="radio" 
                v-model="forwardType" 
                value="echo" 
                class="mr-3"
              >
              <div>
                <div class="font-medium">{{ t('messageActions.forwardToEcho') }}</div>
                <div class="text-sm text-gray-500">{{ t('messageActions.forwardToEchoHint') }}</div>
              </div>
            </label>
            
            <label class="flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer">
              <input 
                type="radio" 
                v-model="forwardType" 
                value="netmail" 
                class="mr-3"
              >
              <div>
                <div class="font-medium">{{ t('messageActions.forwardAsNetmail') }}</div>
                <div class="text-sm text-gray-500">{{ t('messageActions.forwardAsNetmailHint') }}</div>
              </div>
            </label>
            
            <label class="flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer">
              <input 
                type="radio" 
                v-model="forwardType" 
                value="folder" 
                class="mr-3"
              >
              <div>
                <div class="font-medium">{{ t('messageActions.forwardToFolder') }}</div>
                <div class="text-sm text-gray-500">{{ t('messageActions.forwardToFolderHint') }}</div>
              </div>
            </label>
          </div>
        </div>
        
        <!-- Destination Fields -->
        <div v-if="forwardType === 'echo'" class="mb-6">
          <label class="block text-sm font-medium mb-2">{{ t('messageActions.selectEcho') }}</label>
          <select 
            v-model="selectedEchoName" 
            class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option :value="null" disabled>{{ t('messageActions.selectEchoPlaceholder') }}</option>
            <option v-for="echo in availableEchoes" :key="echo.name" :value="echo.name">
              {{ echo.name }}
            </option>
          </select>
        </div>
        
        <div v-if="forwardType === 'netmail'" class="mb-6">
          <label class="block text-sm font-medium mb-2">{{ t('netmail.recipient') }}</label>
          <input 
            v-model="recipientAddress" 
            type="text" 
            :placeholder="t('messageActions.recipientPlaceholder')"
            class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
          <div class="text-xs text-gray-500 mt-1">
            {{ t('messageActions.recipientHint') }}
          </div>
          
          <!-- Key status -->
          <div v-if="recipientAddress.trim()" class="mt-3 space-y-2">
            <div v-if="hasKey" class="text-sm text-green-600">
              ✓ {{ t('messageActions.keyAvailable') }}
            </div>
            <div v-else-if="hasRequestedKey" class="text-sm text-yellow-600">
              ⌛ {{ t('messageActions.keyRequestedOn', { date: requestDate }) }}
            </div>
            <div v-else class="text-sm text-red-600">
              ⚠ {{ t('messageActions.noKeyWarning') }}
            </div>
            
            <div v-if="!hasKey && !hasRequestedKey" class="flex items-center gap-2">
              <button
                @click="requestPublicKey"
                class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {{ t('messageActions.requestPubkey') }}
              </button>
              <div class="text-xs text-gray-500">
                {{ t('messageActions.requestPubkeyHint') }}
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="forwardType === 'folder'" class="mb-6">
          <label class="block text-sm font-medium mb-2">{{ t('messageActions.selectFolder') }}</label>
          <select
            v-model="selectedFolder"
            class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option :value="null" disabled>{{ t('messageActions.selectFolderPlaceholder') }}</option>
            <option v-for="folder in customFolders" :key="folder.slug" :value="folder.slug">
              {{ folder.name }}
            </option>
          </select>
          <div v-if="customFolders.length === 0" class="text-xs text-gray-500 mt-2">
            {{ t('messageActions.noFoldersHint') }}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            {{ t('messageActions.forwardToFolderHint') }}
          </div>
        </div>
        
        <!-- Optional Comment -->
        <div class="mb-6">
          <MarkdownEditor v-model="comment" :label="t('messageActions.commentOptional')" :rows="3" :placeholder="t('messageActions.commentPlaceholder')" />
        </div>
        
        <!-- Actions -->
        <div class="flex justify-end space-x-3">
          <button
            @click="close"
            class="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            {{ t('app.cancel') }}
          </button>
          <button
            @click="forward"
            :disabled="!canForward"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ t('app.forward') || 'Forward' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEchoStore } from '../stores/echo'
import { keyService } from '../services/keyService'
import { useSettingsStore } from '../stores/settings'
import * as db from '../services/db'
import MarkdownEditor from '../components/MarkdownEditor.vue'

const { t } = useI18n()
const echoStore = useEchoStore()
const settingsStore = useSettingsStore()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  message: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'forward'])

// Forward type
const forwardType = ref('echo')

// Destination fields
const selectedEchoName = ref(null)
const recipientAddress = ref('')
const selectedFolder = ref(null)
const comment = ref('')

// Custom netmail folders (reloaded each time the dialog opens)
const customFolders = ref([])

function reloadCustomFolders() {
  const folders = db.getNetmailFolders()
  customFolders.value = Object.entries(folders).map(([slug, name]) => ({ slug, name }))
}

// Key status for netmail recipient
const keyStatus = computed(() => {
  const address = recipientAddress.value.trim()
  if (!address) return null
  if (keyService.hasPublicKey(address)) {
    return { status: 'has_key' }
  }
  const requestStatus = keyService.getRequestStatus(address)
  if (requestStatus) {
    return { status: 'requested', requestedAt: requestStatus.requestedAt }
  }
  return { status: 'no_key' }
})

const hasKey = computed(() => keyStatus.value?.status === 'has_key')
const hasRequestedKey = computed(() => keyStatus.value?.status === 'requested')
const requestDate = computed(() => {
  if (keyStatus.value?.status === 'requested') {
    return new Date(keyStatus.value.requestedAt).toLocaleString()
  }
  return null
})

async function requestPublicKey() {
  const address = recipientAddress.value.trim()
  if (!address) return
  try {
    await keyService.requestPublicKey(address, false)
    // Success - status will update via computed
  } catch (err) {
    console.error('Failed to request public key:', err)
    // TODO: show error notification
  }
}

// Available echoes: the store's subscribed list (synced from the node) plus
// any echo the server reports as subscribed (#271).
const availableEchoes = computed(() => {
  const names = new Set()
  for (const e of echoStore.subscribedEchoesList) names.add(e.name)
  for (const e of echoStore.echoes) if (e.subscribed) names.add(e.name)
  const result = echoStore.echoes.filter(e => names.has(e.name))
  const known = new Set(result.map(e => e.name))
  for (const name of names) {
    if (!known.has(name)) result.push({ name })
  }
  return result
})

// Validation
const canForward = computed(() => {
  switch (forwardType.value) {
    case 'echo':
      return selectedEchoName.value !== null
    case 'netmail':
      return recipientAddress.value.trim() !== '' && recipientAddress.value.includes(':')
    case 'folder':
      return selectedFolder.value !== null
    default:
      return false
  }
})

function close() {
  emit('close')
}

function forward() {
  const forwardData = {
    type: forwardType.value,
    message: props.message,
    destination: null,
    comment: comment.value.trim() || null
  }

  switch (forwardType.value) {
    case 'echo':
      forwardData.destination = selectedEchoName.value
      break
    case 'netmail':
      forwardData.destination = recipientAddress.value
      break
    case 'folder':
      forwardData.destination = selectedFolder.value
      break
  }

  emit('forward', forwardData)
  reset()
}

function reset() {
  forwardType.value = 'echo'
  selectedEchoName.value = null
  recipientAddress.value = ''
  selectedFolder.value = null
  comment.value = ''
}

// Reset when dialog opens
watch(() => props.show, (newVal) => {
  if (newVal) {
    reset()
    reloadCustomFolders()
  }
})

// Load folders on mount too (so first open shows existing folders)
if (typeof window !== 'undefined') {
  reloadCustomFolders()
}
</script>