import { describe, it, expect } from 'vitest'
import { sha256Base64Url, buildEnvelopeAuthPayload } from '../../src/services/envelope'

describe('sha256Base64Url', () => {
  it('matches the known SHA-256 of "abc" (base64url, no padding)', async () => {
    expect(await sha256Base64Url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })
})

describe('buildEnvelopeAuthPayload', () => {
  it('hashes the JWE when the envelope is encrypted', async () => {
    const payload = await buildEnvelopeAuthPayload({ jwe: 'jwe-token' })
    const parsed = JSON.parse(payload)
    expect(Object.keys(parsed)).toEqual(['jwe_sha256'])
    expect(parsed.jwe_sha256).toBe(await sha256Base64Url('jwe-token'))
  })

  it('hashes the serialized data for plaintext bootstrap envelopes', async () => {
    const data = { request: 'policy', data: { pubkey: 'abc' } }
    const payload = await buildEnvelopeAuthPayload({ data })
    const parsed = JSON.parse(payload)
    expect(Object.keys(parsed)).toEqual(['data_sha256'])
    expect(parsed.data_sha256).toBe(await sha256Base64Url(JSON.stringify(data)))
  })

  it('never contains the request itself', async () => {
    const payload = await buildEnvelopeAuthPayload({ jwe: 'jwe-token' })
    expect(payload).not.toContain('request')
    expect(payload).not.toContain('send_receive')
  })

  it('rejects an envelope without a carrier', async () => {
    await expect(buildEnvelopeAuthPayload({})).rejects.toThrow('neither jwe nor data')
  })
})
