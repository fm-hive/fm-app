<template>
  <div class="netmail-detail">
    <button @click="goBack" class="mb-4 px-3 py-1 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
      ← {{ t('app.back') }}
    </button>

    <div v-if="!message" class="text-gray-500 dark:text-gray-400 p-4 text-center border rounded dark:border-gray-700">
      {{ t('netmail.notFound') }}
    </div>

    <template v-else>
      <div class="border rounded-lg p-6 dark:border-gray-700 mb-4">
        <div class="flex justify-between items-start mb-4">
          <div>
            <div class="text-sm text-gray-500 dark:text-gray-400">{{ t('netmail.from') }}: <SenderLabel :address="message.sender_address" :name-from-message="senderName" /></div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('netmail.to') }}: <SenderLabel :address="message.recipient_address" me /></div>
          </div>
          <div class="text-xs text-gray-400">{{ formatTimestamp(message.timestamp) }}</div>
        </div>

        <div v-if="parsedData.subject" class="text-lg font-semibold mb-4 dark:text-gray-200">{{ parsedData.subject }}</div>

        <!-- Error message (delivered into netmail errors folder) -->
        <div v-if="parsedData.type === 'error'" class="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
          <div class="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <span>⚠</span>
            <span>{{ t('echoes.error') }}</span>
          </div>
          <div class="mt-1 text-sm text-red-600 dark:text-red-400">{{ parsedData.error || parsedData.message }}</div>
          <div v-if="parsedData.original_message" class="mt-2 p-2 bg-red-100 dark:bg-red-900/50 rounded text-xs text-red-700 dark:text-red-300">
            <div class="font-medium mb-1">{{ t('echoes.originalMessage') }}</div>
            <SourceJson :value="parsedData.original_message" />
          </div>
        </div>

        <div v-else class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <CollapsibleContent no-collapse :tagline="parsedData.tagline || ''" :tearline="parsedData.tearline || ''" :content="parsedData.body || parsedData.message || ''" :attachments="parsedData.attachments" :message-id="message.message_id" @select-attachment="handleSelectAttachment" />
        </div>

        <AttachmentsGallery v-if="parsedData.type !== 'error'" :attachments="parsedData.attachments" :content="parsedData.body || parsedData.message || ''" :message-id="message.message_id" @select-attachment="handleSelectAttachment" />

        <div v-if="message.message_id" class="mt-4 text-xs text-gray-400 break-all">
          ID: {{ message.message_id }}
        </div>
      </div>

      <!-- Действия -->
      <div class="flex gap-2">
        <button @click="replyTo" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          {{ t('messageActions.reply') }}
        </button>
        <button @click="showForwardDialog = true" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('app.forward') }}
        </button>
      </div>

      <ForwardDialog
        :show="showForwardDialog"
        :message="message"
        @close="showForwardDialog = false"
        @forward="handleForwardAction"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEchoStore } from '../stores/echo'
import { useIdentityStore } from '../stores/identity'
import { sendNetmail, createSignedMessage } from '../services/message'
import { apiService } from '../services/api'
import * as db from '../services/db'
import * as crypto from '../services/crypto'
import ForwardDialog from '../components/ForwardDialog.vue'
import CollapsibleContent from '../components/CollapsibleContent.vue'
import { useSelectedMessages } from '../composables/useSelectedMessages'
import AttachmentsGallery from '../components/AttachmentsGallery.vue'
import SenderLabel from '../components/SenderLabel.vue'
import SourceJson from '../components/SourceJson.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const echo = useEchoStore()
const identity = useIdentityStore()

const showForwardDialog = ref(false)
const storedMessage = ref(null)

function goBack() {
  router.push({ name: 'Netmail', params: { folderId: route.params.folderId } })
}

