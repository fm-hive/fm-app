import { describe, expect, it } from 'vitest'
import { canWriteToEcho, hasRestrictedWriters } from './rules'

describe('canWriteToEcho', () => {
  const user = ':0:1:1'

  it('allows normal echoes and writers:["all"]', () => {
    expect(canWriteToEcho({}, user)).toBe(true)
    expect(canWriteToEcho({ parameters: { writers: ['all'] } }, user)).toBe(true)
  })

  it('allows a listed writer only', () => {
    const rules = { parameters: { writers: [':0:1:1', ':0:1:2'] } }
    expect(canWriteToEcho(rules, user)).toBe(true)
    expect(canWriteToEcho(rules, ':0:1:3')).toBe(false)
  })

  it('handles legacy flat rules and JSON strings', () => {
    expect(canWriteToEcho({ writers: [user] }, user)).toBe(true)
    expect(canWriteToEcho(JSON.stringify({ parameters: { writers: [user] } }), ':0:1:3')).toBe(false)
  })

  it('never allows Network news and requires an address for restricted echoes', () => {
    expect(canWriteToEcho({ parameters: { writers: [user] } }, user, { networkNews: true })).toBe(false)
    expect(canWriteToEcho({ parameters: { writers: [user] } }, '')).toBe(false)
  })

  it('keeps hasRestrictedWriters consistent with the writers list', () => {
    expect(hasRestrictedWriters({ parameters: { writers: ['all'] } })).toBe(false)
    expect(hasRestrictedWriters({ parameters: { writers: [user] } })).toBe(true)
  })
})
