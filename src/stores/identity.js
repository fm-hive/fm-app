import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { keystore } from '../services/keystore'
import * as crypto from '../services/crypto.js'

export const useIdentityStore = defineStore('identity', () => {
   const user = ref(null) // { publicKey, name, avatar? } - metadata from policy
   const privateKey = ref(null) // raw bytes (Uint8Array)
   const publicKey = ref(null) // raw bytes
    const rules = ref(null) // { moderators: [], ... } parsed from echoes request rules field
   const subscriptions = ref(new Set()) // Set of echo names user is subscribed to
    const newcomersEchoName = ref(null) // Special echo name for announcements (группа новичков)
    const networkNewsEchoName = ref(null) // Network news echo (node-posted chronicle, #310)
    const passwordRequired = ref(false) // Whether password is required to unlock keys
    const nodeEd25519PublicKey = ref(null) // Node's Ed25519 public key (from policy)
    const nodeX25519PublicKey = ref(null) // Node's X25519 public key (derived from Ed25519)
    const x25519PrivateKey = ref(null) // User's X25519 private key for decryption (derived from Ed25519)
    const x25519PublicKey = ref(null) // User's X25519 public key for encryption (derived from Ed25519)
    const keyThumbprint = ref(null) // Base64url SHA256 thumbprint of signPublicKey
    // Own active refill requests: { [echoName]: { messageId, before, sentAt } }.
    // The node does not echo the requester's own refill request back, so we keep
    // it locally to offer a cancel action (see Echoes.vue header button).
    const myRefillRequests = ref(loadMyRefillRequests())

  const hasKeys = computed(() => privateKey.value !== null && publicKey.value !== null)
  const signPublicKey = computed(() => publicKey.value) // Alias for publicKey
  // Moderator: confirmed by the node (is_moderator in the identity/policy
  // response) or derived from the echo rules of the current echo.
  const isModerator = computed(() => {
    if (user.value?.isModerator) return true
    if (!rules.value || !user.value?.address) return false
    const mods = rules.value.parameters?.moderators || rules.value.moderators
    if (!Array.isArray(mods)) return false
    return mods.includes(user.value.address)
  })
  // Admin: server-confirmed only (users.is_admin). Moderator rights are NOT
  // admin rights — the node enforces this, the UI must not claim otherwise.
  const isAdmin = computed(() => !!user.value?.isAdmin)

  // Check if user is subscribed to a specific echo
  function isSubscribed(echoName) {
    return subscriptions.value.has(echoName)
  }

  // Add subscription
  function addSubscription(echoName) {
    // Replace the Set instead of mutating it: callers read it through the
    // store and a replaced value is always reactive (#388).
    if (subscriptions.value.has(echoName)) return
    subscriptions.value = new Set([...subscriptions.value, echoName])
    saveSubscriptionsToStorage()
  }

  // Remove subscription
  function removeSubscription(echoName) {
    if (!subscriptions.value.has(echoName)) return
    subscriptions.value = new Set(
      [...subscriptions.value].filter(name => name !== echoName),
    )
    saveSubscriptionsToStorage()
  }

  /**
   * Move local per-echo state after the node renamed a conference.
   * Subscriptions and own refill requests are keyed by echo name.
   */
  function renameEchoState(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return
    if (subscriptions.value.delete(oldName)) {
      subscriptions.value.add(newName)
      saveSubscriptionsToStorage()
    }
    if (Object.prototype.hasOwnProperty.call(myRefillRequests.value, oldName)) {
      const request = myRefillRequests.value[oldName]
      const next = { ...myRefillRequests.value }
      delete next[oldName]
      next[newName] = request
      myRefillRequests.value = next
      saveMyRefillRequests()
    }
  }

  // Clear all subscriptions
  function clearSubscriptions() {
    subscriptions.value.clear()
    saveSubscriptionsToStorage()
  }

  function setUser(userData) {
    user.value = userData
    saveUserToStorage(userData)
  }

  /**
   * Update the display name of the current user (used as sender_name) and
   * persist it to fm_user so it survives a reload.
   */
  function updateUserName(name) {
    if (!user.value) return
    user.value = { ...user.value, name: name || '' }
    saveUserToStorage(user.value)
  }

  async function setKeys(privateKeyBytes, publicKeyBytes, password = null) {
    privateKey.value = privateKeyBytes
    publicKey.value = publicKeyBytes
    // Compute key thumbprint
    try {
      keyThumbprint.value = await crypto.computeThumbprint(publicKeyBytes)
    } catch (err) {
      console.warn('Failed to compute key thumbprint:', err)
      keyThumbprint.value = null
    }
    // Compute X25519 private key for decryption
    try {
      x25519PrivateKey.value = crypto.ed25519PrivateKeyToX25519(privateKeyBytes)
    } catch (err) {
      console.warn('Failed to compute X25519 private key:', err)
      x25519PrivateKey.value = null
    }
    // Compute X25519 public key for encryption (may fail in some lib versions)
    try {
      x25519PublicKey.value = crypto.ed25519PublicKeyToX25519(publicKeyBytes)
    } catch (err) {
      console.warn('Failed to compute X25519 public key:', err)
      x25519PublicKey.value = null
    }
    // Auto-save to keystore (unencrypted if no password)
    try {
      await keystore.saveKeys(privateKeyBytes, publicKeyBytes, password)
      passwordRequired.value = false
    } catch (err) {
      console.warn('Failed to save keys to keystore:', err)
      // Continue anyway - keys are still in memory
    }
  }

   function setRules(rulesData) {
     rules.value = rulesData
   }

   function setNewcomersEchoName(name) {
     newcomersEchoName.value = name
   }

   function setNetworkNewsEchoName(name) {
     networkNewsEchoName.value = name
   }

  // Create a signed message for sending via send_receive
  async function createSignedMessage(msgType, data, echoName = null, recipientAddress = null) {
    if (!privateKey.value || !publicKey.value) {
      throw new Error('No keys available')
    }
    
    const timestamp = Math.floor(Date.now() / 1000)
    // Явно указанное для сообщения имя («От:») имеет приоритет; иначе — имя
    // пользователя (единственный источник, #296).
    const explicitName = data && typeof data.sender_name === 'string' && data.sender_name.trim()
      ? data.sender_name.trim()
      : ''
    const fallbackName = user.value?.name || ''
    const enrichedData = { ...data, sender_name: explicitName || fallbackName }
    const dataStr = JSON.stringify(enrichedData)
    
    // Sign the data string
    const { createJWS } = await import('../services/crypto.js')
    const jws = await createJWS(privateKey.value, dataStr, publicKey.value)
    
    const message = {
      type: msgType,
      sender_address: user.value?.address || '',
      timestamp: timestamp,
      data: dataStr,
      jws: jws,
    }
    
    if (echoName) {
      message.echo_name = echoName
    }
    if (recipientAddress) {
      message.recipient_address = recipientAddress
    }
    
    return message
  }

  // Send a reaction to a message
  async function sendReaction(targetMessageId, reaction, comment = '', echoName) {
    const echoNameStr = typeof echoName === 'string' ? echoName : (echoName?.echo_name || echoName?.name || '')
    
    const reactionData = {
      reaction,
      reactionMessageId: targetMessageId,
      echo: echoNameStr,
      message: comment || ''
    }
    
    const signedMessage = await createSignedMessage('echomail', reactionData, echoNameStr)
    
    // Queue through outbox (all messages go through outbox)
    const { useOutbox } = await import('../composables/useOutbox')
    const outbox = useOutbox()
    outbox.add({
      type: 'echomail',
      echoName: echoNameStr,
      message: signedMessage,
      label: `${reaction || 'reaction'}`,
      dedupKey: `reaction_${targetMessageId}_${reaction}`,
      isReaction: true,
    })
    
    // Auto-flush if enabled in settings. The flush processes the send_receive
    // response (the reaction appears for the sender immediately) and respects
    // the daily rate limit; failures keep the reaction in the outbox.
    const { useSettingsStore } = await import('./settings')
    const settingsStore = useSettingsStore()
    if (settingsStore.privacy.autoFlushReactions) {
      try {
        await outbox.flushReactions()
      } catch (err) {
        console.warn('[identity] auto-flush reactions failed', err)
      }
    }

    return { queued: true }
  }

  // Send a refill request for an echo
  async function sendRefillRequest(echoName, beforeDate = null) {
    const { apiService } = await import('../services/api.js')
    
    // Use current date if not specified
    const before = beforeDate || new Date()
    
    // Generate unique message ID for refill request (ms + random so repeated
    // submits in the same second don't collide on refill_sessions.request_message_id)
    const messageId = `refill_${echoName}_${user.value?.address || 'unknown'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    
    // Create refill request structure
    const refillData = {
      proto: 'refill',
      type: 'request',
      from: user.value?.address || '',
      to: 'all',
      message: `Refill request for ${echoName}`,
      date: new Date().toISOString(),
      echo: echoName,
      refill: {
        from: user.value?.address || '',
        echo: echoName,
        before: before.toISOString(),
        messageId: messageId
      }
    }
    
    // Create protocol message with type 'refill'
    const { createJWS } = await import('../services/crypto.js')
    
    // Convert refillData to JSON string for data field
    const dataJson = JSON.stringify(refillData)
    
    // Sign the data JSON
    const jws = await createJWS(privateKey.value, dataJson, publicKey.value)
    
    // Create message object
    const signedMessage = {
      type: 'refill',
      sender_address: user.value?.address || '',
      timestamp: Math.floor(Date.now() / 1000),
      echo_name: echoName,
      data: dataJson,
      jws: jws
    }
    
    const response = await apiService.sendReceive({
      messages: [signedMessage]
    })

    // Remember our own request so the UI can offer a cancel action later
    // (the node does not deliver the requester's own refill request back).
    recordMyRefillRequest(echoName, messageId, before.toISOString())

    return response
  }

  // Send a remote channel subscription request to a hosting node.
  async function sendRemoteSubscribe(echoName, hostNode) {
    const { apiService } = await import('../services/api.js')

    const data = {
      proto: 'remote_subscribe',
      type: 'request',
      from: user.value?.address || '',
      to: 'all',
      message: `Remote subscribe to ${echoName}`,
      date: new Date().toISOString(),
      echo: echoName,
      host_node: hostNode,
      requester: user.value?.address || '',
    }

    const { createJWS } = await import('../services/crypto.js')
    const dataJson = JSON.stringify(data)
    const jws = await createJWS(privateKey.value, dataJson, publicKey.value)

    // The channel is hosted on another node, so it may not exist locally.
    // Do not put it into the envelope: the node would reject an unknown
    // echo_name before the protocol handler sees the request. The signed
    // payload already carries `echo`/`host_node`.
    const signedMessage = {
      type: 'remote_subscribe',
      sender_address: user.value?.address || '',
      timestamp: Math.floor(Date.now() / 1000),
      data: dataJson,
      jws: jws,
    }

    return apiService.sendReceive({ messages: [signedMessage] })
  }

  // Cancel a refill request
  async function cancelRefillRequest(echoName, messageId) {
    const { apiService } = await import('../services/api.js')

    const stopData = {
      proto: 'refill',
      type: 'stop',
      from: user.value?.address || '',
      to: 'all',
      message: `Cancel refill for ${echoName}`,
      date: new Date().toISOString(),
      echo: echoName,
      stop: {
        from: user.value?.address || '',
        echo: echoName,
        messageId: messageId
      }
    }

    const { createJWS } = await import('../services/crypto.js')
    const dataJson = JSON.stringify(stopData)
    const jws = await createJWS(privateKey.value, dataJson, publicKey.value)

    const signedMessage = {
      type: 'refill',
      sender_address: user.value?.address || '',
      timestamp: Math.floor(Date.now() / 1000),
      echo_name: echoName,
      data: dataJson,
      jws: jws
    }

    const response = await apiService.sendReceive({ messages: [signedMessage] })
    // Forget the local record once the cancel has been sent.
    clearMyRefillRequest(echoName, messageId)
    return response
  }

  function clear() {
    user.value = null
    privateKey.value = null
    publicKey.value = null
    rules.value = null
    passwordRequired.value = false
    subscriptions.value.clear()
    newcomersEchoName.value = null
    networkNewsEchoName.value = null
    keyThumbprint.value = null
    x25519PrivateKey.value = null
    x25519PublicKey.value = null
    myRefillRequests.value = {}
  }

  // Keystore integration methods

  /**
   * Check if keys are stored in localStorage
   * @returns {boolean}
   */
  function hasStoredKeys() {
    return keystore.hasStoredKeys()
  }

  /**
   * Check if stored keys are encrypted
   * @returns {boolean}
   */
  function isKeyEncrypted() {
    return keystore.isEncrypted()
  }

  /**
   * Load keys from localStorage with optional password
   * @param {string} [password] - Password for decryption (required if key is encrypted)
   * @returns {Promise<boolean>} true if keys loaded successfully
   */
  async function loadStoredKeys(password = null) {
    try {
      const { privateKey: loadedPrivateKey, publicKey: loadedPublicKey } = await keystore.loadKeys(password)
      privateKey.value = loadedPrivateKey
      publicKey.value = loadedPublicKey
      // Derive X25519 private key for decryption
      try {
        x25519PrivateKey.value = crypto.ed25519PrivateKeyToX25519(loadedPrivateKey)
      } catch (err) {
        console.warn('Failed to compute X25519 private key:', err)
      }
      // Derive X25519 public key for encryption
      try {
        x25519PublicKey.value = crypto.ed25519PublicKeyToX25519(loadedPublicKey)
      } catch (err) {
        console.warn('Failed to compute X25519 public key:', err)
      }
      passwordRequired.value = false
      return true
    } catch (err) {
      // Wrong password also surfaces as a WebCrypto OperationError (AES-GCM key
      // does not match the stored ciphertext) — treat it as "password required".
      const message = String(err?.message || '')
      if (message.includes('Password required') || message.includes('decrypt') ||
          err?.name === 'OperationError' || /operation-specific reason/i.test(message)) {
        passwordRequired.value = true
      }
      throw err
    }
  }

  /**
   * Generate new keys and save to localStorage with optional password protection
   * @param {string} [password] - Password for encryption (if omitted, keys stored unencrypted)
   * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
   */
  async function generateAndSaveKeys(password = null) {
    const keyPair = await keystore.generateKeys()
    await keystore.saveKeys(keyPair.privateKey, keyPair.publicKey, password)
    privateKey.value = keyPair.privateKey
    publicKey.value = keyPair.publicKey
    passwordRequired.value = false
    // Compute X25519 private key for decryption
    try {
      x25519PrivateKey.value = crypto.ed25519PrivateKeyToX25519(privateKey.value)
    } catch (err) {
      console.warn('Failed to compute X25519 private key:', err)
      x25519PrivateKey.value = null
    }
    // Compute X25519 public key for encryption
    try {
      x25519PublicKey.value = crypto.ed25519PublicKeyToX25519(publicKey.value)
    } catch (err) {
      console.warn('Failed to compute X25519 public key:', err)
      x25519PublicKey.value = null
    }
    // Compute key thumbprint
    try {
      keyThumbprint.value = await crypto.computeThumbprint(publicKey.value)
    } catch (err) {
      console.warn('Failed to compute key thumbprint:', err)
      keyThumbprint.value = null
    }
    return keyPair
  }

  /**
   * Save current keys to localStorage with optional password protection
   * @param {string} [password] - Password for encryption (if omitted, keys stored unencrypted)
   * @returns {Promise<void>}
   */
  async function saveKeysToStorage(password = null) {
    if (!privateKey.value || !publicKey.value) {
      throw new Error('No keys to save')
    }
    await keystore.saveKeys(privateKey.value, publicKey.value, password)
    passwordRequired.value = false
  }

  /**
   * Export keys to portable JSON format
   * @param {string} [password] - Password for encryption in export
   * @returns {Promise<string>} JSON string
   */
  async function exportKeys(password = null) {
    if (!privateKey.value || !publicKey.value) {
      throw new Error('No keys to export')
    }
    return keystore.exportKeys(password)
  }

  /**
   * Import keys from JSON string
   * @param {string} jsonData - JSON string from exportKeys()
   * @param {string} [password] - Password for decryption (required if encrypted)
   * @returns {Promise<boolean>} true if import successful
   */
  async function importKeys(jsonData, password = null) {
    const { privateKey: importedPrivateKey, publicKey: importedPublicKey } = await keystore.importKeys(jsonData, password)
    privateKey.value = importedPrivateKey
    publicKey.value = importedPublicKey
    // Derive X25519 private key for decryption
    try {
      x25519PrivateKey.value = crypto.ed25519PrivateKeyToX25519(importedPrivateKey)
    } catch (err) {
      console.warn('Failed to compute X25519 private key:', err)
    }
    // Derive X25519 public key for encryption
    try {
      x25519PublicKey.value = crypto.ed25519PublicKeyToX25519(importedPublicKey)
    } catch (err) {
      console.warn('Failed to compute X25519 public key:', err)
    }
    try {
      keyThumbprint.value = await crypto.computeThumbprint(importedPublicKey)
    } catch (err) {
      console.warn('Failed to compute thumbprint:', err)
    }
    passwordRequired.value = false
    return true
  }

  /**
   * Export all user data (keys + address + subscriptions) to a single JSON string.
   * @param {string} [password] - Password for key encryption in export
   * @returns {Promise<string>} JSON string with all user data
   */
  async function exportUserData(password = null) {
    const keysJson = await exportKeys(password)
    const data = JSON.parse(keysJson)
    // Append user address and subscriptions (not exported by exportKeys)
    const userStr = localStorage.getItem('fm_user')
    const subsStr = localStorage.getItem('fm_subscriptions')
    if (userStr) data.user = JSON.parse(userStr)
    if (subsStr) data.subscriptions = JSON.parse(subsStr)
    return JSON.stringify(data, null, 2)
  }

  /**
   * Import all user data (keys + address + subscriptions) from a JSON string.
   * @param {string} jsonStr - JSON string from exportUserData()
   * @param {string} [password] - Password for key decryption (required if encrypted)
   * @returns {Promise<boolean>} true if import successful
   */
  /** Roles come from the node (identity/policy), never from a backup file. */
  function stripServerRoles(userData) {
    if (!userData || typeof userData !== 'object') return userData
    const { isAdmin, isModerator, ...rest } = userData
    return rest
  }

  async function importUserData(jsonStr, password = null) {
    const data = JSON.parse(jsonStr)
    // Import keys (this sets privateKey/publicKey in memory + saves to keystore)
    await importKeys(JSON.stringify(data), password)
    // Restore address (roles are server-owned: never trust them from a backup)
    if (data.user) {
      localStorage.setItem('fm_user', JSON.stringify(stripServerRoles(data.user)))
    }
    // Restore subscriptions
    if (data.subscriptions) {
      localStorage.setItem('fm_subscriptions', JSON.stringify(data.subscriptions))
    }
    // Reload stored data into memory
    loadStoredUser()
    passwordRequired.value = false
    return true
  }

   /**
    * Clear stored keys from localStorage and memory
    */
  function clearStoredKeys() {
    keystore.clear()
    localStorage.removeItem('fm_user')
    clear()
  }

  /**
   * Logout: remove session data, clear memory, show password dialog.
   * Encrypted keys and IndexedDB messages are preserved.
   */
  async function logout() {
    // Unregister this client from the address's client list (multi-device sync).
    try {
      const { unregisterSelf } = await import('../services/clientSync')
      await unregisterSelf()
    } catch (e) {
      console.warn('[logout] client sync unregister failed', e)
    }
    try {
      const { resetClientRefill } = await import('../services/clientRefill')
      resetClientRefill()
    } catch (e) {
      console.warn('[logout] client refill reset failed', e)
    }

    // Remove session-only localStorage items
    const sessionKeys = [
      'fm_session_password',
      'fm_subscriptions',
      'fm_echo_last_read',
      'fm_echo_catalog',
      'fm_echo_groups',
      'fm_netmail_last_read',
      'fm_dismissed_messages',
      'fm_node_public_key',
      'fm_dev_mode',
      'fm_policy_params',
      'fm_policy_full',
      'fm_key_cache',
      'fm_key_requests',
      'fm_responded_pubkeys',
      'fm_key_settings',
      'fm_my_refills',
    ]
    for (const key of sessionKeys) {
      localStorage.removeItem(key)
    }

    // Clear echo store from memory
    try {
      const { useEchoStore } = await import('./echo')
      const echoStore = useEchoStore()
      echoStore.clearAll()
    } catch (e) {
      console.warn('[logout] echo store clear failed', e)
    }

    // Clear identity from memory
    clear()

    // Reset boot store to show password dialog
    try {
      const { useBootStore, BOOT_STATE } = await import('./boot')
      const bootStore = useBootStore()
      bootStore.reset()
      bootStore.setState(BOOT_STATE.NEEDS_PASSWORD)
      bootStore.setPasswordDialog(true)
    } catch (e) {
      console.warn('[logout] boot store reset failed', e)
    }
  }

  /**
   * Load user data from localStorage
   * @returns {Object|null} User data or null if not found
   */
   function loadStoredUser() {
    const userJson = localStorage.getItem('fm_user')
    if (!userJson) return null
    try {
      const userData = JSON.parse(userJson)
      user.value = userData
      // Load subscriptions as well
      loadStoredSubscriptions()
      return userData
    } catch (err) {
      console.warn('Failed to parse stored user data:', err)
      return null
    }
  }

  /**
   * Refresh admin status from the server and reconcile the client address.
   * Called on boot to pick up admin changes made after registration.
   * If the server reports a different address for this key (e.g. after a backup
   * restore where fm_user kept an old address while the node knows the key under
   * a new one), update the stored user + API address so outgoing messages carry
   * the correct sender_address.
   */
  /**
   * Push the display name to the node (request set_name, #215). The identity
   * store stays the single source of truth (#296): callers update the local
   * name first, then push it.
   */
  async function pushName(name) {
    const trimmed = (name || '').trim()
    if (!trimmed) throw new Error('Display name is required')
    const { apiService } = await import('../services/api')
    const response = await apiService.setName(trimmed)
    const saved = typeof response?.name === 'string' && response.name ? response.name : trimmed
    if (user.value) {
      user.value = { ...user.value, name: saved }
      saveUserToStorage(user.value)
    }
    return saved
  }

  async function syncAdminStatus() {
    if (!user.value?.address) return
    try {
      const { apiService } = await import('../services/api')
      const response = await apiService.status()
      if (response?.address) {
        const serverRoles = {
          isAdmin: !!response.is_admin,
          isModerator: !!response.is_moderator,
        }
        // The node owns the display name (users.name): adopt it unconditionally,
        // so a rename made on another device is picked up on boot (#296).
        const serverName = typeof response.name === 'string' ? response.name.trim() : ''
        // A restored backup explicitly asks to push its name to the node.
        let pendingName = ''
        try {
          pendingName = (localStorage.getItem('fm_name_pending_push') || '').trim()
        } catch { /* ignore */ }
        if (pendingName && response.address === user.value.address) {
          try {
            const saved = await pushName(pendingName)
            localStorage.removeItem('fm_name_pending_push')
            user.value = { ...user.value, name: saved }
            saveUserToStorage(user.value)
            return
          } catch (err) {
            console.warn('[identity] pending name push failed', err)
          }
        }
        if (response.address === user.value.address) {
          const updated = { ...user.value, ...serverRoles }
          if (serverName) updated.name = serverName
          user.value = updated
          saveUserToStorage(updated)
          // The node has no name yet but the client does (e.g. restored backup):
          // push it once so both sides converge.
          if (!serverName && updated.name) {
            try {
              await pushName(updated.name)
            } catch (err) {
              console.warn('[identity] name push failed', err)
            }
          }
        } else {
          // Address mismatch (restore/backup onto a different identity, or a
          // network merge reassigned addresses):
          // trust the node's mapping of this key -> address.
          const oldAddress = user.value.address
          console.warn(`[identity] address mismatch: local ${oldAddress}, server ${response.address}; reconciling`)
          const updated = {
            ...user.value,
            address: response.address,
            ...serverRoles,
          }
          if (serverName) updated.name = serverName
          user.value = updated
          saveUserToStorage(updated)
          if (apiService.address && apiService.address !== response.address) {
            apiService.setAddress(response.address)
          }
          // Переписать адреса в справочнике «адрес → имена» (мерж сетей).
          try {
            const { useNamesStore } = await import('./names')
            useNamesStore().renameAddress(oldAddress, response.address)
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      // Keep the last server-confirmed status (roles are never invented locally).
      console.warn('[identity] admin status sync failed:', e?.message || e)
    }
  }

  /**
   * Save user data to localStorage
   * @param {Object} userData - User data to save
   */
   function saveUserToStorage(userData) {
    try {
      localStorage.setItem('fm_user', JSON.stringify(userData))
    } catch (err) {
      console.warn('Failed to save user data:', err)
    }
  }

  /**
   * Load subscriptions from localStorage
   */
  function loadStoredSubscriptions() {
    const stored = localStorage.getItem('fm_subscriptions')
    if (stored) {
      try {
        subscriptions.value = new Set(JSON.parse(stored))
      } catch (err) {
        console.warn('Failed to parse stored subscriptions:', err)
      }
    }
  }

  /**
    * Save subscriptions to localStorage
    */
   function saveSubscriptionsToStorage() {
    try {
      localStorage.setItem('fm_subscriptions', JSON.stringify([...subscriptions.value]))
    } catch (err) {
      console.warn('Failed to save subscriptions:', err)
    }
  }

  /** Load own refill requests from localStorage */
  function loadMyRefillRequests() {
    try { return JSON.parse(localStorage.getItem('fm_my_refills') || '{}') } catch { return {} }
  }

  /** Persist own refill requests to localStorage */
  function saveMyRefillRequests() {
    try { localStorage.setItem('fm_my_refills', JSON.stringify(myRefillRequests.value)) } catch { /* ignore */ }
  }

  /** Record a refill request this user sent (for the cancel action). */
  function recordMyRefillRequest(echoName, messageId, before) {
    if (!echoName || !messageId) return
    myRefillRequests.value = {
      ...myRefillRequests.value,
      [echoName]: { messageId, before: before || null, sentAt: Date.now() },
    }
    saveMyRefillRequests()
  }

  /** Forget a refill request this user sent (after cancel). */
  function clearMyRefillRequest(echoName, messageId = null) {
    const current = myRefillRequests.value[echoName]
    if (!current) return
    if (messageId && current.messageId !== messageId) return
    const next = { ...myRefillRequests.value }
    delete next[echoName]
    myRefillRequests.value = next
    saveMyRefillRequests()
  }

  /**
   * Set node's Ed25519 public key and derive X25519 public key
   * @param {Uint8Array} ed25519PublicKey - Raw bytes
   */
  function setNodePublicKey(ed25519PublicKey) {
    nodeEd25519PublicKey.value = ed25519PublicKey
    // Persist to localStorage for session persistence
    if (ed25519PublicKey) {
      const b64 = btoa(String.fromCharCode(...ed25519PublicKey))
      localStorage.setItem('fm_node_public_key', b64)
    } else {
      localStorage.removeItem('fm_node_public_key')
    }
  }

  // Load node public key from localStorage on store initialization
  function loadNodePublicKey() {
    const stored = localStorage.getItem('fm_node_public_key')
    if (stored) {
      try {
        const bytes = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
        nodeEd25519PublicKey.value = bytes
      } catch (e) {
        console.warn('[identity] failed to load node public key', e)
        localStorage.removeItem('fm_node_public_key')
      }
    }
  }
  loadNodePublicKey()

  /**
   * Set node's X25519 public key
   * @param {Uint8Array} x25519PublicKey - Raw bytes
   */
  function setNodeX25519PublicKey(x25519PublicKey) {
    nodeX25519PublicKey.value = x25519PublicKey
  }

    return {
      user,
      privateKey,
      publicKey,
      signPublicKey,
      keyThumbprint,
      rules,
      subscriptions,
      newcomersEchoName,
      networkNewsEchoName,
      setNetworkNewsEchoName,
      passwordRequired,
      nodeEd25519PublicKey,
      nodeX25519PublicKey,
      x25519PrivateKey,
      x25519PublicKey,
      hasKeys,
      isModerator,
      isAdmin,
      setUser,
      updateUserName,
    pushName,
      setKeys,
      setRules,
      setNewcomersEchoName,
      setNodePublicKey,
      setNodeX25519PublicKey,
      clear,
      hasStoredKeys,
      isKeyEncrypted,
      loadStoredKeys,
      generateAndSaveKeys,
      saveKeysToStorage,
       exportKeys,
       importKeys,
       exportUserData,
       importUserData,
       clearStoredKeys,
       logout,
       loadStoredUser,
       syncAdminStatus,
       saveUserToStorage,
       loadStoredSubscriptions,
       saveSubscriptionsToStorage,
       isSubscribed,
       addSubscription,
       removeSubscription,
       clearSubscriptions,
       renameEchoState,
       createSignedMessage,
       sendReaction,
       sendRefillRequest,
       sendRemoteSubscribe,
       cancelRefillRequest,
       myRefillRequests,
       recordMyRefillRequest,
       clearMyRefillRequest,
    }
})