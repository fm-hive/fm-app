<template>
  <div class="markdown-body" @click="onContentClick">
    <template v-for="(segment, i) in segments" :key="i">
      <div v-if="segment.html" class="fm-html-chunk" v-html="segment.html" />
      <BundleMessages
        v-else
        :ref-key="segment.ref"
        :attachments="attachments"
        :attachment-resolver="attachmentResolver"
        :message-id="messageId"
        @select-attachment="emit('select-attachment', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import BundleMessages from './BundleMessages.vue'
import { useSettingsStore } from '../stores/settings'
import { renderMarkdown, splitBundleSlots, parseAttachmentRef } from '../utils/markdown'

// Bundles nested deeper than this render as plain JSON download links.
const MAX_BUNDLE_DEPTH = 3

const props = defineProps({
  content: { type: String, default: '' },
  attachments: { type: Array, default: null },
  attachmentResolver: { type: Function, default: null },
  messageId: { type: String, default: '' },
})

const emit = defineEmits(['select-attachment'])

const { t } = useI18n()
const settings = useSettingsStore()
const depth = inject('fm-bundle-depth', 0)

/**
 * Render the markdown and split it into HTML chunks and bundle placeholders,
 * so selected-message bundles render as real message cards (#306).
 */
const segments = computed(() => {
  const labels = {
    bundleTitle: t('selected.title'),
    showContent: t('selected.showContent'),
    noSubject: t('selected.noSubject'),
    selectLabel: t('selected.addAttachment'),
    rawLabel: t('selected.raw'),
    echoLabel: t('selected.echo'),
    copyTitle: t('common.copy'),
    copiedLabel: `✓ ${t('common.copied')}`,
    showTearline: settings.userProfile?.showTearline === true,
    bundles: depth < MAX_BUNDLE_DEPTH,
  }
  const html = renderMarkdown(props.content, props.attachments, props.attachmentResolver, labels)
  return splitBundleSlots(html)
})

// Buttons inside the rendered HTML cannot be wired by Vue: handle clicks by
// delegation. The JSON attachment blocks carry a `data-fm-attachment` ref.
function onContentClick(event) {
  const btn = event.target?.closest?.('[data-fm-attachment]')
  if (!btn) return
  const ref = btn.getAttribute('data-fm-attachment')
  const parsed = parseAttachmentRef(ref, props.messageId)
  const list = parsed && parsed.messageId === props.messageId
    ? props.attachments
    : (parsed && props.attachmentResolver ? props.attachmentResolver(parsed.messageId) : null)
  const attachment = parsed && Array.isArray(list) ? list[parsed.index] : null
  if (!attachment) return
  emit('select-attachment', { attachment, ref, messageId: parsed.messageId, index: parsed.index })
}
</script>

<style>
/* Shared styles for the JSON attachment rendering (#306). Global on purpose:
   the blocks are generated as HTML by utils/markdown.js and can appear in the
   feed, in message details and in the composer preview. */
.fm-html-chunk {
  display: contents;
}
.fm-json-bundle {
  margin: 0.5rem 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-left: 3px solid #d97706;
  border-radius: 0.375rem;
  background: #fffbeb;
}
.dark .fm-json-bundle {
  background: rgba(217, 119, 6, 0.1);
  border-color: #4b5563;
  border-left-color: #d97706;
}
.fm-json-bundle-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.35rem;
}
.dark .fm-json-bundle-title {
  color: #e5e7eb;
}
.fm-json-message {
  padding: 0.25rem 0;
  border-top: 1px solid #e5e7eb;
}
.fm-json-bundle-single .fm-json-message {
  border-top: none;
  padding-top: 0;
}
.dark .fm-json-message {
  border-color: #4b5563;
}
.fm-json-message-head {
  font-size: 0.875rem;
}
.fm-json-message-meta {
  font-size: 0.75rem;
  color: #6b7280;
}
.fm-json-message-tagline {
  font-size: 0.8rem;
  font-style: italic;
  color: #6b7280;
  white-space: pre-wrap;
  margin-top: 0.15rem;
}
.fm-json-body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.75rem;
  margin-top: 0.25rem;
  max-height: 24rem;
  overflow: auto;
}
/* Long data: URIs in raw sources collapse into a copy chip (#316). Global on
   purpose: the chips are produced as HTML by sourceFormat.js (v-html). */
.fm-data-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
  padding: 0 0.35rem;
  border: 1px solid #93c5fd;
  border-radius: 0.25rem;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.7rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  vertical-align: baseline;
}
.fm-data-chip:hover {
  background: #dbeafe;
}
.fm-data-chip-copied {
  border-color: #86efac;
  background: #f0fdf4;
  color: #15803d;
}
.dark .fm-data-chip {
  border-color: #1e40af;
  background: #1e3a8a33;
  color: #93c5fd;
}
.dark .fm-data-chip:hover {
  background: #1e3a8a66;
}
.dark .fm-data-chip-copied {
  border-color: #166534;
  background: #14532d33;
  color: #86efac;
}
.fm-json-raw {
  margin-top: 0.25rem;
  font-size: 0.75rem;
}
.fm-json-raw summary {
  cursor: pointer;
  color: #6b7280;
}
.fm-json-link {
  text-decoration: none;
}
.fm-json-select {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 0.15rem;
  opacity: 0.75;
}
.fm-json-select:hover {
  opacity: 1;
}
.dark .fm-json-message-meta,
.dark .fm-json-message-tagline,
.dark .fm-json-raw summary {
  color: #9ca3af;
}
</style>
