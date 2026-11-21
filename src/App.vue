<script setup>
import { useIdentityStore } from './stores/identity'
import { useEchoStore } from './stores/echo'
import { useProtocolStore } from './stores/protocol'
import { useBootStore } from './stores/boot'
import { useSettingsStore } from './stores/settings'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getBrowserLocale } from './i18n/index'
import { docsBasePath } from './utils/appBase'
import { networkNameFromParameters } from './utils/policyParams'
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useBoot } from './composables/useBoot'
import { initDB as initIDB, cleanTrash } from './services/db'
import { usePolling } from './composables/usePolling'
import NotificationToast from './components/NotificationToast.vue'
import OutboxDialog from './components/OutboxDialog.vue'
import SelectedMessagesDialog from './components/SelectedMessagesDialog.vue'
import { useOutbox } from './composables/useOutbox'
import { installCopyChipHandler } from './utils/sourceFormat'
import { useSelectedMessages } from './composables/useSelectedMessages'
import PasswordDialog from './components/PasswordDialog.vue'
import ImportDialog from './components/ImportDialog.vue'
import PolicyConfirm from './components/PolicyConfirm.vue'
import ThemeToggle from './components/ThemeToggle.vue'

const identity = useIdentityStore()
const echo = useEchoStore()
const { t, locale } = useI18n()
const bootStore = useBootStore()
const boot = useBoot()
const poll = usePolling()
const echoStore = useEchoStore()
const protocol = useProtocolStore()
const showMobileMenu = ref(false)

// Height of the top navigation, exposed as --nav-height so full-height views
// (echo feed, netmail) can fill exactly the remaining viewport (#302).
const navEl = ref(null)
const navHeight = ref(56)
let navResizeObserver = null

const outbox = useOutbox()
const showOutbox = ref(false)
const showImportDialog = ref(false)
const outboxCount = computed(() => outbox.count.value)
// Selected messages (#306)
const selected = useSelectedMessages()
const showSelected = ref(false)
const selectedCount = computed(() => selected.count.value)
const showUserMenu = ref(false)
const route = useRoute()
const router = useRouter()

// Network display name from the accepted policy. Before the policy is loaded
// (or for old policies) the historical "FM" name is used.
const networkName = computed(() => networkNameFromParameters(boot.policyData.value?.policy?.parameters))

// Название текущей страницы для мобильного тулбара
const currentPageName = computed(() => {
  if (route.name === 'Home') return networkName.value
  const names = {
    Echoes: 'app.echoes', Netmail: 'app.netmail',
    Search: 'app.search', Settings: 'app.settings', PolicyViewer: 'app.settings',
    Admin: 'app.admin',
  }
  const key = names[route.name] || 'app.title'
  return t(key)
})

// Computed properties to ensure reactivity for PolicyConfirm props
const policyData = computed(() => boot.policyData.value)
const nodePublicKeyBase64 = computed(() => boot.nodePublicKeyBase64.value)
const signatureVerified = computed(() => boot.signatureVerified.value)
const policyLoading = computed(() => boot.policyLoading.value)
const previousPolicy = computed(() => boot.previousPolicy.value)
const policyCurrentName = computed(() => (identity.user?.name || '').trim())

// Docs live next to the app directory (runtime base, #337).
const docsUrl = docsBasePath()

// Поле имени нужно не только для новых ключей: на свежеразвёрнутой ноде (или
// после бекапа без имени) у ключей ещё нет имени на ноде, и сервер отвечает
// 400 «display name is required» (#333).
const showPolicyNameInput = computed(() => bootStore.isNewKeys || !policyCurrentName.value)

const pollStatusClass = computed(() => {
  switch (poll.status.value) {
    case 'polling': return 'text-blue-500 animate-pulse'
    case 'ok': return 'text-green-500 '
    case 'error': return 'text-red-500'
    case 'rateLimited': return 'text-yellow-500'
    default: return 'text-gray-400'
  }
})