function formatTimestamp(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

// Selected attachments container (#306). Netmail has no echo: the entry keeps
// the IndexedDB store of the folder (`netmail_<folder>`) as its source, so the
// attachment can be resolved later.
const selectedStore = useSelectedMessages()
function handleSelectAttachment({ attachment, messageId, index }) {
  selectedStore.toggleAttachment(attachment, {
    messageId: messageId || message?.message_id,
    index,
    echoName: route.params.folderId ? db.netmailStoreName(route.params.folderId) : '',
    echoId: null,
  })
}

const message = computed(() => {
  const msgId = route.params.messageId
  if (!msgId) return null
  if (storedMessage.value) return storedMessage.value
  for (const echoName in echo.messages) {
    for (const msg of echo.messages[echoName]) {
      if (msg.message_id === msgId) {
        return msg
      }
    }
  }
  return null
})

const senderName = computed(() => {
  if (!message.value?.data) return ''
  try {
    const d = typeof message.value.data === 'string' ? JSON.parse(message.value.data) : message.value.data
    return (d && typeof d.sender_name === 'string') ? d.sender_name : ''
  } catch { return '' }
})

async function loadMessage() {
  const msgId = route.params.messageId
  if (!msgId) return
  storedMessage.value = null
  // Try IndexedDB (custom folders, inbox, sent, etc.)
  if (route.params.folderId) {
    try {
      const store = db.netmailStoreName(route.params.folderId)
      storedMessage.value = await db.getMessage(store, msgId)
      if (storedMessage.value) return
    } catch (e) {
      console.warn('[netmail-detail] load from folder failed', e)
    }
  }
  // Fallback: search in-memory echo store
  for (const echoName in echo.messages) {
    const found = (echo.messages[echoName] || []).find(m => m.message_id === msgId)
    if (found) { storedMessage.value = found; return }
  }
  // Deep link straight to the message (the netmail list was never opened):
  // all netmail folders live in the `__netmail__` store.
  try {
    const all = await db.getAllMessages('__netmail__')
    const found = (all || []).find(m => m.message_id === msgId)
    if (found) {
      if (!found.data && found.jws) found.data = crypto.decodeJwsPayload(found.jws)
      storedMessage.value = found
    }
  } catch (e) {
    console.warn('[netmail-detail] load from __netmail__ failed', e)
  }
}

onMounted(async () => {
  // Открытие письма = чтение: сбрасываем бейдж непрочитанного нетмайла.
  echo.markNetmailRead()
  await loadMessage()
})
watch(() => route.params.messageId, loadMessage)

const parsedData = computed(() => {
  if (!message.value?.data) return {}
  try {
    return typeof message.value.data === 'string' ? JSON.parse(message.value.data) : message.value.data
  } catch { return {} }
})

function replyTo() {
  router.push({
    name: 'Netmail',
    query: {
      to: message.value.sender_address,
      subject: parsedData.value.subject ? `Re: ${parsedData.value.subject}` : '',
      body: `${parsedData.value.body || ''}`,
    }
  })
}

async function handleForwardAction(forwardData) {
  showForwardDialog.value = false
  const msgData = parsedData.value

  if (forwardData.type === 'echo') {
    // netmail → echo: создаём echomail с контентом из netmail
    const forwardText = forwardData.comment
      ? `${forwardData.comment}\n\n---\n${msgData.body || msgData.message || ''}`
      : `${msgData.body || msgData.message || ''}`
    const forwardSubject = msgData.subject ? `Forward: ${msgData.subject}` : 'Forwarded message'
    const messagePayload = {
      subject: forwardSubject,
      body: forwardText,
      timestamp: Math.floor(Date.now() / 1000),
    }
    const signedMessage = await createSignedMessage('echomail', messagePayload, {
      echo_name: forwardData.destination,
    })
    await apiService.sendReceive({ messages: [signedMessage] })
  } else if (forwardData.type === 'netmail') {
    // netmail → netmail: пересылаем другому адресату
    const netmailData = {
      subject: msgData.subject ? `Forward: ${msgData.subject}` : 'Forwarded message',
      body: forwardData.comment
        ? `${forwardData.comment}\n\n---\n${msgData.body || msgData.message || ''}`
        : `${msgData.body || msgData.message || ''}`,
      timestamp: Math.floor(Date.now() / 1000),
      original_message: message.value.message_id,
    }
    await sendNetmail(forwardData.destination, netmailData)
  } else if (forwardData.type === 'folder') {
    // netmail → папка: сохранить сообщение в выбранную папку
    const store = db.netmailStoreName(forwardData.destination)
    await db.putMessage(store, {
      ...message.value,
      message_id: message.value.message_id || `fwd_${Date.now()}`,
      _folderSlug: forwardData.destination,
      forwardedAt: Date.now(),
    })
  }
}
</script>

<style scoped>
.netmail-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}
</style>
