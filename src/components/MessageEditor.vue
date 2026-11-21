<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="requestClose">
    <div class="message-editor bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-2xl w-full mx-2 sm:mx-4 max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden" @paste="onPaste">
      <h3 class="text-lg font-bold mb-4 dark:text-white shrink-0">{{ isEdit ? t('editor.editTitle') : t('editor.title') }}</h3>

      <!-- Everything above the footer scrolls on short screens; the footer stays visible. -->
      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col pr-1">

      <!-- Echo name (read-only) / Netmail recipient / Blog name (read-only) -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {{ blog ? t('bloggor.blogName') : (netmail ? t('netmail.recipient') : t('protocol.echo')) }}
        </label>
        <input v-if="netmail" v-model="recipient" list="editor-known-addresses"
          class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm"
          :placeholder="t('netmail.recipientPlaceholder')" />
        <datalist v-if="netmail" id="editor-known-addresses">
          <option v-for="addr in knownAddresses" :key="addr" :value="addr" />
        </datalist>
        <input v-else :value="blog ? blogName : echoName" disabled class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 text-sm" />
      </div>

      <!-- Reply indicator -->
      <div v-if="replyQuoteId" class="mb-3 flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-sm">
        <span class="text-blue-700 dark:text-blue-300 inline-flex items-center gap-1">↩ {{ t('editor.replyingTo') }} <SenderLabel :address="replySenderAddress" :name="replySenderName" class="font-semibold" /></span>
        <button @click="clearReply" class="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border rounded px-1.5 py-0.5">✕</button>
      </div>

      <!-- Subject -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('netmail.subject') }}</label>
        <input v-model="subject" class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" :placeholder="t('editor.subjectPlaceholder')" />
      </div>

      <!-- From (отображаемое имя отправителя, можно переопределить) -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('editor.from') }}</label>
        <input v-model="fromName" class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm"
          :placeholder="defaultFromName" />
      </div>


      <!-- Announcement toggle -->
      <label v-if="!blog && !netmail && echoAllowsAnnouncements && !isEdit"
        class="mb-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
        <input type="checkbox" v-model="isAnnouncement" class="rounded text-blue-600" />
        <span>📢 {{ t('editor.postAnnouncement') }}</span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('editor.postAnnouncementHint') }}</span>
      </label>

      <!-- Body (Markdown) -->
      <div class="mb-3 flex-1 flex flex-col">
        <div class="flex items-center justify-between mb-1">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('editor.body') }}</label>
          <div class="flex items-center gap-2">
            <button @click="previewMode = !previewMode" class="text-xs text-blue-500 hover:text-blue-700">
              {{ previewMode ? t('editor.edit') : t('editor.preview') }}
            </button>
            <MarkdownHelp />
          </div>
        </div>
        <textarea v-if="!previewMode" ref="bodyTextarea" v-model="body" rows="8"
          class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm flex-1 min-h-[8rem]"
          :placeholder="t('editor.bodyPlaceholder')" />
        <div v-else class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm flex-1 min-h-[8rem] overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
          <MarkdownBody :content="body || ''" :attachments="previewAttachments" :attachment-resolver="attachmentsOf" />
        </div>
      </div>

      <!-- Tagline: shown as text under the message, edited in place (#309) -->
      <div class="mb-3 -mt-1 text-sm">
        <template v-if="!editingTagline">
          <span v-if="tagline" class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ tagline }}</span>
          <span v-else class="italic text-gray-400 dark:text-gray-500">{{ t('editor.noTagline') }}</span>
          <button type="button" @click="startTaglineEdit"
            class="ml-2 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >{{ t('editor.editTagline') }}</button>
          <!-- Save this tagline as the default one (#309) -->
          <button v-if="taglineDiffers" type="button" @click="saveGlobalTagline"
            class="ml-2 text-xs hover:opacity-80"
            :title="t('editor.saveTagline')"
          >💾</button>
        </template>
        <template v-else>
          <div class="flex items-center gap-2">
            <input
              ref="taglineInput"
              v-model="taglineDraft"
              maxlength="200"
              class="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm"
              :placeholder="t('editor.taglinePlaceholder')"
              @keydown.enter.prevent="applyTagline"
              @keydown.esc.prevent="cancelTaglineEdit"
            />
            <button type="button" @click="applyTagline" class="text-xs text-blue-500 hover:text-blue-700">{{ t('app.save') }}</button>
            <button type="button" @click="cancelTaglineEdit" class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">{{ t('app.cancel') }}</button>
          </div>
        </template>
      </div>

      <!-- Attachments -->
      <div class="mb-3 mt-3">
        <div class="flex items-center gap-2 mb-1">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('editor.attachments') }}</label>
          <button @click="addAttachment" class="text-xs text-blue-500 hover:text-blue-700">+ {{ t('editor.add') }}</button>
          <!-- Attach messages/attachments picked in the Selected container (#306) -->
          <button v-if="selectedCount > 0" @click="showAttachSelected = true"
            class="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >📌 {{ t('editor.attachSelected') }} ({{ selectedCount }})</button>
          <span class="text-xs text-gray-400 dark:text-gray-500">{{ t('editor.pasteHint') }}</span>
        </div>
        <div v-if="attachments.length > 0" class="space-y-1 max-h-40 overflow-y-auto">
          <div v-for="(att, i) in attachments" :key="i" class="flex items-center gap-2 text-sm p-1 bg-gray-50 dark:bg-gray-700 rounded">
            <img v-if="att.file.type.startsWith('image/')" :src="att.preview" class="w-10 h-10 object-cover rounded" />
            <span class="truncate text-gray-700 dark:text-gray-300 flex-1">
              {{ att.file.name }} ({{ formatSize(att.file.size) }})
            </span>
            <button @click="attachments.splice(i, 1)" class="text-red-500 hover:text-red-700 ml-2 text-lg leading-none">&times;</button>
          </div>
        </div>
      </div>

      <AttachSelectedDialog
        :visible="showAttachSelected"
        @close="showAttachSelected = false"
        @attach="onAttachSelected"
      />
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm shrink-0">{{ error }}</div>

      <!-- Request key (netmail mode, when recipient key unknown) -->
      <div v-if="showKeyRequest" class="mb-3 flex items-center gap-2 shrink-0">
        <button @click="requestKey" class="px-3 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600">
          {{ t('netmail.requestKey') }}
        </button>
      </div>

      <div class="flex justify-end gap-3 pt-3 border-t dark:border-gray-600 shrink-0">
        <button @click="requestClose" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('app.cancel') }}
        </button>
        <button @click="submit" :disabled="sending || !canSend" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
          {{ sending ? t('editor.sending') : (isEdit ? t('editor.save') : t('editor.send')) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import SenderLabel from './SenderLabel.vue'
import { useEchoStore } from '../stores/echo'
import { useIdentityStore } from '../stores/identity'
import { useSettingsStore } from '../stores/settings'
import { useNotificationsStore } from '../stores/notifications'
import { useMessageSender } from '../composables/useMessageSender'
import { useSelectedMessages } from '../composables/useSelectedMessages'
import AttachSelectedDialog from './AttachSelectedDialog.vue'
import { formatFidoQuote, scopeAttachmentRefs } from '../utils/quote'
import { keyService } from '../services/keyService'
import { transcodeImage } from '../utils/image'
import { imageFilesFromClipboard } from '../utils/clipboard'
import MarkdownHelp from './MarkdownHelp.vue'
import MarkdownBody from './MarkdownBody.vue'

const { t } = useI18n()
const messageSender = useMessageSender()
const selectedStore = useSelectedMessages()
const selectedCount = computed(() => selectedStore.count.value)
const showAttachSelected = ref(false)
const echoStore = useEchoStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
  echoName: { type: String, default: '' },
  // Blog mode: compose a local blog post (emits blogSubmit instead of sending)
  blog: { type: Boolean, default: false },
  blogName: { type: String, default: '' },
  // Netmail mode: show recipient field instead of echo, send as netmail
  netmail: { type: Boolean, default: false },
  recipient: { type: String, default: '' },
  initialSubject: { type: String, default: '' },
  initialBody: { type: String, default: '' },
  forwardMessage: { type: Object, default: null },
  // Reply mode: original message to quote (newsgroup style)
  quote: { type: Object, default: null },
  // Edit mode: original own message being updated (full replacement via updateMessageId)
  editMessage: { type: Object, default: null },
})
const emit = defineEmits(['close', 'sent', 'blogSubmit'])