const pollStatusText = computed(() => {
  switch (poll.status.value) {
    case 'ok': return t('polling.ok')
    case 'error': return t('polling.error')
    case 'rateLimited': return t('polling.rateLimited')
    default: return t('polling.ok')
  }
})

const lastPollTimeTitle = computed(() => {
  if (!poll.lastPollTime.value) return ''
  return `Last poll: ${poll.lastPollTime.value.toLocaleTimeString()}`
})

// Expose API for DevTools testing (console only, not for production use)
async function setupTestAPI() {
  const { apiService } = await import('./services/api')
  window.__api = apiService
  const { useIdentityStore } = await import('./stores/identity')
  window.__identity = useIdentityStore()
}

onBeforeUnmount(() => navResizeObserver?.disconnect())

function measureNav() {
  if (navEl.value) navHeight.value = navEl.value.offsetHeight
}

onMounted(async () => {
  measureNav()
  // Copy chips in raw sources (#316) are plain HTML (v-html), so their clicks
  // are handled globally by delegation.
  installCopyChipHandler()
  if (typeof ResizeObserver !== 'undefined' && navEl.value) {
    navResizeObserver = new ResizeObserver(measureNav)
    navResizeObserver.observe(navEl.value)
  }

  // Инициализация IndexedDB + миграция из localStorage
  try {
    await initAppDB()
  } catch (e) {
    console.warn('[db] init error', e)
  }

  await boot.boot()
  if (import.meta.env.DEV) {
    setupTestAPI().catch(e => console.warn('test API setup failed', e))
  }
  // Auto-detect browser language if not manually chosen
  const settings = useSettingsStore()
  const savedLang = settings.application?.language
  if (!savedLang || savedLang === 'auto') {
    const bl = getBrowserLocale()
    if (locale.value !== bl) locale.value = bl
  }
})

// Watch for language change in settings
watch(() => {
  try { return useSettingsStore().application?.language } catch { return null }
}, (lang) => {
  if (lang && lang !== 'auto' && locale.value !== lang) locale.value = lang
})

// Восстанавливаем сохранённые протокольные сообщения после загрузки ключей
// (иначе блок «протоколы» в эхе исчезает после перезагрузки).
let protocolInited = false
watch(() => identity.hasKeys, (has) => {
  if (has && !protocolInited) {
    protocolInited = true
    protocol.init().catch(e => console.warn('[protocol] init failed', e))
  }
}, { immediate: true })

// Reflect unread counts in the browser tab title:
// "FM" with no unread, "FM (N:1, E:10)" otherwise (only non-zero parts).
watch(
  [() => echoStore.netmailUnreadCount, () => echoStore.echoUnreadCount, networkName],
  ([netmail, echomail, base]) => {
    const parts = []
    if (netmail > 0) parts.push(`N:${netmail}`)
    if (echomail > 0) parts.push(`E:${echomail}`)
    document.title = parts.length > 0 ? `${base} (${parts.join(', ')})` : base
  },
  { immediate: true }
)

async function manualBoot() {
  await boot.manualBoot()
}

/** Retry the boot flow after an error (e.g. a wrong remembered password). */
async function retryBoot() {
  bootStore.reset()
  await boot.boot()
}

async function handleLogout() {
  if (!confirm(t('app.logoutConfirm'))) return
  await identity.logout()
  poll.stop()
}

