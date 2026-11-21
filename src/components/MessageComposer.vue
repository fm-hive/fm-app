<template>
  <div class="message-composer border rounded-lg p-4">
    <div v-if="!identity.hasKeys" class="p-3 bg-red-50 border border-red-200 rounded">
      <div class="text-red-600 font-medium">{{ t('errors.policyFailed') }}</div>
      <div class="text-red-500 text-sm mt-1">You need to complete policy flow first.</div>
    </div>
    
    <form v-else @submit.prevent="sendMessage" class="space-y-4">
      <!-- Echo Selection (hidden when echo is pre-selected via props) -->
      <div v-if="!echoName">
        <label class="block text-sm font-medium mb-2">{{ t('messageComposer.selectEcho') }}</label>
        <select 
          v-model="selectedEchoName" 
          class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          :disabled="messageSender.sending"
        >
          <option :value="null" disabled>{{ t('messageComposer.selectEcho') }}</option>
          <option v-for="echo in subscribedEchoes" :key="echo.name" :value="echo.name">
            {{ echo.name }}
          </option>
        </select>
        
        <!-- Newcomers Echo Warning -->
        <div v-if="isNewcomersEcho" class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div class="font-medium text-yellow-800">{{ t('messageComposer.newcomersLimit') }}</div>
          <div class="text-yellow-700 mt-1">
            {{ t('messageComposer.newcomersRemaining', { remaining: remainingAnnouncements, max: maxAnnouncementsPerAddress }) }}
          </div>
          <div v-if="remainingAnnouncements === 0" class="font-bold text-red-600 mt-2">
            {{ t('messageComposer.newcomersLimitReached') }}
          </div>
        </div>
      </div>
      
      <!-- Subject -->
      <div>
        <label class="block text-sm font-medium mb-2">{{ t('messageComposer.subject') }}</label>
        <input 
          v-model="subject" 
          type="text" 
          class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          :placeholder="t('messageComposer.subject')"
          :disabled="messageSender.sending"
        >
      </div>

      <!-- From (отображаемое имя отправителя, можно переопределить) -->
      <div>
        <label class="block text-sm font-medium mb-2">{{ t('editor.from') }}</label>
        <input
          v-model="fromName"
          type="text"
          class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          :placeholder="defaultFromName"
          :disabled="messageSender.sending"
        >
      </div>
      
      <!-- Message Body -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <label class="block text-sm font-medium">{{ t('messageComposer.message') }}</label>
          <MarkdownHelp />
        </div>
        <textarea
          ref="bodyTextarea"
          v-model="body"
          rows="6"
          class="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          :placeholder="t('messageComposer.message')"
          :disabled="messageSender.sending"
          @keydown.ctrl.enter="sendMessage"
        ></textarea>
        <div class="mt-1 text-xs text-gray-500">
          {{ t('messageComposer.willBeSigned') }} Press Ctrl+Enter to send.
        </div>
        
        <!-- Quote Preview -->
        <div v-if="quote" class="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
          <div class="flex justify-between items-center mb-2">
            <div class="text-sm font-medium text-gray-700">Quoting message</div>
            <button 
              type="button" 
              @click="clearQuote"
              class="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div class="text-xs text-gray-600 whitespace-pre-wrap font-mono">{{ quotePreview }}</div>
        </div>
      </div>
      
      <!-- Form Actions -->
      <div class="flex justify-between items-center pt-4 border-t">
        <div class="text-sm text-gray-500">
          {{ t('messageComposer.willBeSigned') }}
        </div>
        <div class="space-x-3">
          <button
            type="button"
            @click="saveDraft"
            class="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="messageSender.sending || !body.trim()"
          >
            {{ t('messageComposer.saveDraft') }}
          </button>
          <button
            type="button"
            @click="clearForm"
            class="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="messageSender.sending"
          >
            {{ t('app.cancel') }}
          </button>
          <button
            type="submit"
            :disabled="messageSender.sending || !selectedEchoName || !subject.trim() || !body.trim() || (isNewcomersEcho && remainingAnnouncements === 0)"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="messageSender.sending">{{ t('messageComposer.sending') }}</span>
            <span v-else>{{ t('messageComposer.send') }}</span>
          </button>
        </div>
      </div>
      
      <!-- Status Messages -->
      <div v-if="messageSender.error" class="p-3 bg-red-50 border border-red-200 rounded-lg">
        <div class="text-red-600 font-medium">Error:</div>
        <div class="text-red-600 text-sm mt-1">{{ messageSender.error }}</div>
      </div>
      
      <div v-if="success" class="p-3 bg-green-50 border border-green-200 rounded-lg">
        <div class="text-green-600 font-medium">{{ t('messageComposer.messageSent') }}</div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useMessageSender } from '../composables/useMessageSender'
