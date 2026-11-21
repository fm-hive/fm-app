import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/secureStorage', () => ({
  secureStorage: {
    hasStoredSettings: vi.fn(() => true),
    isEncrypted: vi.fn(() => false),
    loadSettings: vi.fn(async () => ({})),
    saveSettings: vi.fn(async () => {}),
  },
}))

import { secureStorage } from '../../src/services/secureStorage'
import { useSettingsStore } from '../../src/stores/settings'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    secureStorage.hasStoredSettings.mockReturnValue(true)
    secureStorage.loadSettings.mockResolvedValue({ application: { refreshInterval: 42 } })
  })

  it('loadSettings() without a password does not throw and applies stored settings', async () => {
    const store = useSettingsStore()
    await expect(store.loadSettings()).resolves.toBe(true)
    expect(store.loaded).toBe(true)
    expect(store.application.refreshInterval).toBe(42)
    expect(store.password).toBe(null)
  })

  it('loadSettings(password) keeps the password for later saves', async () => {
    const store = useSettingsStore()
    await expect(store.loadSettings('secret')).resolves.toBe(true)
    expect(store.password).toBe('secret')
  })

  it('initialize() loads stored settings without a password', async () => {
    const store = useSettingsStore()
    await expect(store.initialize()).resolves.toBe(true)
    expect(store.loaded).toBe(true)
  })

  it('loadSettings() uses defaults when nothing is stored', async () => {
    secureStorage.hasStoredSettings.mockReturnValue(false)
    const store = useSettingsStore()
    await expect(store.loadSettings()).resolves.toBe(true)
    expect(secureStorage.loadSettings).not.toHaveBeenCalled()
    expect(store.loaded).toBe(true)
    // The tagline defaults to empty (#309) and the tearline is off (#311)
    expect(store.userProfile.tagline).toBe('')
    expect(store.userProfile.showTearline).toBe(false)
  })
})
