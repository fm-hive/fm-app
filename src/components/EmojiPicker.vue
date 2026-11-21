<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-sm w-full mx-4">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-bold text-sm dark:text-white">{{ t('reactions.title') }}</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">&times;</button>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="emoji in emojis" :key="emoji"
          @click="select(emoji)"
          class="w-9 h-9 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer relative"
          :class="{
            'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500': isMyReaction(emoji),
            'bg-gray-50 dark:bg-gray-700': hasReactions(emoji) && !isMyReaction(emoji)
          }"
        >
          {{ emoji }}
          <span v-if="hasReactions(emoji)" class="absolute -top-1 -right-1 text-[10px] bg-gray-500 text-white rounded-full px-1 leading-tight">{{ getCount(emoji) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'

const props = defineProps({
  visible: { type: Boolean, default: false },
  reactionCounts: { type: Object, default: () => ({}) },
  myReaction: { type: String, default: null },
})
const emit = defineEmits(['select', 'close'])

const { t } = useI18n()
const settings = useSettingsStore()

const emojis = computed(() => settings.ui.customEmojis?.length ? settings.ui.customEmojis : [
  '👍','👎','❤️','💯','😄','😊','😍','🎉','🎊','👏','💪','🚀','🔥',
  '😁','😂','🤣','🥰','😘','🤗','🎈','🎁','🏆','⭐','😎','🤩','🥳',
  '😤','😭','🫂','🤝','😢','😞','😡','🤔','👀','🙏'
])

function hasReactions(emoji) {
  return (props.reactionCounts[emoji] || 0) > 0
}

function getCount(emoji) {
  return props.reactionCounts[emoji] || 0
}

function isMyReaction(emoji) {
  return props.myReaction === emoji
}

function select(emoji) {
  emit('select', emoji)
  emit('close')
}
</script>
