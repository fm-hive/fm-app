import { describe, it, expect } from 'vitest'
import { base64UrlEncode, base64UrlDecode, decodeJwsPayload } from '../../src/services/crypto'

describe('base64Url encode/decode', () => {
  it('round-trips small buffers', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255])
    const enc = base64UrlEncode(bytes)
    expect(enc).not.toContain('+')
    expect(enc).not.toContain('/')
    expect(enc).not.toContain('=')
    expect(base64UrlDecode(enc)).toEqual(bytes)
  })

  it('handles large buffers without throwing (regression: spread overflow)', () => {
    // > 64KB to exceed the old String.fromCharCode(...spread) call-stack limit
    const bytes = new Uint8Array(70000)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (i * 31) % 256
    }
    let enc = ''
    expect(() => { enc = base64UrlEncode(bytes) }).not.toThrow()
    expect(base64UrlDecode(enc)).toEqual(bytes)
  })
})

describe('decodeJwsPayload', () => {
  it('recovers the data string embedded in a JWS payload', () => {
    const payload = '{"subject":"hi","body":"there"}'
    const token = `${base64UrlEncode(new TextEncoder().encode('{"alg":"EdDSA"}'))}.${base64UrlEncode(new TextEncoder().encode(payload))}.abc`
    expect(decodeJwsPayload(token)).toBe(payload)
  })

  it('returns empty string for malformed tokens', () => {
    expect(decodeJwsPayload('')).toBe('')
    expect(decodeJwsPayload('no-dots-here')).toBe('')
    expect(decodeJwsPayload('a.b')).toBe('')
    expect(decodeJwsPayload(undefined)).toBe('')
  })
})
