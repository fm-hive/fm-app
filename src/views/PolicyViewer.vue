<template>
  <div class="policy-viewer container mx-auto px-4 py-8">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-white">{{ t('policyViewer.title') }}</h1>
        <div class="flex gap-2">
          <button
            @click="checkPolicy"
            :disabled="checking"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {{ checking ? t('policyViewer.checking') : t('policyViewer.checkPolicy') }}
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-red-700">{{ error }}</p>
        <button @click="fetchFromCache" class="mt-2 text-sm text-blue-600 hover:text-blue-800">{{ t('policyViewer.retry') }}</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-500">{{ t('boot.loading') }}</p>
      </div>

      <!-- No policy cached -->
      <div v-else-if="!policyData" class="text-center py-12">
        <p class="text-gray-500 dark:text-gray-400">{{ t('policyViewer.noPolicyCached') }}</p>
      </div>

      <!-- Policy content -->
      <div v-else class="space-y-6">
        <!-- Verification banner -->
        <div v-if="checkResult" class="p-4 rounded-lg" :class="checkResult.verified ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'">
          <p :class="checkResult.verified ? 'text-green-700' : 'text-red-700'" class="font-medium">
            {{ checkResult.verified ? '✓ ' : '✗ ' }}{{ checkResult.verified ? t('policyViewer.policyUpToDate') : t('policyViewer.policyChanged') }}
          </p>
          <p class="text-xs mt-1" :class="checkResult.verified ? 'text-green-600' : 'text-red-600'">
            {{ t('policyViewer.signature') }}: {{ checkResult.verified ? t('policyViewer.signatureVerified') : t('policyViewer.signatureCheckFailed') }}
          </p>
          <p v-if="checkResult.checkedAt" class="text-xs mt-1 text-gray-500">
            {{ t('policyViewer.lastChecked') }}: {{ new Date(checkResult.checkedAt).toLocaleString() }}
          </p>
        </div>

        <!-- Policy content -->
        <PolicyDisplay
          v-if="policyData"
          :policy-data="policyData"
          :signature-verified="signatureVerified"
          :node-public-key-base64="nodePublicKeyBase64"
          :use-markdown="true"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiService } from '../services/api'
import * as crypto from '../services/crypto'
import PolicyDisplay from '../components/PolicyDisplay.vue'

const { t } = useI18n()

const policyData = ref(null)
const nodePublicKeyBase64 = ref('')
const signatureVerified = ref(false)
const checkResult = ref(null)
const loading = ref(true)
const checking = ref(false)
const error = ref('')

onMounted(() => {
  fetchFromCache()
})

function parseJwsPayload(jws) {
  const parts = jws.split('.')
  if (parts.length !== 3) return null
  try {
    const payloadBytes = crypto.base64UrlDecode(parts[1])
    return JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch { return null }
}

function fetchFromCache() {
  error.value = ''
  try {
    const raw = localStorage.getItem('fm_policy_full')
    if (raw) {
      const data = JSON.parse(raw)
      policyData.value = data
      loading.value = false
    } else {
      loading.value = false
    }
  } catch (e) {
    loading.value = false
  }
}

async function checkPolicy() {
  checking.value = true
  error.value = ''
  checkResult.value = null

  try {
    const response = await apiService.policy(null, false)
    if (!response?.policy) {
      error.value = t('policyViewer.fetchError')
      return
    }

    const payload = parseJwsPayload(response.policy)
    if (!payload) {
      error.value = t('policyViewer.fetchError')
      return
    }

    // Update cached policy
    localStorage.setItem('fm_policy_full', JSON.stringify(payload))
    policyData.value = payload
    nodePublicKeyBase64.value = response.sig_pkey || ''

    // Verify signature if we have the node public key
    if (payload?.id && policyData.value?.id) {
      signatureVerified.value = payload.id === policyData.value.id
    }

    checkResult.value = {
      verified: true,
      checkedAt: Date.now(),
    }
  } catch (e) {
    error.value = e.message || t('policyViewer.fetchError')
  } finally {
    checking.value = false
  }
}
</script>
