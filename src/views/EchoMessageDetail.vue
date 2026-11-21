<template>
  <div class="echo-detail">
    <button @click="goBack" class="mb-4 px-3 py-1 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
      ← {{ t('app.back') }}
    </button>

    <div v-if="!message" class="text-gray-500 dark:text-gray-400 p-4 text-center border rounded dark:border-gray-700">
      {{ t('echoes.echoDetail.notFound') }}
    </div>

    <template v-else>
      <div :class="[moderationBorder || 'border dark:border-gray-700', 'rounded-lg p-6 mb-4']">
        <div class="flex justify-between items-start mb-4">
          <div>
            <div class="text-sm text-gray-500 dark:text-gray-400">{{ t('echoes.echoDetail.echo') }}: <span class="font-semibold dark:text-gray-200">{{ echoName }}</span></div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('netmail.from') }}: <SenderLabel :address="message.sender_address" :name-from-message="parsedData.sender_name" /></div>
          </div>
          <div class="text-xs text-gray-400">
            {{ formatTimestamp(message.timestamp) }}
            <button v-if="message._edited" @click="showVersions = true"
              class="ml-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              ✏️ {{ t('messageActions.editedAt', { date: formatEditedAt(message) }) }}
            </button>
          </div>
        </div>

        <div v-if="message.type === 'announcement'" class="mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
          📢 {{ t('announcement.badge') }}
        </div>

        <template v-if="isErrorMessage">
          <div class="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded mb-4">
            <div class="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
              <span>⚠</span>
              <span>{{ t('echoes.error') }}</span>
            </div>
            <div class="mt-1 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{{ parsedData.error }}</div>
            <div v-if="parsedData.original_message" class="mt-2 p-2 bg-red-100 dark:bg-red-900/50 rounded text-xs text-red-700 dark:text-red-300">
              <div class="font-medium mb-1">{{ t('echoes.originalMessage') }}</div>
              <SourceJson :value="parsedData.original_message" />
            </div>
            <button v-if="parsedData.suggest_refill" @click="requestRefillForError"
              class="mt-2 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
              📥 {{ t('echoes.requestRefill') }}
            </button>
          </div>
        </template>
        <template v-else-if="isModerationMessage">
          <ModerationMessage :data="parsedData" />
        </template>
        <template v-else-if="refillRequest">
          <div class="p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded mb-4">
            <div class="font-semibold text-purple-800 dark:text-purple-300">📥 {{ t('echoes.refillRequest') }}</div>
            <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {{ t('refillDialog.requestFrom', { from: refillRequest.from }) }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">
              {{ t('refillDialog.echo') }}: {{ refillRequest.echoName }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">
              {{ t('refillDialog.before') }}: {{ new Date(refillRequest.before).toLocaleDateString() }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400">
              {{ t('refillDialog.messagesCount', { count: refillLocalCount }) }}
            </div>
            <button
              v-if="refillLocalCount > 0"
              :disabled="refillSending"
              @click="respondToRefill"
              class="mt-2 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {{ refillSending ? t('editor.sending') : t('refillDialog.send') }}
            </button>
            <div v-if="refillResult" class="mt-2 text-xs text-green-700 dark:text-green-400">{{ refillResult }}</div>
          </div>
        </template>
        <template v-else>
          <div v-if="parsedData.subject" class="text-lg font-semibold mb-4 dark:text-gray-200">{{ parsedData.subject }}</div>
          <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <CollapsibleContent no-collapse :tagline="parsedData.tagline || ''" :tearline="parsedData.tearline || ''" :content="parsedData.body || parsedData.message || ''" :attachments="parsedData.attachments" :attachment-resolver="attachmentsOf" :message-id="message.message_id" @select-attachment="handleSelectAttachment" />
          </div>
          <AttachmentsGallery :attachments="parsedData.attachments" :content="parsedData.body || parsedData.message || ''" :message-id="message.message_id" @select-attachment="handleSelectAttachment" />
        </template>

        <div v-if="message.message_id" class="mt-4 text-xs text-gray-400 break-all">
          ID: {{ message.message_id }}
        </div>
      </div>

      <!-- Действия -->
      <div class="flex gap-2">
        <button @click="showForwardDialog = true" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('app.forward') }}
        </button>
      </div>

      <!-- Исходник сообщения в самом низу (#322) -->
      <details class="fm-json-raw mt-4">
        <summary>{{ t('messageActions.showSource') }}</summary>
        <SourceJson :value="rawMessage" class="fm-json-body" />
      </details>

      <ForwardDialog
        :show="showForwardDialog"
        :message="message"
        @close="showForwardDialog = false"
        @forward="handleForwardAction"
      />

      <MessageVersionsDialog
        :visible="showVersions"
        :message="message"
        @close="showVersions = false"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEchoStore } from '../stores/echo'
import { createSignedMessage } from '../services/message'
import { apiService } from '../services/api'
import * as db from '../services/db'
import ForwardDialog from '../components/ForwardDialog.vue'
import MessageVersionsDialog from '../components/MessageVersionsDialog.vue'
import CollapsibleContent from '../components/CollapsibleContent.vue'
import { useSelectedMessages } from '../composables/useSelectedMessages'
import AttachmentsGallery from '../components/AttachmentsGallery.vue'
import SenderLabel from '../components/SenderLabel.vue'
import ModerationMessage from '../components/ModerationMessage.vue'
import { moderationBorderClass, moderationSeverity } from '../services/moderation'
import { sendRefillResponse, refillableMessagesFor, refillRequestFromMessage } from '../services/refill'
import SourceJson from '../components/SourceJson.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const echo = useEchoStore()

const showForwardDialog = ref(false)
const showVersions = ref(false)

// Исходник сообщения (#322): data парсится, чтобы JSON был читаемым (#316).
const rawMessage = computed(() => {
  const parsed = { ...message.value }
  if (typeof parsed.data === 'string') {
    try { parsed.data = JSON.parse(parsed.data) } catch { /* остаётся строкой */ }
  }
  return parsed
})

function formatEditedAt(msg) {
  const ts = msg?._edited_at
  if (!ts) return ''
  try { return new Date(ts * 1000).toLocaleString() } catch { return '' }
}

function goBack() {
  // Вернуться туда, откуда пришли (#322): из reader — на то же сообщение.
  const prev = window.history.state?.back
  if (prev) {
    router.back()
    return
  }
  router.push({ name: 'EchoDetail', params: { id: route.params.id } })
}

function formatTimestamp(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

// Selected attachments container (#306)
const selectedStore = useSelectedMessages()
function handleSelectAttachment({ attachment, messageId, index }) {
  const echoItem = (echo.echoes || []).find(e => e.name === echoName.value)
  selectedStore.toggleAttachment(attachment, {
    messageId: messageId || message?.message_id,
    index,
    echoName: echoName.value,
    echoId: echoItem?.id ?? null,
  })
}

const echoName = computed(() => {
  const id = route.params.id
  const item = echo.echoes.find(e => String(e.id) === String(id))
  return item?.name || id || ''
})

const message = computed(() => {
  const msgId = route.params.messageId
  if (!msgId) return null
  const msgs = echo.messages[echoName.value] || []
  return msgs.find(m => m.message_id === msgId) || null
})

const parsedData = computed(() => {
  if (!message.value?.data) return {}
  try {
    return typeof message.value.data === 'string' ? JSON.parse(message.value.data) : message.value.data
  } catch { return {} }
})

/**
 * Attachments of another message in this conference, used to resolve
 * message-scoped refs `attachment:<message_id>:N` in quotes (issue #268).
 */
function attachmentsOf(messageId) {
  if (!messageId) return null
  const m = (echo.messages[echoName.value] || []).find(x => x.message_id === messageId)
  if (!m) return null
  try {
    return JSON.parse(m.data).attachments || null
  } catch { return null }
}

const isErrorMessage = computed(() => parsedData.value.type === 'error')

const moderationBorder = computed(() => moderationBorderClass(parsedData.value))

const isModerationMessage = computed(() => moderationSeverity(parsedData.value) !== null)

// Refill request: click-through from the feed shows the request details and
// lets the user agree to send the old messages (issue #274).
const refillRequest = computed(() => refillRequestFromMessage(message.value))
const refillLocalCount = computed(() =>
  refillRequest.value ? refillableMessagesFor(echo.messages[echoName.value] || [], refillRequest.value.before).length : 0
)
const refillSending = ref(false)
const refillResult = ref('')

async function respondToRefill() {
  const req = refillRequest.value
  if (!req || refillSending.value) return
  refillSending.value = true
  refillResult.value = ''
  try {
    const messages = refillableMessagesFor(echo.messages[echoName.value] || [], req.before).slice(-100)
    const res = await sendRefillResponse(req, messages, { echoes: echo.echoes })
    refillResult.value = res.skipped > 0
      ? t('refillDialog.sentSkipped', { count: res.count, skipped: res.skipped })
      : t('refillDialog.sent', { count: res.count })
  } catch (err) {
    console.error('Refill respond error:', err)
    refillResult.value = t('refillDialog.sendError')
  } finally {
    refillSending.value = false
  }
}

async function requestRefillForError() {
  try {
    const { useIdentityStore } = await import('../stores/identity')
    const echoForRefill = parsedData.value.echo || echoName.value
    await useIdentityStore().sendRefillRequest(echoForRefill, new Date())
  } catch (e) {
    console.error('[echo-detail] refill request failed', e)
  }
}

onMounted(async () => {
  // Ensure the echo list is loaded (for id -> name mapping on direct deep links)
  if (echo.echoes.length === 0) {
    try {
      const data = await apiService.getEchoes()
      await echo.reconcileEchoRenames(data)
      echo.setEchoes(data)
    } catch (e) { console.warn('[echo-detail] load echoes failed', e) }
  }
  // Ensure messages for the echo are loaded
  if (echoName.value && !echo.messages[echoName.value]) {
    await echo.loadEcho(echoName.value)
  }
})

async function handleForwardAction(forwardData) {
  showForwardDialog.value = false
  const msgData = parsedData.value

  if (forwardData.type === 'echo') {
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
    const { sendNetmail } = await import('../services/message')
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
.echo-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}
</style>
