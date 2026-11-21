import { describe, it, expect, beforeEach } from 'vitest'
import { getVoteState } from '../../src/composables/useProtocolPhases'

function setParams(params) {
  localStorage.setItem('fm_policy_params', JSON.stringify(params))
}

function poster(phase) {
  return {
    timestamp: Math.floor(Date.now() / 1000),
    data: JSON.stringify({
      proto: 'vote',
      type: 'poster',
      protocol: 'merge',
      protocol_data: { phase, state_key: 'sk', chunk_index: phase === 1 ? 0 : undefined },
    }),
  }
}

describe('merge vote phases (#212)', () => {
  beforeEach(() => {
    localStorage.clear()
    setParams({
      voting_period: '30',
      merge_phase0_vote_period: '2',
      merge_phase1_vote_period: '3',
      merge_phase2_vote_period: '4',
    })
  })

  it('uses the period of the phase', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(getVoteState(poster(0)).votingEnd - now).toBeGreaterThan(2 * 86400 - 60)
    expect(getVoteState(poster(0)).votingEnd - now).toBeLessThan(2 * 86400 + 60)
    expect(getVoteState(poster(1)).votingEnd - now).toBeGreaterThan(3 * 86400 - 60)
    expect(getVoteState(poster(2)).votingEnd - now).toBeGreaterThan(4 * 86400 - 60)
  })

  it('prefers the frozen max vote_period from the poster (#257)', () => {
    const msg = poster(1)
    const data = JSON.parse(msg.data)
    data.protocol_data.vote_period = 7
    msg.data = JSON.stringify(data)
    const now = Math.floor(Date.now() / 1000)
    const state = getVoteState(msg)
    expect(state.votingEnd - now).toBeGreaterThan(7 * 86400 - 60)
    expect(state.votingEnd - now).toBeLessThan(7 * 86400 + 60)
  })

  it('honours vote_period = 0 (decide as soon as all nodes voted)', () => {
    const msg = poster(1)
    const data = JSON.parse(msg.data)
    data.protocol_data.vote_period = 0
    msg.data = JSON.stringify(data)
    expect(getVoteState(msg).phase).toBe('ended')
  })

  it('treats posters without a phase as chunk votes (phase 1)', () => {
    const msg = {
      timestamp: Math.floor(Date.now() / 1000),
      data: JSON.stringify({ proto: 'vote', type: 'poster', protocol: 'merge' }),
    }
    const now = Math.floor(Date.now() / 1000)
    const state = getVoteState(msg)
    expect(state.votingEnd - now).toBeGreaterThan(3 * 86400 - 60)
    expect(state.votingEnd - now).toBeLessThan(3 * 86400 + 60)
  })
})
