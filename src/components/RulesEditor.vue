<template>
  <div class="rules-editor">
    <!-- Rules text (Markdown) -->
    <div class="mb-4">
      <MarkdownEditor v-model="text" :label="label || t('rulesEditor.rulesText')" :rows="rows" />
    </div>

    <!-- Parameters -->
    <div class="mb-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('rulesEditor.rulesParams') }}</label>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('rulesEditor.paramsHint') }}</p>
    </div>

    <div class="space-y-3">
      <div v-for="def in paramDefs" :key="def.key" class="flex items-start gap-2">
        <div class="flex-1">
          <div class="flex items-center gap-1">
            <label :for="`rules-param-${def.key}`" class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ paramLabel(def) }}
            </label>
            <span class="inline-block relative group" :title="paramTooltip(def)">
              <span class="cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">ⓘ</span>
              <div v-if="def.doc" class="hidden group-hover:block absolute left-0 top-full mt-1 w-64 p-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded shadow-lg z-20 text-xs text-gray-700 dark:text-gray-300">
                <p class="mb-1">{{ def.doc }}</p>
                <a :href="def.docLink" target="_blank" class="text-blue-500 hover:text-blue-700 dark:text-blue-400">📚 {{ t('rulesEditor.docs') }}</a>
              </div>
            </span>
          </div>
        </div>
        <input
          v-if="def.type === 'bool'"
          :id="`rules-param-${def.key}`"
          type="checkbox"
          class="w-5 h-5 mt-0.5 rounded text-blue-600"
          :checked="paramValues[def.key] === true || paramValues[def.key] === 'true'"
          @change="paramValues[def.key] = $event.target.checked"
        />
        <input
          v-else
          :id="`rules-param-${def.key}`"
          v-model="paramValues[def.key]"
          type="text"
          class="w-40 p-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          :placeholder="def.placeholder || ''"
        />
      </div>
    </div>

    <!-- Writers & elect_writers_from (comma lists) -->
    <div class="mt-4 space-y-3">
      <div v-for="def in listDefs" :key="def.key" class="flex items-start gap-2">
        <div class="flex-1">
          <div class="flex items-center gap-1">
            <label :for="`rules-param-${def.key}`" class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ paramLabel(def) }}
            </label>
            <span class="inline-block relative group" :title="paramTooltip(def)">
              <span class="cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">ⓘ</span>
              <div v-if="def.doc" class="hidden group-hover:block absolute left-0 top-full mt-1 w-64 p-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded shadow-lg z-20 text-xs text-gray-700 dark:text-gray-300">
                <p class="mb-1">{{ def.doc }}</p>
                <a :href="def.docLink" target="_blank" class="text-blue-500 hover:text-blue-700 dark:text-blue-400">📚 {{ t('rulesEditor.docs') }}</a>
              </div>
            </span>
          </div>
        </div>
        <input
          :id="`rules-param-${def.key}`"
          :value="listValue(def.key)"
          @input="setListValue(def.key, $event.target.value)"
          type="text"
          class="w-64 p-1.5 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          :placeholder="def.placeholder || ''"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownEditor from './MarkdownEditor.vue'
import { docsBasePath } from '../utils/appBase'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Object, default: () => ({ text: '', parameters: {} }) },
  label: { type: String, default: '' },
  rows: { type: Number, default: 6 },
  // Show an extra JSON raw fallback editor (for parameters not in the schema)
  showRaw: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])

// Static parameter definitions with tooltips + docs links
const DOC_BASE = `${docsBasePath()}/api/create_echo_with_rules.md`
const ECHOMAIL_DOC = `${docsBasePath()}/service/echomail.md`

const paramDefs = [
  { key: 'min_moderators', type: 'int', doc: t('rulesEditor.docMinModerators'), docLink: DOC_BASE, placeholder: '1' },
  { key: 'max_moderators', type: 'int', doc: t('rulesEditor.docMaxModerators'), docLink: DOC_BASE, placeholder: '3' },
  { key: 'announcements_enable', type: 'bool', doc: t('rulesEditor.docAnnouncementsEnable'), docLink: DOC_BASE },
  { key: 'announcements_max_for_address', type: 'int', doc: t('rulesEditor.docAnnouncementsMax'), docLink: DOC_BASE, placeholder: '1' },
  { key: 'refill_days', type: 'int', doc: t('rulesEditor.docRefillDays'), docLink: DOC_BASE, placeholder: '3' },
  { key: 'max_message_size', type: 'int', doc: t('rulesEditor.docMaxMessageSize'), docLink: ECHOMAIL_DOC, placeholder: '1048576' },
  { key: 'max_attachments_per_message', type: 'int', doc: t('rulesEditor.docMaxAttachments'), docLink: ECHOMAIL_DOC, placeholder: '5' },
  { key: 'max_attachment_size', type: 'int', doc: t('rulesEditor.docMaxAttachmentSize'), docLink: ECHOMAIL_DOC, placeholder: '5242880' },
]

const listDefs = [
  { key: 'writers', type: 'list', doc: t('rulesEditor.docWriters'), docLink: DOC_BASE, placeholder: ':0:1, :0:5 (empty = all)' },
  { key: 'elect_writers_from', type: 'list', doc: t('rulesEditor.docElectWritersFrom'), docLink: DOC_BASE, placeholder: 'Moderators council, Admin council' },
]

/** Normalize a list parameter to a string array (legacy string values allowed). */
function toList(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean)
  if (v === undefined || v === null) return []
  return String(v).split(',').map(s => s.trim()).filter(Boolean)
}

/** List parameters are always arrays in the emitted model (the backend expects arrays). */
function normalizeParams(params) {
  const out = { ...params }
  for (const def of listDefs) {
    if (def.key in out) out[def.key] = toList(out[def.key])
  }
  return out
}

function listValue(key) {
  return toList(paramValues.value[key]).join(', ')
}

function setListValue(key, str) {
  paramValues.value[key] = toList(str)
}

const text = ref(props.modelValue?.text || '')
const paramValues = ref(normalizeParams(props.modelValue?.parameters || {}))

function paramLabel(def) {
  return def.key.replace(/_/g, ' ')
}

function paramTooltip(def) {
  return def.doc || ''
}

// Rebuild {text, parameters} whenever inputs change
watch([text, paramValues], () => {
  emitUpdate()
}, { deep: true })

function emitUpdate() {
  emit('update:modelValue', {
    text: text.value,
    // List parameters are emitted as arrays (the backend expects arrays).
    parameters: normalizeParams(paramValues.value),
  })
}

// Sync when modelValue changes externally. Skip when the incoming value is the
// echo of our own emit (otherwise the two watchers loop forever and the form
// lags: each parameter change used to trigger ~100 update:modelValue emits).
watch(() => props.modelValue, (val) => {
  if (!val) return
  const incomingText = val.text || ''
  const incomingParams = normalizeParams(val.parameters || {})
  if (incomingText === text.value && JSON.stringify(incomingParams) === JSON.stringify(paramValues.value)) {
    return
  }
  text.value = incomingText
  paramValues.value = { ...incomingParams }
}, { deep: true })

// Expose parsed parameters (normalized: writers/elect_writers_from as arrays)
function getParameters() {
  const params = normalizeParams(paramValues.value)
  // Drop empty values
  for (const key of Object.keys(params)) {
    if (params[key] === '' || params[key] === undefined) delete params[key]
  }
  return params
}

defineExpose({ getParameters })
</script>
