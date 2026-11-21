import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useIdentityStore } from '../../src/stores/identity'
import { createPinia, setActivePinia } from 'pinia'

// Mock crypto module
vi.mock('../../src/services/crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    generateKeyPair: vi.fn(),
    signMessage: vi.fn(),
    verifySignature: vi.fn(),
    toHex: vi.fn(),
    fromHex: vi.fn(),
    base64UrlDecode: vi.fn(),
    createJWS: vi.fn(),
    ed25519PrivateKeyToX25519: vi.fn(),
    ed25519PublicKeyToX25519: vi.fn(),
    encryptJWE: vi.fn(),
    decryptJWE: vi.fn(),
  }
})

// Mock API service
vi.mock('../../src/services/api', () => ({
  apiService: {
    policy: vi.fn(),
    getEchoes: vi.fn(),
    setAddress: vi.fn(),
    subscribeEcho: vi.fn(),
    sendReceive: vi.fn(),
    status: vi.fn(),
    setName: vi.fn(),
  },
}))

// Mock useOutbox
const mockOutboxAdd = vi.fn()
const mockOutboxFlushReactions = vi.fn()
vi.mock('../../src/composables/useOutbox', () => ({
  useOutbox: () => ({
    add: mockOutboxAdd,
    send: vi.fn(),
    flushReactions: mockOutboxFlushReactions,
    count: { value: 0 },
    queue: { value: [] },
  }),
}))

// Mock settings store (privacy flags are mutable per test)
const mockPrivacy = vi.hoisted(() => ({ autoFlushReactions: false }))
vi.mock('../../src/stores/settings', () => ({
  useSettingsStore: () => ({ privacy: mockPrivacy }),
}))

// Mock keystore
vi.mock('../../src/services/keystore', () => ({
  keystore: {
    hasStoredKeys: vi.fn(),
    isEncrypted: vi.fn(),
    generateKeys: vi.fn(),
    saveKeys: vi.fn(),
    loadKeys: vi.fn(),
    exportKeys: vi.fn(),
    importKeys: vi.fn(),
    clear: vi.fn(),
    getPrivateKey: vi.fn(),
    getPublicKey: vi.fn(),
    getMetadata: vi.fn(),
  }
}))

// Import mocked modules
import * as crypto from '../../src/services/crypto'
import { apiService } from '../../src/services/api'
import { keystore } from '../../src/services/keystore'

