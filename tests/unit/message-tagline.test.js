import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockIdentity = {
  hasKeys: true,
  user: { address: ':0:1', name: 'Test User' },
  privateKey: new Uint8Array([1]),
  signPublicKey: new Uint8Array([2]),
  address: ':0:1',
}
vi.mock('../../src/stores/identity', () => ({
  useIdentityStore: () => mockIdentity,
}))

const mockTagline = vi.hoisted(() => ({ value: '', showTearline: false }))
vi.mock('../../src/stores/settings', () => ({
  useSettingsStore: () => ({
    userProfile: {
      get tagline() { return mockTagline.value },
      get showTearline() { return mockTagline.showTearline },
    },
  }),
}))

const mockCrypto = vi.hoisted(() => ({
  createJWS: vi.fn(async () => 'jws'),
  encryptJWE: vi.fn(async () => 'jwe'),
  decodeJwsPayload: vi.fn(() => ''),
}))
vi.mock('../../src/services/crypto', () => mockCrypto)

vi.mock('../../src/services/keyService', () => ({
  keyService: {
    getPublicKey: vi.fn(() => ({ x25519PublicKey: new Uint8Array(32) })),
    hasPublicKey: vi.fn(() => true),
  },
}))

vi.mock('../../src/stores/names', () => ({
  useNamesStore: () => ({ record: vi.fn() }),
}))

import { createSignedMessage, buildNetmailMessage } from '../../src/services/message'

describe('message tearline (#311)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockTagline.value = ''
    mockTagline.showTearline = false
    mockCrypto.createJWS.mockClear()
    mockCrypto.encryptJWE.mockClear()
    vi.stubGlobal('__APP_NAME__', 'fm-app')
    vi.stubGlobal('__APP_VERSION__', '1.2.3')
  })

  it('adds the client tearline to echomail when enabled', async () => {
    mockTagline.showTearline = true
    await createSignedMessage('echomail', { body: 'x' }, { echo_name: 'E' })
    const payload = JSON.parse(mockCrypto.createJWS.mock.calls[0][1])
    expect(payload.tearline).toBe('fm-app v1.2.3 :0:1')
  })

  it('omits the tearline when the setting is off', async () => {
    await createSignedMessage('echomail', { body: 'x' }, { echo_name: 'E' })
    const payload = JSON.parse(mockCrypto.createJWS.mock.calls[0][1])
    expect('tearline' in payload).toBe(false)
  })

  it('never adds the tearline to reactions or protocol payloads', async () => {
    mockTagline.showTearline = true
    await createSignedMessage('echomail', { reaction: '👍', reactionMessageId: 'x' }, { echo_name: 'E' })
    expect('tearline' in JSON.parse(mockCrypto.createJWS.mock.calls[0][1])).toBe(false)
  })

  it('adds the tearline to netmail when enabled', async () => {
    mockTagline.showTearline = true
    await buildNetmailMessage(':0:9', { subject: 'Hi', body: 'text' })
    const plaintext = JSON.parse(new TextDecoder().decode(mockCrypto.encryptJWE.mock.calls[0][0]))
    expect(plaintext.tearline).toBe('fm-app v1.2.3 :0:1')
  })
})

describe('message tagline (#309)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockTagline.value = ''
    mockCrypto.createJWS.mockClear()
    mockCrypto.encryptJWE.mockClear()
  })

  it('adds the configured tagline to echomail', async () => {
    mockTagline.value = '— Ivan'
    await createSignedMessage('echomail', { subject: 'Hi', body: 'text' }, { echo_name: 'Newcomers' })

    const payload = JSON.parse(mockCrypto.createJWS.mock.calls[0][1])
    expect(payload.tagline).toBe('— Ivan')
    expect(payload.sender_name).toBe('Test User')
  })

  it('lets a per-message tagline win and an empty one remove it', async () => {
    mockTagline.value = 'global'
    await createSignedMessage('echomail', { body: 'a', tagline: 'per message' }, { echo_name: 'E' })
    expect(JSON.parse(mockCrypto.createJWS.mock.calls[0][1]).tagline).toBe('per message')

    mockCrypto.createJWS.mockClear()
    await createSignedMessage('echomail', { body: 'b', tagline: '' }, { echo_name: 'E' })
    expect(JSON.parse(mockCrypto.createJWS.mock.calls[0][1]).tagline).toBe('')
  })

  it('does not sign reactions, moderation or protocol payloads', async () => {
    mockTagline.value = 'global'
    await createSignedMessage('echomail', { reaction: '👍', reactionMessageId: 'x' }, { echo_name: 'E' })
    expect(JSON.parse(mockCrypto.createJWS.mock.calls[0][1]).tagline).toBeUndefined()

    mockCrypto.createJWS.mockClear()
    await createSignedMessage('echomail', { severity: 'warn', updateMessageId: 'x' }, { echo_name: 'E' })
    expect(JSON.parse(mockCrypto.createJWS.mock.calls[0][1]).tagline).toBeUndefined()
  })

  it('adds the tagline to netmail', async () => {
    mockTagline.value = '— Ivan'
    await buildNetmailMessage(':0:9', { subject: 'Hi', body: 'text' })

    const plaintext = JSON.parse(new TextDecoder().decode(mockCrypto.encryptJWE.mock.calls[0][0]))
    expect(plaintext.tagline).toBe('— Ivan')
  })

  it('omits the tagline when none is configured', async () => {
    await createSignedMessage('echomail', { body: 'text' }, { echo_name: 'E' })
    const payload = JSON.parse(mockCrypto.createJWS.mock.calls[0][1])
    expect('tagline' in payload).toBe(false)
  })
})
