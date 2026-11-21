import { describe, it, expect } from 'vitest'
import { diffTextLines, diffPolicyParams, computePolicyDiff } from '../../src/utils/policyDiff'

function textOf(hunk) {
  const prefix = { same: ' ', add: '+', remove: '-' }
  return hunk.lines.map(l => `${prefix[l.type]}${l.text}`)
}

describe('diffTextLines', () => {
  it('returns no hunks for identical texts', () => {
    const diff = diffTextLines('a\nb\nc', 'a\nb\nc')
    expect(diff.hunks).toEqual([])
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
  })

  it('detects a changed line with context', () => {
    const diff = diffTextLines('one\ntwo\nthree', 'one\nTWO\nthree', { context: 1 })
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(diff.hunks).toHaveLength(1)
    expect(textOf(diff.hunks[0])).toEqual([' one', '-two', '+TWO', ' three'])
  })

  it('detects added and removed lines', () => {
    const diff = diffTextLines('a\nb', 'a\nx\nb')
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(0)
    expect(textOf(diff.hunks[0])).toEqual([' a', '+x', ' b'])
  })

  it('splits far apart changes into separate hunks', () => {
    const oldText = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const newText = oldText.replace('line 2', 'line 2 changed').replace('line 27', 'line 27 changed')
    const diff = diffTextLines(oldText, newText, { context: 2 })
    expect(diff.hunks).toHaveLength(2)
    expect(diff.hunks[0].oldStart).toBe(1)
    expect(diff.hunks[1].oldStart).toBe(26)
  })

  it('keeps the line numbers of hunks', () => {
    const diff = diffTextLines('a\nb\nc\nd', 'a\nb\nc\nD', { context: 1 })
    expect(diff.hunks[0].oldStart).toBe(3)
    expect(diff.hunks[0].newStart).toBe(3)
  })

  it('handles an empty previous text (all lines added)', () => {
    const diff = diffTextLines('', 'a\nb')
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(0)
    expect(textOf(diff.hunks[0])).toEqual(['+a', '+b'])
  })

  it('handles CRLF and a trailing newline', () => {
    const diff = diffTextLines('a\r\nb\r\n', 'a\nb')
    expect(diff.hunks).toEqual([])
  })
})

describe('diffPolicyParams', () => {
  it('detects added, removed and changed parameters', () => {
    const changes = diffPolicyParams(
      { voting_period: '30', old_param: 'x', same: '1' },
      { voting_period: '14', new_param: 'y', same: '1' }
    )
    expect(changes).toEqual([
      { type: 'added', key: 'new_param', old: null, new: 'y' },
      { type: 'removed', key: 'old_param', old: 'x', new: null },
      { type: 'changed', key: 'voting_period', old: '30', new: '14' },
    ])
  })

  it('ignores special_echogroups', () => {
    const changes = diffPolicyParams(
      { special_echogroups: { admin: 'A' } },
      { special_echogroups: { admin: 'B' } }
    )
    expect(changes).toEqual([])
  })

  it('stringifies non-string values', () => {
    const changes = diffPolicyParams({ n: 1 }, { n: 2 })
    expect(changes).toEqual([{ type: 'changed', key: 'n', old: '1', new: '2' }])
  })
})

describe('computePolicyDiff', () => {
  const policy = (text, parameters = {}) => ({ id: 'x', policy: { text, parameters } })

  it('reports no previous policy', () => {
    const diff = computePolicyDiff(null, policy('new'))
    expect(diff.hasPrevious).toBe(false)
    expect(diff.hasChanges).toBe(true)
    expect(diff.params).toEqual([])
  })

  it('reports changes for text and parameters', () => {
    const diff = computePolicyDiff(
      policy('line one\nline two', { voting_period: '30' }),
      policy('line one\nline two changed', { voting_period: '14' })
    )
    expect(diff.hasPrevious).toBe(true)
    expect(diff.hasChanges).toBe(true)
    expect(diff.text.added).toBe(1)
    expect(diff.text.removed).toBe(1)
    expect(diff.params).toEqual([{ type: 'changed', key: 'voting_period', old: '30', new: '14' }])
  })

  it('reports no changes for an identical policy', () => {
    const diff = computePolicyDiff(policy('same', { a: '1' }), policy('same', { a: '1' }))
    expect(diff.hasPrevious).toBe(true)
    expect(diff.hasChanges).toBe(false)
  })
})
