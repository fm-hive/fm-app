<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="close">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg dark:text-white">{{ t('recovery.title') }}</h3>
        <button @click="close" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 text-xl leading-none">&times;</button>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">{{ t('recovery.hint') }}</p>
      <input
        v-model="url"
        class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
        :placeholder="t('recovery.urlPlaceholder')"
        @keyup.enter="recover"
      />
      <div v-if="error" class="mt-3 p-2 text-sm text-red-700 bg-red-50 rounded dark:bg-red-900/30 dark:text-red-300">{{ error }}</div>
      <div class="flex justify-end gap-3 mt-5">
        <button @click="close" class="px-4 py-2 border rounded dark:border-gray-600 dark:text-gray-300">{{ t('app.cancel') }}</button>
        <button @click="recover" :disabled="loading || !url.trim()"
          class="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">
          {{ loading ? t('recovery.recovering') : t('recovery.start') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { apiService } from '../services/api'
import { parseInviteURL, bytesToBase64 } from '../services/invite'
import { saveRecoveryNode } from '../utils/recoveryNode'
import * as crypto from '../services/crypto'

defineProps({ visible: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'success'])
const { t } = useI18n()
const identity = useIdentityStore()
const url = ref('')
const loading = ref(false)
const error = ref('')

function close() {
  if (!loading.value) emit('close')
}

async function recover() {
  error.value = ''
  const invite = parseInviteURL(url.value.trim())
  if (!invite?.baseUrl || !invite.pubkey) {
    error.value = t('recovery.invalidUrl')
    return
  }
  if (!invite.address) {
    error.value = t('recovery.missingAddress')
    return
  }
  if (!identity.hasKeys || !identity.user?.address) {
    error.value = t('recovery.keysRequired')
    return
  }
  loading.value = true
  const oldBase = apiService.baseURL
  const oldNodeKey = identity.nodeEd25519PublicKey
  try {
    apiService.setBaseURL(invite.baseUrl)
    identity.setNodePublicKey(invite.pubkey)
    const x25519 = crypto.ed25519PublicKeyToX25519(invite.pubkey)
    identity.setNodeX25519PublicKey(x25519)
    apiService.setNodeX25519PublicKey(x25519)

    const payload = JSON.stringify({
      address: identity.user.address,
      node_address: invite.address,
    })
    const jws = await crypto.createJWS(identity.privateKey, payload, identity.publicKey)
    const result = await apiService.recover({
      address: identity.user.address,
      jws,
      pubkey: bytesToBase64(identity.publicKey),
    })
    saveRecoveryNode({
      apiUrl: invite.baseUrl,
      nodePubkeyB64: bytesToBase64(invite.pubkey),
      appUrl: invite.appUrl || '',
    })
    emit('success', result)
    window.location.reload()
  } catch (err) {
    apiService.setBaseURL(oldBase)
    if (oldNodeKey) identity.setNodePublicKey(oldNodeKey)
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}
</script>
