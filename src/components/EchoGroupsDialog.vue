<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-lg font-bold dark:text-white">{{ t('echoes.groups.title') }}</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ t('echoes.groups.hint') }}</p>

      <div class="flex-1 overflow-y-auto space-y-4 pr-1">
        <!-- Create group -->
        <div class="flex items-end gap-2">
          <label class="flex-1">
            <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t('echoes.groups.newGroup') }}</span>
            <input v-model="newGroupName" :placeholder="t('echoes.groups.groupName')"
              class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm"
              @keydown.enter.prevent="createGroup" />
          </label>
          <button @click="createGroup" class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
            {{ t('echoes.groups.create') }}
          </button>
        </div>

        <!-- Existing groups -->
        <div v-if="draftGroups.length > 0">
          <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t('echoes.groups.existing') }}</div>
          <div class="space-y-1">
            <div v-for="group in draftGroups" :key="group.id"
              class="flex items-center gap-2 px-2 py-1.5 border rounded dark:border-gray-600 text-sm dark:text-gray-200">
              <span class="flex-1 truncate">{{ group.name }}</span>
              <span class="text-xs text-gray-400">{{ group.echoes.length }}</span>
              <button @click="deleteGroup(group.id)" class="text-xs text-red-500 hover:text-red-700" :title="t('echoes.groups.delete')">✕</button>
            </div>
          </div>
        </div>

        <!-- Move selected echoes -->
        <div>
          <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t('echoes.groups.selectEchoes') }}</div>
          <div class="border rounded dark:border-gray-600 max-h-64 overflow-y-auto">
            <label v-for="echoItem in sortedEchoes" :key="echoItem.name"
              class="flex items-center gap-2 px-2 py-1.5 border-b last:border-b-0 dark:border-gray-600 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
              <input type="checkbox" :checked="selected.has(echoItem.name)" @change="toggleEcho(echoItem.name)" class="rounded" />
              <span class="flex-1 truncate dark:text-gray-200">{{ echoItem.name }}</span>
              <span class="text-xs text-gray-400">{{ groupNameFor(echoItem.name) }}</span>
            </label>
            <div v-if="sortedEchoes.length === 0" class="px-2 py-3 text-sm text-gray-500">{{ t('echoes.groups.empty') }}</div>
          </div>
        </div>

        <div class="flex items-end gap-2">
          <label class="flex-1">
            <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{{ t('echoes.groups.target') }}</span>
            <select v-model="targetGroupId"
              class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
              <option value="">{{ t('echoes.groups.noGroup') }}</option>
              <option v-for="group in draftGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
          </label>
        </div>
      </div>

      <div v-if="error" class="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>

      <div class="flex justify-end gap-3 mt-4 pt-3 border-t dark:border-gray-600">
        <button @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">
          {{ t('app.cancel') }}
        </button>
        <button @click="apply" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          {{ t('echoes.groups.apply') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { assignEchoesToGroup, newEchoGroupId } from '../utils/echoGroups'

const { t } = useI18n()

const props = defineProps({
  visible: { type: Boolean, default: false },
  echoes: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'save'])

const draftGroups = ref([])
const selected = ref(new Set())
const targetGroupId = ref('')
const newGroupName = ref('')
const error = ref('')

const sortedEchoes = computed(() =>
  [...props.echoes].sort((a, b) => String(a.name).localeCompare(String(b.name))),
)

watch(() => props.visible, (visible) => {
  if (!visible) return
  draftGroups.value = props.groups.map(group => ({
    ...group,
    echoes: [...(group.echoes || [])],
  }))
  selected.value = new Set()
  targetGroupId.value = ''
  newGroupName.value = ''
  error.value = ''
})

function toggleEcho(name) {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selected.value = next
}

function groupNameFor(name) {
  return draftGroups.value.find(group => group.echoes.includes(name))?.name || t('echoes.groups.noGroup')
}

function createGroup() {
  const name = newGroupName.value.trim()
  if (!name) {
    error.value = t('echoes.groups.nameRequired')
    return
  }
  const group = { id: newEchoGroupId(), name, echoes: [] }
  draftGroups.value = [...draftGroups.value, group]
  targetGroupId.value = group.id
  newGroupName.value = ''
  error.value = ''
}

function deleteGroup(id) {
  draftGroups.value = draftGroups.value.filter(group => group.id !== id)
  if (targetGroupId.value === id) targetGroupId.value = ''
}

function apply() {
  const nextGroups = assignEchoesToGroup(
    draftGroups.value,
    [...selected.value],
    targetGroupId.value || null,
  )
  emit('save', nextGroups)
  emit('close')
}
</script>
