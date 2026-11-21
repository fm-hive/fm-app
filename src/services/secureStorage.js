import * as crypto from './crypto.js'
import { settingsWithoutDefaultEmojis } from '../utils/emojis'

// Storage keys for localStorage
const STORAGE_KEYS = {
  ENCRYPTED_DATA: 'fm_encrypted_settings',
  METADATA: 'fm_settings_metadata',
  UNENCRYPTED_DATA: 'fm_settings',
}

// Default encryption parameters (match keystore)
const ENCRYPTION_PARAMS = {
  PBKDF2_ITERATIONS: 100000,
  SALT_LENGTH: 16,
  KEY_LENGTH: 32, // AES-GCM key length
}

// Global crypto object (Web Crypto API)
const webCrypto = globalThis.crypto

/**
 * Secure storage service for encrypting/decrypting JSON data with password protection
 * Provides similar interface to keystore but for arbitrary JSON objects
 */
export class SecureStorage {
  constructor() {
    this._metadata = this._loadMetadata()
  }

  // Public API

  /**
   * Check if settings are stored in localStorage
   * @returns {boolean}
   */
  hasStoredSettings() {
    const hasEncrypted = !!localStorage.getItem(STORAGE_KEYS.ENCRYPTED_DATA)
    const hasUnencrypted = !!localStorage.getItem(STORAGE_KEYS.UNENCRYPTED_DATA)
    return hasEncrypted || hasUnencrypted
  }

  /**
   * Check if stored settings are encrypted
   * @returns {boolean}
   */
  isEncrypted() {
    if (!this.hasStoredSettings()) return false
    const metadata = this._loadMetadata()
    return metadata?.encrypted || false
  }

  /**
   * Save settings to localStorage with optional password protection
   * @param {Object} data - JSON-serializable object to store
   * @param {string} [password] - Password for encryption (if omitted, data stored unencrypted)
   * @returns {Promise<void>}
   */
  async saveSettings(data, password = null) {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be a JSON-serializable object')
    }

    const jsonData = JSON.stringify(data)
    let metadata = {
      encrypted: false,
      timestamp: Date.now(),
      version: '1.0',
    }

