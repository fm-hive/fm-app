import { describe, it, expect, beforeEach } from 'vitest'
import { getElectionState, countElectionVotes, countVoteVariants, formatRemaining, formatDate, getVoteState, hasVoteResult } from '../../src/composables/useProtocolPhases'

function posterMsg(id, ts) {
  return {
    message_id: id,
    type: 'election',
    timestamp: ts,
    data: JSON.stringify({ proto: 'election', type: 'poster', from: ':' + id, to: 'all', echo: 'E' }),
  }
}

function electionVote(id, voter, to, ts) {
  return {
    message_id: id,
    type: 'election',
    timestamp: ts,
    sender_address: voter,
    data: JSON.stringify({ proto: 'election', type: 'vote', from: voter, to, echo: 'E' }),
  }
}

function voteMsg(id, voter, variant, poster, ts) {
  return {
    message_id: id,
    type: 'vote',
    timestamp: ts,
    sender_address: voter,
    data: JSON.stringify({ proto: 'vote', type: 'vote', from: voter, vote: variant, poster_message: poster, echo: 'E' }),
  }
}

describe('getElectionState', () => {
  beforeEach(() => {
    localStorage.setItem('fm_policy_params', JSON.stringify({
      candidate_collection_period: '3',
      voting_period: '15',
      min_candidates: '1',
    }))
  })

  it('anchors the collection period to the FIRST (oldest) candidate', () => {
    const now = Math.floor(Date.now() / 1000)
    const t1 = now - 4 * 86400
    const t2 = now - 3 * 86400
    const t3 = now - 2 * 86400
    const t4 = now - 1 * 86400
    // Stored/returned in a shuffled order; the oldest must win.
    const msgs = [posterMsg(1, t4), posterMsg(2, t1), posterMsg(3, t3), posterMsg(4, t2)]

    const state = getElectionState(msgs[0], msgs)

    expect(state.collectionEnd).toBe(t1 + 3 * 86400)
    // t1 + 3d is in the past -> voting (matches the backend's server-clock anchor).
    expect(state.phase).toBe('voting')
  })

  it('is in collection right after the first candidate posts', () => {
    const now = Math.floor(Date.now() / 1000)
    const t1 = now - 3600 // 1h ago
    const msgs = [posterMsg(1, t1), posterMsg(2, now - 1800)]

    const state = getElectionState(msgs[0], msgs)

    expect(state.collectionEnd).toBe(t1 + 3 * 86400)
    expect(state.phase).toBe('collection')
  })

  it('prefers the node-broadcast phase when provided', () => {
    const now = Math.floor(Date.now() / 1000)
    // Locally these posters would compute "collection" ...
    const msgs = [posterMsg(1, now - 3600), posterMsg(2, now - 1800)]
    // ... but the node (authoritative) says the election has ended.
    const nodePhase = { phase: 'ended', collectionEnd: now - 100, votingEnd: now - 50 }

    const state = getElectionState(msgs[0], msgs, nodePhase)

    expect(state.phase).toBe('ended')
    expect(state.collectionEnd).toBe(now - 100)
    expect(state.votingEnd).toBe(now - 50)
  })

  it('drops a retracted vote from candidateVotes', () => {
    const now = Math.floor(Date.now() / 1000)
    const msgs = [
      posterMsg(1, now - 3600),
      posterMsg(2, now - 1800),
      electionVote('v1', ':0:5', ':0:1', now - 100),
      electionVote('v2', ':0:5', '', now - 50), // retraction
    ]

    const state = getElectionState(msgs[0], msgs)

    expect(state.candidateVotes).toEqual({})
    expect(state.totalVotes).toBe(0)
  })
})

describe('countElectionVotes', () => {
  it('drops a voter who retracted their vote (empty `to`)', () => {
    const msgs = [
      electionVote('v1', ':0:5', ':0:1', 100),
      electionVote('v2', ':0:5', '', 101), // retraction
    ]
    const { candidateVotes, totalVotes } = countElectionVotes(msgs, 1)
    expect(candidateVotes).toEqual({})
    expect(totalVotes).toBe(0)
  })

  it('counts only the latest vote per voter when they change it', () => {
    const msgs = [
      electionVote('v1', ':0:5', ':0:1', 100),
      electionVote('v2', ':0:5', ':0:2', 101),
    ]
    const { candidateVotes } = countElectionVotes(msgs, 1)
    expect(candidateVotes).toEqual({ ':0:2': 1 })
  })

  it('respects maxModerators (a voter can pick several candidates)', () => {
    const msgs = [
      electionVote('v1', ':0:5', ':0:1', 100),
      electionVote('v2', ':0:5', ':0:2', 101),
    ]
    expect(countElectionVotes(msgs, 2).candidateVotes).toEqual({ ':0:1': 1, ':0:2': 1 })
    expect(countElectionVotes(msgs, 1).candidateVotes).toEqual({ ':0:2': 1 })
  })

  it('counts votes from different voters independently', () => {
    const msgs = [
      electionVote('v1', ':0:5', ':0:1', 100),
      electionVote('v2', ':0:6', ':0:1', 101),
      electionVote('v3', ':0:7', ':0:2', 102),
    ]
    const { candidateVotes, totalVotes } = countElectionVotes(msgs, 1)
    expect(candidateVotes).toEqual({ ':0:1': 2, ':0:2': 1 })
    expect(totalVotes).toBe(3)
  })
})

