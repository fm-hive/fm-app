<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg dark:text-white">{{ t('contacts.title') }}</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="contactsList.length === 0" class="text-gray-500 dark:text-gray-400 p-4 text-center border rounded dark:border-gray-700">
          {{ t('contacts.empty') }}
        </div>

        <div v-else class="space-y-2">
          <div v-for="contact in contactsList" :key="contact.address"
            class="border rounded-lg p-4 dark:border-gray-700 flex items-center justify-between"
          >
            <div>
              <div class="text-sm dark:text-gray-200"><SenderLabel :address="contact.address" /></div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ t('contacts.thumbprint') }}: {{ contact.keyThumbprint?.substring(0, 16) }}...
              </div>
            </div>
            <button @click="$emit('write', contact.address)"
              class="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >{{ t('contacts.write') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SenderLabel from './SenderLabel.vue'
import { keyService } from '../services/keyService'

defineProps({
  visible: { type: Boolean, default: false }
})
defineEmits(['close', 'write'])

const { t } = useI18n()

/**
 * Список контактов формируется из keyCache сервиса keyService.
 * Каждый контакт — это пользователь, чей публичный ключ нам известен.
 */
const contactsList = computed(() => {
  const list = []
  for (const [address, data] of keyService.keyCache.entries()) {
    list.push({ address, keyThumbprint: data.keyThumbprint })
  }
  list.sort((a, b) => a.address.localeCompare(b.address))
  return list
})
</script>
