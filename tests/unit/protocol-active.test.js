import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProtocolStore } from '../../src/stores/protocol'
import { ACTIVITY_CRITERIA } from '../../src/config/protocol'

const now = () => Math.floor(Date.now() / 1000)

function chunkCarrier(id, ts) {
  return {
    message_id: id,
    type: 'change_policy',
    echo_name: 'E',
    timestamp: ts,
    data: JSON.stringify({ proto: 'change_policy', chunk_index: 0, state_key: 'sk', message: 'chunk 1/8' }),
  }
}

function chunkVotePoster(id, ts) {
  return {
    message_id: id,
    type: 'vote',
    echo_name: 'E',
    timestamp: ts,
    data: JSON.stringify({ proto: 'vote', type: 'poster', protocol: 'change_policy', message: `chunk ${id}` }),
  }
}

describe('ACTIVITY_CRITERIA.change_policy', () => {
  it('ignores internal change_policy chunk carriers', () => {
    const msg = chunkCarrier('c0', now())
    expect(ACTIVITY_CRITERIA.change_policy(msg, [msg])).toBe(false)
  })

  it('keeps recent non-chunk change_policy messages', () => {
    const msg = {
      message_id: 'c1', type: 'change_policy', timestamp: now(),
      data: JSON.stringify({ proto: 'change_policy', subject: 'proposal' }),
    }
    expect(ACTIVITY_CRITERIA.change_policy(msg, [msg])).toBe(true)
  })

  it('keeps change_policy chunk vote posters active', () => {
    const poster = chunkVotePoster('v0', now())
    expect(ACTIVITY_CRITERIA.vote(poster, [poster])).toBe(true)
  })
})

describe('protocol store active protocols', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('returns every active protocol (no cap)', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = Array.from({ length: 8 }, (_, i) => chunkVotePoster(`v${i}`, ts))
    expect(store.getActiveByEcho('E')).toHaveLength(8)
  })

  it('does not count change_policy chunk carriers as active protocols', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = [chunkCarrier('c0', ts), chunkVotePoster('v0', ts)]
    const active = store.getActiveByEcho('E')
    expect(active.map(m => m.message_id)).toEqual(['v0'])
  })
})

function electionPoster(id, from, ts) {
  return {
    message_id: id,
    type: 'election',
    echo_name: 'E',
    timestamp: ts,
    data: JSON.stringify({ proto: 'election', type: 'poster', from, message: `candidate ${from}` }),
  }
}

function chunkPosterWithData(id, ts, stateKey, chunkIndex, totalChunks) {
  return {
    message_id: id,
    type: 'vote',
    echo_name: 'E',
    timestamp: ts,
    data: JSON.stringify({
      proto: 'vote', type: 'poster', protocol: 'change_policy', message: `vote on chunk ${chunkIndex}`,
      protocol_data: { proposer: ':0:0', state_key: stateKey, chunk_index: chunkIndex, total_chunks: totalChunks, subject: 'policy' },
    }),
  }
}

function carrierWithData(id, ts, stateKey, chunkIndex, text) {
  return {
    message_id: id,
    type: 'change_policy',
    echo_name: 'E',
    timestamp: ts,
    data: JSON.stringify({ proto: 'change_policy', chunk_index: chunkIndex, message: text, metadata: { state_key: stateKey } }),
  }
}

describe('protocol store change_policy chunk grouping', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('groups chunk posters of one proposal into a single card with the chunk list', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = [
      carrierWithData('c0', ts, 'sk1', 0, 'diff 0'),
      carrierWithData('c1', ts, 'sk1', 1, 'diff 1'),
      chunkPosterWithData('v0', ts, 'sk1', 0, 2),
      chunkPosterWithData('v1', ts, 'sk1', 1, 2),
    ]

    const protocols = store.getActiveProtocols('E')
    expect(protocols).toHaveLength(1)
    const card = protocols[0]
    expect(card._changePolicy).toBe(true)
    expect(card._stateKey).toBe('sk1')
    expect(card._chunks.map(c => c.chunkIndex)).toEqual([0, 1])
    expect(card._chunks.map(c => c.poster.message_id)).toEqual(['v0', 'v1'])
    expect(card._chunks.map(c => c.text)).toEqual(['diff 0', 'diff 1'])
  })

  it('keeps different proposals in different cards', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = [
      chunkPosterWithData('v0', ts, 'sk1', 0, 1),
      chunkPosterWithData('v1', ts, 'sk2', 0, 1),
    ]

    const protocols = store.getActiveProtocols('E')
    expect(protocols).toHaveLength(2)
    expect(protocols.map(p => p._stateKey).sort()).toEqual(['sk1', 'sk2'])
  })
})

