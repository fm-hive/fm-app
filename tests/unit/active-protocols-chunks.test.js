import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import ActiveProtocolsList from '../../src/components/ActiveProtocolsList.vue'
import { useProtocolStore } from '../../src/stores/protocol'
import { useIdentityStore } from '../../src/stores/identity'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const now = Math.floor(Date.now() / 1000)

function chunkPoster(id, ts, stateKey, idx, total) {
  return {
    message_id: id,
    type: 'vote',
    echo_name: 'E',
    sender_address: ':0:0',
    timestamp: ts,
    data: JSON.stringify({
      proto: 'vote',
      type: 'poster',
      protocol: 'change_policy',
      message: `chunk ${idx}`,
      variants: ['accept', 'reject'],
      protocol_data: {
        proposer: ':0:0',
        state_key: stateKey,
        chunk_index: idx,
        total_chunks: total,
        subject: `Policy ${idx + 1}`,
      },
    }),
  }
}

function chunkVote(id, voter, variant, posterText) {
  return {
    message_id: id,
    type: 'vote',
    echo_name: 'E',
    sender_address: voter,
    timestamp: now,
    data: JSON.stringify({ proto: 'vote', type: 'vote', vote: variant, poster_message: posterText }),
  }
}

describe('ActiveProtocolsList change_policy chunk list (#251)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    useIdentityStore().user = { address: ':0:28' }
    // One-day policy vote period: chunk 0 is over, chunk 1 is still open.
    localStorage.setItem('fm_policy_params', JSON.stringify({ voting_period: '10', change_policy_vote_period: '1' }))
  })

  function mountList(extra = []) {
    const store = useProtocolStore()
    store.messages = [
      chunkPoster('c0', now - 2 * 86400, 'sk', 0, 2),
      chunkPoster('c1', now - 3600, 'sk', 1, 2),
      chunkVote('v0', ':0:2', 'accept', 'chunk 0'),
      chunkVote('v1', ':0:2', 'reject', 'chunk 1'),
      ...extra,
    ]
    return mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
  }

  it('shows end time, votes and the own vote per chunk without expanding', async () => {
    // The own vote is only shown once the node delivered it back as a message.
    const wrapper = mountList([chunkVote('v2', ':0:28', 'accept', 'chunk 0')])
    await new Promise(r => setTimeout(r, 0))

    const text = wrapper.text()
    expect(text).toContain('Chunk 1/2')
    expect(text).toContain('Chunk 2/2')
    // Status per chunk: the first one ended, the second is still open.
    expect(text).toContain('Ended')
    expect(text).toContain('Voting open')
    // Vote tallies per chunk (the own vote counts too).
    expect(text).toContain('accept: 2')
    expect(text).toContain('reject: 1')
    // Own vote marker without clicking the chunk.
    expect(text).toContain('✓ accept')
    // The vote card is not expanded yet.
    expect(text).not.toContain('All votes')
  })

  it('hides a grouped change_policy card from the header (#356)', async () => {
    const store = useProtocolStore()
    store.messages = [
      chunkPoster('c0', now - 3600, 'sk-hide', 0, 2),
      chunkPoster('c1', now - 3600, 'sk-hide', 1, 2),
    ]
    const wrapper = mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
    await new Promise(r => setTimeout(r, 0))
    const hide = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Hide')
    expect(hide).toBeTruthy()
    await hide.trigger('click')
    expect(store.getActiveProtocols('E').filter(m => m._changePolicy)).toHaveLength(0)
    wrapper.unmount()
  })

  it('does not mark a vote that the node has not delivered back', async () => {
    // Pending local selection only — no vote message in the store.
    const wrapper = mountList()
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.text()).not.toContain('✓')
    expect(wrapper.text()).toContain('accept: 1')
  })

  it('hides the own vote after a delivered retraction', async () => {
    const poster = {
      message_id: 'p1',
      type: 'vote',
      echo_name: 'E',
      sender_address: ':0:1',
      timestamp: now - 3600,
      data: JSON.stringify({ proto: 'vote', type: 'poster', from: ':0:1', message: 'Tea or coffee?', variants: ['tea', 'coffee'] }),
    }
    const withVote = mountList([poster, chunkVote('own1', ':0:28', 'tea', 'Tea or coffee?')])
    await new Promise(r => setTimeout(r, 0))
    expect(withVote.text()).toContain('Retract vote')

    withVote.unmount()
    const retracted = mountList([
      poster,
      chunkVote('own1', ':0:28', 'tea', 'Tea or coffee?'),
      chunkVote('own2', ':0:28', '', 'Tea or coffee?'),
    ])
    await new Promise(r => setTimeout(r, 0))
    expect(retracted.text()).not.toContain('Retract vote')
  })

  it('expands the vote card for a chunk on click', async () => {
    const wrapper = mountList()
    await new Promise(r => setTimeout(r, 0))

    const chunkButton = wrapper.findAll('button').find(b => b.text().includes('Chunk 2/2'))
    expect(chunkButton).toBeTruthy()
    await chunkButton.trigger('click')

    expect(wrapper.text()).toContain('All votes')
  })
})
