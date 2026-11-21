<template>
  <div class="flex gap-4 min-h-0 overflow-hidden netmail-layout">
    <!-- Left sidebar: folders -->
    <div class="w-1/4 min-w-[220px] border rounded-lg p-4 dark:border-gray-700 dark:bg-gray-800 overflow-y-auto">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold dark:text-white">{{ t('netmail.title') }}</h2>
        <button @click="openCreateFolder" class="px-2 py-1 text-sm border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" :title="t('netmail.createFolder')">+ {{ t('netmail.createFolder') }}</button>
      </div>

      <div class="space-y-1">
        <div
          v-for="f in folders"
          :key="f.key"
          role="button"
          tabindex="0"
          @click="selectFolder(f.key)"
          @keydown.enter.prevent="selectFolder(f.key)"
          @keydown.space.prevent="selectFolder(f.key)"
          :class="[
            'w-full flex items-center justify-between px-2 py-1.5 rounded text-sm cursor-pointer mb-0.5',
            currentFolder === f.key
              ? 'bg-blue-100 dark:bg-blue-900'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          ]"
        >
          <span class="flex items-center gap-1 min-w-0">
            <span class="truncate">{{ f.label }}</span>
            <span v-if="f.custom" class="text-xs text-gray-400 shrink-0">📁</span>
          </span>
          <span class="flex items-center gap-1 shrink-0">
            <span v-if="f.key === 'inbox' && inboxUnread > 0"
              class="text-xs px-1.5 py-0.5 bg-red-500 text-white rounded-full">{{ inboxUnread > 99 ? '99+' : inboxUnread }}</span>
            <span v-else-if="['errors','bad','dup'].includes(f.key) && folderCount(f.key) > 0"
              class="text-xs px-1.5 py-0.5 bg-red-500 text-white rounded-full">{{ folderCount(f.key) > 99 ? '99+' : folderCount(f.key) }}</span>
            <span v-if="folderCount(f.key) > 0 && f.custom"
              class="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded-full">{{ folderCount(f.key) }}</span>
            <div v-if="f.custom" class="relative" @click.stop>
              <button @click="folderMenuKey = folderMenuKey === f.key ? null : f.key"
                class="px-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                :title="t('netmail.folderActions')">⋮</button>
              <div v-if="folderMenuKey === f.key"
                class="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg z-40 overflow-hidden">
                <button @click="removeFolder(f.key)"
                  class="block w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  🗑 {{ t('netmail.deleteFolder') }}
                </button>
              </div>
            </div>
          </span>
        </div>
      </div>
      <div v-if="folderMenuKey" class="fixed inset-0 z-30" @click="folderMenuKey = null"></div>
    </div>

    <!-- Right panel -->
    <div class="relative flex-1 border rounded-lg p-4 dark:border-gray-700 dark:bg-gray-800 flex flex-col min-h-0">
      <!-- No folder selected: actions -->
      <template v-if="!currentFolder">
        <h2 class="text-xl font-bold mb-6 dark:text-white">{{ t('netmail.title') }}</h2>
        <div class="flex flex-wrap gap-3">
          <button @click="openCompose()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
            ✉️ {{ t('netmail.compose') }}
          </button>
          <button @click="openCreateFolder" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
            📁 {{ t('netmail.createFolder') }}
          </button>
          <button @click="showContacts = true" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
            👥 {{ t('contacts.title') }}
          </button>
        </div>
        <p class="mt-6 text-sm text-gray-500 dark:text-gray-400">{{ t('netmail.noFolderSelected') }}</p>
      </template>

      <!-- Folder selected: drafts (inbox) + messages -->
      <template v-else>
        <!-- Header -->
        <div class="flex-shrink-0 mb-2 pb-2 border-b dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-xl font-bold dark:text-white">{{ currentFolderLabel }}</h2>
          <div class="flex items-center gap-2">
            <button @click="openCompose()" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">
              + {{ t('netmail.compose') }}
            </button>
            <button @click="showContacts = true" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              👥 {{ t('contacts.title') }}
            </button>
          </div>
        </div>

        <!-- Drafts for netmail (inbox only) -->
        <div v-if="currentFolder === 'inbox' && netmailDrafts.length > 0" class="mb-6 space-y-2">
          <div v-for="draft in netmailDrafts" :key="draft.id"
            class="border-2 border-dashed border-yellow-400 dark:border-yellow-600 rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/20"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase">{{ t('contacts.drafts') }}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatDraftDate(draft.updatedAt) }}</span>
              </div>
              <div class="flex gap-1">
                <button @click="loadNetmailDraft(draft)" class="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600">✏️</button>
                <button @click="deleteNetmailDraft(draft.id)" class="px-2 py-0.5 text-xs bg-gray-400 text-white rounded hover:bg-gray-500">✕</button>
              </div>
            </div>
            <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
              <SenderLabel :address="draft.recipient" me />
              <span v-if="draft.subject" class="ml-2">{{ draft.subject }}</span>
            </div>
          </div>
        </div>

        <!-- Trash: restore/empty -->
        <div v-if="currentFolder === 'trash' && currentMessages.length > 0" class="mb-2 text-xs text-gray-500">
          <button @click="emptyTrash" class="text-red-500 hover:text-red-700">🗑 {{ t('netmail.emptyTrash') }}</button>
        </div>

        <!-- Message list -->
        <div ref="mailScrollEl" class="flex-1 overflow-y-auto min-h-0 overscroll-contain" @scroll.passive="onMailScroll">
          <div v-if="currentMessages.length === 0" class="text-gray-500 dark:text-gray-400 p-4 text-center border rounded dark:border-gray-700">
            {{ t('netmail.noMessages') }}
          </div>
          <div v-else class="space-y-2">
            <template v-for="msg in currentMessages" :key="msg.message_id || msg.id">
            <div v-if="(msg.message_id || msg.id) === firstUnreadMailId" class="unread-divider" data-mail-divider>
              <span>{{ t('echoes.newMessages') }}</span>
              <span v-if="unreadMail.length > 1">· {{ t('echoes.newMessagesCount', { count: unreadMail.length }) }}</span>
            </div>
            <div
              class="border rounded-lg p-3 dark:border-gray-700"
              :class="echo.isNetmailUnread(msg) ? 'mail-unread' : ''"
              :data-mail-id="msg.message_id || msg.id"
            >
              <div class="flex items-start justify-between mb-2">
                <div @click="openMessage(msg)" class="flex-1 cursor-pointer min-w-0">
                  <span v-if="echo.isNetmailUnread(msg)" class="unread-dot mr-1" :title="t('echoes.unread')"></span>
                  <!-- Sent: show recipient; other folders: show sender and recipient -->
                  <template v-if="currentFolder === 'sent'">
                    <SenderLabel :address="msg.recipient_address || msg.sender_address" :name-from-message="senderNameOf(msg)" />
                  </template>
                  <template v-else>
                    <SenderLabel :address="msg.sender_address || msg.recipient_address" :name-from-message="senderNameOf(msg)" />
                    <span v-if="msg.recipient_address" class="text-sm text-gray-500 dark:text-gray-400"> → <SenderLabel :address="msg.recipient_address" me /></span>
                  </template>
                  <span v-if="msgSubject(msg)" class="ml-2 text-sm text-gray-600 dark:text-gray-400">{{ msgSubject(msg) }}</span>
                  <div v-if="msgBody(msg)" class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{{ msgBody(msg) }}</div>
                  <div v-if="!msgSubject(msg) && !msgBody(msg) && msg.jwe" class="text-xs text-orange-500 mt-0.5">
                    ⚠ {{ t('netmail.encrypted') }}
                  </div>
                  <div v-if="msg._decryptError" class="text-xs text-red-500 mt-0.5">⚠ {{ t('netmail.decryptError') }}</div>
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-2">
                  <button @click.stop="openMessage(msg)" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" :title="t('netmail.open')">↗</button>
                  <span class="text-xs text-gray-400 whitespace-nowrap">{{ formatTimestamp(msg.timestamp) }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <MessageActions
                  v-if="currentFolder !== 'trash'"
                  :message="msg"
                  :is-moderator="false"
                  :is-admin="false"
                  :is-owner="msg.sender_address === identity.user?.address"
                  :echo-name="'__netmail__'"
                  @reply="handleReply(msg)"
                  @forward="forwardMessage(msg)"
                />
                <button v-if="currentFolder !== 'trash'" @click.stop="openMoveToFolder(msg)"
                  class="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded border dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  :title="t('netmail.moveToFolder')">📁</button>
                <button v-if="currentFolder !== 'trash'" @click.stop="moveToTrash(msg)"
                  class="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded border dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  :title="t('netmail.trash')">🗑</button>
              </div>
              <div v-if="currentFolder === 'trash'" class="flex gap-2 mt-1">
                <button @click="restoreFromTrash(msg)" class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">♻️ {{ t('netmail.restore') }}</button>
                <button @click="deletePermanently(msg)" class="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">🗑 {{ t('netmail.deleteForever') }}</button>
              </div>
            </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Jump to the first unread / newest mail (#302) -->
      <button
        v-if="currentFolder && showMailPill"
        @click="jumpToUnreadMail"
        class="absolute bottom-4 right-6 z-20 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs shadow-lg hover:bg-blue-700 flex items-center gap-1"
        :title="t('echoes.jumpToNew')"
      >
        <span v-if="unreadMail.length > 0">↓ {{ t('echoes.newMessagesCount', { count: unreadMail.length }) }}</span>
        <span v-else>↓ {{ t('echoes.jumpToNew') }}</span>
      </button>
    </div>

    <!-- Create folder dialog -->
    <div v-if="showCreateFolder" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showCreateFolder = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('netmail.createFolder') }}</h3>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('netmail.folderName') }}</label>
        <input v-model="newFolderName" @keyup.enter="createFolder"
          class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm"
          :placeholder="t('netmail.folderNamePlaceholder')" />
        <div v-if="folderError" class="mt-2 text-sm text-red-600">{{ folderError }}</div>
        <div class="flex justify-end gap-3 mt-4">
          <button @click="showCreateFolder = false" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">{{ t('app.cancel') }}</button>
          <button @click="createFolder" :disabled="!newFolderName.trim()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50">{{ t('app.create') }}</button>
        </div>
      </div>
    </div>

    <!-- Move-to-folder dialog -->
    <div v-if="showMoveToFolder" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showMoveToFolder = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('netmail.moveToFolder') }}</h3>
        <div v-if="customFolderList.length === 0" class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {{ t('netmail.noFoldersHint') }}
        </div>
        <div v-else class="space-y-1 mb-4 max-h-60 overflow-y-auto">
          <button v-for="f in customFolderList" :key="f.slug" @click="confirmMoveToFolder(f.slug)"
            class="w-full text-left px-3 py-2 text-sm border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            📁 {{ f.name }}
          </button>
        </div>
        <div class="flex justify-end gap-3">
          <button @click="showMoveToFolder = false" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">{{ t('app.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- Contacts modal -->
    <ContactsModal :visible="showContacts" @close="showContacts = false" @write="onContactWrite" />

    <!-- Forward Dialog -->
    <ForwardDialog
      :show="showForwardDialog"
      :message="forwardMsg"
      @close="showForwardDialog = false"
      @forward="handleForwardAction"
    />

    <!-- Compose button + universal composer -->
    <MessageEditor
      :visible="showComposer"
      :netmail="true"
      :recipient="composeRecipient"
      :initial-subject="composeSubject"
      :initial-body="composeBody"
      @close="showComposer = false"
      @sent="onComposerSent"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEchoStore } from '../stores/echo'
