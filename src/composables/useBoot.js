import { computed } from 'vue'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useSettingsStore } from '../stores/settings'
import { usePolicy } from './usePolicy'
import { useBootStore, BOOT_STATE } from '../stores/boot'

/**
 * Boot composable for automatic application initialization
 * Manages password and policy dialogs, key loading, and policy flow
 * Uses Pinia store for shared state across components
 */

/**
 * True when a keystore error means "wrong/missing password" rather than an
 * unexpected failure. WebCrypto throws a DOMException (OperationError) when the
 * AES-GCM key does not match the stored ciphertext, e.g. after importing a
 * backup whose key is protected by another password.
 */
export function isPasswordError(err) {
  if (!err) return false
  const message = String(err.message || '')
  if (message.includes('Password required') || message.includes('decrypt')) return true
  if (err.name === 'OperationError') return true
  return /operation-specific reason/i.test(message)
}

// Module-level singleton (App.vue creates it first). Sharing one instance makes
// App.vue and the routed views (Home/Echoes/...) observe the SAME usePolicy
// state; otherwise each useBoot() call created its own policy refs, so a re-sign
// fetch routed through one instance left the dialog (fed by another) without the
// diff baseline. It also lets other composables (e.g. usePolling) route into the
// policy flow when the node reports "No policy signature" without destroying
// local identity data.
let bootInstance = null

