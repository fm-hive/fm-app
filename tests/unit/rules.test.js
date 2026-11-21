import { describe, it, expect } from 'vitest'
import { computeRulesId, canonicalStringify, canonicalRules, buildRulesSignature, hasRestrictedWriters } from '../../src/utils/rules'
import { generateKeyPair } from '../../src/services/crypto'

// Golden values produced by the Go backend (internal/models Echo.ComputeRulesID):
// sha256 of encoding/json.Marshal of the canonical {text, parameters} map.
describe('computeRulesId', () => {
  const announcements = {
    text: '1. В конференции Announcements публикуются объявления.',
    parameters: { announcements_enable: true, announcements_max_for_address: 1 }
  }
  const announcementsRulesId = 'e5b796a39214ab3e0d1bd32ce853a055e8a2e5908c771d4104993a9bf85bbf03'

  it('matches the backend hash for Announcements-style rules', async () => {
    expect(await computeRulesId(announcements)).toBe(announcementsRulesId)
    // Same value when passed as a JSON string (the server format)
    expect(await computeRulesId(JSON.stringify(announcements))).toBe(announcementsRulesId)
  })

  it('escapes HTML/control characters like Go json.Marshal', async () => {
    const rules = {
      text: 'Правила:\n- нельзя > кричать\n- нельзя & спамить\n- нельзя < оскорблять\n"цитата" и слэш \\',
      parameters: { moderated: true, note: 'a & b < c > d', count: 3 }
    }
    // Go golden: {"parameters":{"count":3,"moderated":true,"note":"a \u0026 b \u003c c \u003e d"},"text":"Правила:\n- нельзя \u003e ..."}
    expect(await computeRulesId(rules)).toBe('36694b33b3a61a895c8c5d7a28070a2578cdffa26564fdf62d246966e88846b2')
  })

  it('normalizes legacy flat rules into {text, parameters}', async () => {
    const legacy = { moderators: [':0:1'], text: 'Будьте вежливы.' }
    expect(await computeRulesId(legacy)).toBe('725af65a78bf3fdd13c7763232e6c6bfa2ad7e21d4cde1e712b2a38f7d29bcaf')
  })

  it('is deterministic regardless of key order', async () => {
    const a = { text: 'x', parameters: { b: 1, a: true } }
    const b = { parameters: { a: true, b: 1 }, text: 'x' }
    expect(await computeRulesId(a)).toBe(await computeRulesId(b))
  })
})

describe('canonicalStringify', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalStringify({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}')
  })
  it('matches Go escaping for < > & and quotes', () => {
    expect(canonicalStringify({ s: 'a & b < c > d "q" \\' })).toBe('{"s":"a \\u0026 b \\u003c c \\u003e d \\"q\\" \\\\"}')
  })
  it('uses compact separators', () => {
    expect(canonicalStringify([1, 'x', true, null])).toBe('[1,"x",true,null]')
  })
})

describe('canonicalRules', () => {
  it('parses JSON strings', () => {
    expect(canonicalRules('{"text":"t","parameters":{"a":1}}')).toEqual({ text: 't', parameters: { a: 1 } })
  })
  it('wraps flat rules into parameters', () => {
    expect(canonicalRules({ text: 't', moderators: [':0:1'] })).toEqual({ text: 't', parameters: { moderators: [':0:1'] } })
  })
  it('handles invalid input', () => {
    expect(canonicalRules('not json')).toEqual({ text: '', parameters: {} })
    expect(canonicalRules(null)).toEqual({})
    expect(canonicalRules(undefined)).toEqual({})
  })
})

describe('buildRulesSignature', () => {
  it('produces a valid rules_id without throwing (regression: crypto.subtle undefined)', async () => {
    const { privateKey, publicKey } = await generateKeyPair()
    const rules = { text: 'Будьте вежливы.', parameters: { moderated: true } }
    const sig = await buildRulesSignature(rules, privateKey, publicKey)
    expect(sig.rules_id).toBe(await computeRulesId(rules))
    expect(sig.rules_id).toMatch(/^[0-9a-f]{64}$/)
    expect(sig.rules_jws).toBeTruthy()
    expect(sig.sig_pkey).toBeTruthy()
  })
})

describe('hasRestrictedWriters (#298)', () => {
  it('detects a writers list', () => {
    expect(hasRestrictedWriters({ parameters: { writers: [':0:1', ':0:2'] } })).toBe(true)
    expect(hasRestrictedWriters(JSON.stringify({ parameters: { writers: [':0:1'] } }))).toBe(true)
  })

  it('treats missing, empty and ["all"] as unrestricted', () => {
    expect(hasRestrictedWriters(null)).toBe(false)
    expect(hasRestrictedWriters({})).toBe(false)
    expect(hasRestrictedWriters({ parameters: {} })).toBe(false)
    expect(hasRestrictedWriters({ parameters: { writers: [] } })).toBe(false)
    expect(hasRestrictedWriters({ parameters: { writers: ['all'] } })).toBe(false)
  })

  it('handles legacy flat rules', () => {
    expect(hasRestrictedWriters({ writers: [':0:5'] })).toBe(true)
    expect(hasRestrictedWriters({ writers: ['all'] })).toBe(false)
  })

  it('treats ["all", address] as restricted (like the backend)', () => {
    expect(hasRestrictedWriters({ parameters: { writers: ['all', ':0:1'] } })).toBe(true)
  })
})
