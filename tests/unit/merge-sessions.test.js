import { describe, it, expect } from 'vitest'
import { buildMergeSessions } from '../../src/utils/mergeSessions'

const sk = 'merge::0:0_:9:9:0_123'

function msg(type, data) {
  return { type, data: JSON.stringify(data) }
}

function votePoster(extra) {
  return msg('vote', {
    proto: 'vote',
    type: 'poster',
    protocol: 'merge',
    message: `Merge phase 0: ${sk}`,
    protocol_data: { state_key: sk, node1: ':0:0', node2: ':9:9:0', phase: 0, ...extra },
  })
}

function vote(voteValue, posterRef) {
  return msg('vote', {
    proto: 'vote',
    type: 'vote',
    protocol: 'merge',
    vote: voteValue,
    poster_message: posterRef,
    protocol_data: { state_key: sk },
  })
}

describe('buildMergeSessions (#212)', () => {
  it('folds a phase-0 poster into one session', () => {
    const sessions = buildMergeSessions([votePoster()])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ stateKey: sk, phase: 0, target: ':9:9:0', accept: 0, reject: 0, result: '' })
  })

  it('counts only votes referencing the session poster', () => {
    const sessions = buildMergeSessions([
      votePoster(),
      vote('accept', `Merge phase 0: ${sk}`),
      vote('reject', `Merge phase 0: ${sk}`),
      vote('accept', 'Merge phase 0: merge::0:0_:9:9:1_999'),
    ])
    expect(sessions[0].accept).toBe(1)
    expect(sessions[0].reject).toBe(1)
  })

  it('tracks chunk posters and winners (phase 1)', () => {
    const sessions = buildMergeSessions([
      votePoster(),
      msg('vote', {
        proto: 'vote', type: 'poster', protocol: 'merge',
        message: `Merge chunk 1/2: subject`,
        protocol_data: { state_key: sk, node2: ':9:9:0', chunk_index: 0, total_chunks: 2 },
      }),
      msg('vote', {
        proto: 'vote', type: 'result', protocol: 'merge', variant: 'accept',
        protocol_data: { state_key: sk, chunk_index: 0 },
      }),
    ])
    expect(sessions[0].phase).toBe(1)
    expect(sessions[0].chunks).toEqual([{ index: 0, winner: 'accept' }])
  })

  it('shows the target from a "started" record of a single-node merge (#247)', () => {
    const sessions = buildMergeSessions([
      msg('merge', {
        proto: 'merge',
        type: 'started',
        state_key: sk,
        node1: ':0:0',
        node2: ':9:9:0',
        message: 'Merge with :9:9:0: phase 0 skipped (single-node network)',
      }),
    ])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ stateKey: sk, phase: 0, target: ':9:9:0', result: '' })
  })

  it('shows the final result of the session', () => {
    const sessions = buildMergeSessions([
      votePoster(),
      msg('merge', { proto: 'merge', type: 'result', result: 'fail', state_key: sk }),
    ])
    expect(sessions[0].result).toBe('failed')

    const merged = buildMergeSessions([
      votePoster(),
      msg('merge', { proto: 'merge', type: 'result', result: 'merged', state_key: sk }),
    ])
    expect(merged[0].result).toBe('merged')
  })

  it('ignores unrelated messages and non-merge protocols', () => {
    const sessions = buildMergeSessions([
      msg('vote', { proto: 'vote', type: 'poster', message: 'other' }),
      msg('echomail', { state_key: 'x' }),
    ])
    expect(sessions).toHaveLength(0)
  })
})
