<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
      <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('import.title') }}</h3>

      <!-- Step 1: choose file -->
      <div v-if="!data" class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">{{ t('import.chooseFileHint') }}</p>
        <button
          @click="chooseFile"
          :disabled="reading"
          class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 w-full"
        >
          <span v-if="reading">⟳</span>
          {{ reading ? t('import.reading') : t('import.chooseFile') }}
        </button>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </div>

      <!-- Step 2: select what to import -->
      <template v-else>
        <div class="text-xs text-gray-500 dark:text-gray-400 p-2 border rounded dark:border-gray-600 mb-4">
          {{ fileSummary }}
        </div>

        <div class="space-y-4">
          <!-- Core: settings + keys + folders -->
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="includeCore" class="rounded" />
            <div>
              <div class="text-sm font-medium dark:text-gray-200">{{ t('import.core') }}</div>
              <div class="text-xs text-gray-500">{{ t('import.coreHint') }}</div>
            </div>
          </label>

          <!-- Echo messages -->
          <div v-if="analysis.echoes.length > 0">
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" v-model="includeEchos" class="rounded" />
              <div>
                <div class="text-sm font-medium dark:text-gray-200">{{ t('import.echoMessages') }}</div>
                <div class="text-xs text-gray-500">{{ t('import.echoMessagesHint') }}</div>
              </div>
            </label>
            <div v-if="includeEchos" class="mt-2 ml-8 space-y-1 max-h-36 overflow-y-auto border rounded p-2 dark:border-gray-600">
              <label v-for="e in analysis.echoes" :key="e.name" class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" :value="e.name" v-model="selectedEchos" class="rounded" />
                <span class="dark:text-gray-300 truncate">{{ e.name }}</span>
                <span class="text-xs text-gray-400 shrink-0">({{ e.count }})</span>
              </label>
            </div>
          </div>

          <!-- Netmail messages -->
          <div v-if="analysis.netmailPresent">
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" v-model="includeNetmail" class="rounded" />
              <div>
                <div class="text-sm font-medium dark:text-gray-200">{{ t('import.netmail') }}</div>
                <div class="text-xs text-gray-500">{{ t('import.netmailHint') }}</div>
              </div>
            </label>
            <div v-if="includeNetmail" class="mt-2 ml-8 space-y-2 max-h-48 overflow-y-auto border rounded p-2 dark:border-gray-600">
              <div v-if="analysis.netmailBaseFolders.length > 0">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ t('import.baseFolders') }}</div>
                <label v-for="f in analysis.netmailBaseFolders" :key="f.folder" class="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" :value="f.folder" v-model="selectedNetmailBase" class="rounded" />
                  <span class="dark:text-gray-300">{{ baseFolderLabel(f.folder) }}</span>
                  <span class="text-xs text-gray-400">({{ f.count }})</span>
                </label>
              </div>
              <div v-if="analysis.netmailCustom.length > 0">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 mt-2">{{ t('import.customFolders') }}</div>
                <label v-for="f in analysis.netmailCustom" :key="f.store" class="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" :value="f.store" v-model="selectedNetmailCustom" class="rounded" />
                  <span class="dark:text-gray-300">📁 {{ f.label }}</span>
                  <span class="text-xs text-gray-400">({{ f.count }})</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Blog posts -->
          <label v-if="analysis.blogCount > 0" class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="includeBlogs" class="rounded" />
            <div>
              <div class="text-sm font-medium dark:text-gray-200">{{ t('import.blogs') }}</div>
              <div class="text-xs text-gray-500">{{ t('import.blogsHint', { count: analysis.blogCount }) }}</div>
            </div>
          </label>
        </div>

        <div v-if="error" class="mt-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{{ error }}</div>

        <div class="flex justify-end gap-3 mt-6">
          <button @click="resetFile" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {{ t('import.back') }}
          </button>
          <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {{ t('app.cancel') }}
          </button>
          <button @click="doImport" :disabled="importing" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
            <span v-if="importing">⟳</span>
            {{ importing ? t('import.importing') : t('import.import') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationsStore } from '../stores/notifications'
import { pickExportFile, analyzeExport, applyImport } from '../composables/useImport'

const { t } = useI18n()
const notifications = useNotificationsStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const reading = ref(false)
// shallowRef: the parsed file may contain large nested structures (messages).
// A deep ref() wraps them in Vue reactive Proxies, which break IndexedDB
// structuredClone (DataCloneError on put).
const data = shallowRef(null)
const analysis = shallowRef(null)
const error = ref('')

// Options
const includeCore = ref(true)
const includeEchos = ref(true)
const includeNetmail = ref(true)
const includeBlogs = ref(true)
const selectedEchos = ref([])
const selectedNetmailBase = ref([])
const selectedNetmailCustom = ref([])
const importing = ref(false)

const fileSummary = computed(() => {
  if (!analysis.value) return ''
  const parts = []
  if (analysis.value.hasKeys) parts.push(t('import.summaryKeys'))
  if (analysis.value.hasSettings) parts.push(t('import.summarySettings'))
  if (analysis.value.echoes.length) parts.push(t('import.summaryEchoes', { count: analysis.value.echoes.length }))
  if (analysis.value.netmailPresent) parts.push(t('import.summaryNetmail'))
  if (analysis.value.blogCount) parts.push(t('import.summaryBlogs', { count: analysis.value.blogCount }))
  return parts.length ? t('import.fileContains', { items: parts.join(', ') }) : ''
})

watch(() => props.visible, (v) => {
  if (v) {
    resetFile()
  }
})

function baseFolderLabel(folder) {
  const map = { inbox: 'netmail.inbox', sent: 'netmail.sent', errors: 'netmail.errors', bad: 'netmail.bad', dup: 'netmail.dup' }
  return t(map[folder] || 'netmail.inbox')
}

async function chooseFile() {
  error.value = ''
  reading.value = true
  try {
    const fileData = await pickExportFile()
    if (!fileData) return
    if (fileData.parseError) {
      error.value = t('import.parseError', { error: fileData.parseError })
      return
    }
    data.value = fileData
    analysis.value = analyzeExport(fileData)
    // Default: everything available selected
    selectedEchos.value = analysis.value.echoes.map(e => e.name)
    selectedNetmailBase.value = analysis.value.netmailBaseFolders.map(f => f.folder)
    selectedNetmailCustom.value = analysis.value.netmailCustom.map(f => f.store)
  } catch (err) {
    error.value = t('import.parseError', { error: err.message })
  } finally {
    reading.value = false
  }
}

function resetFile() {
  data.value = null
  analysis.value = null
  error.value = ''
  includeCore.value = true
  includeEchos.value = true
  includeNetmail.value = true
  includeBlogs.value = true
  selectedEchos.value = []
  selectedNetmailBase.value = []
  selectedNetmailCustom.value = []
}

async function doImport() {
  error.value = ''
  importing.value = true
  try {
    const res = await applyImport(data.value, {
      core: includeCore.value,
      echoes: includeEchos.value ? selectedEchos.value : [],
      netmailBase: includeNetmail.value ? selectedNetmailBase.value : [],
      netmailCustom: includeNetmail.value ? selectedNetmailCustom.value : [],
      blogs: includeBlogs.value,
    })
    emit('close')
    if (res.failedStores > 0) {
      notifications.warning(t('settings.fullImportPartial', { failed: res.failedStores }), t('settings.importComplete'))
    } else {
      notifications.success(t('settings.fullImportComplete'), t('settings.importComplete'))
    }
    // Keys/user may have been replaced — reload so the app boots with the
    // imported identity and re-syncs the address with the node.
    setTimeout(() => window.location.reload(), 1200)
  } catch (err) {
    error.value = t('settings.importFailed', { error: err.message })
    notifications.error(t('settings.importFailed', { error: err.message }), t('settings.importError'))
    console.error(err)
  } finally {
    importing.value = false
  }
}
</script>
