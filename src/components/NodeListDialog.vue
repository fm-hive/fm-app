<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="close">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg dark:text-white">{{ t('admin.nodeListTitle') }}</h3>
        <button @click="close" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none" :aria-label="t('app.close')">&times;</button>
      </div>

      <div v-if="loading" class="py-8 text-center text-gray-500 dark:text-gray-400">{{ t('admin.nodeListLoading') }}</div>
      <div v-else-if="error" class="p-3 bg-red-50 text-red-700 rounded text-sm">{{ error }}</div>
      <div v-else-if="nodes.length === 0" class="py-8 text-center text-gray-500 dark:text-gray-400 border rounded dark:border-gray-700">
        {{ t('admin.nodeListEmpty') }}
      </div>
      <div v-else class="overflow-y-auto space-y-3">
        <div v-for="node in nodes" :key="node.address || node.url" class="border rounded-lg p-4 dark:border-gray-700">
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="font-mono font-medium dark:text-gray-200">{{ node.address || '?' }}</span>
            <span v-if="node.name" class="text-sm text-gray-600 dark:text-gray-400">{{ node.name }}</span>
            <span v-if="node.is_recover_node" class="text-xs px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
              {{ t('admin.nodeRecover') }}
            </span>
            <span v-if="node.is_open_node" class="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {{ t('admin.nodeOpen') }}
            </span>
            <span v-if="node.is_echomail_router" class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              {{ t('admin.nodeRouter') }}
            </span>
          </div>
          <div v-if="node.url" class="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">{{ node.url }}</div>
          <div v-if="node.clients && node.clients.length" class="mt-2">
            <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{{ t('admin.nodeListClients') }}</div>
            <ul class="ml-4 list-disc text-sm dark:text-gray-300">
              <li v-for="client in node.clients" :key="client.address">
                <span class="font-mono">{{ client.address }}</span>
                <span v-if="client.name" class="ml-1 text-gray-500 dark:text-gray-400">· {{ client.name }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="flex justify-end mt-4">
        <button @click="close" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded dark:text-gray-300">{{ t('app.close') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiService } from '../services/api'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
const { t } = useI18n()
const nodes = ref([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await apiService.getNodes()
    nodes.value = Array.isArray(response) ? response : (response?.nodes || [])
  } catch (err) {
    error.value = err.message || t('admin.nodeListError')
    nodes.value = []
  } finally {
    loading.value = false
  }
}

function close() {
  emit('close')
}

watch(() => props.visible, (visible) => {
  if (visible) load()
}, { immediate: true })
</script>
