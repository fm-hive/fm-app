<template>
  <div>
    <!-- Meta grid -->
    <div class="grid grid-cols-2 gap-2 text-sm mb-3">
      <div v-if="showEcho">
        <span class="text-gray-500">{{ t('protocol.echo') }}:</span>
        <span class="ml-2 font-medium">{{ msg.echo_name || 'N/A' }}</span>
      </div>
      <div>
        <span class="text-gray-500">{{ t('protocol.sender') }}:</span>
        <SenderLabel :address="posterMsg.sender_address" :name-from-message="posterData.sender_name || ''" class="ml-2 font-medium truncate" />
      </div>
      <div>
        <span class="text-gray-500">{{ t('protocol.date') }}:</span>
        <span class="ml-2">{{ formatTimestamp(posterMsg.timestamp) }}</span>
      </div>
      <div>
        <span class="text-gray-500">{{ t('protocol.status') }}:</span>
        <span class="ml-2">{{ statusText }}</span>
      </div>
    </div>

    <!-- Question / description (plain text for overrides like chunk diffs) -->
    <div v-if="question" class="mt-2 p-3 bg-gray-100 rounded text-sm">
      <pre v-if="questionIsPlain" class="whitespace-pre-wrap font-mono text-xs text-gray-800 dark:text-gray-200">{{ question }}</pre>
      <MarkdownRenderer v-else :content="question" />
    </div>

    <!-- Result (finished vote) -->
    <div v-if="isResult" class="mt-3 text-sm space-y-1">
      <div class="font-semibold" :class="resultClass">
        {{ resultLabel }}
      </div>
      <div v-if="resultWinner" class="text-gray-800 dark:text-gray-200">
        🏆 {{ resultWinner }} <span class="text-gray-500">({{ resultWinnerCount }})</span>
      </div>
      <div v-if="resultReason" class="text-xs text-gray-500 dark:text-gray-400">{{ resultReason }}</div>
    </div>

    <!-- Phase timeline (also for results: the same form as in the active list) -->
    <div v-if="phaseData" class="mt-3">
      <div class="flex items-center gap-0.5 mb-1">
        <div v-for="(phase, i) in phaseData.phases" :key="i"
          class="flex-1 h-2 rounded"
          :class="phase.active ? 'bg-blue-500' : phase.past ? 'bg-gray-300' : 'bg-gray-100'"
          :title="phase.name"
        ></div>
      </div>
      <div class="flex justify-between text-xs mb-2">
        <span v-for="(phase, i) in phaseData.phases" :key="i"
          :class="phase.active ? 'font-bold text-blue-600' : phase.past ? 'text-gray-500' : 'text-gray-300'">
          {{ t(phaseNameKeys[i] || '') }}
        </span>
      </div>
      <div v-if="phaseData.phaseEnd && phaseData.phase !== 'ended'" class="text-xs mt-1">
        <span class="text-gray-500">{{ t('vote.endsAt') }}:</span>
        <span @click="showDate = !showDate" class="cursor-pointer ml-1 text-blue-600 hover:underline">
          {{ showDate ? formatDate(phaseData.phaseEnd) : formatRemaining(phaseData.remaining) }}
        </span>
      </div>
    </div>

    <!-- Variants -->
    <div v-if="variants.length > 0" class="mt-3">
      <div :class="isMerge ? 'flex flex-col items-stretch gap-2' : 'flex flex-wrap gap-2'">
        <button
          v-for="variant in variants"
          :key="variant"
          type="button"
          :disabled="readonly"
          @click="emit('select-variant', variant)"
          :class="[
            'px-3 py-1 text-sm rounded border',
            isMerge ? 'text-left font-mono text-xs whitespace-pre-wrap break-words' : '',
            myVoteVariant === variant
              ? 'bg-green-500 text-white border-green-500'
              : pendingVariant === variant
                ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                : 'bg-white hover:bg-blue-50 border-gray-300',
            readonly ? 'cursor-default opacity-90' : ''
          ]"
        >
          {{ variant }} <span v-if="counts[variant]" class="ml-1 text-xs opacity-70">({{ counts[variant] }})</span>
        </button>
        <button v-if="!readonly && pendingVariant" type="button" @click="emit('vote')" class="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
          🗳️ {{ t('specialMessages.vote') }}
        </button>
        <button v-if="!readonly && myVoteVariant" type="button" @click="emit('retract')" class="px-3 py-1 text-sm rounded border border-red-300 text-red-500 hover:bg-red-50">
          ↩ {{ t('specialMessages.retractVote') }}
        </button>
      </div>

      <!-- A/B legend for merge chunk votes (#346): A is the node that started
           the merge (contacts the peer by URL), B is the other node. -->
      <div v-if="isMerge" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span class="font-semibold text-gray-700 dark:text-gray-300">A</span>
        {{ mergeData.node1 ? `(${mergeData.node1})` : '' }} — {{ t('merge.initiator') }},
        <span class="font-semibold text-gray-700 dark:text-gray-300">B</span>
        {{ mergeData.node2 ? `(${mergeData.node2})` : '' }} — {{ t('merge.acceptor') }}
      </div>

      <!-- Voter icons: one list, new votes carry a green dot (#348) -->
      <div v-if="voters.length > 0" class="mt-3">
        <div class="text-xs text-gray-500 font-medium mb-1">{{ t('protocol.allVotes') }}</div>
        <div class="flex flex-wrap gap-1">
          <span
            v-for="vm in allVotesSorted"
            :key="vm.message_id"
            @click="emit('open-voter', vm)"
            class="relative inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold cursor-pointer hover:ring-2 hover:ring-blue-300 transition-all"
            :style="{ backgroundColor: stringToColor(vm.sender_address) }"
            :title="voterLabel(vm)"
          >
            {{ voterInitials(vm) }}
            <span v-if="isNewVote(vm)" class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white"></span>
          </span>
        </div>
      </div>
    </div>

    <!-- Reactions + message actions in one row (#297, #348) -->
    <div v-if="showReactions || showRaw || showHide" class="mt-3 flex flex-wrap items-center gap-2">
      <ReactionButton v-if="showReactions && msg.message_id" :target-message-id="msg.message_id" :echo-name="msg.echo_name || ''" />
      <button
        v-if="showRaw"
        type="button"
        @click="emit('view-raw')"
        class="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {{ t('protocol.viewRaw') }}
      </button>
      <button
        v-if="showHide"
        type="button"
        @click="emit('hide')"
        class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        {{ t('protocol.hide') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ReactionButton from './ReactionButton.vue'
import SenderLabel from './SenderLabel.vue'
import { countVoteVariants, getVoteState, formatRemaining, formatDate } from '../composables/useProtocolPhases'
import { stringToColor } from '../utils/color'

const { t } = useI18n()

const props = defineProps({
  // Vote poster message (or the result message when readonly)
  msg: { type: Object, required: true },
  // Poster message for a result (msg is the result then)
  poster: { type: Object, default: null },
  // All protocol messages of the echo (for counts/voters)
  allMessages: { type: Array, default: () => [] },
  // Result mode: show the outcome, no vote buttons
  readonly: { type: Boolean, default: false },
  // Pending (not yet sent) variant selection of the current user
  pendingVariant: { type: String, default: '' },
  // Variant the current user voted for
  myVoteVariant: { type: String, default: '' },
  // Ids of votes already seen (no green dot)
  seenVoteIds: { type: Object, default: null },
  // Optional override for the question text (e.g. a change_policy chunk diff)
  question: { type: String, default: '' },
  showEcho: { type: Boolean, default: false },
  // Reactions on the shown voting message (#297)
  showReactions: { type: Boolean, default: false },
  // View Raw / Hide next to the reactions (#348)
  showRaw: { type: Boolean, default: false },
  showHide: { type: Boolean, default: false },
})

const emit = defineEmits(['select-variant', 'vote', 'retract', 'open-voter', 'view-raw', 'hide'])

const showDate = ref(false)

function parse(msg) {
  try { return JSON.parse(msg?.data) || {} } catch { return {} }
}

const msgData = computed(() => parse(props.msg))
const posterMsg = computed(() => props.poster || props.msg)
const posterData = computed(() => parse(posterMsg.value))
// Merge chunk votes carry the chunk diff in protocol_data (both nodes get the
// same text, #346): the visible poster text is only the chunk title.
const isMerge = computed(() => posterData.value.protocol === 'merge')
const mergeData = computed(() => (isMerge.value ? (posterData.value.protocol_data || {}) : {}))
// Result mode is about the message type only: `readonly` hides the vote
// actions (feed) but must not turn an active poster into a finished vote (#252).
const isResult = computed(() => msgData.value.type === 'result')

const question = computed(() => {
  if (props.question) return props.question
  if (isMerge.value) {
    const pd = mergeData.value
    const diff = pd.message || ''
    if (diff) {
      // Phase posters (accept/reject) carry no chunk index: the diff text
      // already names the phase, so do not invent a "chunk 1/?" title.
      if (pd.chunk_index === undefined) return diff
      return `Merge chunk ${pd.chunk_index + 1}/${pd.total_chunks || '?'}: ${diff}`
    }
  }
  return posterData.value.message || ''
})
// Chunk diffs keep their +/- markers, so they are rendered as plain text.
const questionIsPlain = computed(() => !!props.question || isMerge.value)
const variants = computed(() => (Array.isArray(posterData.value.variants) ? posterData.value.variants : []))

const voteStats = computed(() => {
  try {
    return countVoteVariants(posterData.value.message, props.allMessages)
  } catch {
    return { counts: {}, voters: [] }
  }
})
const counts = computed(() => voteStats.value.counts || {})
const voters = computed(() => voteStats.value.voters || [])
const allVotesSorted = computed(() => [...voters.value].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)))
function isNewVote(vm) {
  const seen = props.seenVoteIds
  return !!seen && typeof seen.has === 'function' && !seen.has(vm.message_id)
}

const phaseData = computed(() => getVoteState(posterMsg.value))
const phaseNameKeys = ['vote.votingPhase', 'vote.endedPhase']

const statusText = computed(() => {
  if (isResult.value) return t('vote.endedPhase')
  const phase = phaseData.value?.phase
  if (phase === 'ended') return t('vote.endedPhase')
  return t('vote.votingPhase')
})

// Result banner
const resultWinner = computed(() => {
  const d = msgData.value
  if (!isResult.value) return ''
  if (d.variant) return d.variant
  const entries = Object.entries(counts.value).sort(([, a], [, b]) => b - a)
  return entries.length > 0 ? entries[0][0] : ''
})
const resultWinnerCount = computed(() => counts.value[resultWinner.value] || 0)
const resultReason = computed(() => msgData.value.reason || '')
const resultLabel = computed(() => {
  const result = msgData.value.result
  if (result === 'success') return t('protocol.completed')
  if (result === 'cancelled') return t('protocol.cancelled')
  return t('vote.votingEnded')
})
const resultClass = computed(() => (msgData.value.result === 'success'
  ? 'text-green-700 dark:text-green-400'
  : 'text-red-600 dark:text-red-400'))

function formatTimestamp(ts) {
  if (!ts) return ''
  try { return new Date(ts * 1000).toLocaleString() } catch { return '' }
}

function stripNetworkTag(address) {
  const s = String(address || '')
  if (s.startsWith('A:') || s.startsWith('B:')) return s.slice(2)
  return s
}

function voterInitials(vm) {
  const data = parse(vm)
  const name = (data.sender_name || stripNetworkTag(vm.sender_address) || '').trim()
  if (!name) return '?'
  if (name.startsWith(':')) return name.slice(0, 2)
  return name.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2)
}

function voterLabel(vm) {
  const data = parse(vm)
  const tag = String(vm.sender_address || '').startsWith('A:') ? 'A'
    : String(vm.sender_address || '').startsWith('B:') ? 'B' : ''
  const name = data.sender_name || stripNetworkTag(vm.sender_address) || ''
  return `${tag ? tag + ': ' : ''}${name}: ${data.vote || ''}`
}
</script>
