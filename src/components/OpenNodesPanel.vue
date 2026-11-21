<template>
  <div v-if="openNodes.length || voucherInvites.length" class="mb-4 border rounded-lg p-3 bg-indigo-50/60 dark:bg-indigo-900/20 dark:border-indigo-800">
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-semibold text-sm text-indigo-800 dark:text-indigo-200">{{ t('recovery.openNodes') }}</h3>
    </div>
    <div v-for="node in openNodes" :key="node.address" class="border rounded p-2 mb-2 bg-white/70 dark:bg-gray-800/70 dark:border-gray-700">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-sm dark:text-gray-200">{{ node.address }}</span>
        <span v-if="node.url" class="text-xs text-gray-500 dark:text-gray-400 break-all">{{ node.url }}</span>
        <span v-if="node.admin_address" class="text-xs text-gray-500 dark:text-gray-400">admin {{ node.admin_address }}</span>
        <div class="ml-auto flex gap-2">
          <button v-if="node.admin_address" @click="requestVoucher(node)"
            class="px-2 py-1 text-xs border rounded text-indigo-700 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-300 dark:border-indigo-700">
            {{ t('recovery.requestVoucher') }}
          </button>
          <button @click="switchNode(node)"
            class="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
            {{ t('recovery.switchNode') }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="voucherInvites.length" class="mt-2">
      <div class="text-xs font-medium text-indigo-800 dark:text-indigo-200 mb-1">{{ t('recovery.voucherInvites') }}</div>
      <button v-for="invite in voucherInvites" :key="invite" @click="openInvite(invite)"
        class="block w-full text-left text-xs text-indigo-700 dark:text-indigo-300 underline break-all mb-1">
        {{ invite }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageSender } from '../composables/useMessageSender'
import { keyService } from '../services/keyService'
import { apiUrlToAppUrl, buildInviteURL, parseInviteURL } from '../services/invite'
import { getActiveBoot } from '../composables/useBoot'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  netmail: { type: Array, default: () => [] },
})
const { t } = useI18n()
const { sendNetmail } = useMessageSender()

function messageData(message) {
  try {
    if (message?.data) return typeof message.data === 'string' ? JSON.parse(message.data) : message.data
    if (message?.jws) {
      const parts = message.jws.split('.')
      if (parts.length === 3) return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    }
  } catch { /* ignore */ }
  return null
}

const openNodes = computed(() => {
  let latest = null
  for (const message of props.messages) {
    if (message?.type !== 'recover') continue
    const data = messageData(message)
    if (data?.type === 'open_nodes' && Array.isArray(data.open_nodes)) latest = data.open_nodes
  }
  return latest || []
})

const voucherInvites = computed(() => {
  const result = new Set()
  for (const message of props.netmail) {
    const body = message?.body || ''
    for (const match of body.matchAll(/https?:\/\/[^\s"'<>]+voucher=[^\s"'<>]+/g)) result.add(match[0])
  }
  return [...result]
})

function bytesFromBase64(value) {
  try { return Uint8Array.from(atob(value || ''), c => c.charCodeAt(0)) } catch { return null }
}

async function requestVoucher(node) {
  if (node.admin_address && node.admin_sign_public_key) {
    keyService.storePublicKey({
      address: node.admin_address,
      sign_public_key: node.admin_sign_public_key,
      key_thumbprint: node.admin_key_thumbprint || '',
    })
  }
  await sendNetmail(node.admin_address, {
    subject: 'Voucher request',
    body: t('recovery.voucherRequestBody', { address: node.address }),
  })
}

async function switchNode(node) {
  const appUrl = apiUrlToAppUrl(node.url)
  const pubkey = bytesFromBase64(node.sign_public_key)
  if (!appUrl || !pubkey) return
  const invite = parseInviteURL(buildInviteURL(appUrl, { pubkey, address: node.address }))
  if (!invite) return
  const boot = getActiveBoot()
  if (boot) {
    await boot.applyInvite({ ...invite, recovery: true })
    window.location.reload()
  }
}

async function openInvite(invite) {
  const parsed = parseInviteURL(invite)
  if (!parsed) return
  const boot = getActiveBoot()
  if (boot) {
    await boot.applyInvite({ ...parsed, recovery: true })
    window.location.reload()
  }
}
</script>