import { useIdentityStore } from '../stores/identity'
import { useNotificationsStore } from '../stores/notifications'
import { usePolling } from '../composables/usePolling'
import SenderLabel from '../components/SenderLabel.vue'
import { useDrafts } from '../composables/useDrafts'
import { sendNetmail, createSignedMessage } from '../services/message'
import { apiService } from '../services/api'
import * as db from '../services/db'
import ForwardDialog from '../components/ForwardDialog.vue'
import MessageActions from '../components/MessageActions.vue'
import MessageEditor from '../components/MessageEditor.vue'
import ContactsModal from '../components/ContactsModal.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const echo = useEchoStore()
const identity = useIdentityStore()
const notifications = useNotificationsStore()
const poll = usePolling()

const currentFolder = ref(null)
// Open actions menu of a custom netmail folder (#388).
const folderMenuKey = ref(null)
const customFolders = ref({})
const showComposer = ref(false)
const composeRecipient = ref('')
const composeSubject = ref('')
const composeBody = ref('')
const editingDraftId = ref(null)
const showForwardDialog = ref(false)
const forwardMsg = ref(null)
const trashMessages = ref([])
const showCreateFolder = ref(false)
const newFolderName = ref('')
const folderError = ref('')
const showContacts = ref(false)
const showMoveToFolder = ref(false)
const moveTargetMsg = ref(null)

