<script setup>
import { renderMarkdownInline } from '../utils/markdown'
import { computed } from 'vue'
import MarkdownBody from './MarkdownBody.vue'

const emit = defineEmits(['select-attachment'])

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  inline: {
    type: Boolean,
    default: false
  },
  // Optional attachments array to resolve `attachment:N` references
  attachments: {
    type: Array,
    default: null
  },
  // Optional lookup for message-scoped refs `attachment:<message_id>:N`
  // (quotes): (messageId) => attachments array or null
  attachmentResolver: {
    type: Function,
    default: null
  },
  // Id of the message being rendered (plain `attachment:N` refs belong to it)
  messageId: {
    type: String,
    default: ''
  },
  // Optional class for wrapper
  class: {
    type: String,
    default: ''
  }
})

const renderedInline = computed(() => renderMarkdownInline(props.content, props.attachments, props.attachmentResolver))
</script>

<template>
  <div
    v-if="inline"
    class="markdown-inline"
    :class="class"
    v-html="renderedInline"
  />
  <div
    v-else
    class="markdown-content"
    :class="class"
  >
    <!-- The body (including selected-message bundle cards) is rendered by
         MarkdownBody, which interleaves HTML and Vue components (#306). -->
    <MarkdownBody
      :content="content"
      :attachments="attachments"
      :attachment-resolver="attachmentResolver"
      :message-id="messageId"
      @select-attachment="emit('select-attachment', $event)"
    />
  </div>
</template>

<style scoped>
.markdown-content {
  line-height: 1.6;
  color: var(--text);
}

.markdown-content :deep(h1) {
  font-size: 1.8em;
  margin: 1em 0 0.5em;
  font-weight: 600;
  color: var(--text-h);
}

.markdown-content :deep(h2) {
  font-size: 1.5em;
  margin: 1em 0 0.5em;
  font-weight: 600;
  color: var(--text-h);
}

.markdown-content :deep(h3) {
  font-size: 1.3em;
  margin: 1em 0 0.5em;
  font-weight: 600;
  color: var(--text-h);
}

.markdown-content :deep(p) {
  margin: 1em 0;
}

.markdown-content :deep(ul) {
  list-style: disc;
  margin: 1em 0;
  padding-left: 2em;
}

.markdown-content :deep(ol) {
  list-style: decimal;
  margin: 1em 0;
  padding-left: 2em;
}

.markdown-content :deep(ul ul),
.markdown-content :deep(ol ol),
.markdown-content :deep(ul ol),
.markdown-content :deep(ol ul) {
  padding-left: 3em;
}

.markdown-content :deep(li) {
  margin: 0.5em 0;
}

.markdown-content :deep(code) {
  font-family: var(--mono);
  background: var(--code-bg);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background: var(--code-bg);
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 1em 0;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.markdown-content :deep(blockquote) {
  /* Quotes (including the leading FIDO quote block) are dimmed (#283). */
  border-left: 3px solid var(--text);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--text);
  font-style: italic;
  opacity: 0.7;
}

.markdown-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.markdown-content :deep(a:hover) {
  border-bottom-color: var(--accent);
}

.markdown-content :deep(strong) {
  font-weight: 600;
  color: var(--text-h);
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.markdown-inline {
  display: inline;
}

.markdown-inline :deep(a) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.markdown-inline :deep(a:hover) {
  border-bottom-color: var(--accent);
}

.markdown-inline :deep(code) {
  font-family: var(--mono);
  background: var(--code-bg);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}

.markdown-inline :deep(strong) {
  font-weight: 600;
  color: var(--text-h);
}

.markdown-inline :deep(em) {
  font-style: italic;
}
</style>