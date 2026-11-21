<template>
  <div class="admin">
    <h1 class="text-3xl font-bold mb-4 dark:text-white">{{ t('admin.title') }}</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-4">
        <div class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('admin.newcomersGroup') }}</h2>
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">{{ t('admin.newcomersHint') }}</p>
          <router-link
            to="/echoes"
            class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            {{ t('admin.goToNewcomers') }}
          </router-link>
        </div>

        <div class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('admin.nodeCouncil') }}</h2>
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">{{ t('admin.nodeCouncilHint') }}</p>
          <router-link
            to="/echoes"
            class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            {{ t('admin.goToNodeCouncil') }}
          </router-link>
        </div>
      </div>

      <div class="space-y-4">
        <div class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('policyViewer.title') }}</h2>
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">{{ t('policyEdit.hint') }}</p>
          <button
            v-if="identity.isAdmin && policyData"
            @click="showPolicyEdit = true"
            class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            {{ t('policyViewer.editPolicy') }}
          </button>
          <PolicyEditDialog
            :visible="showPolicyEdit"
            :policy-data="policyData"
            @close="showPolicyEdit = false"
          />
        </div>

        <div class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('admin.nodeListTitle') }}</h2>
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">{{ t('admin.nodeListHint') }}</p>
          <button
            v-if="identity.isAdmin"
            @click="showNodeList = true"
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            {{ t('admin.nodeListButton') }}
          </button>
          <NodeListDialog :visible="showNodeList" @close="showNodeList = false" />
        </div>

        <div class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('admin.networkMerge') }}</h2>
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">{{ t('admin.networkMergeHint') }}</p>
          <div class="flex gap-2 flex-col">
            <div class="flex gap-2 row">
              <QRDisplay v-if="mergeQrUrl" :url="mergeQrUrl" />
              <QRScanner @scanned="onScanned" />
            </div>
            <div class="flex flex-row gap-1">
              <input
                v-model="manualUrl"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                :placeholder="t('admin.manualUrl')"
              />
              <button
                @click="processManualUrl"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {{ t('admin.urlProcess') }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="mergeSessions.length" class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('admin.mergeSessions') }}</h2>
          <div v-for="session in mergeSessions" :key="session.stateKey" class="text-sm mb-3 last:mb-0">
            <div class="font-medium dark:text-gray-200">
              {{ t('admin.mergePhase', { phase: session.phase }) }}
              <span v-if="session.target" class="text-gray-500 dark:text-gray-400">· {{ t('admin.mergeTarget', { target: session.target }) }}</span>
            </div>
            <div v-if="session.chunks.length" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ t('admin.mergeChunks', { count: session.chunks.length }) }}:
              <span v-for="chunk in session.chunks" :key="chunk.index" class="mr-2">
                #{{ chunk.index + 1 }} <span class="font-mono">{{ chunk.winner || '—' }}</span>
              </span>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ t('admin.mergeVotes', { accept: session.accept, reject: session.reject }) }}
              <span v-if="session.result" class="ml-2 font-medium"
                :class="session.result === 'merged' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'">
                {{ session.result === 'merged' ? t('admin.mergeMerged') : t('admin.mergeFailedState') }}
              </span>
            </div>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{{ t('admin.mergeVoteHint') }}</p>
        </div>

        <div class="border rounded-lg p-4 dark:border-gray-700">
          <h2 class="text-xl font-semibold mb-2 dark:text-gray-200">{{ t('admin.subscribeClient') }}</h2>
          <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">{{ t('admin.subscribeClientHint') }}</p>
          <div class="space-y-2">
            <input v-model="subscribeAddress" :placeholder="t('admin.userAddress')" class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
            <select v-model="subscribeEcho" class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
              <option value="">{{ t('admin.selectEcho') }}</option>
              <option v-for="e in availableEchoes" :key="e.id" :value="e.name">{{ e.name }}</option>
            </select>
            <button @click="subscribeClient" :disabled="!subscribeAddress || !subscribeEcho" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
              {{ t('admin.subscribe') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { specialEchoName } from '../utils/policyParams'
import { useI18n } from 'vue-i18n'
import { useNotificationsStore } from '../stores/notifications'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { apiService } from '../services/api'
import { apiUrlToAppUrl, buildInviteURL, bytesToBase64, nodeAddressFromUser, parseInviteURL } from '../services/invite'
import { buildMergeSessions } from '../utils/mergeSessions'
import QRDisplay from '../components/QRDisplay.vue'
import QRScanner from '../components/QRScanner.vue'
import PolicyEditDialog from '../components/PolicyEditDialog.vue'
import NodeListDialog from '../components/NodeListDialog.vue'

const { t } = useI18n()
const notifications = useNotificationsStore()
const identity = useIdentityStore()
const echo = useEchoStore()
const manualUrl = ref('')
const showPolicyEdit = ref(false)
const showNodeList = ref(false)
const policyData = ref(null)
const adminCouncilName = computed(() => specialEchoName(policyData.value?.policy?.parameters, 'admin', 'Admin council'))
const nodeUrl = ref('')
const subscribeAddress = ref('')
const subscribeEcho = ref('')

const availableEchoes = computed(() => echo.echoes)
// Active merge sessions (#212) as they appear in the Admin council.
const mergeSessions = computed(() => buildMergeSessions(echo.messages[adminCouncilName.value] || []))

// The merge QR carries the node URL and its public key: the scanning admin's
// node needs the key to verify and encrypt the merge exchange (#103).
const mergeQrUrl = computed(() => {
  if (!nodeUrl.value) return ''
  return buildInviteURL(apiUrlToAppUrl(nodeUrl.value), {
    pubkey: identity.nodeEd25519PublicKey || null,
    address: nodeAddressFromUser(identity.user?.address) || null,
  })
})

onMounted(() => {
  try {
    const raw = localStorage.getItem('fm_policy_full')
    if (raw) policyData.value = JSON.parse(raw)
  } catch { /* policy is optional here */ }
  echo.loadEcho(adminCouncilName.value)
  // apiService.baseURL is relative for local builds (/pre/api): resolve it
  // against the origin so the QR carries the full deployment path (#337).
  const baseUrl = apiService.baseURL || '/api'
  try {
    nodeUrl.value = new URL(baseUrl, window.location.origin).href.replace(/\/+$/, '')
  } catch {
    nodeUrl.value = window.location.origin
  }
})

async function subscribeClient() {
  if (!subscribeAddress.value || !subscribeEcho.value) return
  try {
    await apiService.subscribeEcho({
      echo_name: subscribeEcho.value,
      user_address: subscribeAddress.value,
    })
    notifications.success(
      t('admin.subscribed', { address: subscribeAddress.value, echo: subscribeEcho.value }),
      t('admin.subscribedTitle')
    )
  } catch (err) {
    notifications.error(err.message || t('admin.subscribeFailed'), t('admin.errorTitle'))
  }
}

async function processManualUrl() {
  const invite = parseInviteURL(manualUrl.value)
  console.log(invite, manualUrl)
  if (!invite) {
    notifications.error(t('qr.invalidCode'), t('qr.title'))
    return
  }
  if (!invite.pubkey) {
    notifications.error(t('qr.noNodeKey'), t('qr.title'))
    return
  }
  if (confirm(t('qr.mergeConfirm', { url: invite.baseUrl }))) {
    onScanned({ url: invite.baseUrl, pubkey: invite.pubkey, address: invite.address })
  }

}

// Merge initiation: the request goes to OUR node (apiService keeps our base URL)
// and carries the peer's URL + public key from the scanned QR.
async function onScanned({ url, pubkey, address }) {
  try {
    console.log(url, pubkey, address)
    const response = await apiService.merge({
      url,
      address: address || undefined,
      pubkey: pubkey ? bytesToBase64(pubkey) : undefined,
    })
    if (response?.status === 'merge_proposed') {
      notifications.success(t('admin.mergeProposed'), t('admin.mergeTitle'))
    } else {
      notifications.success(t('admin.mergeInitiated'), t('admin.mergeTitle'))
    }
  } catch (err) {
    notifications.error(err.message || t('admin.mergeFailed'), t('admin.mergeTitle'))
  }
}
</script>