// Список кастомных папок для диалога перемещения
const customFolderList = computed(() =>
  Object.entries(customFolders.value).map(([slug, name]) => ({ slug, name }))
)

const draftsManager = useDrafts()
const netmailDrafts = computed(() => draftsManager.getNetmailDrafts())

function openCompose(recipient = '', subject = '', body = '') {
  composeRecipient.value = recipient
  composeSubject.value = subject
  composeBody.value = body
  showComposer.value = true
}

function onComposerSent() {
  showComposer.value = false
  if (editingDraftId.value) {
    draftsManager.deleteDraft(editingDraftId.value)
    editingDraftId.value = null
  }
  // Clear reply/forward query params so they don't re-open the composer
  if (route.query.to || route.query.subject || route.query.body) {
    router.replace({ name: 'Netmail' })
  }
}

function onContactWrite(address) {
  showContacts.value = false
  openCompose(address)
}

const folders = computed(() => {
  const list = [
    { key: 'inbox', label: t('netmail.inbox') },
    { key: 'sent', label: t('netmail.sent') },
    { key: 'errors', label: t('netmail.errors') },
    { key: 'bad', label: t('netmail.bad') },
    { key: 'dup', label: t('netmail.dup') },
    { key: 'trash', label: t('netmail.trash') },
  ]
  for (const [slug, name] of Object.entries(customFolders.value)) {
    list.push({ key: slug, label: name, custom: true })
  }
  return list
})

