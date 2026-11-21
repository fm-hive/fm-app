import { reactive, ref } from 'vue'
import { useOutbox } from './useOutbox'
import { useIdentityStore } from '../stores/identity'

// Pending (not yet confirmed) variant selections, shared by every place that
// renders a vote poster (active protocols, feed, reader): choosing a variant
// must not create an outbox entry — only the "Vote" button sends it (#346).
const pendingByEcho = reactive({})
const SEEN_VOTES_KEY = 'fm_seen_vote_ids'

function loadSeenVotes() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_VOTES_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

const seenVoteIds = ref(loadSeenVotes())

function parse(msg) {
  try {
    return JSON.parse(msg?.data || '{}') || {}
  } catch {
    return {}
  }
}

async function notifyQueued(messageKey, titleKey, params = {}) {
  try {
    const [{ useNotificationsStore }, { default: i18n }] = await Promise.all([
      import('../stores/notifications'),
      import('../i18n'),
    ])
    useNotificationsStore().success(
      i18n.global.t(messageKey, params),
      i18n.global.t(titleKey),
    )
  } catch (err) {
    console.warn('[vote] queued notification failed', err)
  }
}

/**
 * Vote actions for a poster card. `echoName` scopes the pending selection so
 * the same poster in the feed and in the active protocols list stays in sync.
 */
export function useVotePoster() {
  function pendingMap(echoName) {
    return pendingByEcho[echoName] || (pendingByEcho[echoName] = {})
  }

  /** Pending variant to show, hidden once the node confirmed the same vote. */
  function pendingVariantOf(echoName, msg, myVariant = '') {
    const pending = msg?.message_id ? pendingMap(echoName)[msg.message_id] : ''
    if (!pending) return ''
    return pending === myVariant ? '' : pending
  }

  function selectVoteVariant(echoName, msg, variant) {
    if (!msg?.message_id) return
    const map = pendingMap(echoName)
    if (map[msg.message_id] === variant) {
      delete map[msg.message_id]
      return
    }
    map[msg.message_id] = variant
  }

  async function castVote(echoName, msg) {
    const variant = msg?.message_id ? pendingMap(echoName)[msg.message_id] : ''
    if (!variant) return
    const identity = useIdentityStore()
    try {
      const data = parse(msg)
      const voteMessage = {
        echo: echoName,
        proto: 'vote',
        type: 'vote',
        from: identity.user?.address,
        to: data.from || 'all',
        vote: variant,
        poster_message: data.message || '',
        message: `Vote: ${variant}`,
        date: new Date().toISOString()
      }
      const { createSignedMessage } = await import('../services/message')
      const signedMessage = await createSignedMessage('vote', voteMessage, { echo_name: echoName })
      useOutbox().add({
        type: 'vote', echoName, message: signedMessage,
        label: data.message || 'Vote', detail: `Vote: ${variant}`,
        dedupKey: `vote_${echoName}_${msg.message_id}`,
      })
      await notifyQueued('specialMessages.voteAddedToOutbox', 'specialMessages.vote', { variant })
    } catch (err) {
      console.error('Failed to cast vote:', err)
      alert('Failed to cast vote: ' + err.message)
    }
  }

  async function retractVote(echoName, msg) {
    const identity = useIdentityStore()
    try {
      const data = parse(msg)
      const voteMessage = {
        echo: echoName,
        proto: 'vote',
        type: 'vote',
        from: identity.user?.address,
        to: data.from || 'all',
        vote: '',
        poster_message: data.message || '',
        message: 'Retract vote',
        date: new Date().toISOString()
      }
      const { createSignedMessage } = await import('../services/message')
      const signedMessage = await createSignedMessage('vote', voteMessage, { echo_name: echoName })
      useOutbox().add({
        type: 'vote', echoName, message: signedMessage,
        label: 'Retract vote on: ' + (data.message || ''), detail: 'Retract',
        dedupKey: `vote_${echoName}_${msg.message_id}`,
      })
      await notifyQueued('specialMessages.retractionAddedToOutbox', 'specialMessages.retractVote')
    } catch (err) {
      console.error('Failed to retract vote:', err)
      alert('Failed to retract vote: ' + err.message)
    }
  }

  return { seenVoteIds, pendingVariantOf, selectVoteVariant, castVote, retractVote }
}
