<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { useSettingsStore } from '../stores/settings'

const { t } = useI18n()

const props = defineProps({
  content: { type: String, default: '' },
  // Id of the rendered message (for attachment selection, #306)
  messageId: { type: String, default: '' },
  // User tagline shown as a separate line under the body (#309). It lives
  // inside the clamped element on purpose: a message that overflows the
  // collapsed card hides the tagline until it is expanded.
  tagline: { type: String, default: '' },
  // Client tearline shown under the tagline (#311); only when enabled in the
  // settings.
  tearline: { type: String, default: '' },
  attachments: { type: Array, default: null },
  // Optional lookup for message-scoped refs `attachment:<message_id>:N` (quotes)
  attachmentResolver: { type: Function, default: null },
  // Max height (px) of the collapsed content. Content taller than this gets a
  // "show more" toggle.
  maxHeight: { type: Number, default: 256 },
  // Always expanded, no collapse button (#322): the reader and the full
  // message views have no use for the toggle.
  noCollapse: { type: Boolean, default: false },
})

defineEmits(['select-attachment'])

// The tearline is a client line: it is shown only when the user enabled it
const settings = useSettingsStore()
const shownTearline = computed(() => (settings.userProfile?.showTearline === true ? props.tearline : ''))

const collapsed = ref(true)
const overflowing = ref(false)
const body = ref(null)

async function measure() {
  await nextTick()
  const el = body.value
  if (!el) {
    overflowing.value = false
    return
  }
  // scrollHeight is the full content height even when clamped by max-height.
  overflowing.value = el.scrollHeight > props.maxHeight + 4
}

watch(() => props.content, measure, { immediate: true })

function toggle() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <div>
    <div
      ref="body"
      :style="!noCollapse && collapsed && overflowing ? { maxHeight: maxHeight + 'px', overflow: 'hidden' } : {}"
    >
      <MarkdownRenderer
        :content="content"
        :attachments="attachments"
        :attachment-resolver="attachmentResolver"
        :message-id="messageId"
        @select-attachment="$emit('select-attachment', $event)"
      />
      <div
        v-if="tagline || shownTearline"
        class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400"
      >
        <div v-if="tagline" class="whitespace-pre-wrap" :title="t('message.tagline')">... {{ tagline }}</div>
        <div v-if="shownTearline" class="whitespace-pre-wrap" :title="t('message.tearline')">--- {{ shownTearline }}</div>
      </div>
    </div>
    <button
      v-if="overflowing && !noCollapse"
      @click="toggle"
      class="mt-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {{ collapsed ? t('echoes.expand') : t('echoes.collapse') }}
    </button>
  </div>
</template>