const currentFolderLabel = computed(() => {
  if (!currentFolder.value) return ''
  const f = folders.value.find(f => f.key === currentFolder.value)
  return f?.label || currentFolder.value
})

async function selectFolder(key) {
  folderMenuKey.value = null
  currentFolder.value = key
  await loadCustomFolderMessages()
  syncRoute()
  await landOnUnreadMail()
}

// ---- Folder management ----

function openCreateFolder() {
  newFolderName.value = ''
  folderError.value = ''
  showCreateFolder.value = true
}

async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  const slug = db.createNetmailFolder(name)
  if (!slug) {
    folderError.value = t('netmail.folderExists')
    return
  }
  await loadCustomFolders()
  showCreateFolder.value = false
  currentFolder.value = slug
  syncRoute()
}

async function removeFolder(slug) {
  folderMenuKey.value = null
  if (!confirm(t('netmail.deleteFolderConfirm'))) return
  await db.deleteNetmailFolder(slug)
  await loadCustomFolders()
  if (currentFolder.value === slug) currentFolder.value = null
  syncRoute()
}

async function loadCustomFolders() {
  customFolders.value = db.getNetmailFolders()
}

// ---- Messages ----

// Все netmail сообщения из echoStore (inbox/sent/bad/dup/errors)
// Chronological order (#302): oldest at the top, newest at the bottom, so new
// mail appends without moving the viewport and the unread block reads downward.
const allNetmail = computed(() => {
  const msgs = echo.messages['__netmail__'] || []
  return msgs.slice().sort((a, b) => {
    const dt = (a.timestamp || 0) - (b.timestamp || 0)
    if (dt !== 0) return dt
    return String(a.message_id || a.id || '').localeCompare(String(b.message_id || b.id || ''))
  })
})

// Новые входящие netmail во время просмотра (#302): если список у низа (у самых
// новых), прокручиваем к ним и помечаем прочитанными; иначе оставляем
// непрочитанными — плашка покажет их количество.
watch(() => (echo.messages['__netmail__'] || []).length, async (len, oldLen) => {
  // Skip the initial load: unread mail must survive opening the page (#302).
  if (len <= oldLen || oldLen === 0) return
  if (atMailBottom.value) {
    echo.markNetmailRead()
    await nextTick()
    await scrollToNewestMail({ smooth: false })
    updateMailScroll()
  }
})

// Непрочитанные входящие письма (бейдж папки «Входящие»).
const inboxUnread = computed(() => {
  const ts = echo.lastReadNetmailTimestamp
  return allNetmail.value.filter(m =>
    m.sender_address !== identity.user?.address && !m._decryptError && !m._isDup && !isErrorMsg(m) && m.timestamp > ts
  ).length
})

// Custom folder messages (from IndexedDB store netmail_<slug>)
const customFolderMessages = ref({})

