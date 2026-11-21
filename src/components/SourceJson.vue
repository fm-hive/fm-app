<template>
  <pre class="fm-source-json"><code v-html="html" /></pre>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatJsonWithDataChips } from '../utils/sourceFormat'

const props = defineProps({
  // Message/protocol object (or a JSON string) to show as source.
  value: {
    type: [Object, Array, String],
    required: true,
  },
  // Minimum data: URI length that is collapsed into a copy chip.
  minLen: {
    type: Number,
    default: 0,
  },
})

const { t } = useI18n()

const html = computed(() => formatJsonWithDataChips(props.value, {
  minLen: props.minLen || undefined,
  copyTitle: t('common.copy'),
  copiedLabel: `✓ ${t('common.copied')}`,
}))
</script>

<style scoped>
.fm-source-json {
  white-space: pre-wrap;
  word-break: break-word;
}
/* src/style.css styles every <code> as an inline-flex chip (Vite template
   leftover) — the source block must stay plain text. */
.fm-source-json code {
  display: block;
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
</style>