const subject = ref('')
const body = ref('')
const fromName = ref('')
const bodyTextarea = ref(null)
const previewMode = ref(false)
const sending = ref(false)
const error = ref('')
const showKeyRequest = ref(false)
const attachments = ref([])

/**
 * Composer attachments in the message-attachment shape, so the preview can
 * resolve `attachment:N` refs and render JSON bundle cards (#306). Files added
 * in this session have no data URL yet (it is read on submit), so only their
 * name/type/size are known.
 */
const previewAttachments = computed(() => attachments.value.map((att, i) => ({
  name: att.file?.name || `attachment-${i + 1}`,
  type: att.file?.type || '',
  size: att.file?.size || 0,
  data: att.data || att.preview || '',
  preview: att.preview || '',
})))
const recipient = ref(props.recipient || '')
const replyQuoteId = ref(null)
const replyQuoteText = ref('')
// Message update mode: message_id of the original being replaced.
const updateMessageId = ref(null)
const tagline = ref('')
const taglineDraft = ref('')
const editingTagline = ref(false)
const taglineInput = ref(null)
const isEdit = computed(() => !!updateMessageId.value)

// The stored default tagline (settings profile) and whether the message one
// differs from it (#309). An empty default adopts the first written tagline
// automatically; a different one can be saved with the 💾 button.
const settingsStore = useSettingsStore()
const notifications = useNotificationsStore()
const globalTagline = computed(() => (settingsStore.userProfile?.tagline || '').trim())
const taglineDiffers = computed(() => {
  const value = tagline.value.trim()
  return !!value && value !== globalTagline.value
})

