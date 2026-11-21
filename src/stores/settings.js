import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { secureStorage } from '../services/secureStorage'
import { DEFAULT_CUSTOM_EMOJIS } from '../utils/emojis'

export const useSettingsStore = defineStore('settings', () => {
  // Default settings
  const defaultSettings = {
    // Node configuration
    // (the API endpoint is compiled in via the deployment prefix, #337)

    // User profile
    userProfile: {
      // The display name lives in the identity store (mirror of users.name on
      // the node, issue #296); only the bio stays here.
      bio: '',
      // User tagline appended to outgoing echomail/netmail (#309)
      tagline: '',
      // Show (and append) the client tearline in messages (#311); off by default
      showTearline: false,
    },
    
    // Notification settings
    notifications: {
      newMessages: true,
      echoSubscriptions: true,
      moderatorActions: true,
      sounds: false,
      desktopAlerts: false,
    },
    
    // Privacy settings
    privacy: {
      showOnlineStatus: true,
      allowDirectMessages: true,
      showLastSeen: false,
      encryptMessages: true,
      allowPubkeyRequests: true,
      autoRequestPubkeys: false,
      autoSendPubkey: false,
      autoFlushReactions: false,
      // Auto-flush freshly composed echomail/netmail (off by default): the
      // message is sent immediately instead of waiting in the outbox. The
      // daily rate limit still applies.
      autoFlushEchomail: false,
      autoFlushNetmail: false,
      trashRetentionDays: 30,
      // Network rate limit (#175): allow sending messages over the daily
      // limits (they are marked as dangerous); off by default.
      allowSendingWithoutRateLimit: false,
      // Client synchronize: encrypt container payloads with the user's own key
      // before sending them to the node (the node adds its own layer on top).
      // Protects the sync from a compromised node; on by default.
      encryptClientSync: true,
    },
    
    // Application settings
    application: {
      language: 'auto',
      theme: 'system', // 'light', 'dark', 'system'
      autoRefresh: true,
      refreshInterval: 30, // seconds
      dashboardDepthDays: 7, // days of history shown on home dashboard
      compactMode: false,
      developerMode: false,
    },
    
    // UI preferences
    ui: {
      fontSize: 'medium', // 'small', 'medium', 'large'
      density: 'comfortable', // 'compact', 'comfortable', 'spacious'
      showAvatars: true,
      showEmojis: true,
      animationSpeed: 'normal', // 'none', 'fast', 'normal', 'slow'
      customEmojis: [...DEFAULT_CUSTOM_EMOJIS],
    },
    
    // Network settings
    network: {
      connectionTimeout: 30000, // ms
      retryAttempts: 3,
      enableCompression: true,
      useWebSocket: true,
    },
    
    // Storage settings
    storage: {
      encryptSettings: true, // Whether to encrypt settings with password
      autoBackup: false,
      backupInterval: 24, // hours
    },
    
    // Security settings
    security: {
      autoLock: false,
      lockTimeout: 15, // minutes
      clearClipboard: true,
      warnOnUnencrypted: true,
    },
  }

  // Reactive state
  const settings = ref({ ...defaultSettings })
  const loaded = ref(false)
  const password = ref(null) // Password for encrypted settings (in memory only)
  const settingsSaving = ref(false)

  // Computed properties
  const isEncrypted = computed(() => secureStorage.isEncrypted())
  const hasStoredSettings = computed(() => secureStorage.hasStoredSettings())
  const userProfile = computed(() => settings.value.userProfile)
  const notifications = computed(() => settings.value.notifications)
  const privacy = computed(() => settings.value.privacy)
  const application = computed(() => settings.value.application)
  const ui = computed(() => settings.value.ui)
  const network = computed(() => settings.value.network)

  /**
   * Load settings from secure storage
   * @param {string} [pwd] - Password for decryption (required if settings are encrypted)
   * @returns {Promise<boolean>} true if settings loaded successfully
   */
  async function loadSettings(pwd = null) {
    try {
      if (!secureStorage.hasStoredSettings()) {
        console.log('No stored settings found, using defaults')
        loaded.value = true
        return true
      }

      const loadedSettings = await secureStorage.loadSettings(pwd)
      
      // Merge with defaults (allowing partial updates)
      settings.value = {
        ...defaultSettings,
        ...loadedSettings,
        userProfile: {
          ...defaultSettings.userProfile,
          ...(loadedSettings.userProfile || {})
        },
        notifications: {
          ...defaultSettings.notifications,
          ...(loadedSettings.notifications || {})
        },
        privacy: {
          ...defaultSettings.privacy,
          ...(loadedSettings.privacy || {})
        },
        application: {
          ...defaultSettings.application,
          ...(loadedSettings.application || {})
        },
        ui: {
          ...defaultSettings.ui,
          ...(loadedSettings.ui || {})
        },
        network: {
          ...defaultSettings.network,
          ...(loadedSettings.network || {})
        },
        storage: {
          ...defaultSettings.storage,
          ...(loadedSettings.storage || {})
        },
        security: {
          ...defaultSettings.security,
          ...(loadedSettings.security || {})
        },
      }
      
      loaded.value = true
      password.value = pwd
      console.log('Settings loaded successfully')
      return true
    } catch (err) {
      console.error('Failed to load settings:', err)
      
      // If password is wrong or data corrupted, use defaults
      if (err.message.includes('Password required') || err.message.includes('corrupted')) {
        console.warn('Using default settings due to load error')
        settings.value = { ...defaultSettings }
        loaded.value = true
        return false
      }
      
      throw err
    }
  }

  /**
   * Save settings to secure storage
   * @param {string} [password] - Password for encryption (uses stored password if not provided)
   * @returns {Promise<boolean>} true if settings saved successfully
   */
  async function saveSettings(pwd = null) {
    settingsSaving.value = true
    try {
      const savePassword = pwd || password.value
      
      // Prevent accidentally saving encrypted settings without password
      if (secureStorage.isEncrypted() && !savePassword) {
        throw new Error('Password required to save encrypted settings. Use changePassword() or provide password.')
      }
      
      await secureStorage.saveSettings(settings.value, savePassword)
      console.log('Settings saved successfully')
      return true
    } catch (err) {
      console.error('Failed to save settings:', err)
      throw err
    } finally {
      settingsSaving.value = false
    }
  }

  /**
   * Update settings partially
   * @param {Object} updates - Partial settings object
   * @param {boolean} [autoSave=true] - Whether to auto-save after update
   * @returns {Promise<void>}
   */
  async function updateSettings(updates, autoSave = true) {
    if (!updates || typeof updates !== 'object') {
      throw new Error('Updates must be an object')
    }

    // Deep merge for nested objects
    const deepMerge = (target, source) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {}
          }
          deepMerge(target[key], source[key])
        } else {
          target[key] = source[key]
        }
      }
      return target
    }

    settings.value = deepMerge({ ...settings.value }, updates)

    if (autoSave) {
      await saveSettings()
    }
  }

  /**
   * Update a specific setting by path
   * @param {string} path - Dot notation path (e.g., 'notifications.newMessages')
   * @param {any} value - New value
   * @param {boolean} [autoSave=true] - Whether to auto-save after update
   * @returns {Promise<void>}
   */
  async function updateSetting(path, value, autoSave = true) {
    const parts = path.split('.')
    let current = settings.value
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {}
      }
      current = current[part]
    }
    
    current[parts[parts.length - 1]] = value
    
    if (autoSave) {
      await saveSettings()
    }
  }

  /**
   * Reset settings to defaults
   * @returns {Promise<void>}
   */
  async function resetSettings() {
    settings.value = { ...defaultSettings }
    await saveSettings()
  }

  /**
   * Clear stored settings from secure storage
   */
  function clearStoredSettings() {
    secureStorage.clear()
    settings.value = { ...defaultSettings }
    loaded.value = false
    password.value = null
  }

  /**
   * Export settings to portable JSON format
   * @param {string} [exportPassword] - Password for encryption in export (if omitted, uses current password)
   * @returns {Promise<string>} JSON string
   */
  async function exportSettings(exportPassword = null) {
    return secureStorage.exportSettings(exportPassword || password.value)
  }

  /**
   * Import settings from JSON string
   * @param {string} jsonData - JSON string from exportSettings()
   * @param {string} [importPassword] - Password for decryption (required if encrypted)
   * @returns {Promise<Object>} Imported settings
   */
  async function importSettings(jsonData, importPassword = null) {
    const importedData = await secureStorage.importSettings(jsonData, importPassword)
    
    // Merge imported settings
    settings.value = {
      ...defaultSettings,
      ...importedData,
    }
    
    await saveSettings(importPassword)
    return importedData
  }

  /**
   * Change encryption password
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password (null to remove encryption)
   * @returns {Promise<boolean>} true if password changed successfully
   */
  async function changePassword(oldPassword, newPassword) {
    try {
      // Load settings with old password to verify it
      const currentSettings = await secureStorage.loadSettings(oldPassword)
      
      // Save with new password (or without if newPassword is null)
      await secureStorage.saveSettings(currentSettings, newPassword)
      
      // Update in-memory password
      password.value = newPassword
      
      console.log('Settings password changed successfully')
      return true
    } catch (err) {
      console.error('Failed to change settings password:', err)
      throw err
    }
  }

  /**
   * Check if settings need password
   * @returns {boolean}
   */
  const needsPassword = computed(() => {
    return secureStorage.isEncrypted() && !password.value
  })

  /**
   * Initialize settings store (called on app startup)
   * @returns {Promise<boolean>} true if initialization successful
   */
  async function initialize() {
    if (loaded.value) return true
    
    try {
      // Try to load settings without password first (in case they're unencrypted)
      await loadSettings()
      return true
    } catch (err) {
      // If password is required, store will be marked as needing password
      console.log('Settings initialization requires password:', err.message)
      return false
    }
  }

  return {
    // State
    settings,
    loaded,
    settingsSaving,
    password,
    
    // Computed
    isEncrypted,
    hasStoredSettings,
    userProfile,
    notifications,
    privacy,
    application,
    ui,
    network,
    needsPassword,
    
    // Methods
    loadSettings,
    saveSettings,
    updateSettings,
    updateSetting,
    resetSettings,
    clearStoredSettings,
    exportSettings,
    importSettings,
    changePassword,
    initialize,
  }
})