describe('Identity Store', () => {
  let consoleErrorSpy
  
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    // Mock console.error to suppress output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Create fresh pinia instance
    setActivePinia(createPinia())
    // Mock keystore methods used by setKeys
    keystore.saveKeys.mockResolvedValue(undefined)
    keystore.hasStoredKeys.mockReturnValue(false)
    keystore.isEncrypted.mockReturnValue(false)
    // Mock crypto functions used by setKeys
    crypto.ed25519PrivateKeyToX25519.mockReturnValue(new Uint8Array([1, 2, 3]))
    crypto.ed25519PublicKeyToX25519.mockReturnValue(new Uint8Array([4, 5, 6]))
    crypto.signMessage.mockResolvedValue(new Uint8Array([7, 8, 9]))
    crypto.createJWS.mockResolvedValue('mock.jws.token')
    crypto.toHex.mockImplementation(bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
  })
  
  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore()
  })

  describe('sendReaction', () => {
    beforeEach(() => {
      // Mock keystore.saveKeys to resolve immediately
      keystore.saveKeys.mockResolvedValue(undefined)
    })

    it('should send reaction message with correct data', async () => {
      const store = useIdentityStore()
      
      // Setup store state
      const mockPrivateKey = new Uint8Array([1, 2, 3])
      const mockPublicKey = new Uint8Array([4, 5, 6])
      await store.setKeys(mockPrivateKey, mockPublicKey)
      
      // Mock user address
      store.setUser({ address: ':0:123' })
      
      // Mock createJWS to return a signed message
      const mockJWS = 'mock.jws.token'
      crypto.createJWS.mockResolvedValue(mockJWS)
      
      // Call sendReaction
      const targetMessageId = 'msg_123'
      const reaction = '👍'
      const comment = 'Welcome!'
      const echoName = 'группа новичков'
      
      const result = await store.sendReaction(targetMessageId, reaction, comment, echoName)
      
      // Verify createJWS was called with correct arguments
      expect(crypto.createJWS).toHaveBeenCalledTimes(1)
      const createJWSCall = crypto.createJWS.mock.calls[0]
      expect(createJWSCall[0]).toEqual(mockPrivateKey)
      expect(createJWSCall[2]).toEqual(mockPublicKey)
      
      // Verify JWS is signed over the data string
      const payload = JSON.parse(createJWSCall[1])
      expect(payload).toMatchObject({
        reaction: reaction,
        reactionMessageId: targetMessageId,
        echo: echoName,
        message: comment,
      })
      
      // Verify outbox.add was called with correct arguments
      expect(mockOutboxAdd).toHaveBeenCalledTimes(1)
      const outboxCall = mockOutboxAdd.mock.calls[0][0]
      expect(outboxCall).toMatchObject({
        type: 'echomail',
        echoName: echoName,
        isReaction: true,
        dedupKey: `reaction_${targetMessageId}_${reaction}`,
      })
      expect(outboxCall.message).toMatchObject({
        type: 'echomail',
        sender_address: ':0:123',
        data: JSON.stringify({ reaction, reactionMessageId: targetMessageId, echo: echoName, message: comment, sender_name: '' }),
        echo_name: echoName,
        jws: mockJWS,
      })
      
      // Verify result
      expect(result).toEqual({ queued: true })
      // Auto-flush should NOT be called (default is false)
      expect(mockOutboxFlushReactions).not.toHaveBeenCalled()
    })

    it('auto-flushes the reaction when the setting is on (#305)', async () => {
      mockPrivacy.autoFlushReactions = true
      mockOutboxFlushReactions.mockResolvedValue({ sent: 1 })
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setUser({ address: ':0:789' })

      await store.sendReaction('target-1', '👍', '', 'Newcomers')

      expect(mockOutboxFlushReactions).toHaveBeenCalledTimes(1)
      mockPrivacy.autoFlushReactions = false
    })

    it('should send reaction without comment', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setUser({ address: ':0:456' })
      
      crypto.createJWS.mockResolvedValue('mock.jws')
      
      const result = await store.sendReaction('msg_456', '👍', '', 'группа новичков')
      
      // Verify message field is empty string when no comment
      const createJWSCall = crypto.createJWS.mock.calls[0]
      const payload = JSON.parse(createJWSCall[1])
      expect(payload.message).toBe('')
      expect(result).toEqual({ queued: true })
    })
  })

  describe('isAdmin and isModerator', () => {
    it('should identify moderator based on rules', async () => {
      const store = useIdentityStore()
      
      // Set public key
      const mockPublicKey = new Uint8Array([0x01, 0x02, 0x03])
      await store.setKeys(new Uint8Array([1]), mockPublicKey)
      store.setUser({ address: ':0:123' })
      
      // Set rules with moderator address
      store.setRules({
        parameters: { moderators: [':0:123'] }
      })
      
      expect(store.isModerator).toBe(true)
      // Moderator rights are not admin rights (issue #256): isAdmin is the
      // server-confirmed flag only.
      expect(store.isAdmin).toBe(false)
    })

    it('should treat isAdmin as server-confirmed only', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))

      store.setUser({ address: ':0:123', isAdmin: true })
      expect(store.isAdmin).toBe(true)

      store.setUser({ address: ':0:123', isAdmin: false })
      expect(store.isAdmin).toBe(false)
    })

    it('should treat isModerator from the server response', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setRules(null)

      store.setUser({ address: ':0:123', isModerator: true })
      expect(store.isModerator).toBe(true)

      store.setUser({ address: ':0:123' })
      expect(store.isModerator).toBe(false)
    })

    it('should not be moderator if rules missing', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setRules(null)
      
      expect(store.isModerator).toBe(false)
      expect(store.isAdmin).toBe(false)
    })

    it('should not be moderator if address not in moderators list', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setUser({ address: ':0:123' })
      store.setRules({
        parameters: { moderators: [':0:456'] }
      })
      
      expect(store.isModerator).toBe(false)
    })
  })

  describe('createSignedMessage', () => {
    it('should create signed message with correct structure', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setUser({ address: ':0:789' })
      
      crypto.createJWS.mockResolvedValue('signed.jws.token')
      
      const result = await store.createSignedMessage('echomail', { text: 'hello' }, 'test echo')
      
      expect(crypto.createJWS).toHaveBeenCalledTimes(1)
      const callArgs = crypto.createJWS.mock.calls[0]
      const payload = JSON.parse(callArgs[1])
      expect(payload).toMatchObject({
        text: 'hello',
      })
      expect(result).toMatchObject({
        type: 'echomail',
        sender_address: ':0:789',
        data: JSON.stringify({ text: 'hello', sender_name: '' }),
        echo_name: 'test echo',
        jws: 'signed.jws.token',
      })
    })

    it('puts the user name into sender_name', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setUser({ address: ':0:789', name: 'Test User' })
      crypto.createJWS.mockResolvedValue('signed.jws.token')

      await store.createSignedMessage('echomail', { text: 'hi' }, 'test echo')
      const payload = JSON.parse(crypto.createJWS.mock.calls[0][1])
      expect(payload.sender_name).toBe('Test User')
    })
  })

  describe('updateUserName', () => {
    it('updates identity.user.name and persists to fm_user', () => {
      const store = useIdentityStore()
      store.setUser({ address: ':0:1', name: 'Old', isAdmin: false })
      expect(store.user.name).toBe('Old')

      store.updateUserName('New Name')
      expect(store.user.name).toBe('New Name')

      const stored = JSON.parse(localStorage.getItem('fm_user'))
      expect(stored.name).toBe('New Name')
      expect(stored.address).toBe(':0:1')
    })

    it('is a no-op when there is no user', () => {
      const store = useIdentityStore()
      expect(() => store.updateUserName('X')).not.toThrow()
    })
  })

  describe('sendRefillRequest', () => {
    it('should send refill request with correct data', async () => {
      const store = useIdentityStore()
      
      // Setup store state
      const mockPrivateKey = new Uint8Array([1, 2, 3])
      const mockPublicKey = new Uint8Array([4, 5, 6])
      await store.setKeys(mockPrivateKey, mockPublicKey)
      store.setUser({ address: ':0:123' })
      
      // Mock createJWS to return a signed message
      const mockJWS = 'mock.jws.token'
      crypto.createJWS.mockResolvedValue(mockJWS)
      
      // Mock sendReceive to return success
      const mockResponse = { success: true }
      apiService.sendReceive.mockResolvedValue(mockResponse)
      
      // Call sendRefillRequest
      const echoName = 'группа новичков'
      const beforeDate = new Date('2025-01-01')
      const result = await store.sendRefillRequest(echoName, beforeDate)
      
      // Verify createJWS was called with correct arguments
      expect(crypto.createJWS).toHaveBeenCalledTimes(1)
      const createJWSCall = crypto.createJWS.mock.calls[0]
      expect(createJWSCall[0]).toEqual(mockPrivateKey)
      expect(createJWSCall[2]).toEqual(mockPublicKey)
      
      // Verify payload is JSON string with correct structure
      const payload = JSON.parse(createJWSCall[1])
      expect(payload).toMatchObject({
        proto: 'refill',
        type: 'request',
        from: ':0:123',
        to: 'all',
        message: expect.any(String),
        date: expect.any(String),
         echo: echoName,
         refill: {
          from: ':0:123',
          echo: echoName,
          before: beforeDate.toISOString(),
          messageId: expect.any(String),
        },
      })
      
      // Verify sendReceive was called with signed message object
      expect(apiService.sendReceive).toHaveBeenCalledTimes(1)
      const sendReceiveCall = apiService.sendReceive.mock.calls[0][0]
      expect(sendReceiveCall.messages[0]).toMatchObject({
        type: 'refill',
        sender_address: ':0:123',
        data: expect.any(String),
        echo_name: echoName,
        jws: mockJWS,
      })
      
      // Verify data field contains the same payload
      const dataPayload = JSON.parse(sendReceiveCall.messages[0].data)
      expect(dataPayload).toEqual(payload)
      
      // Verify result
      expect(result).toEqual(mockResponse)
    })

    it('should handle API errors', async () => {
      const store = useIdentityStore()
      await store.setKeys(new Uint8Array([1]), new Uint8Array([2]))
      store.setUser({ address: ':0:456' })
      
      crypto.createJWS.mockResolvedValue('mock.jws')
      apiService.sendReceive.mockRejectedValue(new Error('Network error'))
      
       await expect(store.sendRefillRequest('группа новичков', new Date()))
        .rejects.toThrow('Network error')
    })
  })

  describe('syncAdminStatus display name (#296)', () => {
    it('adopts the server display name when the local one is missing', async () => {
      const store = useIdentityStore()
      store.setUser({ address: ':0:12' })
      apiService.status.mockResolvedValue({ address: ':0:12', is_admin: false, is_moderator: false, name: 'Maksim' })

      await store.syncAdminStatus()

      expect(store.user.name).toBe('Maksim')
      expect(JSON.parse(localStorage.getItem('fm_user')).name).toBe('Maksim')
    })

    it('adopts the server name even when a local one exists (node is authoritative)', async () => {
      const store = useIdentityStore()
      store.setUser({ address: ':0:12', name: 'Local Name' })
      apiService.status.mockResolvedValue({ address: ':0:12', is_admin: true, is_moderator: false, name: 'Server Name' })

      await store.syncAdminStatus()

      expect(store.user.name).toBe('Server Name')
      expect(store.user.isAdmin).toBe(true)
    })

    it('pushes the local name when the node has none', async () => {
      const store = useIdentityStore()
      store.setUser({ address: ':0:12', name: 'Local Name' })
      apiService.status.mockResolvedValue({ address: ':0:12', is_admin: false, is_moderator: false, name: '' })
      apiService.setName.mockResolvedValue({ address: ':0:12', name: 'Local Name' })

      await store.syncAdminStatus()

      expect(apiService.setName).toHaveBeenCalledWith('Local Name')
      expect(store.user.name).toBe('Local Name')
    })

    it('pushes a name restored from a backup once', async () => {
      localStorage.setItem('fm_name_pending_push', 'Restored Name')
      const store = useIdentityStore()
      store.setUser({ address: ':0:12', name: 'Restored Name' })
      apiService.status.mockResolvedValue({ address: ':0:12', is_admin: false, is_moderator: false, name: 'Server Name' })
      apiService.setName.mockResolvedValue({ address: ':0:12', name: 'Restored Name' })

      await store.syncAdminStatus()

      expect(apiService.setName).toHaveBeenCalledWith('Restored Name')
      expect(store.user.name).toBe('Restored Name')
      expect(localStorage.getItem('fm_name_pending_push')).toBeNull()
    })

    it('pushName sends the trimmed name and mirrors the saved one', async () => {
      const store = useIdentityStore()
      store.setUser({ address: ':0:12', name: 'Old' })
      apiService.setName.mockResolvedValue({ address: ':0:12', name: 'New Name' })

      const saved = await store.pushName('  New Name  ')

      expect(apiService.setName).toHaveBeenCalledWith('New Name')
      expect(saved).toBe('New Name')
      expect(store.user.name).toBe('New Name')
      expect(JSON.parse(localStorage.getItem('fm_user')).name).toBe('New Name')
    })
  })

})