async function loadCustomFolderMessages() {
  for (const slug of Object.keys(customFolders.value)) {
    try {
      customFolderMessages.value[slug] = await db.getAllMessages(db.netmailStoreName(slug))
    } catch (e) {
      customFolderMessages.value[slug] = []
    }
  }
}

function folderCount(key) {
  const all = allNetmail.value
  switch (key) {
    case 'inbox':
      return all.filter(m => m.sender_address !== identity.user?.address && !m._decryptError && !m._isDup).length
    case 'sent':
      return all.filter(m => m.sender_address === identity.user?.address).length
    case 'errors':
      return all.filter(m => isErrorMsg(m)).length
    case 'bad':
      return all.filter(m => m._decryptError).length
    case 'dup':
      return all.filter(m => m._isDup).length
    case 'trash':
      return trashMessages.value.length
    default:
      return (customFolderMessages.value[key] || []).length
  }
}

const currentMessages = computed(() => {
  switch (currentFolder.value) {
    case 'inbox':
      return allNetmail.value.filter(m =>
        m.sender_address !== identity.user?.address && !m._decryptError && !m._isDup && !isErrorMsg(m)
      )
    case 'sent':
      return allNetmail.value.filter(m => m.sender_address === identity.user?.address)
    case 'errors':
      return allNetmail.value.filter(m => isErrorMsg(m))
    case 'bad':
      return allNetmail.value.filter(m => m._decryptError)
    case 'dup':
      return allNetmail.value.filter(m => m._isDup)
    case 'trash':
      return trashMessages.value
    default:
      return customFolderMessages.value[currentFolder.value] || []
  }
})

// ---------------------------------------------------------------------------
// Unread block, landing and read state (#302)
// ---------------------------------------------------------------------------

const mailScrollEl = ref(null)
const mailScroll = ref({ top: 0, height: 0, scrollHeight: 0 })

function updateMailScroll() {
  const el = mailScrollEl.value
  if (!el) return
  mailScroll.value = { top: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight }
}

/** Whether the list is scrolled to the newest mail (bottom). */
const atMailBottom = computed(() => {
  const { top, height, scrollHeight } = mailScroll.value
  return scrollHeight - (top + height) < 48
})

/** Unread incoming mail in the current folder (oldest first). */
const unreadMail = computed(() => currentMessages.value.filter(m => echo.isNetmailUnread(m)))
const firstUnreadMailId = computed(() => unreadMail.value[0]?.message_id || unreadMail.value[0]?.id || '')

/** Floating jump button when the newest mail is off-screen. */
const showMailPill = computed(() => {
  const { height, scrollHeight } = mailScroll.value
  return scrollHeight > height + 48 && !atMailBottom.value
})

async function onMailScroll() {
  updateMailScroll()
  if (atMailBottom.value && unreadMail.value.length > 0) {
    echo.markNetmailRead()
  }
}

function mailElement(messageId) {
  if (!messageId || !mailScrollEl.value) return null
  const nodes = mailScrollEl.value.querySelectorAll('[data-mail-id]')
  for (const node of nodes) {
    if (node.getAttribute('data-mail-id') === messageId) return node
  }
  return null
}

function scrollMailElement(el, { block = 'start', smooth = false } = {}) {
  if (!el) return false
  try {
    el.scrollIntoView({ block, behavior: smooth ? 'smooth' : 'auto' })
    return true
  } catch {
    return false
  }
}

/** Scroll to the first unread mail (or the divider) in the current folder. */
async function scrollToUnreadMail({ smooth = false } = {}) {
  await nextTick()
  const divider = mailScrollEl.value?.querySelector('[data-mail-divider]')
  if (divider) return scrollMailElement(divider, { block: 'start', smooth })
  return scrollMailElement(mailElement(firstUnreadMailId.value), { block: 'start', smooth })
}

/** Scroll to the newest mail (bottom of the chronological list). */
async function scrollToNewestMail({ smooth = true } = {}) {
  await nextTick()
  const nodes = mailScrollEl.value?.querySelectorAll('[data-mail-id]')
  const last = nodes && nodes.length ? nodes[nodes.length - 1] : null
  if (last) return scrollMailElement(last, { block: 'end', smooth })
  const el = mailScrollEl.value
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    return true
  }
  return false
}