describe('countVoteVariants', () => {
  const poster = 'Q?'

  it('drops a voter who retracted their vote (empty `vote`)', () => {
    const msgs = [
      voteMsg('v1', ':0:5', 'yes', poster, 100),
      voteMsg('v2', ':0:5', '', poster, 101), // retraction
    ]
    const { counts, voters } = countVoteVariants(poster, msgs)
    expect(counts).toEqual({})
    expect(voters).toHaveLength(0)
  })

  it('counts only the latest vote per voter when they change it', () => {
    const msgs = [
      voteMsg('v1', ':0:5', 'yes', poster, 100),
      voteMsg('v2', ':0:5', 'no', poster, 101),
    ]
    const { counts } = countVoteVariants(poster, msgs)
    expect(counts).toEqual({ no: 1 })
  })

  it('counts votes from different voters and ignores other posters', () => {
    const msgs = [
      voteMsg('v1', ':0:5', 'yes', poster, 100),
      voteMsg('v2', ':0:6', 'yes', poster, 101),
      voteMsg('v3', ':0:7', 'no', poster, 102),
      voteMsg('v4', ':0:8', 'yes', 'other', 103),
    ]
    const { counts, voters } = countVoteVariants(poster, msgs)
    expect(counts).toEqual({ yes: 2, no: 1 })
    expect(voters).toHaveLength(3)
  })
})

describe('protocol time formatting', () => {
  it('shows the end time to the minute', () => {
    const formatted = formatDate(Date.UTC(2026, 8, 16, 12, 34, 0) / 1000)
    expect(formatted).toMatch(/16/) // day
    expect(formatted).toMatch(/\d{1,2}:\d{2}/) // hours:minutes
  })

  it('formats the remaining time with minutes', () => {
    expect(formatRemaining(2 * 86400 + 5 * 3600 + 30 * 60)).toBe('2d 5h 30m')
    expect(formatRemaining(5 * 3600 + 30 * 60)).toBe('5h 30m')
    expect(formatRemaining(30 * 60)).toBe('30m')
    expect(formatRemaining(0)).toBe('0m')
  })
})

describe('getVoteState periods', () => {
  function poster(protocol, ts) {
    return {
      message_id: 'p1',
      type: 'vote',
      timestamp: ts,
      data: JSON.stringify({ proto: 'vote', type: 'poster', protocol, message: 'q', variants: ['yes', 'no'] }),
    }
  }

  function setParams(params) {
    localStorage.setItem('fm_policy_params', JSON.stringify({
      voting_period: '10',
      change_policy_vote_period: '3',
      create_echo_with_rules_council_vote_period: '1',
      // Two-phase merge (#212): every phase has its own period.
      merge_phase0_vote_period: '2',
      merge_phase1_vote_period: '2',
      merge_phase2_vote_period: '2',
      ...params,
    }))
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('uses the protocol-specific periods', () => {
    const now = Math.floor(Date.now() / 1000)
    setParams({})
    expect(getVoteState(poster('change_policy', now)).votingEnd).toBe(now + 3 * 86400)
    expect(getVoteState(poster('create_echo', now)).votingEnd).toBe(now + 1 * 86400)
    expect(getVoteState(poster('merge', now)).votingEnd).toBe(now + 2 * 86400)
    expect(getVoteState(poster(undefined, now)).votingEnd).toBe(now + 10 * 86400)
  })

  it('falls back to the node defaults (1 day for merge phases) when a protocol period is missing', () => {
    const now = Math.floor(Date.now() / 1000)
    localStorage.setItem('fm_policy_params', JSON.stringify({ voting_period: '10' }))
    expect(getVoteState(poster('change_policy', now)).votingEnd).toBe(now + 3 * 86400)
    expect(getVoteState(poster('create_echo', now)).votingEnd).toBe(now + 3 * 86400)
    expect(getVoteState(poster('merge', now)).votingEnd).toBe(now + 1 * 86400)
    expect(getVoteState(poster(undefined, now)).votingEnd).toBe(now + 10 * 86400)
  })

  it('marks the phase by the period', () => {
    setParams({})
    const now = Math.floor(Date.now() / 1000)
    expect(getVoteState(poster('create_echo', now - 2 * 86400)).phase).toBe('ended')
    expect(getVoteState(poster('create_echo', now - 3600)).phase).toBe('voting')
  })

  it('returns null without policy parameters', () => {
    expect(getVoteState(poster('create_echo', Math.floor(Date.now() / 1000)))).toBe(null)
  })
})

describe('hasVoteResult (#252)', () => {
  const poster = {
    message_id: 'p1',
    type: 'vote',
    timestamp: 1000,
    data: JSON.stringify({ proto: 'vote', type: 'poster', message: 'Tea or coffee?', variants: ['tea', 'coffee'] }),
  }
  const result = (extra = {}) => ({
    message_id: 'r1',
    type: 'vote',
    timestamp: 2000,
    data: JSON.stringify({ proto: 'vote', type: 'result', result: 'success', variant: 'tea', ...extra }),
  })

  it('matches a result by poster text', () => {
    expect(hasVoteResult(poster, [poster, result({ poster_message: 'Tea or coffee?' })])).toBe(true)
  })

  it('matches a result by original message id', () => {
    expect(hasVoteResult(poster, [poster, result({ originalMessageId: 'p1' })])).toBe(true)
  })

  it('is false without a result and for non-posters', () => {
    expect(hasVoteResult(poster, [poster])).toBe(false)
    expect(hasVoteResult(result(), [poster, result()])).toBe(false)
    expect(hasVoteResult(null, [poster])).toBe(false)
  })

  it('ignores results of other posters', () => {
    expect(hasVoteResult(poster, [result({ poster_message: 'Other question?' })])).toBe(false)
  })
})