function startTaglineEdit() {
  taglineDraft.value = tagline.value
  editingTagline.value = true
  nextTick(() => taglineInput.value?.focus())
}

function applyTagline() {
  tagline.value = taglineDraft.value.trim()
  editingTagline.value = false
  // The default was empty: adopt what the user just wrote, so it is used for
  // the following messages too (#309).
  if (tagline.value && !globalTagline.value) {
    saveGlobalTagline()
  }
}

/** Store the current tagline as the default one (settings profile). */
async function saveGlobalTagline() {
  const value = tagline.value.trim()
  if (!value) return
  try {
    await settingsStore.updateSettings({
      userProfile: { ...settingsStore.userProfile, tagline: value },
    })
    notifications.success(t('editor.taglineSaved'), t('editor.saveTagline'))
  } catch (err) {
    console.warn('[editor] save tagline failed', err)
    notifications.error(err.message || t('editor.taglineSaveFailed'), t('editor.saveTagline'))
  }
}

function cancelTaglineEdit() {
  editingTagline.value = false
}

// Адресат ответа (для подсказки в шапке): адрес + имя из сообщения/справочника.
const replySenderAddress = computed(() => props.quote?.sender_address || '')
const replySenderName = computed(() => {
  if (!props.quote) return ''
  try {
    const d = JSON.parse(props.quote.data || '{}')
    return d.sender_name || ''
  } catch {
    return ''
  }
})

const knownAddresses = computed(() => Array.from(keyService.keyCache.keys()).sort())

// Имя отправителя по умолчанию — имя пользователя (единственный источник, #296).
const defaultFromName = computed(() => {
  const identity = useIdentityStore()
  const settings = useSettingsStore()
  return (identity.user?.name || '').trim()
})

