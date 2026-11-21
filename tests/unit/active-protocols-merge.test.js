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
const stateKey = 'merge::0:0_:0:0_1'

function mergeCarrier(id, data) {
  return {
    message_id: id,
    type: 'merge',
    echo_name: 'E',
    sender_address: ':0:0',
    timestamp: now,
    data: JSON.stringify({ proto: 'merge', ...data }),
  }
}

function mergePoster(id, data) {
  const key = data.stateKey || stateKey
  return {
    message_id: id,
    type: 'vote',
    echo_name: 'E',
    sender_address: ':0:0',
    timestamp: now,
    data: JSON.stringify({
      proto: 'vote',
      type: 'poster',
      protocol: 'merge',
      message: data.message,
      variants: data.variants || ['A: x:1', 'B: x:2'],
      protocol_data: { state_key: key, node1: ':0:0', node2: ':0:0', ...data.protocol_data },
    }),
  }
}

function chunkPoster(id, idx, total, key = stateKey) {
  return mergePoster(id, {
    message: `Merge chunk ${idx + 1}/${total}`,
    stateKey: key,
    variants: ['A: max_message_size:1048576', 'B: max_message_size:2097152'],
    protocol_data: {
      chunk_index: idx,
      total_chunks: total,
      subject: `Merge nets A:0:0 and B:0:0 (${idx + 1}/${total})`,
      message: `Rule differences chunk ${idx + 1}/${total}: max_message_size: A:0:0=1048576 vs B:0:0=2097152`,
    },
  })
}

function fixtures() {
  return [
    mergeCarrier('started', { type: 'started', state_key: stateKey, node1: ':0:0', node2: ':0:0', message: 'Merge with B:0:0: phase 0 skipped' }),
    mergeCarrier('exchange', { type: '', state_key: stateKey, node1: ':0:0', node2: ':0:0', message: 'Merge exchange between A:0:0 and B:0:0' }),
    mergeCarrier('nodelist', { type: 'nodelist', state_key: stateKey, message: `Merge nodelists for ${stateKey}` }),
    chunkPoster('c1', 1, 2),
    chunkPoster('c0', 0, 2),
    mergePoster('phase2', {
      message: 'Merge phase 2: ' + stateKey,
      variants: ['accept', 'reject'],
      protocol_data: { phase: 2, message: 'Accept the merge between A:0:0 and B:0:0 on the agreed terms?' },
    }),
    // A finished session must not appear in the active list at all.
    mergeCarrier('done-result', { type: 'result', state_key: 'merge:done', result: 'merged', message: 'Merged A:0:0 and B:0:0' }),
    chunkPoster('done-c0', 0, 1, 'merge:done'),
  ]
}