/** Инициализация IndexedDB + миграция из localStorage */
async function initAppDB() {
  const migrated = localStorage.getItem('fm_indexeddb_v1_migrated')
  const raw = localStorage.getItem('fm_echo_messages')

  let echoNames = []
  if (!migrated && raw) {
    try {
      const old = JSON.parse(raw)
      echoNames = Object.keys(old)
    } catch { /* ignore */ }
  }

  await initIDB(echoNames)

  if (!migrated && raw) {
    try {
      const old = JSON.parse(raw)
      const { bulkPutMessages } = await import('./services/db')
      for (const [echoName, messages] of Object.entries(old)) {
        if (Array.isArray(messages) && messages.length > 0) {
          await bulkPutMessages(echoName, messages)
        }
      }
      localStorage.setItem('fm_indexeddb_v1_migrated', '1')
      console.log('[db] migrated', echoNames.length, 'echoes to IndexedDB')
    } catch (e) {
      console.warn('[db] migration failed', e)
    }
  }

  const settings = useSettingsStore()
  const trashDays = settings.privacy?.trashRetentionDays || 30
  await cleanTrash(trashDays)
}

const langLabel = computed(() => locale.value === 'ru' ? 'RU' : 'EN')

function toggleLang() {
  const newLang = locale.value === 'ru' ? 'en' : 'ru'
  locale.value = newLang
  try {
    const settings = useSettingsStore()
    settings.updateSetting('application.language', newLang, false)
  } catch { /* ignore */ }
}

function navigateSettings() {
  showUserMenu.value = false
  router.push('/settings')
}

function navigateAdmin() {
  showUserMenu.value = false
  router.push('/admin')
}

/** Import from the boot (password) dialog: hide it and show the import picker. */
function openImportFromBoot() {
  bootStore.setPasswordDialog(false)
  showImportDialog.value = true
}

/** Close the import picker: if boot still needs a password/keygen, re-show it. */
function closeImportDialog() {
  showImportDialog.value = false
  if (bootStore.needsPassword || bootStore.needsKeyGeneration) {
    bootStore.setPasswordDialog(true)
  }
}

