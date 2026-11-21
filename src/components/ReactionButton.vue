<template>
  <div class="relative inline-flex" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <button
      type="button"
      @click="showPicker = true"
      class="px-2 py-0.5 text-sm rounded border bg-gray-50 hover:bg-gray-100 border-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
      :title="t('reactions.title')"
    >😊
      <span v-if="totalCount > 0" class="ml-1 text-xs opacity-70">{{ totalCount }}</span>
    </button>

    <!-- Hover preview: only the reactions that exist, with their counts (#301).
         Clicking the button still opens the full picker. -->
    <div
      v-if="hovered && existingReactions.length > 0"
      class="absolute left-0 bottom-full mb-1 z-40 flex flex-wrap gap-x-2 gap-y-1 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg text-sm pointer-events-none whitespace-nowrap"
    >
      <span v-for="reaction in existingReactions" :key="reaction.emoji">
        {{ reaction.emoji }}<span class="ml-0.5 text-xs text-gray-500 dark:text-gray-400">{{ reaction.count }}</span>
      </span>
    </div>

    <EmojiPicker
      :visible="showPicker"
      :reaction-counts="reactionCounts"
      :my-reaction="userReacted"
      @select="handleReaction"
      @close="showPicker = false"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import EmojiPicker from './EmojiPicker.vue'
import { fetchEchoMessages } from '../services/message'

const props = defineProps({
  // Message the reaction is attached to (the message shown in the feed, the
  // vote poster in the protocols panel, ...).
  targetMessageId: { type: String, required: true },
  echoName: { type: String, default: '' },
})

const { t } = useI18n()
const identityStore = useIdentityStore()
const echoStore = useEchoStore()

const showPicker = ref(false)
const hovered = ref(false)

const reactionCounts = computed(() => echoStore.getReactionCounts(props.targetMessageId))
const totalCount = computed(() => Object.values(reactionCounts.value).reduce((a, b) => a + b, 0))
// Only reactions that exist, most used first.
const existingReactions = computed(() =>
  Object.entries(reactionCounts.value)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({ emoji, count }))
)
const userReacted = computed(() => {
  if (!identityStore.user?.address) return null
  return echoStore.getUserReaction(props.targetMessageId, identityStore.user.address)
})

async function handleReaction(emoji) {
  if (!props.targetMessageId || !props.echoName) return
  const sendEmoji = userReacted.value === emoji ? '' : emoji
  try {
    await identityStore.sendReaction(props.targetMessageId, sendEmoji, '', props.echoName)
    const newMessages = await fetchEchoMessages(props.echoName)
    if (newMessages && newMessages.length > 0) {
      echoStore.addMessages(props.echoName, newMessages)
    }
  } catch (err) {
    console.error('Failed to send reaction:', err)
  }
}
</script>
