<template>
  <div class="fm-json-message">
    <div class="fm-json-message-head">
      <strong>{{ subject || t('selected.noSubject') }}</strong>
      <a v-if="link" class="fm-json-link" :href="link" target="_blank" rel="noopener">↗</a>
    </div>
    <div v-if="meta" class="fm-json-message-meta">{{ meta }}</div>

    <!-- The bundled message renders like a regular message (#306): markdown
         body with inline images, tagline/tearline and an attachment gallery. -->
    <CollapsibleContent
      v-if="body"
      :content="body"
      :attachments="attachments"
      :message-id="entry.message_id || ''"
      :tagline="tagline"
      :tearline="tearline"
      :max-height="200"
      @select-attachment="$emit('select-attachment', $event)"
    />
    <AttachmentsGallery :attachments="attachments" :content="body" :selectable="false" />

    <details class="fm-json-raw">
      <summary>{{ t('selected.raw') }}</summary>
      <SourceJson :value="rawObject" class="fm-json-body" />
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CollapsibleContent from './CollapsibleContent.vue'
import AttachmentsGallery from './AttachmentsGallery.vue'
import { bundlePayloadOf } from '../utils/selectedBundle'
import SourceJson from './SourceJson.vue'
import { appBasePath } from '../utils/appBase'

const { t } = useI18n()

const props = defineProps({
  // Wire-ish bundled message: {message_id, jws?, data?, echo_name, echo_id, sender_address, timestamp}
  entry: { type: Object, required: true },
})

defineEmits(['select-attachment'])

const payload = computed(() => bundlePayloadOf(props.entry))

const subject = computed(() => {
  const s = payload.value.subject
  return typeof s === 'string' ? s.trim() : ''
})
const body = computed(() => {
  const b = payload.value.body || payload.value.message
  return typeof b === 'string' ? b : ''
})
const tagline = computed(() => (typeof payload.value.tagline === 'string' ? payload.value.tagline.trim() : ''))
const tearline = computed(() => (typeof payload.value.tearline === 'string' ? payload.value.tearline.trim() : ''))
const attachments = computed(() => (Array.isArray(payload.value.attachments) ? payload.value.attachments : []))

const sender = computed(() => {
  const name = typeof payload.value.sender_name === 'string' ? payload.value.sender_name.trim() : ''
  const address = props.entry.sender_address || ''
  if (name && address) return `${name} (${address})`
  return name || address
})
const echoName = computed(() => props.entry.echo_name || props.entry.echo || '')
const date = computed(() => (props.entry.timestamp ? new Date(props.entry.timestamp * 1000).toLocaleString() : ''))

const meta = computed(() => [
  sender.value,
  echoName.value ? `${t('selected.echo')}: ${echoName.value}` : '',
  date.value,
].filter(Boolean).join(' · '))

const link = computed(() => (props.entry.echo_id && props.entry.message_id
  ? `${appBasePath()}echoes/${encodeURIComponent(props.entry.echo_id)}/${encodeURIComponent(props.entry.message_id)}`
  : ''))

// Raw view of the source message: the bundle copy plus the resolved payload.
const rawObject = computed(() => ({ ...props.entry, data: payload.value }))
</script>
