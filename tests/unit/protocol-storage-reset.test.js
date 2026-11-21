import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/encryption', () => ({
  deriveEncryptionKey: vi.fn(async () => ({})),
  encryptData: vi.fn(async () => 'encrypted'),
  decryptData: vi.fn(async () => {
    throw new Error('Decryption failed: OperationError')
  }),
  isEncryptionAvailable: vi.fn(() => true),
  fallbackEncrypt: vi.fn(async () => 'fallback'),
  fallbackDecrypt: vi.fn(async () => '[]'),
}))

import { useIdentityStore } from '../../src/stores/identity'
import { useProtocolStore } from '../../src/stores/protocol'
import { isPasswordError } from '../../src/composables/useBoot'

describe('protocol store storage reset', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('drops ciphertext that cannot be decrypted with the current key', async () => {
    localStorage.setItem('fm_protocol_messages_encrypted', 'old-ciphertext')

    const identity = useIdentityStore()
    identity.privateKey = new Uint8Array(32)
    identity.publicKey = new Uint8Array(32)

    const protocol = useProtocolStore()
    await protocol.init()

    expect(localStorage.getItem('fm_protocol_messages_encrypted')).toBe(null)
    expect(localStorage.getItem('fm_protocol_messages_debug')).toBe(null)
    expect(protocol.messages).toEqual([])
  })
})

describe('isPasswordError', () => {
  it('recognizes password/decrypt failures', () => {
    expect(isPasswordError(new Error('Password required to decrypt keys'))).toBe(true)
    expect(isPasswordError(new Error('Failed to decrypt: bad key'))).toBe(true)
    expect(isPasswordError(Object.assign(new Error('The operation failed for an operation-specific reason'), { name: 'OperationError' }))).toBe(true)
    expect(isPasswordError(new Error('network down'))).toBe(false)
    expect(isPasswordError(null)).toBe(false)
  })
})
