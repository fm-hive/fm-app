<template>
  <div ref="stripEl" class="message-ribbon flex items-center gap-1 overflow-x-auto pb-1.5 pt-0.5" data-message-ribbon>
    <button
      v-for="msg in messages"
      :key="msg.message_id"
      type="button"
      class="ribbon-tile shrink-0"
      :class="{
        'ribbon-tile-current': msg.message_id === currentId,
        'ribbon-tile-in-thread': threadKey !== '' && threadKeyOf(msg) === threadKey,
      }"
      :data-ribbon-id="msg.message_id"
      :data-ribbon-kind="ribbonKind(msg)"
      :title="titleOf(msg)"
      @click="$emit('select', msg.message_id)"
    >
      <span
        class="ribbon-tile-face"
        :class="ribbonFillClass(msg)"
        :style="{ borderColor: stringToColor(threadKeyOf(msg)) }"
      >
        {{ initialOf(msg) }}
      </span>
      <span v-if="isUnread(msg)" class="ribbon-tile-dot"></span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { stringToColor } from '../utils/color'
import { conversationKey, buildMessageIndex } from '../utils/feed'
import { ribbonFillClass, ribbonKind } from '../utils/messageKind'

const props = defineProps({
  // Navigable messages in display order (chronological, #317).
  messages: {
    type: Array,
    default: () => [],
  },
  // Currently shown message (the cursor square marks it).
  currentId: {
    type: String,
    default: null,
  },
  // Echo read watermark (unix seconds): newer messages are unread.
  lastRead: {
    type: Number,
    default: 0,
  },
  // Message index for conversation keys (thread colors). Built from `messages`
  // when not provided (the parent passes the real index).
  messageIndex: {
    type: Map,
    default: null,
  },
  // Conversation key of the active thread: its tiles get highlighted (#322).
  threadKey: {
    type: String,
    default: '',
  },
})

defineEmits(['select'])

const { t } = useI18n()
const stripEl = ref(null)

const index = computed(() => (props.messageIndex instanceof Map ? props.messageIndex : buildMessageIndex(props.messages)))

/** Conversation key of a message — the ribbon border color is per thread (#322). */
function threadKeyOf(msg) {
  return conversationKey(msg, index.value)
}

/** Whether the message is newer than the echo watermark. */
function isUnread(msg) {
  return (msg.timestamp || 0) > props.lastRead
}

/** First letter of the author's display name (falls back to the address). */
function initialOf(msg) {
  let name = ''
  try {
    name = JSON.parse(msg.data || '{}').sender_name || ''
  } catch { /* keep the address */ }
  const source = (name || msg.sender_address || '?').trim()
  return source.replace(/^:/, '').charAt(0).toUpperCase() || '?'
}

/** Tooltip: subject · author · date. */
function titleOf(msg) {
  let subject = ''
  try {
    subject = JSON.parse(msg.data || '{}').subject || ''
  } catch { /* no subject */ }
  const date = msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleString() : ''
  return [subject || t('echoes.noSubject'), msg.sender_address, date].filter(Boolean).join(' · ')
}

/**
 * Scroll the current tile (the cursor) into view. On the first render the
 * cursor may already be set — e.g. the reader opens on the newest message at
 * the END of the ribbon while the scroll starts at the beginning — so the
 * initial positioning is instant, later navigation scrolls smoothly (#322).
 */
function scrollToCurrent(smooth = false) {
  nextTick(() => {
    const tiles = stripEl.value?.querySelectorAll('[data-ribbon-id]')
    if (!tiles) return
    for (const tile of tiles) {
      if (tile.dataset.ribbonId === props.currentId) {
        tile.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: smooth ? 'smooth' : 'auto' })
        break
      }
    }
  })
}

// First render: position the ribbon on the cursor right away.
onMounted(() => scrollToCurrent(false))

// Keep the current tile in view while paging through the echo.
watch(() => props.currentId, () => scrollToCurrent(true))
</script>

<style scoped>
/* The ribbon scrolls without a scrollbar (#322) and may extend past the panel. */
.message-ribbon {
  scrollbar-width: none;
}
.message-ribbon::-webkit-scrollbar {
  display: none;
}
.ribbon-tile {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1px;
  border-radius: 3px;
  transition: transform 0.1s ease;
}
/* Square card: no fill by default, initials inside, border = thread color. */
.ribbon-tile-face {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border: 2px solid transparent;
  border-radius: 3px;
  color: #374151;
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1;
}
.dark .ribbon-tile-face {
  color: #d1d5db;
}
/* The cursor: a square drawn around the current card (#322). */
.ribbon-tile-current {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
  border-radius: 3px;
}
/* Tiles of the active thread stay highlighted in the general ribbon (#322). */
.ribbon-tile-in-thread {
  background: rgba(99, 102, 241, 0.15);
}
/* Unread marker (#317). */
.ribbon-tile-dot {
  position: absolute;
  bottom: -1px;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: #2563eb;
}
</style>
