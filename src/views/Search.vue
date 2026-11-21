<template>
  <div class="search">
    <div class="flex flex-wrap gap-2 mb-4">
      <input v-model="query" @input="debouncedSearch" type="text"
        class="flex-1 min-w-[200px] px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
        :placeholder="t('search.placeholder')" />
      <select v-model="filterEcho"
        class="px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
        <option value="">{{ t('search.allFolders') }}</option>
        <option v-for="e in echoStore.echoes" :key="e.name" :value="e.name">{{ e.name }}</option>
        <option value="__netmail__">Netmail</option>
      </select>
      <select v-model="filterType"
        class="px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
        <option value="">{{ t('search.allTypes') }}</option>
        <option value="echomail">Echomail</option>
        <option value="netmail">Netmail</option>
      </select>
    </div>

    <div v-if="searching" class="text-center py-8 text-gray-400">🔍 {{ t('search.searching') }}</div>

    <div v-else-if="results.length === 0 && searched" class="text-center py-8 text-gray-500 dark:text-gray-400">
      {{ t('search.noResults') }}
    </div>

    <div v-else-if="results.length > 0" class="space-y-2">
      <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('search.found', { count: results.length }) }}</div>
      <div v-for="msg in results" :key="msg.message_id"
        @click="openMessage(msg)"
        class="border rounded-lg p-3 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span class="font-medium">{{ displayEcho(msg) }}</span>
            <span class="inline-flex items-center gap-1">
              <SenderLabel :address="msg.sender_address || msg.recipient_address" me compact />
              <template v-if="isNetmailResult(msg) && msg.recipient_address"> → <SenderLabel :address="msg.recipient_address" me compact /></template>
            </span>
            <span class="text-xs">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <span class="text-xs text-gray-400">{{ msg.type }}</span>
        </div>
        <div class="mt-1 text-sm dark:text-gray-200 truncate">{{ msgSubject(msg) }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ msgSnippet(msg) }}</div>
      </div>
    </div>

    <div v-else class="text-center py-8 text-gray-400">
      <p>{{ t('search.hint') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SenderLabel from '../components/SenderLabel.vue'
import { useEchoStore } from '../stores/echo'
import { useIdentityStore } from '../stores/identity'
import { searchMessages, openReadConnection } from '../services/db'

const { t } = useI18n()
const router = useRouter()
const echoStore = useEchoStore()
const identity = useIdentityStore()

const query = ref('')
const filterEcho = ref('')
const filterType = ref('')
const results = ref([])
const searching = ref(false)
const searched = ref(false)

let debounceTimer = null
function debouncedSearch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(doSearch, 300)
}

async function doSearch() {
  searching.value = true
  searched.value = true
  try {
    const q = query.value
    console.log('[search] query:', q, 'echo:', filterEcho.value, 'type:', filterType.value)
    // Debug: check DB directly
    const d = await openReadConnection()
    console.log('[search] db stores:', Array.from(d.objectStoreNames))
    console.log('[search] db version:', d.version)
    d.close()
    
    results.value = await searchMessages({
      query: q,
      echoName: filterEcho.value || undefined,
      type: filterType.value || undefined,
      limit: 100,
    })
    console.log('[search] results:', results.value.length)
  } catch (e) {
    console.warn('[search] failed', e)
    results.value = []
  } finally {
    searching.value = false
  }
}

function displayEcho(msg) {
  if (msg._store?.startsWith('netmail_')) return 'Netmail'
  return msg.echo_name || msg._store?.replace(/^echo_/, '') || ''
}

/** Netmail-результат (папки netmail_* тоже). */
function isNetmailResult(msg) {
  return msg.type === 'netmail' || msg._store?.startsWith('netmail_')
}

/** Адрес с подстановкой собственного как «Me»/«Я». */
function addrLabel(addr) {
  if (!addr) return t('netmail.me')
  return addr === identity.user?.address ? t('netmail.me') : addr
}

/** Для netmail: отправитель → получатель; для эх — только отправитель. */
function resultHeader(msg) {
  const isNetmail = msg.type === 'netmail' || msg._store?.startsWith('netmail_')
  const from = addrLabel(msg.sender_address || msg.recipient_address)
  if (!isNetmail || !msg.recipient_address) return from
  return `${from} → ${addrLabel(msg.recipient_address)}`
}

function msgSubject(msg) {
  if (!msg.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return d.subject || ''
  } catch { return '' }
}

function msgSnippet(msg) {
  if (!msg.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return (d.body || d.message || '').substring(0, 120)
  } catch { return '' }
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

function openMessage(msg) {
  const echoName = msg.echo_name || displayEcho(msg)
  if (msg.type === 'netmail' || msg._store?.startsWith('netmail_')) {
    router.push({ name: 'NetmailDetail', params: { messageId: msg.message_id } })
  } else {
    router.push({ name: 'Echoes', query: { echo: echoName } })
  }
}
</script>

<style scoped>
.search {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}
</style>
