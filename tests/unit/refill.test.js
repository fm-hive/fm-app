import { describe, it, expect } from 'vitest'
import { splitRefillChunks, resolveRefillMaxMessageSize, isRefillableMessage, toRefillWireForm, countRefillableMessages, refillRequestFromMessage, refillableMessagesFor, refillRequestsForEcho, refillCutoff, refillBeforeDate } from '../../src/services/refill'

function msg(id, size) {
  return { message_id: id, data: 'x'.repeat(size) }
}

describe('splitRefillChunks', () => {
  it('keeps each chunk within the size budget', () => {
    // maxMessageSize 2000 -> budget 1600, cap 1088
    const msgs = [msg('a', 500), msg('b', 500), msg('c', 500)]
    const { chunks, skipped } = splitRefillChunks(msgs, 2000)
    expect(skipped).toBe(0)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const total = chunk.reduce((sum, m) => sum + JSON.stringify(m).length, 0)
      expect(total).toBeLessThanOrEqual(1600)
    }
    const covered = chunks.flat().length
    expect(covered).toBe(3)
  })

  it('skips a single message larger than the budget', () => {
    const big = msg('big', 5000)
    const small = msg('small', 100)
    const { chunks, skipped } = splitRefillChunks([big, small], 2000)
    expect(skipped).toBe(1)
    expect(chunks.flat().map(m => m.message_id)).toEqual(['small'])
  })

  it('returns no chunks for empty input', () => {
    const { chunks, skipped } = splitRefillChunks([], 1000000)
    expect(chunks).toEqual([])
    expect(skipped).toBe(0)
  })
})

describe('resolveRefillMaxMessageSize', () => {
  it('prefers echo rules max_message_size', () => {
    const echoes = [{ name: 'E', rules: JSON.stringify({ parameters: { max_message_size: '2048' } }) }]
    expect(resolveRefillMaxMessageSize(echoes, 'E')).toBe(2048)
  })

  it('falls back to the 1MB default', () => {
    expect(resolveRefillMaxMessageSize([], 'Anything')).toBe(1048576)
  })
})

describe('isRefillableMessage', () => {
  it('accepts only signed echomail', () => {
    expect(isRefillableMessage({ type: 'echomail', data: '{}', jws: 'abc.def.ghi' })).toBe(true)
  })
  it('rejects messages without a jws (welcome/error) or non-echomail', () => {
    expect(isRefillableMessage({ type: 'echomail', data: '{}', jws: '' })).toBe(false)
    expect(isRefillableMessage({ type: 'echomail', data: '{}' })).toBe(false)
    expect(isRefillableMessage({ type: 'refill', data: '{}', jws: 'x' })).toBe(false)
    expect(isRefillableMessage({ type: 'echomail', jws: 'x' })).toBe(false)
  })
})

describe('toRefillWireForm', () => {
  it('strips data (content lives inside the jws payload) but keeps delivery fields', () => {
    const form = toRefillWireForm({
      type: 'echomail',
      sender_address: ':0:1',
      timestamp: 1234,
      message_id: 'm1',
      data: '{"subject":"x"}',
      jws: 'abc.def.ghi',
      echo_id: 9, // extra local field
    })
    expect(form).toEqual({
      type: 'echomail',
      sender_address: ':0:1',
      timestamp: 1234,
      message_id: 'm1',
      jws: 'abc.def.ghi',
    })
    expect('data' in form).toBe(false)
  })
})

describe('countRefillableMessages (#274)', () => {
  const before = '2026-09-18T00:00:00.000Z'
  const midnight = new Date(before).getTime() / 1000
  const echomail = (id, ts) => ({ message_id: id, type: 'echomail', data: '{}', jws: 'sig', timestamp: ts })

  it('counts signed echomail up to the end of the requested day', () => {
    const msgs = [
      echomail('old1', midnight - 100),
      echomail('same-day', midnight + 3600), // 18.09, after midnight — included (#274)
      echomail('next-day', midnight + 86400 + 10),
      { message_id: 'welcome', type: 'echomail', data: '{}', timestamp: midnight + 60 }, // no jws
      { message_id: 'refill', type: 'refill', data: '{}', jws: 'sig', timestamp: midnight + 60 },
    ]
    expect(countRefillableMessages(msgs, before)).toBe(2)
  })

  it('uses a precise timestamp as-is', () => {
    const precise = '2026-09-18T12:00:00.000Z'
    const t = new Date(precise).getTime() / 1000
    const msgs = [echomail('before', t - 60), echomail('after', t + 60)]
    expect(countRefillableMessages(msgs, precise)).toBe(1)
  })

  it('handles invalid dates and empty input', () => {
    expect(countRefillableMessages([echomail('a', 1)], '')).toBe(0)
    expect(countRefillableMessages(null, before)).toBe(0)
  })
})