const canSend = computed(() => {
  if (!subject.value.trim()) return false
  if (props.netmail && !recipient.value.trim()) return false
  return body.value.trim() || attachments.value.length > 0
})

// Announcement mode: available only in conferences whose rules enable
// announcements (announcements_enable = true).
const echoItem = computed(() => echoStore.echoes.find(e => e.name === props.echoName) || null)

function echoRulesParameters(echo) {
  if (!echo || !echo.rules) return {}
  try {
    const rules = typeof echo.rules === 'string' ? JSON.parse(echo.rules) : echo.rules
    return rules?.parameters || {}
  } catch { return {} }
}

const echoAllowsAnnouncements = computed(() => {
  const params = echoRulesParameters(echoItem.value)
  const v = params.announcements_enable
  return v === true || v === 'true' || v === '1'
})

const isAnnouncement = ref(false)

const hasContent = computed(() => subject.value.trim() || body.value.trim() || attachments.value.length > 0 || recipient.value.trim())

// Close guarded: if there's unsaved content, ask before discarding.
function requestClose() {
  if (!hasContent.value || window.confirm(t('editor.discardConfirm'))) {
    emit('close')
  }
}


/** Attachments of another message in this echo (for quoted attachment refs). */
function attachmentsOf(messageId) {
  if (!messageId) return null
  const m = (echoStore.messages[props.echoName] || []).find(x => x.message_id === messageId)
  if (!m) return null
  try { return JSON.parse(m.data).attachments || null } catch { return null }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function addAttachment() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.onchange = () => {
    addFiles(input.files || [])
  }
  input.click()
}

/** Clipboard images often have no name (or all share "image.png"). */
function ensureFileName(file) {
  const ext = ((file.type || '').split('/')[1] || 'png').replace('jpeg', 'jpg')
  const fallback = `pasted-${Date.now()}.${ext}`
  const name = (file.name || '').trim()
  if (!name || attachments.value.some(a => a.file.name === name)) {
    try {
      return new File([file], fallback, { type: file.type })
    } catch {
      return file
    }
  }
  return file
}

/** Adds files as attachments and inserts their `attachment:N` reference. */
function addFiles(files) {
  for (const raw of files) {
    const file = ensureFileName(raw)
    const isImage = (file.type || '').startsWith('image/')
    const preview = isImage ? URL.createObjectURL(file) : null
    const idx = attachments.value.length
    attachments.value.push({ file, preview })
    // Insert `attachment:N` reference into the body text
    const ref = isImage
      ? `![${file.name}](attachment:${idx})`
      : `[${file.name}](attachment:${idx})`
    insertAtCursor(ref)
  }
}

/**
 * Attach the entries chosen in the Selected picker (#306): they are added to
 * the message with `attachment:N` references in the body.
 */
function onAttachSelected({ attachments: picked }) {
  const restored = (picked || [])
    .map((att, i) => restoreAttachment(att, attachments.value.length + i))
    .filter(Boolean)
  if (restored.length === 0) return
  const base = attachments.value.length
  attachments.value = [...attachments.value, ...restored]
  const refs = restored.map((att, i) => {
    const idx = base + i
    const isImage = (att.file.type || '').startsWith('image/')
    return isImage ? `![${att.file.name}](attachment:${idx})` : `[${att.file.name}](attachment:${idx})`
  }).join('\n')
  body.value = body.value ? `${body.value}\n\n${refs}` : refs
}

/** Ctrl-V: paste image(s) from the clipboard as attachments. */
function onPaste(event) {
  const files = imageFilesFromClipboard(event.clipboardData)
  if (files.length === 0) return // let the default (text) paste happen
  event.preventDefault()
  addFiles(files)
}