/** Apply an invite scanned on the key generation screen. */
async function onInviteScanned(invite) {
  try {
    await boot.applyInvite(invite)
  } catch (err) {
    console.error('[app] failed to apply invite:', err)
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900" :style="{ '--nav-height': navHeight + 'px' }">
    <nav ref="navEl" class="bg-white shadow dark:bg-gray-800 dark:shadow-gray-900">
      <div class="container mx-auto px-4 py-3 flex justify-between items-center relative">
        <div class="text-xl font-bold flex flex-row gap-1 items-center">
          <router-link to="/" class="truncate max-w-[40vw]" :title="networkName">{{ networkName }}</router-link>
        <div class="">
            <!-- Boot status indicators -->
           <div v-if="bootStore.isLoading" class="text-sm text-gray-500 dark:text-gray-400">
             <span class="animate-pulse">{{ t('boot.loading') }}</span>
           </div>
           <div v-else-if="bootStore.needsKeyGeneration" class="text-sm text-yellow-600 dark:text-yellow-400">
             {{ t('boot.keyGenerationRequired') }}
           </div>
           <div v-else-if="bootStore.needsPassword" class="text-sm text-yellow-600 dark:text-yellow-400">
             {{ t('boot.passwordRequired') }}
           </div>
           <div v-else-if="bootStore.needsPolicy" class="text-sm text-blue-600 dark:text-blue-400">
             {{ t('boot.policyRequired') }}
           </div>
           <div v-else-if="bootStore.hasError" class="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
             <span>{{ t('boot.error', { error: bootStore.error }) }}</span>
             <button type="button" class="underline hover:no-underline" @click="retryBoot">{{ t('boot.retry') }}</button>
           </div>
          <div v-else-if="identity.hasKeys" class="text-xs text-gray-500 dark:text-gray-400">
            <button
              type="button"
              @click="poll.poll()"
              :disabled="poll.status.value === 'polling'"
              :class="[pollStatusClass, 'hover:underline disabled:cursor-wait']"
              :title="t('polling.sendReceive') + (lastPollTimeTitle ? ` — ${lastPollTimeTitle}` : '')"
            >{{ pollStatusText }}</button>
          </div>
          <button
            v-else
            @click="manualBoot"
             class="px-3 py-1 bg-blue-500 text-white rounded no-underline hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            {{ t('app.setupIdentity') }}
          </button>
        </div>
        </div>

        <div class="space-x-4 items-center hidden md:flex">
          <router-link to="/netmail" class="nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400 relative">
            {{ t('app.netmail') }}
            <span v-if="echoStore.netmailUnreadCount > 0" class="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full min-w-[18px]">
              {{ echoStore.netmailUnreadCount > 99 ? '99+' : echoStore.netmailUnreadCount }}
            </span>
          </router-link>
          <router-link to="/echoes" class="nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400 relative">
            {{ t('app.echoes') }}
            <span v-if="echoStore.echoUnreadCount > 0" class="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-blue-500 rounded-full min-w-[18px]">
              {{ echoStore.echoUnreadCount > 99 ? '99+' : echoStore.echoUnreadCount }}
            </span>
          </router-link>
          <router-link to="/search" class="nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.search') }}</router-link>
          <a :href="docsUrl" target="_blank" class="nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.docs') }}</a>

          <!-- Outbox button with count -->
          <button v-if="outboxCount > 0" @click="showOutbox = true"
            class="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 relative">
            {{ t('outbox.title') }} ({{ outboxCount }})
          </button>
          
          <ThemeToggle />

          <!-- User menu (⋯) -->
          <div class="relative" v-if="identity.hasKeys">
            <button @click="showUserMenu = !showUserMenu" class="px-2 py-1 text-lg border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 leading-none">⋯</button>
            <div v-if="showUserMenu" class="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg text-sm z-50">
              <div class="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300 border-b dark:border-gray-600">{{ identity.user?.address }}<span v-if="identity.user?.name"> ({{ identity.user.name }})</span></div>
              <!-- <button @click="poll.forcePoll()" class="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">📥 {{ t('app.getMail') }}</button> -->
              <div class="flex items-center gap-2 px-3 py-2 border-t dark:border-gray-600">{{ t('app.language') }}
                <button @click="toggleLang" class="px-2 py-1 text-sm border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 min-w-[40px]">{{ langLabel }}</button>
              </div>
              <button v-if="identity.isAdmin" @click="navigateAdmin" role="link" class="block w-full text-left px-3 py-2 nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.admin') }}</button>
              <button @click="navigateSettings" role="link" class="block w-full text-left px-3 py-2 nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.settings') }}</button>
              <button @click="handleLogout" class="block w-full text-left px-3 py-2 nav-link hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.logout') }}</button>
            </div>
          </div>

        </div>
        <!-- Mobile toolbar: current page + outbox + menu -->
        <div class="md:hidden flex items-center gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[50vw]">{{ currentPageName }}</span>
          <button v-if="outboxCount > 0" @click="showOutbox = true" class="px-2 py-1 text-xs bg-blue-600 text-white rounded relative">
            {{ t('outbox.title') }} ({{ outboxCount }})
          </button>
          <button @click="showMobileMenu = !showMobileMenu" class="px-2 py-1 text-xl border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            ☰
          </button>
        </div>
        <!-- Mobile menu -->
        <div v-if="showMobileMenu" class="md:hidden absolute top-full left-0 right-0 bg-white dark:bg-gray-800 shadow-lg border-t dark:border-gray-700 z-50 p-4 flex flex-col gap-2">
          <router-link to="/netmail" @click="showMobileMenu = false" class="mobile-nav hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.netmail') }}<span v-if="echoStore.netmailUnreadCount > 0" class="ml-1 text-red-500">({{ echoStore.netmailUnreadCount }})</span></router-link>
          <router-link to="/echoes" @click="showMobileMenu = false" class="mobile-nav hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.echoes') }}<span v-if="echoStore.echoUnreadCount > 0" class="ml-1 text-blue-500">({{ echoStore.echoUnreadCount }})</span></router-link>
          <router-link to="/search" @click="showMobileMenu = false" class="mobile-nav hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.search') }}</router-link>
          <a :href="docsUrl" target="_blank" class="mobile-nav hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.docs') }}</a>
          <router-link to="/settings" @click="showMobileMenu = false" class="mobile-nav hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.settings') }}</router-link>
          <router-link v-if="identity.isAdmin" to="/admin" @click="showMobileMenu = false" class="mobile-nav hover:text-blue-600 dark:text-blue-400 dark:text-gray-300 dark:hover:text-blue-400">{{ t('app.admin') }}</router-link>
          <div v-if="identity.hasKeys" class="flex flex-col gap-1 mt-2 pt-2 border-t dark:border-gray-700">
            <span class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ identity.user?.address }}</span>
            <button @click="poll.forcePoll(); showMobileMenu = false" class="text-left hover:text-blue-600">📥 {{ t('app.getMail') }}</button>
            <div class="flex items-center gap-2">
              <ThemeToggle />
              <button @click="toggleLang" class="px-2 py-1 text-sm border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 min-w-[40px]">{{ langLabel }}</button>
            </div>
            <button @click="handleLogout" class="text-left text-red-600 hover:text-red-700">{{ t('app.logout') }}</button>
          </div>
        </div>
      </div>
    </nav>
    
    <main class="container mx-auto px-2 py-2">
      <router-view />
    </main>
    
    <!-- Global Boot Dialogs -->
    <PasswordDialog
      v-if="bootStore.showPasswordDialog"
      :visible="bootStore.showPasswordDialog"
      :title="bootStore.needsKeyGeneration ? t('boot.generateNewKeys') : t('boot.enterPassword')"
      :message="bootStore.needsKeyGeneration ? t('boot.noKeysFound') : t('boot.encryptedKeyMessage')"
      :show-remember="true"
      :show-invite-scan="bootStore.needsKeyGeneration"
      :loading="bootStore.isLoading"
      :boot-error="bootStore.error || ''"
      @confirm="boot.handlePasswordConfirm"
      @cancel="boot.cancelPassword"
      @import="openImportFromBoot"
      @invite="onInviteScanned"
    />
    
    <ImportDialog :visible="showImportDialog" @close="closeImportDialog" />
    
    <PolicyConfirm
      v-if="bootStore.showPolicyConfirm"
      :visible="bootStore.showPolicyConfirm"
      :policy-data="policyData"
      :node-public-key-base64="nodePublicKeyBase64"
      :signature-verified="signatureVerified"
      :loading="policyLoading"
      :show-name-input="showPolicyNameInput"
      :current-name="policyCurrentName"
      :previous-policy="previousPolicy"
      @confirm="boot.handlePolicyConfirm"
      @cancel="boot.cancelPolicy"
    />
    
    <NotificationToast />
    <OutboxDialog :visible="showOutbox" @close="showOutbox = false" @sent="showOutbox = false" />

    <div class="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      <button v-if="selectedCount > 0"
        @click="showSelected = true"
        class="px-4 py-2 bg-amber-600 text-white rounded-full shadow-lg hover:bg-amber-700 flex items-center gap-2">
        <span>📌 {{ t('selected.title') }} ({{ selectedCount }})</span>
      </button>
      <button v-if="outboxCount > 0"
        @click="showOutbox = true"
        class="px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center gap-2">
        <span>{{ t('outbox.title') }} ({{ outboxCount }})</span>
        <span class="animate-pulse">▲</span>
      </button>
    </div>

    <SelectedMessagesDialog :visible="showSelected" @close="showSelected = false" />
  </div>
</template>

<style scoped>
.nav-link {
  font-weight: 500;
}
.nav-link.router-link-active {
  color: #2563eb;
  font-weight: 700;
}
.dark .nav-link.router-link-active {
  color: #60a5fa;
}
.mobile-nav.router-link-active {
  color: #2563eb;
  font-weight: 700;
}
.dark .mobile-nav.router-link-active {
  color: #60a5fa;
}
</style>