import { useDrafts } from '../composables/useDrafts'
import { formatFidoQuote, addressToShortId } from '../utils/quote'
import MarkdownHelp from './MarkdownHelp.vue'

const { t } = useI18n()

const identity = useIdentityStore()
const echoStore = useEchoStore()
const messageSender = useMessageSender()
// Сбрасываем состояние отправки при HMR (setup выполняется при HMR, onMounted — нет)
messageSender.sending = false
messageSender.error = null

// Синхронизируем подписки из identity store (загруженного из localStorage) при монтировании
onMounted(() => {
  echoStore.syncFromIdentity()
})

const props = defineProps({
  quote: {
    type: Object,
    default: null
  },
  echoName: {
    type: String,
    default: null
  },
  draftId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['sent', 'clear-quote'])

const newcomersEchoName = computed(() => identity.newcomersEchoName)
const maxAnnouncementsPerAddress = 10
const userAnnouncementCount = computed(() => {
  if (!newcomersEchoName.value || !identity.user?.address) return 0
  const messages = echoStore.messages[newcomersEchoName.value] || []
  return messages.filter(msg => msg.sender_address === identity.user.address).length
})
const remainingAnnouncements = computed(() => Math.max(0, maxAnnouncementsPerAddress - userAnnouncementCount.value))

// Реактивные ссылки на поля формы
const bodyTextarea = ref(null)
const selectedEchoName = ref(props.echoName)
const subject = ref('')
const body = ref('')
const fromName = ref('')
const success = ref(false)
// Цитируемое сообщение (для ответа)
const quote = ref(props.quote)
// ID редактируемого черновика (если черновик загружен)
const editingDraftId = ref(props.draftId)

// Менеджер черновиков
const draftsManager = useDrafts()

// Имя отправителя по умолчанию — имя пользователя (или displayName из настроек).
const defaultFromName = computed(() => (identity.user?.name || '').trim())

if (!fromName.value) fromName.value = defaultFromName.value

// Если передан draftId — загружаем черновик при инициализации
if (props.draftId) {
  const draft = draftsManager.getDraft(props.draftId)
  if (draft) {
    subject.value = draft.subject || ''
    body.value = draft.body || ''
    quote.value = draft.quote || null
    if (draft.recipient) {
      selectedEchoName.value = draft.echoName
    }
  }
}

// Вычисляемые поля
const subscribedEchoes = computed(() => echoStore.subscribedEchoesList)
const isNewcomersEcho = computed(() => selectedEchoName.value === newcomersEchoName.value && newcomersEchoName.value)

const quotePreview = computed(() => {
  if (!quote.value) return ''
  const messageData = quote.value.data ? JSON.parse(quote.value.data) : { body: '' }
  return formatFidoQuote(quote.value.sender_address, messageData.body)
})

// Отслеживаем изменения пропа quote — подставляем Re:, автофокус и добавляем цитату в тело
watch(() => props.quote, (newQuote) => {
  quote.value = newQuote
  if (newQuote) {
    // Добавляем префикс Re: к теме, если ещё нет
    try {
      const msgData = typeof newQuote.data === 'string' ? JSON.parse(newQuote.data) : (newQuote.data || {})
      const subj = String(msgData.subject || '').trim()
      if (subj && !String(subject.value || '').toUpperCase().startsWith('RE:')) {
        subject.value = subj.toUpperCase().startsWith('RE:') ? subj : `Re: ${subj}`
      }
    } catch (e) {
      // игнорируем ошибки парсинга
    }
    // Автофокус и вставка цитаты в тело сообщения
    nextTick(() => {
      if (bodyTextarea.value) {
        bodyTextarea.value.focus()
        if (!body.value.includes(quotePreview.value)) {
          body.value = `${quotePreview.value}\n\n`
        }
      }
    })
  }
})

// Синхронизируем echoName из пропа
watch(() => props.echoName, (newEchoName) => {
  selectedEchoName.value = newEchoName
})

// При изменении draftId — загружаем черновик
watch(() => props.draftId, (newDraftId) => {
  editingDraftId.value = newDraftId
  if (newDraftId) {
    const draft = draftsManager.getDraft(newDraftId)
    if (draft) {
      subject.value = draft.subject || ''
      body.value = draft.body || ''
      quote.value = draft.quote || null
      selectedEchoName.value = draft.echoName || props.echoName
    }
  }
})

// Методы

/** Отправляет сообщение в эху. После отправки удаляет черновик (если был), очищает форму. */
async function sendMessage() {
  if (!selectedEchoName.value || !body.value.trim()) return
  
  const echo = echoStore.echoes.find(e => e.name === selectedEchoName.value)
  if (!echo) {
    console.error('Selected echo not found')
    return
  }
  
  success.value = false
  
  try {
    const parentMsgId = quote.value?.message_id || quote.value?._reply_to || null
    console.log('[composer] sending to', selectedEchoName.value, 'subject', subject.value)
    const messageData = {
      subject: subject.value,
      body: body.value,
      timestamp: Math.floor(Date.now() / 1000),
      sender_name: fromName.value.trim() || defaultFromName.value,
      reply_to_message_id: parentMsgId,
    }
    const extraOpts = parentMsgId ? { reply_to_message_id: parentMsgId } : {}
    
    await messageSender.sendToEcho(echo.name, 'echomail', messageData, extraOpts)
    
    // Если редактировали черновик — удаляем его после успешной отправки
    if (editingDraftId.value) {
      draftsManager.deleteDraft(editingDraftId.value)
      editingDraftId.value = null
    }
    
    // Очищаем форму и цитату
    clearForm()
    success.value = true
    
    // Оповещаем родительский компонент
    emit('sent')
    
  } catch (err) {
    // Ошибка уже установлена в messageSender
    console.error('Failed to send message:', err)
  }
}

/** Очищает форму: тему, тело, цитату */
function clearForm() {
  subject.value = ''
  body.value = ''
  fromName.value = defaultFromName.value
  quote.value = null
  emit('clear-quote')
}

/** Очищает только цитату */
function clearQuote() {
  quote.value = null
  emit('clear-quote')
}

/**
 * Сохраняет черновик: если editingDraftId установлен — обновляет существующий,
 * иначе создаёт новый и запоминает его ID.
 */
function saveDraft() {
  const fields = {
    echoName: selectedEchoName.value,
    subject: subject.value,
    body: body.value,
    quote: quote.value,
  }
  if (editingDraftId.value) {
    draftsManager.updateDraft(editingDraftId.value, fields)
  } else {
    const draft = draftsManager.addDraft('echo', fields)
    editingDraftId.value = draft.id
  }
}

onMounted(() => {
  if (quote.value && bodyTextarea.value) {
    nextTick(() => {
      bodyTextarea.value.focus()
    })
  }
})
</script>