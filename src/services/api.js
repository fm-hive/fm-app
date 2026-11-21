import * as crypto from './crypto.js'
import { buildEnvelopeAuthPayload } from './envelope.js'
import { apiBasePath } from '../utils/appBase.js'

class ApiService {
  constructor(baseURL = null) {
    // The API is a sibling of the app directory (#337): the path is derived
    // from the deployment base at runtime (public/fm-config.js).
    this.baseURL = baseURL || apiBasePath()
    this.address = null // FM address (e.g., :0:1)
    this.nodeX25519PublicKey = null // Node's X25519 public key for envelope encryption
  }

  setAddress(address) {
    this.address = address
  }

  setNodeX25519PublicKey(publicKey) {
    this.nodeX25519PublicKey = publicKey
  }

  setBaseURL(baseURL) {
    this.baseURL = baseURL
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      let errorData
      try {
        const errorText = await response.text()
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: response.statusText }
      }
      
      // Check for policy signature error with next protocol hint
      if (errorData.next === 'policy' && errorData.error === 'No policy signature') {
        const error = new Error(errorData.error)
        error.name = 'PolicySignatureError'
        error.next = errorData.next
        error.status = response.status
        throw error
      }
      
      const error = new Error(`API error ${response.status}: ${errorData.error || errorData}`)
      // Keep the HTTP status so callers can react to specific codes (e.g. the
      // 502 camouflage of a closed policy flow, #83).
      error.status = response.status
      throw error
    }

    const responseData = await response.json()
    // Handle JWE encrypted response — decrypt with user's X25519 private key
    if (responseData.type === 'control' && responseData.jwe && !responseData.data) {
      try {
        const { useIdentityStore } = await import('../stores/identity.js')
        const identity = useIdentityStore()
        if (identity.x25519PrivateKey) {
          const cryptoMod = await import('./crypto.js')
          const decryptedBytes = await cryptoMod.decryptJWE(responseData.jwe, identity.x25519PrivateKey)
          const decryptedStr = new TextDecoder().decode(decryptedBytes)
          const controlData = JSON.parse(decryptedStr)
          return controlData.data !== undefined ? controlData.data : controlData
        }
      } catch (e) {
        console.warn('[API] Failed to decrypt JWE response:', e.message)
      }
    }

    // Responses are envelopes with type "control" and data containing request and data
    // Extract data field from envelope if present
    if (responseData.type === 'control' && responseData.data) {
      let controlData
      if (typeof responseData.data === 'string') {
        // Backend might send data as JSON string
        controlData = JSON.parse(responseData.data)
      } else {
        // Backend sends data as object
        controlData = responseData.data
      }
      return controlData.data !== undefined ? controlData.data : controlData
    }
    return responseData
  }

  async postWithEnvelope(requestName, data = null, requireAuth = false) {
    const apiPath = ''
    const envelope = {
      type: 'control',
    }

    const controlData = {
      request: requestName,
    }
    if (data !== null) {
      controlData.data = data
    }

    // Encrypt envelope for node when its public key is available.
    // This includes policy requests: with a QR invite the node key is known
    // upfront, and closed nodes (encrypted_policy_flow) only accept JWE.
    if (this.nodeX25519PublicKey) {
      try {
        const plaintext = JSON.stringify(controlData)
        const plaintextBytes = new TextEncoder().encode(plaintext)
        const jweToken = await crypto.encryptJWE(plaintextBytes, this.nodeX25519PublicKey)
        envelope.jwe = jweToken
        console.log('[API] Envelope encrypted for node')
      } catch (err) {
        console.error('[API] Failed to encrypt envelope:', err)
        // Fallback to unencrypted (may be rejected by node)
        envelope.data = controlData
      }
    } else {
      envelope.data = controlData
    }

    // Sign the hash of the transmitted carrier (the JWE, or the plaintext data
    // for bootstrap requests). The request itself never appears in the payload.
    if (requireAuth) {
      try {
        // Dynamically import identity store to avoid circular dependencies
        const { useIdentityStore } = await import('../stores/identity.js')
        const identity = useIdentityStore()

        if (identity.hasKeys && identity.privateKey && identity.publicKey) {
          const authPayload = await buildEnvelopeAuthPayload(envelope)
          envelope.jws = await crypto.createJWS(identity.privateKey, authPayload, identity.publicKey)
          console.log('[API] Added JWS signature to envelope')
        } else {
          console.warn('[API] Authentication required but no keys available')
        }
      } catch (err) {
        console.error('[API] Failed to add JWS signature:', err)
        // Continue without JWS - may fail on backend
      }
    }

    return this.request(apiPath, {
      method: 'POST',
      body: JSON.stringify(envelope),
    })
  }

  // Policy endpoint - phase 1 (no address needed), phase 2 (address optional)
  async policy(data = null) {
    return this.postWithEnvelope('policy', data, false)
  }

  // Identity endpoint — returns current user's address, is_admin, name
  async status() {
    return this.postWithEnvelope('identity', null, true)
  }

  // Update the display name on the node (users.name, issue #215)
  async setName(name) {
    return this.postWithEnvelope('set_name', { name }, true)
  }

  // Get echoes list (POST with envelope)
  async getEchoes() {
    return this.postWithEnvelope('echoes', null, true)
  }

  // Get nodes list (POST with envelope)
  async getNodes() {
    return this.postWithEnvelope('nodes', null, false)
  }

  // Send/receive messages - address required
  async sendReceive(data = null) {
    return this.postWithEnvelope('send_receive', data, true)
  }

  // Subscribe to an echo - address required
  async subscribeEcho(data) {
    // Add user_address to data if not already present and address is set
    const enrichedData = { ...data }
    if (this.address && !enrichedData.user_address) {
      enrichedData.user_address = this.address
    }
    return this.postWithEnvelope('subscribe_echo', enrichedData, true)
  }

  // Accept an echo's rules (sign rules hash and send acceptance) - address required
  async acceptRules(data) {
    return this.postWithEnvelope('accept_rules', data, true)
  }

  // Unsubscribe from an echo - address required
  async unsubscribeEcho(data) {
    // Add user_address to data if not already present and address is set
    const enrichedData = { ...data }
    if (this.address && !enrichedData.user_address) {
      enrichedData.user_address = this.address
    }
    return this.postWithEnvelope('unsubscribe_echo', enrichedData, true)
  }

  // Create local echo - address required
  async createLocalEcho(data) {
    // Add user_address to data if not already present and address is set
    const enrichedData = { ...data }
    if (this.address && !enrichedData.user_address) {
      enrichedData.user_address = this.address
    }
    return this.postWithEnvelope('create_local_echo', enrichedData, true)
  }

  // Create echo with rules - address required
  async createEchoWithRules(data) {
    // Add user_address to data if not already present and address is set
    const enrichedData = { ...data }
    if (this.address && !enrichedData.user_address) {
      enrichedData.user_address = this.address
    }
    return this.postWithEnvelope('create_echo_with_rules', enrichedData, true)
  }

  // Create an invite voucher (signed by the current user) - address required
  async createVoucher(data) {
    return this.postWithEnvelope('voucher', data, true)
  }

  async voucherList() {
    return this.postWithEnvelope('voucher', { action: 'list' }, true)
  }

  async revokeVoucher(code) {
    return this.postWithEnvelope('voucher', { action: 'revoke', code }, true)
  }

  // Client synchronize containers (several clients of one address) - address required
  async clientSynchronize(data) {
    return this.postWithEnvelope('client_synchronize', data, true)
  }

  // Service messages (ack, pubkey, etc.) - address required
  async service(messages) {
    return this.postWithEnvelope('service', { messages }, true)
  }

  // Merge - address required
  async merge(data) {
    return this.postWithEnvelope('merge', data, true)
  }

  // Recover an existing identity on a recovery node. The JWS is created by the
  // caller over {address, node_address}.
  async recover(data) {
    return this.postWithEnvelope('recover', data, true)
  }

}

export const apiService = new ApiService()