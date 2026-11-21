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

import { clearIdentityScopedState } from '../../src/composables/useImport'
import { useNamesStore } from '../../src/stores/names'
import { useProtocolStore } from '../../src/stores/protocol'
import * as db from '../../src/services/db'

describe('clearIdentityScopedState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('drops identity-scoped keys but keeps unrelated ones', async () => {
    localStorage.setItem('fm_session_password', 'secret')
    localStorage.setItem('fm_policy_accepted', '{}')
    localStorage.setItem('fm_client_id', 'client-1')
    localStorage.setItem('fm_keep_me', '1')

    await clearIdentityScopedState()

    expect(localStorage.getItem('fm_session_password')).toBe(null)
    expect(localStorage.getItem('fm_policy_accepted')).toBe(null)
    expect(localStorage.getItem('fm_client_id')).toBe(null)
    expect(localStorage.getItem('fm_keep_me')).toBe('1')
  })

  it('clears the protocol store and the message database', async () => {
    const protocol = useProtocolStore()
    localStorage.setItem('fm_protocol_messages_encrypted', 'cipher')
    protocol.hiddenProtocols = { m1: true }

    await clearIdentityScopedState()

    expect(localStorage.getItem('fm_protocol_messages_encrypted')).toBe(null)
    expect(protocol.hiddenProtocols).toEqual({})
    expect(db.deleteMessageDB).toHaveBeenCalled()
  })

  it('clears the names directory', async () => {
    const names = useNamesStore()
    names.record(':0:2', 'Bob')
    expect(names.currentName(':0:2')).toBe('Bob')

    await clearIdentityScopedState()

    expect(names.currentName(':0:2')).toBe('')
    expect(localStorage.getItem('fm_addr_names')).toBe(null)
  })
})