describe('refillRequestFromMessage (#274)', () => {
  it('parses a refill request message', () => {
    const msg = {
      message_id: 'req-1',
      type: 'refill',
      timestamp: 1789760282,
      data: JSON.stringify({
        proto: 'refill', type: 'request', from: ':0:19', echo: 'FM доработки',
        refill: { from: ':0:19', echo: 'FM доработки', before: '2026-09-18T00:00:00.000Z', messageId: 'refill_x' },
      }),
    }
    expect(refillRequestFromMessage(msg)).toEqual({
      messageId: 'req-1',
      from: ':0:19',
      echoName: 'FM доработки',
      before: '2026-09-18T00:00:00.000Z',
      timestamp: 1789760282,
    })
  })

  it('accepts data as an object', () => {
    const msg = { message_id: 'req-2', type: 'refill', data: { type: 'request', refill: { echo: 'E', from: ':0:2', before: 'd' } } }
    expect(refillRequestFromMessage(msg).echoName).toBe('E')
  })

  it('ignores responses and non-refill messages', () => {
    expect(refillRequestFromMessage({ message_id: 'x', type: 'refill', data: JSON.stringify({ type: 'response', refill: { echo: 'E' } }) })).toBeNull()
    expect(refillRequestFromMessage({ message_id: 'x', type: 'echomail', data: '{}' })).toBeNull()
    expect(refillRequestFromMessage(null)).toBeNull()
  })

  it('requires an echo name', () => {
    const msg = { message_id: 'x', type: 'refill', data: JSON.stringify({ type: 'request', refill: { from: ':0:1' } }) }
    expect(refillRequestFromMessage(msg)).toBeNull()
  })
})

describe('refillRequestsForEcho (#274)', () => {
  const reqs = [
    { messageId: 'r1', echoName: 'A' },
    { messageId: 'r2', echoName: 'B' },
    { messageId: 'r3', echoName: 'A' },
  ]

  it('keeps only the requests of the given echo', () => {
    expect(refillRequestsForEcho(reqs, 'A').map(r => r.messageId)).toEqual(['r1', 'r3'])
    expect(refillRequestsForEcho(reqs, 'B').map(r => r.messageId)).toEqual(['r2'])
  })

  it('returns nothing without an echo (e.g. the digest view)', () => {
    expect(refillRequestsForEcho(reqs, null)).toEqual([])
    expect(refillRequestsForEcho(reqs, '')).toEqual([])
    expect(refillRequestsForEcho(null, 'A')).toEqual([])
  })
})

describe('refillableMessagesFor (#274)', () => {
  const before = '2026-09-18T00:00:00.000Z'
  const midnight = new Date(before).getTime() / 1000
  const msg = (id, ts, jws = 'sig') => ({ message_id: id, type: 'echomail', data: '{}', jws, timestamp: ts })

  it('returns signed echomail up to the end of the requested day', () => {
    const list = [
      msg('old', midnight - 10),
      msg('same-day', midnight + 3600),
      msg('next-day', midnight + 86400 + 10),
      { ...msg('nojws', midnight + 60), jws: '' },
    ]
    expect(refillableMessagesFor(list, before).map(m => m.message_id)).toEqual(['old', 'same-day'])
  })

  it('handles invalid dates and empty input', () => {
    expect(refillableMessagesFor([msg('a', 1)], '')).toEqual([])
    expect(refillableMessagesFor(null, before)).toEqual([])
  })
})

describe('refillCutoff / refillBeforeDate (#274)', () => {
  it('treats a date-only before as the end of that day', () => {
    expect(refillCutoff('2026-09-18T00:00:00.000Z')).toBe(new Date('2026-09-18T23:59:59.999Z').getTime())
  })

  it('keeps a precise timestamp', () => {
    const t = '2026-09-18T12:00:00.000Z'
    expect(refillCutoff(t)).toBe(new Date(t).getTime())
  })

  it('builds the request boundary as the end of the picked day', () => {
    expect(refillBeforeDate('2026-09-18')).toBe('2026-09-18T23:59:59.999Z')
    // Fallback for an empty/invalid value: now (the request covers everything).
    expect(Number.isFinite(new Date(refillBeforeDate('')).getTime())).toBe(true)
  })
})

describe('isRefillableMessage node messages (#274)', () => {
  const msg = (sender) => ({ message_id: 'm', type: 'echomail', data: '{}', jws: 'sig', sender_address: sender })

  it('excludes node-generated messages', () => {
    expect(isRefillableMessage(msg(':0:0'))).toBe(false)
    expect(isRefillableMessage(msg(':1:2:0'))).toBe(false)
  })

  it('keeps user messages', () => {
    expect(isRefillableMessage(msg(':0:1'))).toBe(true)
    expect(isRefillableMessage(msg(':0:10'))).toBe(true)
  })
})
