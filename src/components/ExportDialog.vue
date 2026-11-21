<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
      <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('export.title') }}</h3>

      <div class="space-y-4">
        <!-- Always-included note -->
        <div class="text-xs text-gray-500 dark:text-gray-400 p-2 border rounded dark:border-gray-600">
          {{ t('export.alwaysIncluded') }}
        </div>

        <!-- Settings (always included) -->
        <label class="flex items-center gap-3 cursor-pointer opacity-80">
          <input type="checkbox" v-model="exportSettings" disabled class="rounded" />
          <div>
            <div class="text-sm font-medium dark:text-gray-200">{{ t('export.settings') }}</div>
            <div class="text-xs text-gray-500">{{ t('export.settingsHint') }}</div>
          </div>
        </label>

        <!-- Keys (always included) -->
        <label class="flex items-center gap-3 cursor-pointer opacity-80">
          <input type="checkbox" v-model="exportKeys" disabled class="rounded" />
          <div>
            <div class="text-sm font-medium dark:text-gray-200">{{ t('export.keys') }}</div>
            <div class="text-xs text-gray-500">{{ t('export.keysHint') }}</div>
          </div>
        </label>

        <!-- Echo messages -->
        <div>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="exportEchos" class="rounded" />
            <div>
              <div class="text-sm font-medium dark:text-gray-200">{{ t('export.echoMessages') }}</div>
              <div class="text-xs text-gray-500">{{ t('export.echoMessagesHint') }}</div>
            </div>
          </label>
          <div v-if="exportEchos && echoList.length > 0" class="mt-2 ml-8 space-y-1 max-h-40 overflow-y-auto border rounded p-2 dark:border-gray-600">
            <label v-for="echoName in echoList" :key="echoName" class="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" :value="echoName" v-model="selectedEchos" class="rounded" />
              <span class="dark:text-gray-300">{{ echoName }}</span>
              <span class="text-xs text-gray-400">({{ echoMessageCounts[echoName] || 0 }})</span>
            </label>
          </div>
          <div v-if="exportEchos && echoList.length === 0" class="mt-1 ml-8 text-xs text-gray-400">
            {{ t('export.noEchoMessages') }}
          </div>
        </div>

        <!-- Netmail messages (per folder) -->
        <div>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="exportNetmail" class="rounded" />
            <div>
              <div class="text-sm font-medium dark:text-gray-200">{{ t('export.netmail') }}</div>
              <div class="text-xs text-gray-500">{{ t('export.netmailHint') }}</div>
            </div>
          </label>
          <div v-if="exportNetmail" class="mt-2 ml-8 space-y-1 max-h-48 overflow-y-auto border rounded p-2 dark:border-gray-600">
            <label v-for="f in netmailFolderOptions" :key="f.key" class="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" :value="f.key" v-model="selectedNetmailFolders" class="rounded" />
              <span class="dark:text-gray-300">{{ f.label }}</span>
              <span v-if="f.count != null" class="text-xs text-gray-400">({{ f.count }})</span>
            </label>
          </div>
        </div>

        <!-- Blogs -->
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" v-model="exportBlogs" class="rounded" />
          <div>
            <div class="text-sm font-medium dark:text-gray-200">{{ t('export.blogs') }}</div>
            <div class="text-xs text-gray-500">{{ t('export.blogsHint') }}</div>
          </div>
        </label>
      </div>

      <div class="flex justify-end gap-3 mt-6">
        <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          {{ t('app.cancel') }}
        </button>
        <button @click="doExport" :disabled="!canExport" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
          {{ t('settings.fullExport') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import * as db from '../services/db'
import * as blogStore from '../services/blogStore'

const { t } = useI18n()
const identity = useIdentityStore()

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'export'])

const exportSettings = ref(true)
const exportKeys = ref(true)
const exportEchos = ref(true)
const exportNetmail = ref(false)
const exportBlogs = ref(false)
const selectedEchos = ref([])
const echoList = ref([])
const echoMessageCounts = ref({})
const selectedNetmailFolders = ref([])
const netmailFolderOptions = ref([])

const canExport = computed(() => true) // structure/settings/keys always exported

