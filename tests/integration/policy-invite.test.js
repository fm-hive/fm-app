import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePolicy } from '../../src/composables/usePolicy'
import { apiService } from '../../src/services/api'
import { useIdentityStore } from '../../src/stores/identity'
import { saveInvite, loadInvite, clearInvite } from '../../src/services/invite'

const policyPayload = JSON.stringify({
  id: 'policy123',
  policy: { text: 'Network policy', parameters: {} },
  data: {},
})

vi.mock('../../src/services/crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createJWS: vi.fn().mockResolvedValue('user.jws.token'),
    verifyJWS: vi.fn().mockImplementation(async () => policyPayload),
    // Decode the policy JWS payload, everything else uses the real decoder
    // (e.g. invite pubkey round-trips).
    base64UrlDecode: vi.fn((str) => {
      if (str === 'jws') return new TextEncoder().encode(policyPayload)
      return actual.base64UrlDecode(str)
    }),
    ed25519PublicKeyToX25519: vi.fn(() => new Uint8Array([7, 8, 9])),
    toHex: vi.fn(() => 'aabbcc'),
  }
})

vi.mock('../../src/services/api', () => ({
  apiService: {
    policy: vi.fn(),
    getEchoes: vi.fn().mockResolvedValue([]),
    setAddress: vi.fn(),
    subscribeEcho: vi.fn().mockResolvedValue({}),
    setNodeX25519PublicKey: vi.fn(),
    nodeX25519PublicKey: null,
  },
}))

// base64 std of the invite node key [1,2,3,4]
const NODE_KEY_B64 = 'AQIDBA=='
// base64 std of the client key [4,5,6]
const CLIENT_KEY_B64 = 'BAUG'

describe('Policy flow with an invite (QR)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Reset mocks and their once-queues (vi.clearAllMocks keeps queued values).
    apiService.policy.mockReset()
    apiService.getEchoes.mockResolvedValue([])
    apiService.subscribeEcho.mockResolvedValue({})
    apiService.setAddress.mockClear()
    apiService.setNodeX25519PublicKey.mockClear()
    apiService.nodeX25519PublicKey = null

    const identity = useIdentityStore()
    identity.privateKey = new Uint8Array([1, 2, 3])
    identity.publicKey = new Uint8Array([4, 5, 6])
  })

  it('sends the client pubkey in phase 1 and the voucher in phase 2', async () => {
    saveInvite({ pubkey: new Uint8Array([1, 2, 3, 4]), voucher: 'voucher-1' })
    apiService.nodeX25519PublicKey = new Uint8Array([7, 8, 9])
    apiService.policy
      .mockResolvedValueOnce({ policy: 'node.jws.token', sig_pkey: NODE_KEY_B64 })
      .mockResolvedValueOnce({ address: ':0:5', is_admin: false, name: 'Invited' })

    const { fetchPolicy, submitPolicy, error } = usePolicy()

    await fetchPolicy()
    expect(error.value).toBeNull()
    expect(apiService.policy).toHaveBeenNthCalledWith(1, { pubkey: CLIENT_KEY_B64 }, false)

    await submitPolicy({ verifySignature: true, name: 'Invited' })
    expect(error.value).toBeNull()
    expect(apiService.policy).toHaveBeenNthCalledWith(2, {
      policy: 'user.jws.token',
      sig_pkey: CLIENT_KEY_B64,
      name: 'Invited',
      voucher: 'voucher-1',
    }, false)

    // The invite is consumed after a successful registration.
    expect(loadInvite()).toBeNull()
  })

  it('rejects a node key that does not match the invite', async () => {
    saveInvite({ pubkey: new Uint8Array([9, 9, 9, 9]), voucher: 'voucher-1' })
    apiService.nodeX25519PublicKey = new Uint8Array([7, 8, 9])
    apiService.policy.mockResolvedValueOnce({ policy: 'node.jws.token', sig_pkey: NODE_KEY_B64 })

    const { fetchPolicy, error } = usePolicy()
    await expect(fetchPolicy()).rejects.toThrow('does not match the invite')
    expect(error.value).toContain('does not match the invite')
  })

  it('sends a plain phase 1 request when no node key is known', async () => {
    clearInvite()
    apiService.policy
      .mockResolvedValueOnce({ policy: 'node.jws.token', sig_pkey: NODE_KEY_B64 })
      .mockResolvedValueOnce(':0:6')

    const { fetchPolicy, submitPolicy } = usePolicy()
    await fetchPolicy()
    expect(apiService.policy).toHaveBeenNthCalledWith(1, null, false)

    await submitPolicy({ verifySignature: true })
    // No invite stored — no voucher field.
    expect(apiService.policy).toHaveBeenNthCalledWith(2, {
      policy: 'user.jws.token',
      sig_pkey: CLIENT_KEY_B64,
      name: '',
    }, false)
  })
})
