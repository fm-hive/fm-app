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
import { secureStorage } from '../../src/services/secureStorage'

describe('backup carries the node public key (encrypted policy flow)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('full backup import restores fm_node_public_key', async () => {
    await applyImport(
      {
        keys: {
          publicKey: 'USER_PUB',
          encryptedPrivateKey: 'USER_ENC',
          metadata: '{}',
          nodePublicKey: 'NODE_PUB_B64',
        },
      },
      { core: true }
    )
    expect(localStorage.getItem('fm_node_public_key')).toBe('NODE_PUB_B64')
  })

  it('a backup without the node key does not resurrect the old one', async () => {
    localStorage.setItem('fm_node_public_key', 'OLD_NODE_KEY')
    // Different user keys → the identity-scoped state (incl. the node key) is
    // dropped, and the backup has no nodePublicKey to restore.
    await applyImport(
      {
        keys: { publicKey: 'OTHER_PUB', encryptedPrivateKey: 'OTHER_ENC' },
      },
      { core: true }
    )
    expect(localStorage.getItem('fm_node_public_key')).toBeNull()
  })

  it('settings export includes the node key and settings import restores it', async () => {
    localStorage.setItem('fm_node_public_key', 'NODE_PUB_B64')
    await secureStorage.saveSettings({ ui: { theme: 'dark' } }, null)

    const json = await secureStorage.exportSettings(null)
    const parsed = JSON.parse(json)
    expect(parsed.type).toBe('fm_settings')
    expect(parsed.nodePublicKey).toBe('NODE_PUB_B64')

    localStorage.removeItem('fm_node_public_key')
    await secureStorage.importSettings(json, null)
    expect(localStorage.getItem('fm_node_public_key')).toBe('NODE_PUB_B64')
  })

  it('settings export without a stored node key keeps null', async () => {
    await secureStorage.saveSettings({ ui: { theme: 'dark' } }, null)
    const parsed = JSON.parse(await secureStorage.exportSettings(null))
    expect(parsed.nodePublicKey).toBeNull()
  })
})
