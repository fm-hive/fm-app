import { ref, computed } from 'vue'
import { apiService } from '../services/api'
import * as crypto from '../services/crypto'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { readStoredPolicy, rememberPreviousPolicy, selectPreviousPolicy } from '../utils/policyBaseline'
import { policyErrorMessage } from '../utils/policyErrors'
import { loadInvite } from '../services/invite'
import i18n from '../i18n/index'

/**
 * Policy flow composable with password protection and user confirmation
 */
export function usePolicy() {
  const identity = useIdentityStore()
  const echoStore = useEchoStore()
  // Global i18n instance: this composable is also used outside a component
  // setup (integration tests, boot flow), where useI18n() is not available.
  const t = (key) => i18n.global.t(key)
  
  // State
  const loading = ref(false)
  const error = ref(null)
  const policyData = ref(null)
  const nodePublicKeyBase64 = ref('')
  const signatureVerified = ref(false)
  const previousPolicyData = ref(null) // last accepted policy, for the diff during re-sign
  
  // Computed
  const hasPolicyData = computed(() => policyData.value !== null)
  
  /**
   * Fetch policy from node (phase 1)
   * @returns {Promise<Object>} Policy data including JWS and node public key
   */
  async function fetchPolicy() {
    console.log('[usePolicy] fetchPolicy start, loading:', loading.value)
    loading.value = true
    error.value = null
    try {
      // Apply a stored invite (from a QR code) before phase 1: it provides the
      // node's public key so the request can be encrypted and the response key
      // can be verified against the invite.
      const { loadInvite } = await import('../services/invite')
      const invite = loadInvite()
      let invitePubkey = null
      if (invite?.pubkey) {
        invitePubkey = invite.pubkey
        identity.setNodePublicKey(invite.pubkey)
        try {
          const inviteX25519 = crypto.ed25519PublicKeyToX25519(invite.pubkey)
          identity.setNodeX25519PublicKey(inviteX25519)
          apiService.setNodeX25519PublicKey(inviteX25519)
        } catch (err) {
          console.warn('[usePolicy] failed to derive node X25519 key from invite:', err)
        }
      }

      // Step 1: Get network policy from node (phase 1 - no address needed).
      // When the node key is known, the request is encrypted and carries our
      // public key so the node encrypts its response for us.
      let phase1Data = null
      if (apiService.nodeX25519PublicKey && identity.publicKey) {
        phase1Data = { pubkey: btoa(String.fromCharCode(...identity.publicKey)) }
      }
      console.log('[usePolicy] calling apiService.policy...')
      const phase1Response = await apiService.policy(phase1Data, false)
      console.log('[usePolicy] phase1Response:', phase1Response)
      
      // Response should contain: { policy: jwsToken, sig_pkey: base64PublicKey }
      const policyJWS = phase1Response.policy
      const nodeSigPkeyB64 = phase1Response.sig_pkey
      
      if (!policyJWS || !nodeSigPkeyB64) {
        throw new Error('Invalid policy response from node')
      }

      // The node key must match the one from the invite (MITM protection).
      if (invitePubkey) {
        const responseKey = Uint8Array.from(atob(nodeSigPkeyB64), c => c.charCodeAt(0))
        const sameKey = responseKey.length === invitePubkey.length &&
          responseKey.every((byte, i) => byte === invitePubkey[i])
        if (!sameKey) {
          throw new Error('Node public key does not match the invite')
        }
      }
      
      // Store node public key
      nodePublicKeyBase64.value = nodeSigPkeyB64
      console.log('[usePolicy] nodePublicKeyBase64:', nodeSigPkeyB64)
      
      // Store node public key in identity store for encryption
      const nodeEd25519PublicKey = Uint8Array.from(atob(nodeSigPkeyB64), c => c.charCodeAt(0))
      identity.setNodePublicKey(nodeEd25519PublicKey)
      
      // Store node key in keyService for message signature verification
      const { keyService } = await import('../services/keyService')
      const keyThumbprint = await crypto.computeThumbprint(nodeEd25519PublicKey)
      keyService.keyCache.set(':0:0', {
        signPublicKey: nodeEd25519PublicKey,
        keyThumbprint: keyThumbprint,
        x25519PublicKey: null,
      })
      keyService.saveToStorage()
      
      try {
        const nodeX25519PublicKey = crypto.ed25519PublicKeyToX25519(nodeEd25519PublicKey)
        identity.setNodeX25519PublicKey(nodeX25519PublicKey)
        apiService.setNodeX25519PublicKey(nodeX25519PublicKey)
        console.log('[usePolicy] Node X25519 public key derived and stored')
      } catch (err) {
        console.warn('[usePolicy] Failed to convert node public key to X25519:', err)
        // Conversion may fail if library doesn't support it; we'll attempt later
      }
      
      // Step 2: Verify node's signature (optional)
      console.log('[usePolicy] verifying node signature...')
      const verificationResult = await verifyNodeSignature(policyJWS, nodeSigPkeyB64)
      signatureVerified.value = verificationResult.verified
      console.log('[usePolicy] signatureVerified:', verificationResult.verified)
      
      if (!verificationResult.verified) {
        console.warn('Node signature verification failed:', verificationResult.error)
      }
      
      // Step 3: Parse policy payload
      console.log('[usePolicy] parsing policy JWS...')
      const parsedPolicy = parsePolicyJWS(policyJWS)
      console.log('[usePolicy] parsedPolicy:', parsedPolicy)
      policyData.value = parsedPolicy
      console.log('[usePolicy] policyData.value set')

      // Snapshot the previously cached policy BEFORE overwriting fm_policy_full
      // and remember it as fm_policy_prev whenever it differs from the fetched
      // one. This keeps the diff baseline stable across the several fetchPolicy
      // calls a single re-sign flow can trigger (polling + boot echo load):
      // the second call would otherwise see fm_policy_full === current and lose
      // the baseline.
      rememberPreviousPolicy(parsedPolicy)

      // Keep the previously accepted policy so the confirmation dialog can show
      // a diff. Primary source is the last policy this client signed; fall back
      // to the last distinct policy seen (older clients / first run after the
      // upgrade). Always overwrite: a baseline from a previous identity must not
      // leak into the current one.
      previousPolicyData.value = loadPreviousPolicy(parsedPolicy)

      // Persist policy parameters for election/vote state computation
      if (parsedPolicy?.policy?.parameters) {
        localStorage.setItem('fm_policy_params', JSON.stringify(parsedPolicy.policy.parameters))
      }
      // Persist full policy for policy viewer page
      try {
        localStorage.setItem('fm_policy_full', JSON.stringify(parsedPolicy))
      } catch {}
      
      return {
        policyJWS,
        nodePublicKeyBase64: nodeSigPkeyB64,
        policyData: parsedPolicy,
        signatureVerified: verificationResult.verified
      }
    } catch (err) {
      // A closed node answers 502 without the node key (see policyErrorMessage).
      const message = policyErrorMessage(err, { t })
      error.value = message
      console.error('Failed to fetch policy:', err)
      const wrapped = new Error(message)
      wrapped.status = err?.status
      wrapped.cause = err
      throw wrapped
    } finally {
      loading.value = false
      console.log('[usePolicy] fetchPolicy end, loading:', loading.value)
    }
  }
  
  /**
   * Submit signed policy to node (phase 2)
   * @param {Object} options - Options for policy submission
   * @param {boolean} options.verifySignature - Whether to require signature verification
   * @param {string} options.password - Password for encrypted keys (if needed)
   * @returns {Promise<Object>} Result with user address and other data
   */
  async function submitPolicy(options = {}) {
    const { verifySignature = true, password = null, name = '' } = options
    
    loading.value = true
    error.value = null
    let newcomersEchoName = null
    
    try {
      // Validate policy data exists
      if (!policyData.value || !nodePublicKeyBase64.value) {
        throw new Error('No policy data available. Call fetchPolicy first.')
      }
      
      // Validate signature if required
      if (verifySignature && !signatureVerified.value) {
        throw new Error('Node signature verification is required but signature is not verified')
      }
      
      // Step 1: Ensure user has keys (load from storage or generate new)
      let privateKey = identity.privateKey
      let publicKey = identity.publicKey
      
      if (!privateKey || !publicKey) {
        // Try to load existing keys from storage
        if (identity.hasStoredKeys()) {
          await loadKeysWithPassword(password)
          privateKey = identity.privateKey
          publicKey = identity.publicKey
        } else {
          // Generate new keys
          const keyPair = await identity.generateAndSaveKeys(password)
          privateKey = keyPair.privateKey
          publicKey = keyPair.publicKey
        }
      }
      
      // Step 2: Create user's signature of the same policy payload
      const payloadString = JSON.stringify(policyData.value)
      const userPolicyJWS = await crypto.createJWS(privateKey, payloadString, publicKey)
      
      // Step 3: Export user's public key as base64
      const userSigPkeyB64 = btoa(String.fromCharCode(...publicKey))
      
      // Step 4: Send signed policy back to node (phase 2)
      // Never submit an empty display name when one is already known locally:
      // a re-sign (existing user, no name input) must not wipe the imported or
      // stored name (#290).
      const effectiveName = (name || identity.user?.name || '').trim()

      const { loadInvite, clearInvite } = await import('../services/invite')
      const invite = loadInvite()
      const phase2Data = {
        policy: userPolicyJWS,
        sig_pkey: userSigPkeyB64,
        name: effectiveName,
      }
      if (invite?.voucher) {
        phase2Data.voucher = invite.voucher
      }
      
      const phase2Response = await apiService.policy(phase2Data, false)
      
      // Response can be string (address) or object {address, is_admin}
      let userAddress, isAdmin
      if (typeof phase2Response === 'string') {
        userAddress = phase2Response
        isAdmin = false
      } else if (phase2Response && typeof phase2Response === 'object') {
        userAddress = phase2Response.address
        isAdmin = !!phase2Response.is_admin
      }
      if (!userAddress || typeof userAddress !== 'string') {
        throw new Error('Invalid user address received')
      }
      
      // Step 5: Store user address in identity store and api service
      identity.setUser({
        address: userAddress,
        publicKey: crypto.toHex(publicKey),
        isAdmin: isAdmin,
        isModerator: !!phase2Response.is_moderator,
        name: phase2Response.name || effectiveName || identity.user?.name || '',
      })
      apiService.setAddress(userAddress)
      
      // Step 6: Process special echogroups and auto-subscribe
      newcomersEchoName = await processSpecialEchogroups(policyData.value)
      
      // Registration succeeded — the invite (if any) has been used.
      clearInvite()
      
      // Remember the accepted policy: it is the diff baseline for the next re-sign.
      saveAcceptedPolicy(policyData.value, nodePublicKeyBase64.value)
      previousPolicyData.value = policyData.value
      
      // Step 7: Load echoes for moderator detection
      await loadEchoes(newcomersEchoName)
      
      console.log('Policy flow completed successfully. User address:', userAddress)
      
      return {
        userAddress,
        publicKey: crypto.toHex(publicKey),
        newcomersEchoName,
        signatureVerified: signatureVerified.value
      }
    } catch (err) {
      const message = friendlyPolicyError(err)
      error.value = message
      console.error('Failed to submit policy:', err)
      const wrapped = new Error(message)
      wrapped.status = err?.status
      wrapped.cause = err
      throw wrapped
    } finally {
      loading.value = false
    }
  }

  /**
   * Human-readable text for a policy submit failure. A 502 means the node hides
   * the API: either the closed policy flow (no/wrong node key) or a missing
   * invite voucher when the network requires one (#83).
   */
  function friendlyPolicyError(err) {
    const params = policyData.value?.policy?.parameters || {}
    const voucherEnabled = params.voucher_enable === undefined || String(params.voucher_enable) !== 'false'
    return policyErrorMessage(err, {
      voucherEnabled,
      hasVoucher: !!loadInvite()?.voucher,
      t,
    })
  }
  
  /**
   * Complete policy flow (for backward compatibility)
   * This method performs fetchPolicy and submitPolicy sequentially
   * @param {Object} options - Options for policy submission
   * @param {boolean} options.verifySignature - Whether to require signature verification
   * @param {string} options.password - Password for encrypted keys (if needed)
   * @returns {Promise<Object>} Result from submitPolicy
   */
  async function startPolicy(options = {}) {
    try {
      // Fetch policy first
      await fetchPolicy()
      
      // Submit policy with options
      return await submitPolicy(options)
    } catch (err) {
      // Error already set in fetchPolicy or submitPolicy
      throw err
    }
  }
  
  // Internal helper functions
  
  async function verifyNodeSignature(policyJWS, nodePublicKeyBase64) {
    try {
      const nodePublicKey = Uint8Array.from(atob(nodePublicKeyBase64), c => c.charCodeAt(0))
      const payload = await crypto.verifyJWS(policyJWS, nodePublicKey)
      return { verified: true, payload }
    } catch (err) {
      return { verified: false, error: err.message }
    }
  }
  
  function parsePolicyJWS(policyJWS) {
    const jwsParts = policyJWS.split('.')
    if (jwsParts.length !== 3) {
      throw new Error('Invalid JWS format from node')
    }
    const payloadEncoded = jwsParts[1]
    const payloadBytes = crypto.base64UrlDecode(payloadEncoded)
    return JSON.parse(new TextDecoder().decode(payloadBytes))
  }

  /**
   * Policy the client signed last time (diff baseline). Guarded by the node
   * key so a baseline from another node is never used. Falls back to the last
   * distinct policy seen for clients that signed before this key existed.
   */
  function loadPreviousPolicy(currentPolicy) {
    return selectPreviousPolicy({
      accepted: readStoredPolicy('fm_policy_accepted'),
      prev: readStoredPolicy('fm_policy_prev'),
      nodeKey: nodePublicKeyBase64.value,
      currentPolicy,
    })
  }

  function saveAcceptedPolicy(policy, nodeKey) {
    if (!policy?.policy || !nodeKey) return
    try {
      localStorage.setItem('fm_policy_accepted', JSON.stringify({ nodeKey, payload: policy }))
    } catch {}
  }
  
  async function loadKeysWithPassword(password = null) {
    // If no password provided and keys are encrypted, show password dialog
    if (identity.isKeyEncrypted() && !password) {
      throw new Error('Password required to decrypt keys')
    }
    
    await identity.loadStoredKeys(password)
  }
  
  async function processSpecialEchogroups(policyData) {
    try {
      const policyObj = policyData.policy
      if (policyObj && policyObj.parameters) {
        const specialEchogroups = policyObj.parameters.special_echogroups
        if (specialEchogroups && specialEchogroups.network_news) {
          // The Network news conference is node-posted (users read only, #310).
          identity.setNetworkNewsEchoName(specialEchogroups.network_news)
        }
        if (specialEchogroups && specialEchogroups.announcements) {
          const newcomersEchoName = specialEchogroups.announcements
          identity.setNewcomersEchoName(newcomersEchoName)
          console.log('Auto-subscribing to newcomers group:', newcomersEchoName)
          
          // Auto-subscribe to newcomers group
          try {
            await apiService.subscribeEcho({
              echo_name: newcomersEchoName,
            })
            console.log('Successfully subscribed to newcomers group:', newcomersEchoName)
            identity.addSubscription(newcomersEchoName)
          } catch (subscribeErr) {
            // Если ошибка "Already subscribed" (409), всё равно добавляем подписку локально
            if (subscribeErr.message.includes('Already subscribed') || subscribeErr.message.includes('409')) {
              console.log('Already subscribed to newcomers group, updating local state:', newcomersEchoName)
              identity.addSubscription(newcomersEchoName)
            } else {
              console.warn('Failed to auto-subscribe to newcomers group:', subscribeErr)
              // Continue anyway
            }
          }
          
          return newcomersEchoName
        }
      }
    } catch (err) {
      console.warn('Failed to process special echogroups:', err)
    }
    return null
  }
  
  async function loadEchoes(newcomersEchoName = null) {
    try {
      const echoesData = await apiService.getEchoes()
      await echoStore.reconcileEchoRenames(echoesData)
      echoStore.setEchoes(echoesData)
      
      // After loading echoes, ensure newcomers group is marked as subscribed
      if (newcomersEchoName) {
        const newcomersEcho = echoesData.find(echo => echo.name === newcomersEchoName)
        if (newcomersEcho) {
          echoStore.subscribe(newcomersEchoName)
          identity.addSubscription(newcomersEchoName)
          console.log('Marked newcomers group as subscribed in store:', newcomersEchoName)
        }
      }
    } catch (err) {
      console.warn('Failed to load echoes:', err)
    }
  }
  
  return {
    // State
    loading,
    error,
    policyData,
    previousPolicyData,
    nodePublicKeyBase64,
    signatureVerified,
    hasPolicyData,
    
    // Methods
    fetchPolicy,
    submitPolicy,
    startPolicy,
  }
}