<template>
  <div v-if="messages.length > 0" class="fm-json-bundle" :class="{ 'fm-json-bundle-single': isSingle }">
    <div class="fm-json-bundle-title" :class="{ 'justify-end': isSingle }">
      <span v-if="!isSingle">📌 {{ t('selected.title') }} ({{ messages.length }})</span>
      <button
        type="button"
        class="fm-json-select"
        :title="t('selected.addAttachment')"
        @click="selectBundle"
      >{{ isSelected ? '📌' : '📍' }}</button>
    </div>
    <BundleMessageCard
      v-for="(entry, i) in messages"
      :key="entry.message_id || i"
      :entry="entry"
      @select-attachment="$emit('select-attachment', $event)"
    />
  </div>
</template>

<script setup>
import { computed, inject, provide } from 'vue'
import { useI18n } from 'vue-i18n'
import BundleMessageCard from './BundleMessageCard.vue'
import { lookupAttachment, decodeDataUrl, parseAttachmentRef } from '../utils/markdown'
import { useSelectedMessages } from '../composables/useSelectedMessages'

const { t } = useI18n()

const props = defineProps({
  // Attachment reference of the bundle (`N` or `<message_id>:N`)
  refKey: { type: String, required: true },
  attachments: { type: Array, default: null },
  attachmentResolver: { type: Function, default: null },
  // Id of the message the bundle is attached to (for plain refs)
  messageId: { type: String, default: '' },
})

const emit = defineEmits(['select-attachment'])

// Nested bundles (a bundle inside a bundled message) are capped so a
// pathological chain cannot recurse forever.
const depth = inject('fm-bundle-depth', 0)
provide('fm-bundle-depth', depth + 1)

const parsedRef = computed(() => parseAttachmentRef(props.refKey, props.messageId))
const attachment = computed(() => lookupAttachment(props.refKey, props.attachments, props.attachmentResolver))

const messages = computed(() => {
  const json = decodeDataUrl(attachment.value?.data || attachment.value?.preview || attachment.value?.src || '')
  if (!json) return []
  try {
    const bundle = JSON.parse(json)
    return Array.isArray(bundle?.messages) ? bundle.messages : []
  } catch {
    return []
  }
})

const isSingle = computed(() => messages.value.length === 1)

// Selected state of the bundle attachment itself (#306)
const selectedStore = useSelectedMessages()
const isSelected = computed(() => {
  const p = parsedRef.value
  if (!p) return false
  return selectedStore.hasAttachment(`${p.messageId}:${p.index}`)
})

function selectBundle() {
  if (!attachment.value || !parsedRef.value) return
  emit('select-attachment', {
    attachment: attachment.value,
    ref: props.refKey,
    messageId: parsedRef.value.messageId,
    index: parsedRef.value.index,
  })
}
</script>
