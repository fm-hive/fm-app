<template>
  <div v-if="items.length > 0" class="attachments-gallery mt-2">
    <!-- Horizontal scrollable row of small attachment icons -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1" role="list">
      <div
        v-for="att in items"
        :key="att._i"
        role="listitem"
        class="relative group flex-shrink-0 w-14 h-14 rounded border border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-700"
      >
      <button
        type="button"
        class="w-full h-full hover:ring-2 hover:ring-blue-400 cursor-pointer"
        :title="att.name"
        @click="openAt(att._i)"
      >
        <img v-if="isImageAttachment(att)" :src="att.data" :alt="att.name" class="w-full h-full object-cover" loading="lazy" />
        <span v-else class="w-full h-full flex flex-col items-center justify-center text-lg leading-none">
          <span class="text-xl">📎</span>
          <span class="mt-0.5 max-w-full px-0.5 text-[9px] text-gray-600 dark:text-gray-300 truncate">{{ fileExt(att.name) }}</span>
        </span>
      </button>
      <!-- Add the attachment to the selected container (#306). Hidden in
           read-only contexts (bundled message cards). -->
      <button
        v-if="selectable"
        type="button"
        class="absolute top-0 right-0 px-1 text-xs leading-none rounded-bl bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700"
        :title="t('selected.addAttachment')"
        @click.stop="emit('select-attachment', { attachment: att, index: att._i })"
      >{{ isSelected(att._i) ? '📌' : '📍' }}</button>
      </div>
    </div>

    <!-- Attachment modal -->
    <div v-if="current" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[70]" @click.self="close">
      <button @click.stop="prev" :disabled="items.length <= 1"
        class="absolute left-4 text-white text-3xl hover:text-gray-300 disabled:opacity-30">&lsaquo;</button>

      <div class="max-w-[90vw] max-h-[90vh] flex flex-col items-center p-2" @click.stop>
        <!-- Image: full size -->
        <img v-if="isImageAttachment(current)" :src="current.data" :alt="current.name"
          class="max-w-[85vw] max-h-[80vh] object-contain rounded" />
        <!-- File: name / size / download -->
        <div v-else class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
          <div class="flex items-center gap-3 mb-4">
            <span class="text-3xl">📎</span>
            <span class="font-medium break-all dark:text-gray-200">{{ current.name }}</span>
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {{ current.type || 'file' }} · {{ formatSize(current.size) }}
          </div>
          <a :href="current.data" :download="current.name"
            class="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
            ⬇ {{ t('attachments.download') }}
          </a>
        </div>
      </div>

      <button @click.stop="next" :disabled="items.length <= 1"
        class="absolute right-4 text-white text-3xl hover:text-gray-300 disabled:opacity-30">&rsaquo;</button>
      <button @click="close" class="absolute top-4 right-4 text-white text-2xl hover:text-gray-300">&times;</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { unreferencedAttachments } from '../utils/markdown'
import { useSelectedMessages } from '../composables/useSelectedMessages'

const { t } = useI18n()
const emit = defineEmits(['select-attachment'])

// Selected attachments container (#306)
const selectedStore = useSelectedMessages()
function isSelected(index) {
  const id = `${props.messageId}:${index}`
  return selectedStore.items.value.some(e => e.kind === 'attachment' && e.attachment_id === id)
}

const props = defineProps({
  attachments: { type: Array, default: null },
  // Body text that may reference attachments inline via `attachment:N`.
  // Attachments referenced in the text are already shown inline, so they are
  // excluded from the bottom gallery to avoid duplication.
  content: { type: String, default: '' },
  // Id of the message the attachments belong to (for the selected container)
  messageId: { type: String, default: '' },
  // Offer the "add to selected" button (#306)
  selectable: { type: Boolean, default: true },
})

const visibleAttachments = computed(() => unreferencedAttachments(props.content, props.attachments))

/** Visible attachments with stable index, in display order. */
const items = computed(() => (visibleAttachments.value || []).map((a, i) => ({ ...a, _i: i })))

function isImageAttachment(att) {
  return !!(att && att.type && att.type.startsWith('image/'))
}

const selectedIndex = ref(-1)
const current = computed(() => (selectedIndex.value >= 0 ? items.value[selectedIndex.value] : null))

function openAt(i) { selectedIndex.value = i }
function prev() { if (selectedIndex.value > 0) selectedIndex.value-- }
function next() { if (selectedIndex.value < items.value.length - 1) selectedIndex.value++ }
function close() { selectedIndex.value = -1 }

function fileExt(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(String(name || ''))
  return m ? m[1].toUpperCase() : ''
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>