describe('protocol store getActiveProtocols', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('merges election posters into one protocol card', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = [
      electionPoster('p1', ':0:1', ts - 2),
      electionPoster('p2', ':0:2', ts - 1),
      electionPoster('p3', ':0:3', ts),
      chunkVotePoster('v1', ts),
      chunkVotePoster('v2', ts),
    ]

    const protocols = store.getActiveProtocols('E')
    // 1 election (3 posters merged) + 2 votes = 3 protocols, not 5 messages.
    expect(protocols).toHaveLength(3)

    const election = protocols.find(m => m.type === 'election')
    expect(election._merged).toBe(true)
    expect(election._posterCount).toBe(3)
    // The merged card is based on the FIRST (oldest) poster.
    expect(election.message_id).toBe('p1')
  })

  it('drops internal chunk carriers and non-poster election votes', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = [
      chunkCarrier('c0', ts),
      chunkVotePoster('v0', ts),
      {
        message_id: 'ev1', type: 'election', echo_name: 'E', timestamp: ts,
        data: JSON.stringify({ proto: 'election', type: 'vote', from: ':0:9', to: ':0:1' }),
      },
    ]
    const protocols = store.getActiveProtocols('E')
    expect(protocols.map(m => m.message_id)).toEqual(['v0'])
  })

  it('excludes hidden and cancelled protocols (and persists them)', () => {
    const store = useProtocolStore()
    const ts = now()
    store.messages = [chunkVotePoster('v1', ts), chunkVotePoster('v2', ts)]

    store.hideProtocol('v1')
    store.cancelProtocol('v2')

    expect(store.getActiveProtocols('E')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('fm_hidden_messages'))).toEqual({ v1: true })
    expect(JSON.parse(localStorage.getItem('fm_cancelled_messages'))).toEqual({ v2: true })
  })

  it('clearAll resets hidden/cancelled protocols', async () => {
    const store = useProtocolStore()
    store.hideProtocol('v1')
    store.cancelProtocol('v2')
    await store.clearAll()
    expect(store.hiddenProtocols).toEqual({})
    expect(store.cancelledProtocols).toEqual({})
    expect(localStorage.getItem('fm_hidden_messages')).toBeNull()
  })
})

describe('protocol store hides ended protocols (#262)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function plainVotePoster(id, ts) {
    return {
      message_id: id,
      type: 'vote',
      echo_name: 'E',
      timestamp: ts,
      data: JSON.stringify({ proto: 'vote', type: 'poster', message: 'Q ' + id, variants: ['yes', 'no'] }),
    }
  }

  it('hides a vote poster whose voting period is over', () => {
    localStorage.setItem('fm_policy_params', JSON.stringify({ voting_period: '1' }))
    const store = useProtocolStore()
    const now = Math.floor(Date.now() / 1000)
    store.messages = [
      plainVotePoster('old', now - 2 * 86400),
      plainVotePoster('fresh', now - 100),
    ]
    const ids = store.getActiveProtocols('E').map(m => m.message_id)
    expect(ids).toContain('fresh')
    expect(ids).not.toContain('old')
  })

  it('hides a change_policy group when every chunk ended and keeps an active one', () => {
    localStorage.setItem('fm_policy_params', JSON.stringify({ change_policy_vote_period: '1' }))
    const store = useProtocolStore()
    const now = Math.floor(Date.now() / 1000)
    store.messages = [
      chunkPosterWithData('c0', now - 2 * 86400, 'sk1', 0, 2),
      chunkPosterWithData('c1', now - 2 * 86400, 'sk1', 1, 2),
      chunkPosterWithData('c2', now - 100, 'sk2', 0, 1),
    ]
    const cards = store.getActiveProtocols('E').filter(m => m._changePolicy)
    expect(cards).toHaveLength(1)
    expect(cards[0]._stateKey).toBe('sk2')
  })
})
