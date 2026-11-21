import * as cryptoUtils from './crypto.js'

// Storage keys for localStorage
const STORAGE_KEYS = {
  ENCRYPTED_PRIVATE_KEY: 'fm_encrypted_private_key',
  PUBLIC_KEY: 'fm_public_key',
  KEY_METADATA: 'fm_key_metadata',
}

// Default encryption parameters
const ENCRYPTION_PARAMS = {
  PBKDF2_ITERATIONS: 100000,
  SALT_LENGTH: 16,
  KEY_LENGTH: 32, // AES-GCM key length
}

// Global crypto object (Web Crypto API)
const webCrypto = globalThis.crypto

/**
 * Check if a string is valid base64 (standard or URL-safe)
 * @param {string} str - String to check
 * @returns {boolean} True if valid base64
 */
function isValidBase64(str) {
  if (typeof str !== 'string') return false
  // Remove whitespace
  const cleaned = str.trim()
  if (cleaned.length === 0) return false
  
  // Check for valid base64 characters (standard and URL-safe)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  const base64UrlRegex = /^[A-Za-z0-9_-]*$/
  
  // Try decoding to validate
  try {
    // Replace URL-safe characters
    const standardBase64 = cleaned.replace(/-/g, '+').replace(/_/g, '/')
    // Add padding if needed
    const padded = standardBase64.padEnd(standardBase64.length + (4 - standardBase64.length % 4) % 4, '=')
    
    if (!base64Regex.test(padded)) {
      return false
    }
    
    // Try actual decoding
    atob(padded)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Clean potentially corrupted base64 string by extracting only valid characters
 * @param {string} str - Potentially corrupted string
 * @returns {string} Cleaned base64 string or empty string if cannot recover
 */
function cleanBase64(str) {
  if (typeof str !== 'string') return ''
  // Extract only valid base64 characters (including URL-safe)
  const validChars = str.match(/[A-Za-z0-9+/_-]/g)
  if (!validChars || validChars.length < 4) { // Minimum base64 length
    return ''
  }
  return validChars.join('')
}

/**
 * Keystore service for managing Ed25519 key pairs with password protection
 * Provides encryption/decryption, storage, export/import functionality
 */
export class Keystore {
  constructor() {
    this._publicKey = null
    this._privateKey = null
    this._metadata = this._loadMetadata()
  }

  // Public API

  /**
   * Generate new Ed25519 key pair
   * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
   */
  async generateKeys() {
    const keyPair = await cryptoUtils.generateKeyPair()
    this._privateKey = keyPair.privateKey
    this._publicKey = keyPair.publicKey
    return keyPair
  }

  /**
   * Check if keys are stored in localStorage
   * @returns {boolean}
   */
  hasStoredKeys() {
    const hasPrivateKey = !!localStorage.getItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY)
    const hasPublicKey = !!localStorage.getItem(STORAGE_KEYS.PUBLIC_KEY)
    return hasPrivateKey && hasPublicKey
  }

  /**
   * Check if stored private key is encrypted
   * @returns {boolean}
   */
  isEncrypted() {
    if (!this.hasStoredKeys()) return false
    const metadata = this._loadMetadata()
    return metadata?.encrypted || false
  }

  /**
   * Save keys to localStorage with optional password protection
   * @param {Uint8Array} privateKey - Raw private key bytes
   * @param {Uint8Array} publicKey - Raw public key bytes
   * @param {string} [password] - Password for encryption (if omitted, key stored unencrypted)
   * @returns {Promise<void>}
   */
  async saveKeys(privateKey, publicKey, password = null) {
    if (!privateKey || !publicKey) {
      throw new Error('Both privateKey and publicKey are required')
    }

    this._privateKey = privateKey
    this._publicKey = publicKey

    let encryptedPrivateKey = null
    let metadata = {
      encrypted: false,
      timestamp: Date.now(),
    }

    if (password) {
      // Encrypt private key with password
      const encryptedData = await this._encryptPrivateKey(privateKey, password)
      // Convert encrypted Uint8Array to base64 string for storage
      encryptedPrivateKey = btoa(String.fromCharCode(...encryptedData.encrypted))
      console.log('[keystore] saveKeys: encrypted key saved, length:', encryptedPrivateKey.length, 'chars')
      metadata = {
        ...metadata,
        encrypted: true,
        salt: Array.from(encryptedData.salt),
        iterations: encryptedData.iterations,
        iv: Array.from(encryptedData.iv),
      }
    } else {
      // Store private key unencrypted (base64)
      encryptedPrivateKey = btoa(String.fromCharCode(...privateKey))
      console.log('[keystore] saveKeys: unencrypted key saved, length:', encryptedPrivateKey.length, 'chars')
    }

    // Store keys in localStorage
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY, encryptedPrivateKey)
    localStorage.setItem(STORAGE_KEYS.PUBLIC_KEY, btoa(String.fromCharCode(...publicKey)))
    localStorage.setItem(STORAGE_KEYS.KEY_METADATA, JSON.stringify(metadata))
    console.log('[keystore] saveKeys: keys stored in localStorage, metadata:', metadata)

    this._metadata = metadata
  }

  /**
   * Load keys from localStorage with optional password
   * @param {string} [password] - Password for decryption (required if key is encrypted)
   * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
   */
  async loadKeys(password = null) {
    if (!this.hasStoredKeys()) {
      throw new Error('No keys stored in localStorage')
    }

    let encryptedPrivateKeyBase64 = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY)
    let publicKeyBase64 = localStorage.getItem(STORAGE_KEYS.PUBLIC_KEY)
    const metadata = this._loadMetadata()

    if (!encryptedPrivateKeyBase64 || !publicKeyBase64) {
      throw new Error('Corrupted key storage')
    }

    // Clean and validate base64 strings
    console.log('[keystore] Raw encryptedPrivateKeyBase64:', encryptedPrivateKeyBase64.substring(0, 50) + '...')
    console.log('[keystore] Raw publicKeyBase64:', publicKeyBase64.substring(0, 50) + '...')
    
    // Check if data might be corrupted (contains commas, indicating Uint8Array string)
    if (encryptedPrivateKeyBase64.includes(',') || publicKeyBase64.includes(',')) {
      console.warn('[keystore] Detected potentially corrupted key data (Uint8Array string), clearing storage...')
      this.clear()
      throw new Error('Key storage corrupted. Please generate new keys.')
    }
    
    // Clean base64 strings
    const cleanedEncrypted = cleanBase64(encryptedPrivateKeyBase64)
    const cleanedPublic = cleanBase64(publicKeyBase64)
    
    if (!isValidBase64(cleanedEncrypted) || !isValidBase64(cleanedPublic)) {
      console.error('[keystore] Invalid base64 data after cleaning:', {
        encrypted: cleanedEncrypted.substring(0, 50),
        public: cleanedPublic.substring(0, 50)
      })
      this.clear()
      throw new Error('Invalid key data. Please generate new keys.')
    }
    
    // Use cleaned strings
    encryptedPrivateKeyBase64 = cleanedEncrypted
    publicKeyBase64 = cleanedPublic

    // Decode public key
    console.log('[keystore] loadKeys: decoding public key, base64 length:', publicKeyBase64.length)
    const publicKey = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0))
    console.log('[keystore] loadKeys: public key decoded, length:', publicKey.length)

    let privateKey
    if (metadata?.encrypted) {
      // Key is encrypted, need password
      if (!password) {
        throw new Error('Password required to decrypt private key')
      }
      
      console.log('[keystore] loadKeys: key is encrypted, attempting decryption')
      console.log('[keystore] loadKeys: encryptedPrivateKeyBase64 length:', encryptedPrivateKeyBase64.length)
      console.log('[keystore] loadKeys: metadata:', metadata)

      try {
        const encryptedPrivateKey = Uint8Array.from(atob(encryptedPrivateKeyBase64), c => c.charCodeAt(0))
        console.log('[keystore] loadKeys: encryptedPrivateKey decoded, length:', encryptedPrivateKey.length)
        
        const salt = new Uint8Array(metadata.salt)
        const iv = new Uint8Array(metadata.iv)
        const iterations = metadata.iterations
        
        console.log('[keystore] loadKeys: salt length:', salt.length, 'iv length:', iv.length, 'iterations:', iterations)

        privateKey = await this._decryptPrivateKey(
          encryptedPrivateKey,
          password,
          salt,
          iv,
          iterations
        )
        console.log('[keystore] loadKeys: decryption successful, private key length:', privateKey.length)
      } catch (decryptErr) {
        console.error('[keystore] loadKeys: decryption failed:', decryptErr)
        // Check if the error is from atob (invalid base64)
        if (decryptErr.name === 'InvalidCharacterError' || decryptErr.message.includes('invalid character')) {
          console.error('[keystore] loadKeys: Base64 decoding failed, likely corrupted storage')
          this.clear()
          throw new Error('Key storage corrupted. The encrypted key data is invalid. Please generate new keys.')
        }
        throw decryptErr
      }
    } else {
      // Key is not encrypted
      console.log('[keystore] loadKeys: key is not encrypted')
      privateKey = Uint8Array.from(atob(encryptedPrivateKeyBase64), c => c.charCodeAt(0))
      console.log('[keystore] loadKeys: private key decoded, length:', privateKey.length)
    }

    this._privateKey = privateKey
    this._publicKey = publicKey
    this._metadata = metadata

    return { privateKey, publicKey }
  }

  /**
   * Export keys to portable JSON format
   * @param {string} [password] - Password for encryption in export (if omitted, export unencrypted)
   * @returns {Promise<string>} JSON string
   */
  async exportKeys(password = null) {
    if (!this._privateKey || !this._publicKey) {
      throw new Error('No keys loaded')
    }

    const exportData = {
      version: '1.0',
      publicKey: btoa(String.fromCharCode(...this._publicKey)),
      metadata: { ...this._metadata },
      timestamp: Date.now(),
    }

    if (password) {
      const encryptedData = await this._encryptPrivateKey(this._privateKey, password)
      exportData.encryptedPrivateKey = btoa(String.fromCharCode(...encryptedData.encrypted))
      exportData.salt = Array.from(encryptedData.salt)
      exportData.iterations = encryptedData.iterations
      exportData.iv = Array.from(encryptedData.iv)
      exportData.encrypted = true
    } else {
      exportData.privateKey = btoa(String.fromCharCode(...this._privateKey))
      exportData.encrypted = false
    }

    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Import keys from JSON string
   * @param {string} jsonData - JSON string from exportKeys()
   * @param {string} [password] - Password for decryption (required if encrypted)
   * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
   */
  async importKeys(jsonData, password = null) {
    let data
    try {
      data = JSON.parse(jsonData)
    } catch (err) {
      throw new Error('Invalid JSON format')
    }

    if (data.version !== '1.0') {
      throw new Error('Unsupported export version')
    }

    if (!data.publicKey) {
      throw new Error('Missing public key in import data')
    }

    const publicKey = Uint8Array.from(atob(data.publicKey), c => c.charCodeAt(0))
    let privateKey

    if (data.encrypted) {
      // Encrypted import
      if (!password) {
        throw new Error('Password required to decrypt imported private key')
      }
      if (!data.encryptedPrivateKey || !data.salt || !data.iv || !data.iterations) {
        throw new Error('Missing encryption data in import')
      }

      const encryptedPrivateKey = Uint8Array.from(atob(data.encryptedPrivateKey), c => c.charCodeAt(0))
      const salt = new Uint8Array(data.salt)
      const iv = new Uint8Array(data.iv)
      const iterations = data.iterations

      privateKey = await this._decryptPrivateKey(
        encryptedPrivateKey,
        password,
        salt,
        iv,
        iterations
      )
    } else {
      // Unencrypted import
      if (!data.privateKey) {
        throw new Error('Missing private key in import data')
      }
      privateKey = Uint8Array.from(atob(data.privateKey), c => c.charCodeAt(0))
    }

    this._privateKey = privateKey
    this._publicKey = publicKey
    this._metadata = data.metadata || { encrypted: false, timestamp: Date.now() }

    return { privateKey, publicKey }
  }

  /**
   * Clear stored keys from localStorage and memory
   */
  clear() {
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY)
    localStorage.removeItem(STORAGE_KEYS.PUBLIC_KEY)
    localStorage.removeItem(STORAGE_KEYS.KEY_METADATA)
    this._privateKey = null
    this._publicKey = null
    this._metadata = { encrypted: false, timestamp: Date.now() }
  }

  /**
   * Get loaded private key (only available after loadKeys or generateKeys)
   * @returns {Uint8Array|null}
   */
  getPrivateKey() {
    return this._privateKey
  }

  /**
   * Get loaded public key (only available after loadKeys or generateKeys)
   * @returns {Uint8Array|null}
   */
  getPublicKey() {
    return this._publicKey
  }

  /**
   * Get metadata
   * @returns {Object}
   */
  getMetadata() {
    return this._metadata
  }

  // Internal methods

  _loadMetadata() {
    try {
      const metadataStr = localStorage.getItem(STORAGE_KEYS.KEY_METADATA)
      return metadataStr ? JSON.parse(metadataStr) : { encrypted: false, timestamp: Date.now() }
    } catch (err) {
      return { encrypted: false, timestamp: Date.now() }
    }
  }

  async _encryptPrivateKey(privateKey, password) {
    // Generate random salt and IV
    const salt = webCrypto.getRandomValues(new Uint8Array(ENCRYPTION_PARAMS.SALT_LENGTH))
    const iv = webCrypto.getRandomValues(new Uint8Array(12)) // AES-GCM standard IV length

    // Normalize password to NFC form for consistent encoding
    // This ensures that characters with multiple Unicode representations are treated consistently
    const normalizedPassword = password.normalize('NFC')
    console.log('[keystore] _encryptPrivateKey: password length:', password.length, 'normalized length:', normalizedPassword.length)
    
    // Derive key from password using PBKDF2
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(normalizedPassword)
    
    const baseKey = await webCrypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    const derivedKey = await webCrypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: ENCRYPTION_PARAMS.PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: ENCRYPTION_PARAMS.KEY_LENGTH * 8 },
      false,
      ['encrypt']
    )

    // Encrypt private key with AES-GCM
    const ciphertext = await webCrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      privateKey
    )

    return {
      encrypted: new Uint8Array(ciphertext),
      salt,
      iv,
      iterations: ENCRYPTION_PARAMS.PBKDF2_ITERATIONS,
    }
  }

  async _decryptPrivateKey(encryptedPrivateKey, password, salt, iv, iterations) {
    // Normalize password to NFC form (must match encryption)
    const normalizedPassword = password.normalize('NFC')
    console.log('[keystore] _decryptPrivateKey: password length:', password.length, 'normalized length:', normalizedPassword.length)
    
    // Derive key from password using PBKDF2
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(normalizedPassword)
    
    const baseKey = await webCrypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    const derivedKey = await webCrypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: iterations || ENCRYPTION_PARAMS.PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: ENCRYPTION_PARAMS.KEY_LENGTH * 8 },
      false,
      ['decrypt']
    )

    // Decrypt private key
    const decrypted = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encryptedPrivateKey
    )

    return new Uint8Array(decrypted)
  }
}

// Singleton instance
export const keystore = new Keystore()