export function useBoot() {
  if (bootInstance) return bootInstance

  const identity = useIdentityStore()
  const settings = useSettingsStore()
  const policy = usePolicy()
  const bootStore = useBootStore()

  // Deduplicates concurrent policy fetches: a re-sign can be triggered both by
  // polling and by the boot echo load. Without this the second fetch rewrote the
  // cached policy before the diff baseline was read (issue #248).
  let policyFetchPromise = null

  async function fetchPolicyOnce() {
    if (policyFetchPromise) return policyFetchPromise
    policyFetchPromise = policy.fetchPolicy().finally(() => { policyFetchPromise = null })
    return policyFetchPromise
  }
  
  // Expose store state and computed properties
  const isLoading = computed(() => bootStore.isLoading)
  const needsKeyGeneration = computed(() => bootStore.needsKeyGeneration)
  const needsPassword = computed(() => bootStore.needsPassword)
  const needsPolicy = computed(() => bootStore.needsPolicy)
  const isReady = computed(() => bootStore.isReady)
  const hasError = computed(() => bootStore.hasError)
  
  /**
   * Main boot function - called on app startup
   * Automatically determines what user needs to do
   */
  async function boot() {
    if (bootStore.bootState === BOOT_STATE.LOADING) return
    if (bootStore.bootState === BOOT_STATE.READY && identity.hasKeys) return
    
    bootStore.setState(BOOT_STATE.LOADING)
    bootStore.setError(null)
    bootStore.setPasswordDialog(false)
    bootStore.setPolicyConfirm(false)
    
    try {
      // Initialize settings (loads from localStorage, handles encryption)
      await settings.initialize()
      
      // The API base is derived from the deployment base at runtime (#337).
      // A recovery/open-node override persists across reloads.
      try {
        const { apiService } = await import('../services/api')
        const { apiBasePath } = await import('../utils/appBase')
        const { loadRecoveryNode } = await import('../utils/recoveryNode')
        const recovery = loadRecoveryNode()
        if (recovery?.apiUrl) {
          apiService.setBaseURL(recovery.apiUrl)
          if (recovery.nodePubkeyB64) {
            const key = Uint8Array.from(atob(recovery.nodePubkeyB64), c => c.charCodeAt(0))
            identity.setNodePublicKey(key)
            try {
              const { ed25519PublicKeyToX25519 } = await import('../services/crypto')
              const x25519 = ed25519PublicKeyToX25519(key)
              identity.setNodeX25519PublicKey(x25519)
              apiService.setNodeX25519PublicKey(x25519)
            } catch (err) {
              console.warn('Could not derive recovery node key:', err)
            }
          }
        } else {
          apiService.baseURL = apiBasePath()
        }
        console.log('API service initialized with URL:', apiService.baseURL)
      } catch (err) {
        console.warn('Could not update API service URL:', err)
        // Non-critical error, continue boot process
      }

      // Derive the node X25519 key from the cached node public key so all
      // requests are encrypted (required by closed nodes with
      // encrypted_policy_flow).
      await applyNodeKeyFromCache()

      // Pick up an invite passed in the URL (?pubkey=...&voucher=...), e.g. when
      // the user opens an invite link/QR with the phone camera.
      await applyInviteFromURL()
      
      // Check if keys are stored in localStorage
      if (identity.hasStoredKeys()) {
        // Try to load keys without password (works if not encrypted)
        await handleStoredKeys()
      } else {
        // No stored keys - user needs to sign policy
        await handleNoKeys()
      }
    } catch (err) {
      handleBootError(err)
    }
  }
  
  /**
   * Handle loading stored keys (with optional password)
   */
  async function handleStoredKeys(password = null) {
    try {
      // Check localStorage for remembered password
      let effectivePassword = password
      if (!effectivePassword) {
        const stored = localStorage.getItem('fm_session_password')
        if (stored) {
          effectivePassword = stored
        }
      }
      
      // Try to load keys
      await identity.loadStoredKeys(effectivePassword)
      
      // Keys loaded successfully
      await onKeysLoaded()
      
    } catch (err) {
       if (isPasswordError(err)) {
        // Password from localStorage may be wrong, clear it
        if (!password && localStorage.getItem('fm_session_password')) {
          localStorage.removeItem('fm_session_password')
        }
        // Keys are encrypted, need password
        bootStore.setPolicyConfirm(false)
        bootStore.setState(BOOT_STATE.NEEDS_PASSWORD)
        bootStore.setPasswordDialog(true)
      } else {
        // Other error loading keys
        throw err
      }
    }
  }
  
  /**
   * Handle case when no keys are stored
   */
  async function handleNoKeys() {
    // Show key generation dialog (password optional)
    bootStore.setPolicyConfirm(false)
    bootStore.setState(BOOT_STATE.NEEDS_KEY_GENERATION)
    bootStore.setPasswordDialog(true)
  }

  /**
   * Handle case when keys exist but policy not signed (no address)
   */
  async function handleNeedsPolicy(isNewKeys = false) {
    // A re-sign may be triggered from several places (polling, echo load); do
    // not start a second fetch once the confirmation dialog is already open.
    if (bootStore.showPolicyConfirm) {
      console.log('[useBoot] policy confirm already open, skipping refetch')
      return
    }

    // Fetch policy from node
    await fetchPolicyOnce()
    
    // Verify policy data is loaded
    if (!policy.policyData.value) {
      console.error('[useBoot] Policy data not loaded after fetchPolicy')
      bootStore.setError('Failed to load policy data')
      return
    }
    
    console.log('[useBoot] Policy data loaded:', policy.policyData.value)
    console.log('[useBoot] Policy loading state:', policy.loading.value)
    
    // Store isNewKeys flag for the policy confirmation dialog
    bootStore.isNewKeys = isNewKeys
    
    // Show policy confirmation dialog
    bootStore.setPasswordDialog(false)
    bootStore.setState(BOOT_STATE.NEEDS_POLICY)
    bootStore.setPolicyConfirm(true)
  }
  
  /**
   * Called when keys are successfully loaded (either from storage or new generation)
   */
  async function onKeysLoaded() {
    // Load stored user data (address) if available
    identity.loadStoredUser()
    
    // Check if we have address (policy signed)
    if (!identity.user?.address) {
      // Keys exist but no address - need to sign policy
      await handleNeedsPolicy()
      return
    }
    
    // Set address in API service if available
    const { apiService } = await import('../services/api')
    apiService.setAddress(identity.user.address)

    // Confirm roles with the node before the UI is shown: is_admin/is_moderator
    // come from the server only (a backup must not be able to fake them).
    await identity.syncAdminStatus()

    // Mark boot as ready
    bootStore.setState(BOOT_STATE.READY)
    bootStore.setPasswordDialog(false)
    bootStore.setPolicyConfirm(false)
    
    // Load echoes in background (non-blocking)
    loadEchoesBackground()
  }
  
  /**
   * Handle password confirmation from dialog
   * @param {Object} options - Password options
   */
  async function handlePasswordConfirm(options) {
    const { password, remember } = options
    const currentState = bootStore.bootState
    
    bootStore.setPasswordDialog(false)
    bootStore.setState(BOOT_STATE.LOADING)
    
    try {
      // Store password in localStorage if remember is checked
      if (remember && password) {
        localStorage.setItem('fm_session_password', password)
      }

      if (currentState === BOOT_STATE.NEEDS_KEY_GENERATION) {
        // Generate new keys with optional password
        await identity.generateAndSaveKeys(password || null)
        console.log('Keys generated successfully')
        // Now we have keys, proceed to policy (isNewKeys = true)
        await handleNeedsPolicy(true)
      } else {
        // Try to load existing keys with provided password
        await handleStoredKeys(password)
      }
    } catch (err) {
      // Handle errors based on original state
      if (currentState === BOOT_STATE.NEEDS_KEY_GENERATION) {
        bootStore.setError(err?.message || 'Failed to generate keys. Please try again.')
        console.error('Key generation failed:', err)
        bootStore.setState(BOOT_STATE.NEEDS_KEY_GENERATION)
      } else {
        bootStore.setError(err?.message || 'Failed to decrypt keys. Please check your password.')
        console.error('Password confirmation failed:', err)
        bootStore.setState(BOOT_STATE.NEEDS_PASSWORD)
      }
      bootStore.setPasswordDialog(true)
      throw err
    }
  }
  
  /**
   * Cancel password dialog
   */
  function cancelPassword() {
    const currentState = bootStore.bootState
    bootStore.setPasswordDialog(false)
    // Return to IDLE (not ERROR): the user must be able to retry the boot.
    bootStore.reset()
    bootStore.error = currentState === BOOT_STATE.NEEDS_KEY_GENERATION
      ? 'Key generation cancelled by user'
      : 'Boot process cancelled by user'
  }
  
  /**
   * Handle policy confirmation from dialog
   * @param {Object} options - Policy options
   */
  async function handlePolicyConfirm(options) {
    bootStore.setPolicyConfirm(false)
    bootStore.setState(BOOT_STATE.LOADING)
    
    try {
      // Submit signed policy to node
      await policy.submitPolicy(options)
      
      // Policy submitted successfully, keys should now be loaded
      await onKeysLoaded()
    } catch (err) {
      handleBootError(err)
    }
  }
  
  /**
   * Cancel policy dialog
   */
  function cancelPolicy() {
    bootStore.setPolicyConfirm(false)
    bootStore.setState(BOOT_STATE.IDLE)
    bootStore.setError('Policy flow cancelled by user')
  }
  
  /**
   * Handle boot errors
   * @param {Error} err - Error object
   */
  function handleBootError(err) {
    console.error('Boot error:', err)
    bootStore.setError(err.message)
    bootStore.setState(BOOT_STATE.ERROR)
    bootStore.setPasswordDialog(false)
    bootStore.setPolicyConfirm(false)
  }

  /**
   * Derive the node X25519 key from the cached node public key and configure the
   * API service so every request is encrypted for the node.
   */
  async function applyNodeKeyFromCache() {
    if (!identity.nodeEd25519PublicKey) return
    const { apiService } = await import('../services/api')
    const { ed25519PublicKeyToX25519 } = await import('../services/crypto')
    try {
      const x25519 = ed25519PublicKeyToX25519(identity.nodeEd25519PublicKey)
      identity.setNodeX25519PublicKey(x25519)
      apiService.setNodeX25519PublicKey(x25519)
    } catch (err) {
      console.warn('[boot] failed to derive node X25519 key from cache:', err)
    }
  }

  /**
   * Apply an invite passed in the page URL (?pubkey=...&voucher=...), e.g. when
   * the user opens an invite link/QR with the phone camera.
   */
  async function applyInviteFromURL() {
    if (typeof window === 'undefined' || !window.location?.search) return
    const { parseInviteURL } = await import('../services/invite')
    const invite = parseInviteURL(window.location.href)
    if (!invite || (!invite.pubkey && !invite.voucher)) return

    // Strip the invite params from the address bar.
    try {
      const clean = new URL(window.location.href)
      clean.searchParams.delete('pubkey')
      clean.searchParams.delete('voucher')
      window.history.replaceState({}, '', clean.toString())
    } catch {
      // ignore
    }

    await applyInvite(invite)
    console.log('[boot] invite applied from URL')
  }

  /**
   * Apply an invite: persist the node URL, remember the invite (node public key
   * + voucher) and configure the API service so policy requests are encrypted.
   * @param {{baseUrl?: string, pubkey?: Uint8Array|null, voucher?: string|null}} invite
   */
  async function applyInvite(invite) {
    const { apiService } = await import('../services/api')
    const { saveInvite } = await import('../services/invite')
    const { ed25519PublicKeyToX25519 } = await import('../services/crypto')

    if (invite.baseUrl) {
      // An invite opened on this deployment points at the same origin/prefix;
      // keep the in-session override only (the API base is compiled in, #337).
      apiService.setBaseURL(invite.baseUrl)
    }
    saveInvite({ pubkey: invite.pubkey, voucher: invite.voucher })
    if (invite.pubkey) {
      identity.setNodePublicKey(invite.pubkey)
      try {
        const x25519 = ed25519PublicKeyToX25519(invite.pubkey)
        identity.setNodeX25519PublicKey(x25519)
        apiService.setNodeX25519PublicKey(x25519)
      } catch (err) {
        console.warn('[boot] failed to derive node X25519 key from invite:', err)
      }
    }
    if (invite.recovery && invite.baseUrl) {
      const { saveRecoveryNode } = await import('../utils/recoveryNode')
      const { bytesToBase64 } = await import('../services/invite')
      saveRecoveryNode({
        apiUrl: invite.baseUrl,
        nodePubkeyB64: invite.pubkey ? bytesToBase64(invite.pubkey) : '',
        appUrl: invite.appUrl || '',
      })
    }
    return invite
  }
  
  /**
   * Reset boot state (e.g., after logout or error recovery)
   */
  function reset() {
    bootStore.reset()
  }
  
  /**
   * Manually trigger boot process (e.g., from UI)
   */
  async function manualBoot() {
    reset()
    await boot()
  }
  
  /**
   * Load echoes in background (non-blocking)
   */
  async function loadEchoesBackground() {
    try {
      const { apiService } = await import('../services/api')
      const echoesData = await apiService.getEchoes()
      const echoStore = useEchoStore()
      
      // Update echo store with loaded echoes
      await echoStore.reconcileEchoRenames(echoesData)
      echoStore.setEchoes(echoesData)
      
      // Restore subscriptions from identity store
      // Defensive checks for subscriptions
      if (!identity.subscriptions) {
        console.error('[useBoot] identity.subscriptions is undefined', identity)
        return
      }
      if (!identity.subscriptions.value) {
        console.warn('[useBoot] identity.subscriptions.value is undefined, initializing empty Set')
        identity.subscriptions.value = new Set()
      }
      
      identity.subscriptions.value.forEach(echoName => {
        echoStore.subscribe(echoName)
        console.log('Restoring subscription to:', echoName)
      })
     } catch (err) {
       if (err.name === 'PolicySignatureError') {
         console.log('Policy signature missing or outdated, triggering policy flow')
         await handleNeedsPolicy()
       } else {
         console.warn('Failed to load echoes on startup:', err)
         // Non-critical error, don't affect boot state
       }
     }
   }
  
  /**
   * Handle "No policy signature" reported by the node during polling.
   * Unlike the old behaviour (delete fm_user + reload, which could strand the
   * app on "Setup identity"), this keeps local identity/keys intact and routes
   * into the policy re-sign dialog.
   */
  async function handlePolicySignatureMissing() {
    if (bootStore.showPolicyConfirm) {
      console.log('[boot] policy confirm already open, skipping re-sign refetch')
      return
    }
    console.warn('[boot] No policy signature from node — re-running policy flow')
    bootStore.reset()
    // Preserve user/keys; only re-fetch and show the policy confirmation.
    try {
      await fetchPolicyOnce()
    } catch (err) {
      console.error('[boot] policy fetch failed on re-sign:', err)
      bootStore.setError('Failed to load policy data')
      return
    }
    bootStore.isNewKeys = false
    bootStore.setPasswordDialog(false)
    bootStore.setState(BOOT_STATE.NEEDS_POLICY)
    bootStore.setPolicyConfirm(true)
  }

  // Publish the shared singleton so polling (and others) can route into the
  // policy flow. The handle is created once with the shared policy instance.
  bootInstance = {
    // Methods
    boot,
    manualBoot,
    handlePasswordConfirm,
    cancelPassword,
    handlePolicyConfirm,
    cancelPolicy,
    handlePolicySignatureMissing,
    applyInvite,
    reset,

    // Policy data (for passing to PolicyConfirm component)
    policyData: policy.policyData,
    previousPolicy: policy.previousPolicyData,
    nodePublicKeyBase64: policy.nodePublicKeyBase64,
    signatureVerified: policy.signatureVerified,
    policyLoading: policy.loading,
  }
  return bootInstance
}

/** Returns the active boot instance if one was created (App.vue). */
export function getActiveBoot() {
  return bootInstance
}