function insertAtCursor(text) {
  const el = bodyTextarea.value
  if (!el) {
    body.value = body.value ? body.value + '\n' + text : text
    return
  }
  const start = el.selectionStart ?? body.value.length
  const end = el.selectionEnd ?? body.value.length
  body.value = body.value.substring(0, start) + text + body.value.substring(end)
  nextTick(() => {
    const pos = start + text.length
    el.selectionStart = el.selectionEnd = pos
    el.focus()
  })
}

// `immediate` covers the case when the editor is mounted already visible (the
// Selected container opens a message right after navigating, #306).
watch(() => props.visible, (v) => {
  if (v) {
    subject.value = ''
    body.value = ''
    fromName.value = defaultFromName.value
    previewMode.value = false
    error.value = ''
    showKeyRequest.value = false
    attachments.value = []
    recipient.value = props.recipient || ''
    isAnnouncement.value = false
    replyQuoteId.value = null
    replyQuoteText.value = ''
    updateMessageId.value = null
    editingTagline.value = false
    tagline.value = (useSettingsStore().userProfile?.tagline || '').trim()

    if (props.editMessage) {
      // Edit mode: prefill the original content and remember its message ID so
      // the update replaces it (docs/service/echomail.md §Обновления сообщений).
      const orig = props.editMessage
      let d = {}
      try { d = JSON.parse(orig.data || '{}') } catch {}
      updateMessageId.value = orig.message_id || null
      subject.value = d.subject || ''
      body.value = d.body || d.message || ''
      fromName.value = d.sender_name || defaultFromName.value
      tagline.value = typeof d.tagline === 'string' ? d.tagline : ''
      isAnnouncement.value = orig.type === 'announcement'
      attachments.value = (Array.isArray(d.attachments) ? d.attachments : [])
        .map((att, i) => restoreAttachment(att, i))
        .filter(Boolean)
    } else if (props.quote) {
      // Reply mode: quote the original message newsgroup-style.
      const q = props.quote
      let d = {}
      try { d = JSON.parse(q.data || '{}') } catch {}
      replyQuoteId.value = q.message_id || q._reply_to || null
      // Тема ответа: «Re: …», но не удваиваем уже существующий префикс «Re:».
      const subj = String(d.subject || '').trim()
      subject.value = subj ? (subj.toUpperCase().startsWith('RE:') ? subj : `Re: ${subj}`) : ''
      const name = d.sender_name || q.sender_address || q._senderName || ''
      // Attachment refs in the quote must point at the quoted message (#268).
      replyQuoteText.value = formatFidoQuote(name, scopeAttachmentRefs(d.body || d.message || '', q.message_id))
      if (replyQuoteText.value) body.value = `${replyQuoteText.value}\n\n`
      else body.value = ''
    } else if (props.forwardMessage) {
      try {
        const data = JSON.parse(props.forwardMessage.data || '{}')
        const from = props.forwardMessage.sender_address || data.from || ''
        const msg = scopeAttachmentRefs(data.body || data.message || '', props.forwardMessage.message_id)
        subject.value = data.subject ? `Fwd: ${data.subject}` : ''
        body.value = `> From: ${from}\n> \n> ${msg.replace(/\n/g, '\n> ')}\n\n`
      } catch {}
    } else {
      if (props.initialSubject) subject.value = props.initialSubject
      if (props.initialBody) body.value = props.initialBody
    }
  }
}, { immediate: true })

/** Отменить ответ: убрать цитату из начала тела и reply_to. */function clearReply() {
  if (replyQuoteText.value) {
    body.value = body.value.replace(replyQuoteText.value + '\n\n', '')
  }
  replyQuoteId.value = null
  replyQuoteText.value = ''
  subject.value = ''
}

async function requestKey() {
  if (!recipient.value.trim()) return
  try {
    await keyService.requestPublicKey(recipient.value.trim(), false)
    showKeyRequest.value = false
    error.value = t('netmail.keyRequested')
  } catch (err) {
    error.value = t('netmail.keyRequestFailed') + ': ' + err.message
  }
}