watch(() => props.visible, async (v) => {
  if (v) {
    exportSettings.value = true
    exportKeys.value = true
    exportEchos.value = true
    exportNetmail.value = false
    exportBlogs.value = false
    await loadEchoList()
    await loadNetmailFolders()
  }
})

async function loadEchoList() {
  try {
    const dbConn = await db.openReadConnection()
    const names = []
    const counts = {}
    for (const storeName of Array.from(dbConn.objectStoreNames)) {
      if (storeName.startsWith('echo_')) {
        const echoName = storeName.replace(/^echo_/, '')
        names.push(echoName)
        const tx = dbConn.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        counts[echoName] = await new Promise((res) => {
          const req = store.count()
          req.onsuccess = () => res(req.result)
          req.onerror = () => res(0)
        })
      }
    }
    echoList.value = names.sort()
    echoMessageCounts.value = counts
    selectedEchos.value = [...names] // all selected by default
    dbConn.close()
  } catch {
    echoList.value = []
  }
}

/** Список папок netmail для выбора сообщений (содержимое каких папок экспортировать). */
async function loadNetmailFolders() {
  const opts = [
    { key: 'inbox', label: t('netmail.inbox') },
    { key: 'sent', label: t('netmail.sent') },
    { key: 'errors', label: t('netmail.errors') },
    { key: 'bad', label: t('netmail.bad') },
    { key: 'dup', label: t('netmail.dup') },
    { key: 'trash', label: t('netmail.trash') },
  ]
  const custom = db.getNetmailFolders()
  for (const [slug, name] of Object.entries(custom)) {
    opts.push({ key: `netmail_${slug}`, label: `📁 ${name}` })
  }
  // Counts
  try {
    const all = await getNetmailAllMessages()
    for (const o of opts) {
      if (o.key === 'trash') {
        o.count = all.trash.length
      } else if (o.key.startsWith('netmail_')) {
        o.count = all.custom[o.key]?.length || 0
      } else {
        o.count = (all.base[o.key] || []).length
      }
    }
  } catch {
    // counts optional
  }
  netmailFolderOptions.value = opts
  selectedNetmailFolders.value = opts.map(o => o.key)
}

/** Получает сообщения netmail по папкам (базовые + кастомные) + trash. */
async function getNetmailAllMessages() {
  const d = await db.openReadConnection()
  const read = async (storeName) => {
    if (!d.objectStoreNames.contains(storeName)) return []
    const all = await new Promise((res) => {
      const tx = d.transaction(storeName, 'readonly')
      const g = tx.objectStore(storeName).getAll()
      g.onsuccess = () => res(g.result || [])
      g.onerror = () => res([])
    })
    return all
  }
  const netmail = await read('__netmail__')
  const trash = await read('__trash__')
  const custom = {}
  for (const slug of Object.keys(db.getNetmailFolders())) {
    custom[`netmail_${slug}`] = await read(`netmail_${slug}`)
  }

  const me = identity.user?.address
  const base = { inbox: [], sent: [], errors: [], bad: [], dup: [] }
  for (const m of netmail) {
    if (m._isDup) { base.dup.push(m); continue }
    if (m._decryptError) { base.bad.push(m); continue }
    const d2 = parseData(m)
    if (d2.type === 'error') { base.errors.push(m); continue }
    if (m.sender_address === me) { base.sent.push(m); continue }
    base.inbox.push(m)
  }
  d.close()
  return { base, custom, trash }
}

function parseData(msg) {
  if (!msg?.data) return {}
  try { return typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data }
  catch { return {} }
}

function doExport() {
  const allSelected = selectedEchos.value.length === echoList.value.length
  emit('export', {
    settings: exportSettings.value,   // always true
    keys: exportKeys.value,           // always true
    structure: true,                  // folder/echo/blog structure always exported
    echos: exportEchos.value,
    selectedEchos: exportEchos.value && !allSelected ? selectedEchos.value : null,
    netmail: exportNetmail.value,
    netmailFolders: exportNetmail.value ? [...selectedNetmailFolders.value] : [],
    blogs: exportBlogs.value,
  })
}
</script>
