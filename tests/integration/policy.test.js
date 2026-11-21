import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePolicy } from '../../src/composables/usePolicy'
import { apiService } from '../../src/services/api'
import { useIdentityStore } from '../../src/stores/identity'
import { useEchoStore } from '../../src/stores/echo'
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
    verifyJWS: vi.fn(),
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
   },
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
import { keystore } from '../../src/services/keystore'

describe('Policy Flow Integration Test (JWS flow)', () => {
  let consoleLogSpy
  let consoleWarnSpy
  let consoleErrorSpy
  
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    
    // Mock console methods to suppress output during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  
  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('should complete policy flow with new identity', async () => {
    // Mock crypto functions
    const mockKeyPair = {
      privateKey: new Uint8Array([1, 2, 3]),
      publicKey: new Uint8Array([4, 5, 6]),
    }
    
    crypto.generateKeyPair.mockResolvedValue(mockKeyPair)
    crypto.toHex.mockImplementation(arr => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''))
    crypto.ed25519PublicKeyToX25519.mockReturnValue(new Uint8Array([7, 8, 9])) // dummy X25519 key
    crypto.signMessage.mockResolvedValue(new Uint8Array([10, 11, 12]))
    crypto.verifySignature.mockResolvedValue(true)
     crypto.base64UrlDecode.mockImplementation(str => {
       // Simulate decoding base64url payload
       const jsonStr = JSON.stringify({
         id: 'policy123',
         policy: { 
           text: 'Network policy', 
           parameters: {
             special_echogroups: {
               announcements: 'группа новичков',
               admin: 'совета узлов',
               moderators: 'совета модераторов'
             }
           } 
         },
         data: {},
       })
       return new TextEncoder().encode(jsonStr)
     })
    crypto.createJWS.mockResolvedValue('user.jws.token')
    crypto.verifyJWS.mockResolvedValue(JSON.stringify({
      id: 'policy123',
      policy: { 
        text: 'Network policy', 
        parameters: {
          special_echogroups: {
            announcements: 'группа новичков',
            admin: 'совета узлов',
            moderators: 'совета модераторов'
          }
        } 
      },
      data: {},
    }))

    // Mock keystore - no stored keys
    keystore.hasStoredKeys.mockReturnValue(false)
    keystore.isEncrypted.mockReturnValue(false)
    keystore.generateKeys.mockResolvedValue(mockKeyPair)
    keystore.saveKeys.mockResolvedValue(undefined)
    keystore.loadKeys.mockRejectedValue(new Error('No keys stored'))

    // Mock API responses
    const mockPhase1Response = {
      policy: 'node.jws.token',
      sig_pkey: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=',
    }
    
    const mockPhase2Response = ':0:1' // user address
    
    apiService.policy
      .mockResolvedValueOnce(mockPhase1Response) // phase 1
      .mockResolvedValueOnce(mockPhase2Response) // phase 2
    
     apiService.getEchoes.mockResolvedValue([
       { name: 'General', description: 'General discussions', has_rules: false },
       { name: 'группа новичков', description: 'Newcomers announcements', has_rules: false },
     ])
     
     apiService.subscribeEcho.mockResolvedValue({})
    
    // Run policy flow using fetchPolicy and submitPolicy directly
    const { fetchPolicy, submitPolicy, loading, error } = usePolicy()
    
    expect(loading.value).toBe(false)
    
    // Phase 1: fetch policy
    const fetchPromise = fetchPolicy()
    expect(loading.value).toBe(true)
    await fetchPromise
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()

    // Phase 2: submit policy
    const submitPromise = submitPolicy({ verifySignature: true })
    expect(loading.value).toBe(true)
    await submitPromise
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()

    // Verify crypto was called correctly
    // Note: crypto.generateKeyPair is called via keystore.generateKeys
    // but keystore.generateKeys is mocked, so crypto.generateKeyPair may not be called
    // We verify keystore.generateKeys was called instead
    expect(keystore.generateKeys).toHaveBeenCalledTimes(1)
    expect(crypto.base64UrlDecode).toHaveBeenCalled()
    expect(crypto.createJWS).toHaveBeenCalledWith(
      mockKeyPair.privateKey,
      expect.any(String), // policy payload JSON
      mockKeyPair.publicKey
    )

    // Verify API calls
    expect(apiService.policy).toHaveBeenCalledTimes(2)
    expect(apiService.policy).toHaveBeenNthCalledWith(1, null, false)
    expect(apiService.policy).toHaveBeenNthCalledWith(2, {
      policy: 'user.jws.token',
      sig_pkey: expect.any(String),
      name: '',
    }, false)
    expect(apiService.getEchoes).toHaveBeenCalled()
    expect(apiService.setAddress).toHaveBeenCalledWith(':0:1')

    // Verify identity store updated
    const identity = useIdentityStore()
    expect(identity.privateKey).toEqual(mockKeyPair.privateKey)
    expect(identity.publicKey).toEqual(mockKeyPair.publicKey)
    expect(identity.user).toMatchObject({
      address: ':0:1',
      publicKey: crypto.toHex(mockKeyPair.publicKey),
      isAdmin: false,
    })

     // Verify echo store updated
     const echoStore = useEchoStore()
     expect(echoStore.echoes).toHaveLength(2)
  })

  it('re-sign keeps the existing display name when no new name is given (#290)', async () => {
    crypto.base64UrlDecode.mockImplementation(() => new TextEncoder().encode(JSON.stringify({
      id: 'policy123',
      policy: { text: 'Network policy', parameters: {} },
      data: {},
    })))
    crypto.verifyJWS.mockResolvedValue(JSON.stringify({
      id: 'policy123',
      policy: { text: 'Network policy', parameters: {} },
      data: {},
    }))
    crypto.createJWS.mockResolvedValue('user.jws.token')
    crypto.toHex.mockImplementation(arr => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''))
    keystore.hasStoredKeys.mockReturnValue(true)
    keystore.isEncrypted.mockReturnValue(false)

    const identity = useIdentityStore()
    identity.privateKey = new Uint8Array([1, 2, 3])
    identity.publicKey = new Uint8Array([4, 5, 6])
    identity.setUser({ address: ':0:1', name: 'Maksim' })

    apiService.policy
      .mockResolvedValueOnce({ policy: 'node.jws.token', sig_pkey: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=' })
      .mockResolvedValueOnce({ address: ':0:1', is_admin: false, is_moderator: false, name: '' })
    apiService.getEchoes.mockResolvedValue([])

    const { fetchPolicy, submitPolicy } = usePolicy()
    await fetchPolicy()
    await submitPolicy({ verifySignature: true })

    const secondCall = apiService.policy.mock.calls[1][0]
    expect(secondCall.name).toBe('Maksim')
    expect(useIdentityStore().user.name).toBe('Maksim')
  })

   it('should handle policy flow errors', async () => {
        // Clear any previous calls to console.error mock
        consoleErrorSpy.mockClear()
        
        // Mock successful phase1 response
        apiService.policy.mockResolvedValue({
          policy: 'node.jws.token',
          sig_pkey: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=',
        })
        // Mock base64UrlDecode to return valid payload
        crypto.base64UrlDecode.mockImplementation(str => {
          const jsonStr = JSON.stringify({
            id: 'policy123',
            policy: { text: 'Network policy', parameters: {} },
            data: {},
          })
          return new TextEncoder().encode(jsonStr)
        })
        crypto.verifyJWS.mockResolvedValue(JSON.stringify({
          id: 'policy123',
          policy: { text: 'Network policy', parameters: {} },
          data: {},
        }))
        
        // Mock keystore - no stored keys, generateKeys will reject
        keystore.hasStoredKeys.mockReturnValue(false)
        keystore.isEncrypted.mockReturnValue(false)
        keystore.generateKeys.mockImplementation(() => Promise.reject(new Error('Crypto error')))
        keystore.saveKeys.mockResolvedValue(undefined)
        keystore.loadKeys.mockRejectedValue(new Error('No keys stored'))
        
         const { fetchPolicy, submitPolicy, loading, error } = usePolicy()
         
         // First fetch policy to populate policyData
         await fetchPolicy()
         
         // submitPolicy should reject with the error
         await expect(submitPolicy({ verifySignature: true })).rejects.toThrow('Crypto error')
         
         expect(loading.value).toBe(false)
         expect(error.value).toBe('Crypto error')
         
         // Verify console.error was called with the error
         expect(consoleErrorSpy).toHaveBeenCalled()
         expect(consoleErrorSpy.mock.calls[0][0]).toBe('Failed to submit policy:')
         expect(consoleErrorSpy.mock.calls[0][1].message).toBe('Crypto error')
      })
})