describe('ActiveProtocolsList merge card grouping (#348)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    useIdentityStore().user = { address: ':0:1' }
    localStorage.setItem('fm_policy_params', JSON.stringify({
      voting_period: '10',
      merge_phase0_vote_period: '1',
      merge_phase1_vote_period: '1',
      merge_phase2_vote_period: '1',
    }))
  })

  function useFixtures(extra = []) {
    const store = useProtocolStore()
    // The finished session shares the same echo.
    const done = fixtures().filter(m => m.message_id.startsWith('done-'))
    const base = fixtures().filter(m => !m.message_id.startsWith('done-'))
    store.messages = [...base, ...done, ...extra]
    return store
  }

  it('groups carriers and chunk/phase votes into one card', () => {
    const store = useFixtures()
    const cards = store.getActiveProtocols('E')
    expect(cards).toHaveLength(1)
    const card = cards[0]
    expect(card._merge).toBe(true)
    expect(card._stateKey).toBe(stateKey)
    expect(card._chunks.map(c => c.chunkIndex)).toEqual([0, 1])
    expect(card._stages.map(s => s.phase)).toEqual([2])
    expect(card._node1).toBe(':0:0')
    expect(card._node2).toBe(':0:0')
  })

  it('renders chunk badges with tooltips and expands the vote card on click', async () => {
    useFixtures()
    const wrapper = mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
    await new Promise(r => setTimeout(r, 0))

    const text = wrapper.text()
    expect(text).toContain('Merge')
    expect(text).toContain('A: :0:0 ↔ B: :0:0')
    expect(text).toContain('Chunks: 2')
    // Chunk details live in the native tooltip, not in the panel text.
    expect(text).not.toContain('max_message_size')

    const badges = wrapper.findAll('button').filter(b => /\b(Chunk|Phase)\b/.test(b.attributes('title') || ''))
    expect(badges).toHaveLength(3) // 2 chunks + phase 2
    const chunk1 = badges.find(b => b.attributes('title').includes('Chunk 1/2'))
    const chunk2 = badges.find(b => b.attributes('title').includes('Chunk 2/2'))
    const phase = badges.find(b => b.attributes('title').includes('Phase 2'))
    expect(chunk1).toBeTruthy()
    expect(chunk2).toBeTruthy()
    expect(phase).toBeTruthy()
    expect(chunk1.attributes('title')).toContain('max_message_size')
    expect(phase.attributes('title')).toContain('Accept the merge between A:0:0 and B:0:0')
    expect(chunk1.text()).toBe('1')
    expect(chunk2.text()).toBe('2')
    expect(phase.text()).toBe('P2')

    // A click shows the full message and the voting buttons.
    await chunk1.trigger('click')
    expect(wrapper.text()).toContain('max_message_size')
    expect(wrapper.text()).toContain('A: max_message_size:1048576')
    expect(wrapper.text()).toContain('B: max_message_size:2097152')
    expect(chunk1.classes().join(' ')).toContain('bg-blue-600')

    // Internal carriers are folded into the card, not listed separately.
    expect(text).not.toContain('Merge nodelists')
    expect(text).not.toContain('Merge exchange between')
    expect(text).not.toContain('phase 0 skipped')
    // The finished session is not shown.
    expect(text).not.toContain('Merged A:0:0 and B:0:0')
  })

  it('shows both A/B policies from the phase-0 poster (#257)', async () => {
    const p0 = mergePoster('phase0', {
      message: 'Merge phase 0: ' + stateKey,
      variants: ['accept', 'reject'],
      protocol_data: {
        phase: 0,
        vote_period: 7,
        policy1: { text: 'A network policy text', parameters: { max_message_size: '1048576' } },
        policy2: { text: 'B network policy text', parameters: { max_message_size: '2097152' } },
      },
    })
    const store = useFixtures([p0])
    const card = store.getActiveProtocols('E')[0]
    expect(card._policy1.text).toBe('A network policy text')
    expect(card._policy2.text).toBe('B network policy text')

    const wrapper = mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
    await new Promise(r => setTimeout(r, 0))
    const text = wrapper.text()
    expect(text).toContain('Merge policies (A and B)')
    expect(text).toContain('A network policy text')
    expect(text).toContain('B network policy text')
    expect(text).toContain('max_message_size')
    expect(text).toContain('1048576')
    expect(text).toContain('2097152')
  })

  it('keeps all chunk badges after individual chunk votes ended', async () => {
    const store = useFixtures()
    store.messages.push(
      {
        message_id: 'r1',
        type: 'vote',
        echo_name: 'E',
        sender_address: ':0:0',
        timestamp: now + 10,
        data: JSON.stringify({
          proto: 'vote', type: 'result', result: 'success', variant: 'A: max_message_size:1048576',
          protocol: 'merge', poster_message: 'Merge chunk 1/2',
          protocol_data: { state_key: stateKey, chunk_index: 0 },
        }),
      },
      {
        message_id: 'r2',
        type: 'vote',
        echo_name: 'E',
        sender_address: ':0:0',
        timestamp: now + 10,
        data: JSON.stringify({
          proto: 'vote', type: 'result', result: 'success', variant: 'A: max_message_size:1048576',
          protocol: 'merge', poster_message: 'Merge chunk 2/2',
          protocol_data: { state_key: stateKey, chunk_index: 1 },
        }),
      },
    )
    const cards = store.getActiveProtocols('E')
    expect(cards).toHaveLength(1)
    expect(cards[0]._chunks).toHaveLength(2)
    expect(cards[0]._stages).toHaveLength(1)

    const wrapper = mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
    await new Promise(r => setTimeout(r, 0))
    const badges = wrapper.findAll('button').filter(b => /\b(Chunk|Phase)\b/.test(b.attributes('title') || ''))
    expect(badges).toHaveLength(3)
    wrapper.unmount()
  })

  it('hides an active merge card with the header button (#356)', async () => {
    const store = useFixtures()
    const wrapper = mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
    await new Promise(r => setTimeout(r, 0))
    const hide = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Hide')
    expect(hide).toBeTruthy()
    await hide.trigger('click')
    expect(store.getActiveProtocols('E').some(c => c._merge)).toBe(false)
    wrapper.unmount()
  })

  it('keeps a merge poster without state_key as a plain card', () => {
    const store = useFixtures()
    store.messages.push({
      ...mergePoster('ungrouped', { message: 'Legacy merge chunk' }),
      data: JSON.stringify({
        proto: 'vote', type: 'poster', protocol: 'merge', message: 'Legacy merge chunk',
        variants: ['A: x:1', 'B: x:2'], protocol_data: {},
      }),
    })
    const cards = store.getActiveProtocols('E')
    expect(cards.some(c => c.message_id === 'ungrouped' && !c._merge)).toBe(true)
  })
})

describe('merge foreign network details (#361)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    useIdentityStore().user = { address: ':0:2' }
    localStorage.setItem('fm_policy_params', JSON.stringify({
      voting_period: '10',
      merge_phase0_vote_period: '1',
      merge_phase1_vote_period: '1',
      merge_phase2_vote_period: '1',
    }))
  })

  it('shows only the peer policy and nodelist when the local node is side A', async () => {
    const key = 'merge-361'
    const carrier = mergeCarrier('exchange-361', {
      type: '',
      state_key: key,
      node1: ':0:0',
      node2: ':0:1',
      policy1: { text: 'Our network policy', parameters: { own: '1' } },
      policy2: { text: 'Peer network policy', parameters: { peer: '1' } },
      nodelist1: [':0:0'],
      nodelist2: [':0:1'],
      nodelist2_info: [{
        address: ':0:1',
        name: 'Peer admin',
        clients: [{ address: ':0:1:1', name: 'Peer user' }],
      }],
    })
    const poster = mergePoster('phase2-361', {
      message: 'Merge phase 2: ' + key,
      variants: ['accept', 'reject'],
      protocol_data: { state_key: key, phase: 2, node1: ':0:0', node2: ':0:1' },
    })
    const store = useProtocolStore()
    store.messages = [carrier, poster]

    const wrapper = mount(ActiveProtocolsList, { props: { echoName: 'E' }, global: { plugins: [i18n] } })
    await new Promise(r => setTimeout(r, 0))
    const text = wrapper.text()
    expect(text).toContain('Peer network policy')
    expect(text).not.toContain('Our network policy')
    expect(text).toContain('Foreign network nodelist')
    expect(text).toContain(':0:1')
    expect(text).toContain('Peer admin')
    expect(text).toContain('Peer user')
    expect(text).not.toContain(':0:0 ·')
  })
})
