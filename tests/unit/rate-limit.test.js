import { describe, it, expect, beforeEach } from 'vitest'
import {
  setRateLimitUsage,
  rateLimitUsage,
  rateLimitFor,
  kindOfEntry,
  splitByRateLimit,
} from '../../src/services/rateLimit'

function entry(overrides) {
  return { id: overrides.id || 'e1', type: 'echomail', rawData: { subject: 's' }, ...overrides }
}

function signedEntry(type, data) {
  return { id: `signed-${type}`, type, message: { data: JSON.stringify(data) } }
}

describe('rateLimit service', () => {
  beforeEach(() => {
    setRateLimitUsage({})
  })

  it('stores and exposes the node usage', () => {
    setRateLimitUsage({ echomail: { used: 3, limit: 50 } })
    expect(rateLimitUsage().echomail.used).toBe(3)
    expect(rateLimitFor('echomail')).toBe(50)
    expect(rateLimitFor('unknown')).toBe(0)
  })

  it('reads the data from the JWS payload when data is omitted on the wire', () => {
    const payload = JSON.stringify({ proto: 'vote', type: 'poster' })
    const b64url = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const entry = { type: 'vote', message: { jws: `header.${b64url}.signature` } }
    expect(kindOfEntry(entry)).toBe('poster')
  })

  it('classifies entries like the backend', () => {
    expect(kindOfEntry(entry({ type: 'netmail' }))).toBe('netmail')
    expect(kindOfEntry(entry({ type: 'echomail', isReaction: true }))).toBe('reaction')
    expect(kindOfEntry(entry({ type: 'echomail' }))).toBe('echomail')
    expect(kindOfEntry(entry({ type: 'announcement' }))).toBe('')
    expect(kindOfEntry(signedEntry('vote', { type: 'poster' }))).toBe('poster')
    expect(kindOfEntry(signedEntry('vote', { type: 'vote' }))).toBe('vote')
    expect(kindOfEntry(signedEntry('election', { type: 'poster' }))).toBe('poster')
    expect(kindOfEntry(signedEntry('vote', { type: 'result' }))).toBe('')
  })

  it('splits entries at the daily limit, counting the queued ones', () => {
    setRateLimitUsage({ poster: { used: 4, limit: 5 } })
    const entries = [
      signedEntry('vote', { type: 'poster' }),
      signedEntry('vote', { type: 'poster' }),
    ]
    const { allowed, exceeded } = splitByRateLimit(entries)
    expect(allowed).toHaveLength(1)
    expect(exceeded).toHaveLength(1)
    expect(exceeded[0].id).toBe('signed-vote')
  })

  it('allows everything when the kind is not limited', () => {
    setRateLimitUsage({ vote: { used: 100, limit: 20 } })
    const entries = [entry({ id: 'a', type: 'echomail' }), entry({ id: 'b', type: 'announcement' })]
    const { allowed, exceeded } = splitByRateLimit(entries)
    expect(allowed).toHaveLength(2)
    expect(exceeded).toHaveLength(0)
  })

  it('counts reactions and votes separately', () => {
    setRateLimitUsage({
      reaction: { used: 1, limit: 2 },
      vote: { used: 0, limit: 1 },
    })
    const entries = [
      entry({ id: 'r1', type: 'echomail', isReaction: true }),
      entry({ id: 'r2', type: 'echomail', isReaction: true }),
      signedEntry('vote', { type: 'vote' }),
      signedEntry('vote', { type: 'vote' }),
    ]
    const { allowed, exceeded } = splitByRateLimit(entries)
    expect(allowed.map(e => e.id)).toEqual(['r1', 'signed-vote'])
    expect(exceeded.map(e => e.id)).toEqual(['r2', 'signed-vote'])
  })
})