/** Landing when a folder is opened: first unread, otherwise the newest mail. */
async function landOnUnreadMail() {
  await nextTick()
  if (!currentFolder.value) return
  if (firstUnreadMailId.value) {
    await scrollToUnreadMail()
  } else {
    await scrollToNewestMail({ smooth: false })
  }
  updateMailScroll()
}

async function jumpToUnreadMail() {
  if (firstUnreadMailId.value) {
    await scrollToUnreadMail({ smooth: true })
  } else {
    await scrollToNewestMail({ smooth: true })
  }
}

function isErrorMsg(msg) {
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return d && d.type === 'error'
  } catch { return false }
}

function msgSubject(msg) {
  const d = parseData(msg)
  return d.subject || ''
}

function msgBody(msg) {
  const d = parseData(msg)
  if (d.type === 'error') return d.error || d.message || ''
  return d.body || d.message || ''
}

function parseData(msg) {
  if (!msg?.data) return {}
  try { return typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data }
  catch { return {} }
}

/** Показывает адрес; собственный адрес заменяется на «Me»/«Я». */
function addrLabel(addr) {
  if (!addr) return t('netmail.me')
  return addr === identity.user?.address ? t('netmail.me') : addr
}

/** sender_name из (расшифрованного) содержимого нетмайла */
function senderNameOf(msg) {
  if (!msg?.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return (d && typeof d.sender_name === 'string') ? d.sender_name : ''
  } catch { return '' }
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${mins}`
}

function formatDraftDate(ts) {
  return new Date(ts).toLocaleString()
}

function openMessage(msg) {
  router.push({ name: 'NetmailDetail', params: { folderId: currentFolder.value, messageId: msg.message_id } })
}

function handleReply(msg) {
  const d = parseData(msg)
  openCompose(msg.sender_address, d.subject ? `Re: ${d.subject}` : '', d.body || '')
}

function forwardMessage(msg) {
  forwardMsg.value = msg
  showForwardDialog.value = true
}

async function handleForwardAction(forwardData) {
  showForwardDialog.value = false
  if (!forwardMsg.value) return
  const msgData = parseData(forwardMsg.value)

  try {
    if (forwardData.type === 'echo') {
      const text = forwardData.comment
        ? `${forwardData.comment}\n\n---\n${msgData.body || msgData.message || ''}`
        : `${msgData.body || msgData.message || ''}`
      const signed = await createSignedMessage('echomail', {
        subject: msgData.subject ? `Forward: ${msgData.subject}` : 'Forwarded message',
        body: text,
        timestamp: Math.floor(Date.now() / 1000),
      }, { echo_name: forwardData.destination })
      await apiService.sendReceive({ messages: [signed] })
    } else if (forwardData.type === 'netmail') {
      await sendNetmail(forwardData.destination, {
        subject: msgData.subject ? `Forward: ${msgData.subject}` : 'Forwarded message',
        body: forwardData.comment
          ? `${forwardData.comment}\n\n---\n${msgData.body || msgData.message || ''}`
          : `${msgData.body || msgData.message || ''}`,
        timestamp: Math.floor(Date.now() / 1000),
        original_message: forwardMsg.value.message_id,
      })
    } else if (forwardData.type === 'folder') {
      const slug = forwardData.destination
      const store = db.netmailStoreName(slug)
      await db.putMessage(store, {
        ...forwardMsg.value,
        message_id: forwardMsg.value.message_id || `fwd_${Date.now()}`,
        _folderSlug: slug,
        forwardedAt: Date.now(),
      })
      await loadCustomFolderMessages()
    }
  } catch (err) {
    console.error('[netmail] forward failed:', err)
  }
  forwardMsg.value = null
}

// Trash
async function moveToTrash(msg) {
  try {
    await db.moveToTrash('__netmail__', msg)
    const idx = echo.messages['__netmail__']?.findIndex(m => m.message_id === msg.message_id)
    if (idx > -1) echo.messages['__netmail__'].splice(idx, 1)
    await loadTrash()
  } catch (e) { console.warn('[trash] move failed', e) }
}

// Move to a custom folder
function openMoveToFolder(msg) {
  moveTargetMsg.value = msg
  showMoveToFolder.value = true
}

async function confirmMoveToFolder(slug) {
  const msg = moveTargetMsg.value
  if (!msg) return
  showMoveToFolder.value = false
  moveTargetMsg.value = null
  try {
    const store = db.netmailStoreName(slug)
    // Копируем в целевую папку (message_id неизменен — папки раздельные store'ы)
    await db.putMessage(store, {
      ...msg,
      _folderSlug: slug,
      movedAt: Date.now(),
    })
    // Удаляем из текущего расположения
    if (currentFolder.value === 'inbox' && msg.message_id) {
      const idx = echo.messages['__netmail__']?.findIndex(m => m.message_id === msg.message_id)
      if (idx > -1) echo.messages['__netmail__'].splice(idx, 1)
      await db.deleteMessage('__netmail__', msg.message_id)
    } else if (currentFolder.value && currentFolder.value !== 'inbox' && currentFolder.value !== 'trash' && msg.message_id) {
      await db.deleteMessage(db.netmailStoreName(currentFolder.value), msg.message_id)
    }
    await loadCustomFolderMessages()
    notifications.success(t('netmail.movedToFolder'), t('netmail.title'))
  } catch (e) {
    console.warn('[netmail] move to folder failed', e)
  }
}

async function restoreFromTrash(entry) {
  try {
    await db.restoreFromTrash(entry.id)
    await loadTrash()
  } catch (e) { console.warn('[trash] restore failed', e) }
}

async function deletePermanently(entry) {
  try {
    await db.deleteMessage('__trash__', entry.id)
    await loadTrash()
  } catch (e) { console.warn('[trash] delete failed', e) }
}

async function emptyTrash() {
  try {
    const all = await db.getTrash()
    for (const e of all) {
      await db.deleteMessage('__trash__', e.id)
    }
    await loadTrash()
  } catch (e) { console.warn('[trash] empty failed', e) }
}

async function loadTrash() {
  try {
    trashMessages.value = await db.getTrash()
  } catch { trashMessages.value = [] }
}

// Compose
function loadNetmailDraft(draft) {
  editingDraftId.value = draft.id
  openCompose(draft.recipient || '', draft.subject || '', draft.body || '')
}

function deleteNetmailDraft(id) {
  draftsManager.deleteDraft(id)
  if (editingDraftId.value === id) editingDraftId.value = null
}

// ---- Routing sync ----
function syncRoute() {
  const params = {}
  if (currentFolder.value) params.folderId = currentFolder.value
  router.replace({ name: 'Netmail', params })
}

watch(() => route.params.folderId, async (val) => {
  if (val) {
    if (val !== currentFolder.value) {
      currentFolder.value = val
      await loadCustomFolderMessages()
      await landOnUnreadMail()
    }
  } else if (currentFolder.value !== null) {
    // Route param cleared (e.g. /netmail/trash -> /netmail): reset to no folder
    currentFolder.value = null
  }
})

onMounted(async () => {
  await echo.loadEcho('__netmail__')
  await loadCustomFolders()
  await loadCustomFolderMessages()
  await loadTrash()
  poll.forcePoll()
  // Restore folder from route param
  if (route.params.folderId) {
    currentFolder.value = route.params.folderId
    await nextTick()
    await landOnUnreadMail()
  }
  // Open composer from legacy reply/forward query params
  if (route.query.to || route.query.subject || route.query.body) {
    openCompose(route.query.to || '', route.query.subject || '', route.query.body || '')
  }
})
</script>

<style scoped>
/* Unread mail markers (#302). */
.unread-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0;
  scroll-margin-top: 0.5rem;
  color: #2563eb;
  font-size: 0.75rem;
  font-weight: 600;
}
.unread-divider::before,
.unread-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid rgba(37, 99, 235, 0.4);
}
.dark .unread-divider {
  color: #60a5fa;
}
.dark .unread-divider::before,
.dark .unread-divider::after {
  border-top-color: rgba(96, 165, 250, 0.4);
}
.unread-dot {
  display: inline-block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: #3b82f6;
  flex-shrink: 0;
}
.mail-unread {
  background: rgba(59, 130, 246, 0.05);
}
.dark .mail-unread {
  background: rgba(59, 130, 246, 0.1);
}

/* The message list scrolls, not the page (#302). */
.netmail-layout {
  height: calc(100vh - var(--nav-height, 3.5rem) - 1rem);
}
@supports (height: 100dvh) {
  .netmail-layout {
    height: calc(100dvh - var(--nav-height, 3.5rem) - 1rem);
  }
}
</style>
