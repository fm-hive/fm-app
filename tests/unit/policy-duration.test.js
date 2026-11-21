import { describe, it, expect, beforeEach } from 'vitest'
import {
  parsePolicyDurationSeconds,
  policyDurationSeconds,
  getVoteState,
  getElectionState,
  getExcommunicateState,
} from '../../src/composables/useProtocolPhases'

const now = () => Math.floor(Date.now() / 1000)

function votePoster(protocol, ts, protocolData = {}) {
  return {
    message_id: 'p1', type: 'vote', timestamp: ts,
    data: JSON.stringify({
      proto: 'vote', type: 'poster', protocol, message: 'q', variants: ['yes', 'no'],
      protocol_data: protocolData,
    }),
  }
}

describe('policy durations', () => {
  beforeEach(() => localStorage.clear())

  it('parses plain days, fractional days, hours, minutes and compounds', () => {
    expect(parsePolicyDurationSeconds('3')).toBe(3 * 86400)
    expect(parsePolicyDurationSeconds('0.5')).toBe(12 * 3600)
    expect(parsePolicyDurationSeconds('0.5d')).toBe(12 * 3600)
    expect(parsePolicyDurationSeconds('12h')).toBe(12 * 3600)
    expect(parsePolicyDurationSeconds('30m')).toBe(30 * 60)
    expect(parsePolicyDurationSeconds('1d12h')).toBe(36 * 3600)
    expect(parsePolicyDurationSeconds('1.5h30m')).toBe(2 * 3600)
    expect(parsePolicyDurationSeconds('0')).toBe(0)
    expect(parsePolicyDurationSeconds('bad')).toBeNull()
    expect(parsePolicyDurationSeconds('-1h')).toBeNull()
    expect(policyDurationSeconds('bad', 2)).toBe(2 * 86400)
  })

  it('uses duration strings for generic and protocol-specific votes', () => {
    localStorage.setItem('fm_policy_params', JSON.stringify({
      voting_period: '0.5d',
      change_policy_vote_period: '12h',
      appeal_vote_period: '1d12h',
      create_echo_with_rules_council_vote_period: '90m',
    }))
    const ts = now()
    expect(getVoteState(votePoster(undefined, ts)).votingEnd).toBe(ts + 12 * 3600)
    expect(getVoteState(votePoster('change_policy', ts)).votingEnd).toBe(ts + 12 * 3600)
    expect(getVoteState(votePoster('appeal', ts)).votingEnd).toBe(ts + 36 * 3600)
    expect(getVoteState(votePoster('create_echo', ts)).votingEnd).toBe(ts + 90 * 60)
  })

  it('keeps the node fallback for zero change_policy/create_echo periods', () => {
    localStorage.setItem('fm_policy_params', JSON.stringify({
      change_policy_vote_period: '0',
      create_echo_with_rules_council_vote_period: '0',
    }))
    const ts = now()
    expect(getVoteState(votePoster('change_policy', ts)).votingEnd).toBe(ts + 3 * 86400)
    expect(getVoteState(votePoster('create_echo', ts)).votingEnd).toBe(ts + 3 * 86400)
  })

  it('reads a frozen merge period string and keeps numeric legacy days', () => {
    localStorage.setItem('fm_policy_params', JSON.stringify({ merge_phase1_vote_period: '2d' }))
    const ts = now()
    expect(getVoteState(votePoster('merge', ts, { phase: 1, vote_period: '12h' })).votingEnd)
      .toBe(ts + 12 * 3600)
    expect(getVoteState(votePoster('merge', ts, { phase: 1, vote_period: 7 })).votingEnd)
      .toBe(ts + 7 * 86400)
  })

  it('uses durations for election phases and excommunicate voting', () => {
    localStorage.setItem('fm_policy_params', JSON.stringify({
      candidate_collection_period: '12h', voting_period: '0.5d', min_candidates: '1',
    }))
    const ts = now() - 3600
    const poster = {
      message_id: 'e1', type: 'election', timestamp: ts,
      data: JSON.stringify({ proto: 'election', type: 'poster', from: ':0:1', echo: 'E' }),
    }
    const state = getElectionState(poster, [poster])
    expect(state.collectionEnd).toBe(ts + 12 * 3600)
    expect(state.votingEnd).toBe(ts + 24 * 3600)

    const ex = {
      message_id: 'x1', type: 'excommunicate', timestamp: ts,
      data: JSON.stringify({ proto: 'excommunicate', type: 'poster', message: 'q', variants: ['excommunicate', 'read-only'] }),
    }
    expect(getExcommunicateState(ex, [ex]).votingEnd).toBe(ts + 12 * 3600)
  })
})
