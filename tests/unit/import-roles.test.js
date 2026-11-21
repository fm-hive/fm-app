import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/db', () => ({
  closeMessageDB: vi.fn(async () => {}),
  deleteMessageDB: vi.fn(async () => {}),
  createNetmailFolder: vi.fn(),
  getNetmailFolders: vi.fn(() => ({})),
  initDB: vi.fn(async () => {}),
  bulkPutMessages: vi.fn(async () => {}),
  ensureNetmailStore: vi.fn(async () => {}),
}))

import { applyImport } from '../../src/composables/useImport'
import { useSettingsStore } from '../../src/stores/settings'

describe('backup import and server-owned roles', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('does not restore isAdmin/isModerator from a backup', async () => {
    await applyImport(
      {
        user: { address: ':0:12', name: 'Restored', isAdmin: true, isModerator: true },
      },
      { core: true }
    )

    const user = JSON.parse(localStorage.getItem('fm_user'))
    expect(user.address).toBe(':0:12')
    expect(user.name).toBe('Restored')
    expect(user.isAdmin).toBeUndefined()
    expect(user.isModerator).toBeUndefined()
  })

  it('restores the display name from user.name into fm_user (#296)', async () => {
    await applyImport(
      { user: { address: ':0:12', name: 'Maksim' } },
      { core: true }
    )

    expect(JSON.parse(localStorage.getItem('fm_user')).name).toBe('Maksim')
    // The name no longer has a copy in the settings ...
    expect(useSettingsStore().userProfile.displayName).toBeUndefined()
    // ... and the restore asks the boot sync to push it to the node.
    expect(localStorage.getItem('fm_name_pending_push')).toBe('Maksim')
  })

  it('reads the legacy settings.userProfile.displayName as a fallback (#296)', async () => {
    await applyImport(
      {
        user: { address: ':0:12' },
        settings: { userProfile: { displayName: 'Maksim', bio: 'hello' } },
      },
      { core: true }
    )

    expect(JSON.parse(localStorage.getItem('fm_user')).name).toBe('Maksim')
    expect(localStorage.getItem('fm_name_pending_push')).toBe('Maksim')
    // The legacy field is not written back into the settings, the bio is.
    expect(useSettingsStore().userProfile.displayName).toBeUndefined()
    expect(useSettingsStore().userProfile.bio).toBe('hello')
  })
})
