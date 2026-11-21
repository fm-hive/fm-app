<template>
  <div class="space-y-6">
    <!-- Policy ID -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-2 dark:text-white">{{ t('policyViewer.policyId') }}</h2>
      <code class="text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded block break-all dark:text-gray-300">{{ policyData?.id || 'N/A' }}</code>
    </div>

    <!-- Policy Text -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-2 dark:text-white">{{ t('policyViewer.policyText') }}</h2>
      <div v-if="policyData?.policy?.text" class="prose prose-sm dark:prose-invert max-w-none">
        <MarkdownRenderer v-if="useMarkdown" :content="policyData.policy.text" />
        <div v-else class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ policyData.policy.text }}</div>
      </div>
      <p v-else class="text-gray-500 dark:text-gray-400 text-sm">{{ t('policyViewer.noPolicyText') }}</p>
    </div>

    <!-- Parameters -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-2 dark:text-white">{{ t('policyViewer.policyParameters') }}</h2>
      <pre class="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto dark:text-gray-300">{{ JSON.stringify(policyData?.policy?.parameters || {}, null, 2) }}</pre>
    </div>

    <!-- Signature & Node Info -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-2 dark:text-white">{{ t('policyViewer.signatureVerification') }}</h2>
      <div class="text-sm space-y-2">
        <div>
          <span class="text-gray-500">{{ t('policyViewer.signature') }}:</span>
          <span :class="signatureVerified ? 'text-green-600' : 'text-red-600'" class="ml-2 font-medium">
            {{ signatureVerified ? t('policyViewer.signatureVerified') : t('policyViewer.signatureNotVerified') }}
          </span>
        </div>
        <div v-if="nodePublicKeyBase64">
          <span class="text-gray-500">{{ t('policyViewer.nodePublicKey') }}:</span>
          <code class="ml-2 text-xs bg-gray-100 dark:bg-gray-700 p-1 rounded dark:text-gray-300">{{ nodePublicKeyBase64.slice(0, 32) }}...</code>
        </div>
      </div>
    </div>

    <!-- Additional Data -->
    <div v-if="policyData?.data && Object.keys(policyData.data).length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-2 dark:text-white">{{ t('policyViewer.additionalData') }}</h2>
      <pre class="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto dark:text-gray-300">{{ JSON.stringify(policyData.data, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from './MarkdownRenderer.vue'

const { t } = useI18n()

defineProps({
  policyData: { type: Object, default: null },
  signatureVerified: { type: Boolean, default: false },
  nodePublicKeyBase64: { type: String, default: '' },
  useMarkdown: { type: Boolean, default: false },
})
</script>
