import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import VoteProtocolCard from '../../src/components/VoteProtocolCard.vue'
import { countVoteVariants, myVoteVariantFor } from '../../src/composables/useProtocolPhases'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

// Two simple networks both have their admin at :0:1 (#249).
const posterText = 'Merge chunk 1/2: Merge nets A:0:0 and B:0:0 (1/2)'
const mergePoster = {
  message_id: 'mp1',
  type: 'vote',
  echo_name: 'Admin council',
  sender_address: ':0:1',
  timestamp: 1700000000,
  data: JSON.stringify({
    proto: 'vote',
    type: 'poster',
    protocol: 'merge',
    from: ':0:0',
    message: posterText,
    variants: ['A: max_create_echo_requests:2', 'B: max_create_echo_requests:1'],
    protocol_data: {
      state_key: 'merge::0:0_:0:0_1',
      node1: ':0:0',
      node2: ':0:0',
      chunk_index: 0,
      total_chunks: 2,
      message: 'Rule differences chunk 1/2: max_create_echo_requests: A:0:0=2 vs B:0:0=1',
    },
  }),
}

function voteMessage(id, envelopeSender, vote) {
  return {
    message_id: id,
    type: 'vote',
    sender_address: envelopeSender,
    timestamp: 1700000100,
    data: JSON.stringify({
      proto: 'vote',
      type: 'vote',
      from: ':0:1', // inner signed address: equal on both networks
      sender_name: 'Admin',
      vote,
      poster_message: posterText,
    }),
  }
}

const localVote = voteMessage('v1', ':0:1', 'A: max_create_echo_requests:2')
const peerVote = voteMessage('v2', 'B::0:1', 'B: max_create_echo_requests:1')

describe('merge vote attribution on equal addresses (#249/#346)', () => {
  it('counts local and peer votes separately', () => {
    const { counts, voters } = countVoteVariants(posterText, [mergePoster, localVote, peerVote])
    expect(counts).toEqual({ 'A: max_create_echo_requests:2': 1, 'B: max_create_echo_requests:1': 1 })
    expect(voters).toHaveLength(2)
  })

  it('does not treat the peer vote as our own', () => {
    const all = [mergePoster, localVote, peerVote]
    expect(myVoteVariantFor(mergePoster, all, ':0:1')).toBe('A: max_create_echo_requests:2')
    // The peer alone is not "our" vote.
    expect(myVoteVariantFor(mergePoster, [mergePoster, peerVote], ':0:1')).toBe('')
  })

  it('a peer retraction does not retract the local vote', () => {
    const peerRetract = voteMessage('v3', 'B::0:1', '')
    const all = [mergePoster, localVote, peerRetract]
    const { counts } = countVoteVariants(posterText, all)
    expect(counts).toEqual({ 'A: max_create_echo_requests:2': 1 })
    expect(myVoteVariantFor(mergePoster, all, ':0:1')).toBe('A: max_create_echo_requests:2')
  })

  it('shows the chunk contents and the A/B legend', () => {
    const wrapper = mount(VoteProtocolCard, {
      props: { msg: mergePoster, allMessages: [mergePoster, localVote, peerVote] },
      global: { plugins: [i18n, createPinia()] },
    })
    const text = wrapper.text()
    expect(text).toContain('Rule differences chunk 1/2')
    expect(text).toContain('A:0:0=2 vs B:0:0=1')
    expect(text).toContain('node that started the merge')
    expect(text).toContain('A: max_create_echo_requests:2')
    expect(text).toContain('B: max_create_echo_requests:1')
    expect(text).toContain('(1)')
  })

  it('does not invent a chunk title for phase posters', () => {
    const phasePoster = {
      ...mergePoster,
      message_id: 'phase2',
      data: JSON.stringify({
        proto: 'vote',
        type: 'poster',
        protocol: 'merge',
        from: ':0:0',
        message: 'Merge phase 2: merge::0:0_:0:0_1',
        variants: ['accept', 'reject'],
        protocol_data: {
          state_key: 'merge::0:0_:0:0_1',
          node1: ':0:0',
          node2: ':0:0',
          phase: 2,
          message: 'Accept the merge between A:0:0 and B:0:0 on the agreed terms?',
        },
      }),
    }
    const wrapper = mount(VoteProtocolCard, {
      props: { msg: phasePoster, allMessages: [phasePoster] },
      global: { plugins: [i18n, createPinia()] },
    })
    const text = wrapper.text()
    expect(text).toContain('Accept the merge between A:0:0 and B:0:0')
    expect(text).not.toContain('chunk 1/?')
    expect(text).not.toContain('Merge chunk 1')
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
})
