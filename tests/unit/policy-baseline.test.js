import { describe, it, expect, beforeEach } from 'vitest'
import {
  samePolicyId,
  readStoredPolicy,
  rememberPreviousPolicy,
  selectPreviousPolicy,
} from '../../src/utils/policyBaseline'

const policy = (id, text = 'body') => ({ id, policy: { text, parameters: {} } })

describe('samePolicyId', () => {
  it('is false when either id is missing', () => {
    expect(samePolicyId(null, policy('1'))).toBe(false)
    expect(samePolicyId({}, {})).toBe(false)
  })

  it('compares ids', () => {
    expect(samePolicyId(policy('1'), policy('1'))).toBe(true)
    expect(samePolicyId(policy('1'), policy('2'))).toBe(false)
  })
})

describe('rememberPreviousPolicy', () => {
  beforeEach(() => localStorage.clear())

  it('stores the cached dirty policy as fm_policy_prev', () => {
    localStorage.setItem('fm_policy_full', JSON.stringify(policy('old')))
    rememberPreviousPolicy(policy('new'))
    expect(readStoredPolicy('fm_policy_prev')).toEqual(policy('old'))
  })

  it('keeps the existing baseline when the cached policy equals the current one', () => {
    localStorage.setItem('fm_policy_prev', JSON.stringify(policy('older')))
    localStorage.setItem('fm_policy_full', JSON.stringify(policy('current')))
    // Second fetch of the same current policy must not clobber the baseline.
    rememberPreviousPolicy(policy('current'))
    expect(readStoredPolicy('fm_policy_prev')).toEqual(policy('older'))
  })

  it('does nothing without an id', () => {
    localStorage.setItem('fm_policy_full', JSON.stringify(policy('old')))
    rememberPreviousPolicy({ policy: { text: 'x' } })
    expect(localStorage.getItem('fm_policy_prev')).toBe(null)
  })
})

describe('selectPreviousPolicy', () => {
  beforeEach(() => localStorage.clear())

  it('prefers the accepted policy when the node key matches', () => {
    const accepted = { nodeKey: 'k1', payload: policy('a') }
    const prev = policy('b')
    expect(selectPreviousPolicy({ accepted, prev, nodeKey: 'k1', currentPolicy: policy('c') })).toEqual(policy('a'))
  })

  it('ignores an accepted policy from another node and falls back to prev', () => {
    const accepted = { nodeKey: 'other', payload: policy('a') }
    const prev = policy('b')
    expect(selectPreviousPolicy({ accepted, prev, nodeKey: 'k1', currentPolicy: policy('c') })).toEqual(policy('b'))
  })

  it('never returns a baseline equal to the current policy', () => {
    expect(selectPreviousPolicy({ prev: policy('same'), currentPolicy: policy('same') })).toBe(null)
  })

  it('returns null when there is nothing to compare with', () => {
    expect(selectPreviousPolicy({})).toBe(null)
  })
})

describe('re-sign double fetch (#248)', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the baseline across two fetches of the same changed policy', () => {
    // Legacy client: last seen (accepted) policy is "old", no fm_policy_accepted.
    localStorage.setItem('fm_policy_full', JSON.stringify(policy('old')))
    const current = policy('new')

    // Fetch #1: snapshot old -> prev, then overwrite fm_policy_full.
    rememberPreviousPolicy(current)
    const baseline1 = selectPreviousPolicy({
      prev: readStoredPolicy('fm_policy_prev'),
      currentPolicy: current,
    })
    localStorage.setItem('fm_policy_full', JSON.stringify(current))

    // Fetch #2 (same current): must still resolve the old baseline.
    rememberPreviousPolicy(current)
    const baseline2 = selectPreviousPolicy({
      prev: readStoredPolicy('fm_policy_prev'),
      currentPolicy: current,
    })

    expect(baseline1).toEqual(policy('old'))
    expect(baseline2).toEqual(policy('old'))
  })
})
