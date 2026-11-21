<template>
  <div class="home max-w-3xl mx-auto px-4 py-6">
    <div v-if="!identity.hasKeys">
      <h1 class="text-3xl font-bold mb-4 dark:text-white">{{ t('home.title') }}</h1>
      <div class="space-y-4">
        <div v-if="bootStore.isLoading" class="text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p class="mt-2 text-gray-600 dark:text-gray-400">{{ t('boot.initializing') }}</p>
        </div>
        <div v-else-if="bootStore.needsPassword" class="text-center">
          <p class="text-yellow-600 dark:text-yellow-400 mb-4">{{ t('boot.passwordRequiredMessage') }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('boot.passwordDialogHint') }}</p>
        </div>
        <div v-else-if="bootStore.needsPolicy" class="text-center">
          <p class="text-blue-600 dark:text-blue-400 mb-4">{{ t('boot.policyRequiredMessage') }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('boot.policyDialogHint') }}</p>
        </div>
        <div v-else-if="bootStore.hasError" class="text-center">
          <p class="text-red-600 mb-2">{{ t('boot.error', { error: bootStore.error }) }}</p>
          <button @click="manualBoot" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">{{ t('boot.retry') }}</button>
        </div>
        <div v-else class="text-center">
          <p class="mb-4 text-gray-600 dark:text-gray-400">{{ t('boot.setupIdentityMessage') }}</p>
          <button @click="manualBoot" :disabled="bootStore.isLoading" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {{ bootStore.isLoading ? t('home.processing') : t('home.registerLogin') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-white">{{ t('home.dashboard') }}</h1>
        <div class="flex items-center gap-2 text-xs">
          <span :class="pollStatus === 'ok' ? 'text-green-500' : pollStatus === 'error' ? 'text-red-500' : 'text-gray-400'">
            ● {{ t('home.' + (pollStatus === 'ok' ? 'connected' : pollStatus === 'error' ? 'error' : 'connecting')) }}
          </span>
          <span v-if="lastPollTime" class="text-gray-400 dark:text-gray-500">{{ t('home.lastPoll') }}: {{ formatTime(lastPollTime) }}</span>
        </div>
      </div>

      <!-- Active protocols -->
      <div v-if="activeProtocols.length > 0" class="mb-6">
        <h2 class="text-lg font-semibold mb-2 dark:text-gray-200">🛠️ {{ t('home.activeProtocols') }} ({{ activeProtocols.length }})</h2>
        <div class="space-y-2">
          <div v-for="msg in activeProtocols.slice(0, 5)" :key="msg.message_id"
            class="border rounded-lg p-3 text-sm dark:border-gray-700 dark:text-gray-300"
          >
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 text-xs rounded font-medium text-white" :class="protocolBadgeClass(msg)">{{ msg.type }}</span>
              <span class="text-xs text-gray-500">{{ msg.echo_name }}</span>
              <span class="text-xs text-gray-400">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div class="mt-1 truncate">{{ truncateProtocol(msg) }}</div>
          </div>
          <router-link v-if="activeProtocols.length > 5" to="/echoes" class="text-xs text-blue-500">+{{ activeProtocols.length - 5 }} more</router-link>
        </div>
      </div>

      <!-- Recent echo messages -->
      <div class="mb-6">
        <h2 class="text-lg font-semibold mb-2 dark:text-gray-200">{{ t('home.recentMessages') }}</h2>
        <div v-if="recentMessages.length === 0" class="text-gray-400 dark:text-gray-500 text-sm py-4 text-center">{{ t('home.noRecent') }}</div>
        <div v-else class="space-y-2">
          <div v-for="item in recentMessages" :key="item.message_id"
            @click="goToEcho(item.echo_name)"
            class="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span class="font-medium">{{ item.echo_name }}</span>
              <span>{{ formatTime(item.timestamp) }}</span>
            </div>
            <div class="text-sm dark:text-gray-200 truncate"><SenderLabel :address="item.sender_address" compact /></div>
            <div class="text-sm dark:text-gray-300 truncate">{{ msgSnippet(item) }}</div>
          </div>
        </div>
      </div>

      <!-- Recent netmail -->
      <div class="mb-6">
        <h2 class="text-lg font-semibold mb-2 dark:text-gray-200">{{ t('home.recentNetmail') }}</h2>
        <div v-if="recentNetmail.length === 0" class="text-gray-400 dark:text-gray-500 text-sm py-4 text-center">{{ t('home.noNetmail') }}</div>
        <div v-else class="space-y-2">
          <div v-for="msg in recentNetmail" :key="msg.message_id"
            @click="goToNetmail(msg)"
            class="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span class="font-medium">{{ netmailHeader(msg) }}</span>
              <span>{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div class="text-sm dark:text-gray-300 truncate">{{ msgSubject(msg) }}</div>
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="grid grid-cols-2 gap-3 mt-8">
        <router-link to="/echoes" class="block px-4 py-3 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 text-center font-medium">
          📢 {{ t('echoes.title') }}
        </router-link>
        <router-link to="/netmail" class="block px-4 py-3 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 text-center font-medium">
          ✉️ {{ t('netmail.title') }}
        </router-link>
        <router-link to="/search" class="block px-4 py-3 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 text-center font-medium">
          🔍 {{ t('search.title') }}
        </router-link>
        <router-link to="/settings" class="block px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-center font-medium">
          ⚙️ {{ t('settings.title') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SenderLabel from '../components/SenderLabel.vue'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useProtocolStore } from '../stores/protocol'
import { useBootStore } from '../stores/boot'
import { useSettingsStore } from '../stores/settings'
import { useBoot } from '../composables/useBoot'
import { usePolling } from '../composables/usePolling'

const { t } = useI18n()
const router = useRouter()
const identity = useIdentityStore()
const echo = useEchoStore()
const protocol = useProtocolStore()
const bootStore = useBootStore()
const settings = useSettingsStore()
const boot = useBoot()
const polling = usePolling()

const pollStatus = ref('idle')
const lastPollTime = ref(null)

onMounted(async () => {
  pollStatus.value = polling.status.value
  lastPollTime.value = polling.lastPollTime.value
  const interval = setInterval(() => {
    pollStatus.value = polling.status.value
    lastPollTime.value = polling.lastPollTime.value
  }, 2000)
  onUnmounted(() => clearInterval(interval))
  // Active fetch to populate dashboard immediately
  if (identity.hasKeys && identity.user?.address) {
    try {
      const { fetchMessages } = await import('../services/message')
      const msgs = await fetchMessages()
      if (msgs && msgs.length > 0) {
        const byEcho = {}
        for (const m of msgs) {
          const en = m.type === 'netmail' ? '__netmail__' : (m.echo_name || m.echo)
          if (!en || m._internal) continue
          if (!byEcho[en]) byEcho[en] = []
          byEcho[en].push(m)
        }
        for (const [name, list] of Object.entries(byEcho)) {
          echo.addMessages(name, list)
        }
      }
    } catch (e) {
      console.warn('[home] initial fetch failed', e)
    }
  }
})

/** Get all echo names the user is subscribed to (falls back to identity subscriptions) */
function subscribedNames() {
  const names = new Set()
  for (const e of echo.echoes) {
    if (e.subscribed) names.add(e.name)
  }
  for (const n of echo.subscribedEchoes) names.add(n)
  if (identity.isSubscribed) {
    for (const n of echo.echoes) {
      if (identity.isSubscribed(n.name)) names.add(n.name)
    }
  }
  return [...names]
}

const depthDays = computed(() => settings.application?.dashboardDepthDays || 7)
const since = computed(() => Math.floor(Date.now() / 1000) - depthDays.value * 86400)

const activeProtocols = computed(() => {
  const all = []
  for (const echoName of subscribedNames()) {
    const protocols = protocol.getActiveProtocols(echoName) || []
    for (const m of protocols) {
      if (m.timestamp >= since.value) all.push({ ...m, echo_name: echoName })
    }
  }
  return all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 20)
})

const recentMessages = computed(() => {
  const result = []
  for (const echoName of subscribedNames()) {
    const msgs = echo.messages[echoName]
    if (!msgs) continue
    for (const m of msgs) {
      if (m.timestamp >= since.value) {
        result.push({ ...m, echo_name: echoName })
      }
    }
  }
  return result.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 20)
})

const recentNetmail = computed(() => {
  const netmailMsgs = echo.messages['__netmail__'] || []
  return netmailMsgs
    .filter(m => m.timestamp >= since.value)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10)
})

function msgSnippet(msg) {
  if (!msg?.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return (d.body || d.message || d.subject || '').substring(0, 120)
  } catch { return '' }
}

function msgSubject(msg) {
  if (!msg?.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return d.subject || ''
  } catch { return '' }
}

/** Заголовок netmail: отправитель → получатель (собственный адрес как «Me»/«Я»). */
function netmailHeader(msg) {
  const me = identity.user?.address
  const meLabel = t('netmail.me')
  const label = (addr) => (!addr ? meLabel : addr === me ? meLabel : addr)
  const from = label(msg.sender_address || msg.recipient_address)
  const to = label(msg.recipient_address)
  return msg.recipient_address ? `${from} → ${to}` : from
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 60000) return t('home.justNow')
  if (diffMs < 3600000) return Math.floor(diffMs / 60000) + 'm'
  if (diffMs < 86400000) return Math.floor(diffMs / 3600000) + 'h'
  return d.toLocaleDateString()
}

function protocolBadgeClass(msg) {
  const cls = {
    vote: 'bg-blue-500', election: 'bg-yellow-500', excommunicate: 'bg-red-500',
    refill: 'bg-purple-500', change_policy: 'bg-indigo-500', remove_echo: 'bg-pink-500',
  }
  return cls[msg.type] || 'bg-gray-500'
}

function truncateProtocol(msg) {
  // Merged election card: show how many candidates applied.
  if (msg._merged) return `${msg._posterCount} ${t('election.candidatesLower')}`
  try {
    const d = JSON.parse(msg.data)
    return d.message || d.proto || JSON.stringify(d).slice(0, 150)
  } catch { return String(msg.data || '').slice(0, 150) }
}

function goToEcho(echoName) {
  router.push({ name: 'Echoes', query: { echo: echoName } })
}

function goToNetmail(msg) {
  router.push({ name: 'NetmailDetail', params: { messageId: msg.message_id } })
}

function manualBoot() {
  boot.manualBoot()
}
</script>

<style scoped>
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