async function submit() {
  error.value = ''
  showKeyRequest.value = false
  sending.value = true
  try {
    // Serialize attachments to base64 data URLs (images are transcoded/compressed)
    const attachmentData = []
    for (const att of attachments.value) {
      const dataUrl = await readFileAsDataURL(att.file)
      attachmentData.push({
        name: att.file.name,
        type: att.file.type,
        size: att.file.size,
        data: dataUrl,
      })
    }

    const messageData = {
      subject: subject.value,
      body: body.value,
      timestamp: Math.floor(Date.now() / 1000),
      sender_name: fromName.value.trim() || defaultFromName.value,
      // Always sent (also empty): an empty field removes the tagline for this
      // message even when one is configured in the settings (#309).
      tagline: tagline.value.trim(),
    }
    if (attachmentData.length > 0) {
      messageData.attachments = attachmentData
    }
    if (updateMessageId.value) {
      // Message update: the full new text replaces the original on the node
      // (stored announcements) and in the clients.
      messageData.updateMessageId = updateMessageId.value
    }

    if (props.blog) {
      // Blog mode: hand the composed post back to the parent for local storage
      emit('blogSubmit', messageData)
      emit('sent')
      emit('close')
      return
    }

    if (props.netmail) {
      const result = await messageSender.sendNetmail(recipient.value.trim(), messageData)
      if (result?.queued) {
        if (result.noKey) {
          if (result.keyRequested) {
            // Авто-запрос ключа уже отправлен — сообщение останется в исходящих
            error.value = t('netmail.autoKeyRequested')
            sending.value = false
            return
          }
          // Сохранено в outbox без ключа — предлагаем запросить ключ
          showKeyRequest.value = true
          error.value = t('netmail.savedNoKey')
          return
        }
        // Письмо с известным ключом поставлено в outbox и выбрано — ждёт кнопки «Отправить»
        emit('sent')
        emit('close')
        return
      }
      // Fallback: закрываем (не должно случаться)
      emit('sent')
      emit('close')
      return
    } else {
      const msgType = isAnnouncement.value ? 'announcement' : 'echomail'
      const extraOpts = {}
      if (replyQuoteId.value) {
        extraOpts.reply_to_message_id = replyQuoteId.value
      }
      if (isEdit.value && props.editMessage?.reply_to_message_id) {
        extraOpts.reply_to_message_id = props.editMessage.reply_to_message_id
      }
      // Re-editing before the update is sent replaces the queued entry.
      const extraEntry = isEdit.value
        ? { dedupKey: `update_${props.echoName}_${updateMessageId.value}` }
        : {}
      await messageSender.sendToEcho(props.echoName, msgType, messageData, extraOpts, extraEntry)
    }
    emit('sent')
    emit('close')
  } catch (err) {
    error.value = err.message || t('editor.sendError')
  } finally {
    sending.value = false
  }
}

function readFileAsDataURL(file) {
  if (file.type && file.type.startsWith('image/')) {
    return transcodeImage(file)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/** Restore an attachment from a stored data URL so an update re-sends it. */
function restoreAttachment(att, index) {
  try {
    const dataUrl = String(att?.data || '')
    if (!dataUrl.startsWith('data:')) return null
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const mime = (dataUrl.slice(5, comma).split(';')[0]) || att.type || 'application/octet-stream'
    const bin = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], att.name || `attachment-${index + 1}`, { type: mime })
    // `data` is kept for the composer preview (JSON cards, #306); the outgoing
    // message is serialized from the file again in submit().
    return { file, preview: mime.startsWith('image/') ? dataUrl : null, data: dataUrl }
  } catch (e) {
    console.warn('[editor] failed to restore attachment', e)
    return null
  }
}
</script>

<style scoped>
/* Dynamic viewport height follows mobile browser chrome; plain vh is the
   fallback for browsers that do not support dvh. */
@supports (height: 100dvh) {
  .message-editor {
    max-height: 92dvh;
  }
}
@media (min-width: 640px) {
  @supports (height: 100dvh) {
    .message-editor {
      max-height: 90dvh;
    }
  }
}
</style>