    if (password) {
      // Encrypt data with password
      const encryptedData = await this._encryptData(jsonData, password)
      // Convert encrypted Uint8Array to base64 string for storage
      const encryptedBase64 = btoa(String.fromCharCode(...encryptedData.encrypted))
      
      localStorage.setItem(STORAGE_KEYS.ENCRYPTED_DATA, encryptedBase64)
      localStorage.removeItem(STORAGE_KEYS.UNENCRYPTED_DATA)
      
      metadata = {
        ...metadata,
        encrypted: true,
        salt: Array.from(encryptedData.salt),
        iterations: encryptedData.iterations,
        iv: Array.from(encryptedData.iv),
      }
    } else {
      // Store data unencrypted
      localStorage.setItem(STORAGE_KEYS.UNENCRYPTED_DATA, jsonData)
      localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_DATA)
    }

    localStorage.setItem(STORAGE_KEYS.METADATA, JSON.stringify(metadata))
    this._metadata = metadata
  }

  /**
   * Load settings from localStorage with optional password
   * @param {string} [password] - Password for decryption (required if data is encrypted)
   * @returns {Promise<Object>} Decrypted/parsed data
   */
  async loadSettings(password = null) {
    if (!this.hasStoredSettings()) {
      throw new Error('No settings stored in localStorage')
    }

    const metadata = this._loadMetadata()
    let jsonData

    if (metadata?.encrypted) {
      // Data is encrypted, need password
      if (!password) {
        throw new Error('Password required to decrypt settings')
      }

      const encryptedBase64 = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_DATA)
      if (!encryptedBase64) {
        throw new Error('Corrupted settings storage: missing encrypted data')
      }

      try {
        const encryptedData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
        const salt = new Uint8Array(metadata.salt)
        const iv = new Uint8Array(metadata.iv)
        const iterations = metadata.iterations

        jsonData = await this._decryptData(encryptedData, password, salt, iv, iterations)
      } catch (decryptErr) {
        console.error('Settings decryption failed:', decryptErr)
        if (decryptErr.name === 'InvalidCharacterError' || decryptErr.message.includes('invalid character')) {
          this.clear()
          throw new Error('Settings storage corrupted. Please reset settings.')
        }
        throw decryptErr
      }
    } else {
      // Data is not encrypted
      jsonData = localStorage.getItem(STORAGE_KEYS.UNENCRYPTED_DATA)
      if (!jsonData) {
        throw new Error('Corrupted settings storage: missing unencrypted data')
      }
    }

    try {
      return JSON.parse(jsonData)
    } catch (parseErr) {
      console.error('Failed to parse settings JSON:', parseErr)
      this.clear()
      throw new Error('Settings data corrupted. Please reset settings.')
    }
  }

  /**
   * Clear stored settings from localStorage
   */
  clear() {
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_DATA)
    localStorage.removeItem(STORAGE_KEYS.UNENCRYPTED_DATA)
    localStorage.removeItem(STORAGE_KEYS.METADATA)
    this._metadata = { encrypted: false, timestamp: Date.now(), version: '1.0' }
  }

  /**
   * Export settings to portable JSON format
   * @param {string} [password] - Password for encryption in export (if omitted, export unencrypted)
   * @returns {Promise<string>} JSON string
   */
  async exportSettings(password = null) {
    const data = await this.loadSettings(password)

    // The node public key travels with the settings: a restored client without
    // it cannot encrypt its requests (the node answers 502 to plaintext, #322).
    let nodePublicKey = null
    try { nodePublicKey = localStorage.getItem('fm_node_public_key') } catch { /* ignore */ }

    const exportData = {
      version: '1.0',
      data: settingsWithoutDefaultEmojis(data),
      nodePublicKey,
      timestamp: Date.now(),
      type: 'fm_settings',
    }

    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Import settings from JSON string
   * @param {string} jsonData - JSON string from exportSettings()
   * @param {string} [password] - Password for decryption (required if encrypted)
   * @returns {Promise<Object>} Imported data
   */
  async importSettings(jsonData, password = null) {
    let importData
    try {
      importData = JSON.parse(jsonData)
    } catch (err) {
      throw new Error('Invalid JSON format')
    }

    if (importData.type !== 'fm_settings') {
      throw new Error('Invalid settings export format')
    }

    if (importData.version !== '1.0') {
      throw new Error('Unsupported export version')
    }

    // Restore the node public key: without it the requests go plaintext and
    // the node answers 502 (encrypted policy flow).
    if (importData.nodePublicKey) {
      try { localStorage.setItem('fm_node_public_key', String(importData.nodePublicKey)) } catch { /* ignore */ }
    }

    // Store the imported data
    await this.saveSettings(importData.data, password)
    return importData.data
  }

  // Internal methods

  _loadMetadata() {
    try {
      const metadataStr = localStorage.getItem(STORAGE_KEYS.METADATA)
      return metadataStr ? JSON.parse(metadataStr) : { encrypted: false, timestamp: Date.now(), version: '1.0' }
    } catch (err) {
      return { encrypted: false, timestamp: Date.now(), version: '1.0' }
    }
  }

  async _encryptData(data, password) {
    // Generate random salt and IV
    const salt = webCrypto.getRandomValues(new Uint8Array(ENCRYPTION_PARAMS.SALT_LENGTH))
    const iv = webCrypto.getRandomValues(new Uint8Array(12)) // AES-GCM standard IV length

    // Normalize password to NFC form for consistent encoding
    const normalizedPassword = password.normalize('NFC')
    
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

    // Encrypt data with AES-GCM
    const encodedData = new TextEncoder().encode(data)
    const ciphertext = await webCrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encodedData
    )

    return {
      encrypted: new Uint8Array(ciphertext),
      salt,
      iv,
      iterations: ENCRYPTION_PARAMS.PBKDF2_ITERATIONS,
    }
  }

  async _decryptData(encryptedData, password, salt, iv, iterations) {
    // Normalize password to NFC form (must match encryption)
    const normalizedPassword = password.normalize('NFC')
    
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

    // Decrypt data
    const decrypted = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encryptedData
    )

    return new TextDecoder().decode(decrypted)
  }
}

// Singleton instance
export const secureStorage = new SecureStorage()
