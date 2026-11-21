import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/message', () => ({
  createSignedMessage: vi.fn(async (type, data) => ({ type, data: JSON.stringify(data), jws: 'sig' })),
}))

vi.mock('../../src/i18n', () => ({
  default: {
    global: {
      t: (key, params) => key + (params?.variant ? `:${params.variant}` : ''),
    },
  },
}))

import { useVotePoster } from '../../src/composables/useVotePoster'
import { useIdentityStore } from '../../src/stores/identity'
import { useNotificationsStore } from '../../src/stores/notifications'
import { useOutbox } from '../../src/composables/useOutbox'

function poster(id) {
  return {
    message_id: id,
    type: 'vote',
    echo_name: 'E',
    data: JSON.stringify({
      proto: 'vote', type: 'poster', from: ':0:2', message: 'Tea or coffee?', variants: ['tea', 'coffee'],
    }),
  }
}

describe('useVotePoster outbox feedback (#355)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useIdentityStore().user = { address: ':0:1' }
  })

  it('shows a toast after a vote is queued', async () => {
    const msg = poster('poster-toast-vote')
    const { selectVoteVariant, castVote } = useVotePoster()
    selectVoteVariant('E', msg, 'tea')
    const before = useOutbox().count.value
    await castVote('E', msg)

    expect(useOutbox().count.value).toBe(before + 1)
    const notes = useNotificationsStore().notifications
    expect(notes).toHaveLength(1)
    expect(notes[0].type).toBe('success')
    expect(notes[0].message).toBe('specialMessages.voteAddedToOutbox:tea')
    expect(notes[0].title).toBe('specialMessages.vote')
  })

  it('shows a toast after a retraction is queued', async () => {
    const msg = poster('poster-toast-retract')
    const { retractVote } = useVotePoster()
    await retractVote('E', msg)

    const notes = useNotificationsStore().notifications
    expect(notes).toHaveLength(1)
    expect(notes[0].message).toBe('specialMessages.retractionAddedToOutbox')
    expect(notes[0].title).toBe('specialMessages.retractVote')
  })
})
