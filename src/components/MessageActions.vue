<template>
  <div class="message-actions flex flex-wrap gap-2 mt-2">
    <!-- Emoji reactions — одна кнопка открывает picker (#301) -->
    <div v-if="showReactions" class="flex flex-wrap items-center gap-1">
      <ReactionButton :target-message-id="message.message_id" :echo-name="echoNameValue" />
    </div>

    <!-- Other actions -->
    <div class="flex flex-wrap gap-1">
      <button @click="emit('reply')" :title="t('messageActions.reply')"
        class="px-2 py-0.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border">
        {{ t('messageActions.reply') }}
      </button>
      <button @click="emit('forward')" :title="t('messageActions.forward')"
        class="px-2 py-0.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border">
        {{ t('messageActions.forward') }}
      </button>
      <button v-if="canEdit" @click="emit('edit')" :title="t('messageActions.edit')"
        class="px-2 py-0.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border">
        ✏️ {{ t('messageActions.edit') }}
      </button>
      <template v-if="isModerator">
        <button @click="emit('warn')" :title="t('messageActions.warn')"
          class="px-2 py-0.5 text-sm bg-yellow-100 hover:bg-yellow-200 rounded border border-yellow-300">
          {{ t('messageActions.warn') }}
        </button>
        <button @click="emit('punish')" :title="t('messageActions.punish')"
          class="px-2 py-0.5 text-sm bg-red-100 hover:bg-red-200 rounded border border-red-300">
          {{ t('messageActions.punish') }}
        </button>
        <button v-if="isModerationMessage" @click="retractPunishment" :title="t('messageActions.retract')"
          class="px-2 py-0.5 text-sm bg-orange-100 hover:bg-orange-200 rounded border border-orange-300">
          ↩ {{ t('messageActions.retract') }}
        </button>
      </template>

      <!-- Admins can appeal an unfair moderation action in the Admin council (#222) -->
      <button v-if="isAdmin && isModerationMessage" @click="emit('appeal')" :title="t('appeal.title')"
        class="px-2 py-0.5 text-sm bg-amber-100 hover:bg-amber-200 rounded border border-amber-300">
        ⚖️ {{ t('appeal.action') }}
      </button>

      <!-- Three-dots menu -->
      <div class="relative">
        <button @click="showMenu = !showMenu" :title="t('messageActions.more')"
          class="px-2 py-0.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border">
          ⋯
        </button>
        <div v-if="showMenu" class="absolute z-50 right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg text-sm">
          <button @click="toggleRead" class="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            {{ readTitle }}
          </button>
          <button v-if="canOpenThread" @click="emit('openThread')" class="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            🧵 {{ t('messageActions.openThread') }}
          </button>
          <button @click="emit('viewRaw')" class="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            { } {{ t('messageActions.showSource') }}
          </button>
          <button @click="toggleFavorite" class="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            {{ favoriteText }} {{ favoriteTitle }}
          </button>
          <button @click="toggleSelected" class="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            {{ isSelected ? '📌' : '📍' }} {{ isSelected ? t('messageActions.removeSelected') : t('messageActions.addSelected') }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import ReactionButton from './ReactionButton.vue'
import { useSelectedMessages } from '../composables/useSelectedMessages'
import { fetchEchoMessages } from '../services/message'

const { t } = useI18n()
const identityStore = useIdentityStore()
const echoStore = useEchoStore()

const props = defineProps({
  message: { type: Object, required: true },
  isModerator: { type: Boolean, default: false },
  isOwner: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  echoName: { type: String, default: '' },
  // Reactions are hidden where the user may not post (writers/network news, #375).
  canReact: { type: Boolean, default: true },
  // Hide "Open thread" for messages whose conversation has no subject (#287).
  canOpenThread: { type: Boolean, default: true }
})

const emit = defineEmits(['reply', 'forward', 'edit', 'mark', 'warn', 'punish', 'viewRaw', 'openThread', 'appeal'])
const echoNameValue = computed(() => props.echoName || props.message.echo_name || props.message.echo || '')
const showMenu = ref(false)

const isModerationMessage = computed(() => {
  if (!props.message?.data) return false
  try {
    const d = typeof props.message.data === 'string' ? JSON.parse(props.message.data) : props.message.data
    // Network news entries also carry a severity for the chronicle badge, but
    // they are node-generated notices, not moderation actions (#310).
    if (d.event) return false
    return d.severity === 'warning' || d.severity === 'punishment'
  } catch { return false }
})

// Only the author can edit their own echomail/announcement; protocol messages,
// reactions and moderation actions have their own mechanisms.
const canEdit = computed(() => {
  const m = props.message
  if (!m || !props.isOwner) return false
  if (m.type !== 'echomail' && m.type !== 'announcement') return false
  try {
    const d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data
    if (d && (d.reaction || d.severity || d.proto)) return false
  } catch { /* not a plain message */ }
  return true
})

async function retractPunishment() {
  try {
    const { createSignedMessage } = await import('../services/message')
    const { apiService } = await import('../services/api')
    const msgData = {
      echo: props.echoName || props.message.echo_name || props.message.echo,
      from: identityStore.user?.address,
      to: props.message.sender_address,
      severity: 'none',
      subject: 'Retract punishment',
      message: 'Punishment retracted by moderator',
      updateMessageId: props.message.message_id,
      timestamp: Math.floor(Date.now() / 1000),
    }
    const signed = await createSignedMessage('echomail', msgData)
    await apiService.sendReceive({ messages: [signed] })
    // Refresh messages
    const newMessages = await fetchEchoMessages(echoNameValue.value)
    if (newMessages?.length > 0) {
      echoStore.addMessages(echoNameValue.value, newMessages)
    }
  } catch (err) {
    console.error('Failed to retract punishment:', err)
  }
}

// Reactions for plain messages; vote messages carry their own reaction button
// in VoteProtocolCard (#297), so they are excluded here to avoid duplicates.
const showReactions = computed(() => {
  if (!props.canReact) return false
  const m = props.message
  if (!m || m.type !== 'echomail') return false
  try {
    const d = JSON.parse(m.data)
    if (d.reaction) return false
    if (d.proto) return false
    return true
  } catch {
    return true
  }
})

const isRead = ref(true)
const isFavorite = ref(false)

// Selected messages container (#306)
const selectedStore = useSelectedMessages()
const isSelected = computed(() =>
  selectedStore.items.value.some(e => e.message_id === props.message?.message_id))

function toggleSelected() {
  const echoItem = (echoStore.echoes || []).find(e => e.name === echoNameValue.value)
  selectedStore.toggle(props.message, {
    echoName: echoNameValue.value,
    echoId: echoItem?.id ?? props.message?.echo_id ?? null,
  })
}

onMounted(() => loadMessageState())

function loadMessageState() {
  const mid = props.message.message_id
  if (!mid) return
  try {
    const s = JSON.parse(localStorage.getItem(`fm-message-state-${mid}`) || '{}')
    if (s.read !== undefined) isRead.value = s.read
    if (s.favorite !== undefined) isFavorite.value = s.favorite
  } catch { /* ignore */ }
}

function saveMessageState() {
  const mid = props.message.message_id
  if (!mid) return
  localStorage.setItem(`fm-message-state-${mid}`, JSON.stringify({ read: isRead.value, favorite: isFavorite.value, timestamp: Date.now() }))
}

function toggleRead() {
  isRead.value = !isRead.value
  saveMessageState()
  emit('mark', { messageId: props.message.message_id, timestamp: props.message.timestamp, favorite: isFavorite.value, read: isRead.value })
}

function toggleFavorite() {
  isFavorite.value = !isFavorite.value
  saveMessageState()
  emit('mark', { favorite: isFavorite.value, read: isRead.value })
}

const readTitle = computed(() => isRead.value ? t('messageActions.markUnread') : t('messageActions.markRead'))
const favoriteTitle = computed(() => isFavorite.value ? t('messageActions.removeFavorite') : t('messageActions.markFavorite'))
const favoriteText = computed(() => isFavorite.value ? '★' : '☆')
</script>

<style scoped>
.message-actions { font-size: 0.75rem; }
</style>
