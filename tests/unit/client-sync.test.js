import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/api', () => ({
  apiService: {
    clientSynchronize: vi.fn(),
  },
}))

vi.mock('../../src/services/crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // Simple reversible "encryption" so payloads can be inspected in tests.
    encryptJWE: vi.fn(async (bytes) => 'enc:' + new TextDecoder().decode(bytes)),
    decryptJWE: vi.fn(async (token) => new TextEncoder().encode(String(token).replace(/^enc:/, ''))),
  }
})

import { apiService } from '../../src/services/api'
import { useIdentityStore } from '../../src/stores/identity'
import {
  getClientId,
  setSyncEnabled,
  ensureRegistered,
  listClients,
  uploadToOtherClients,
  broadcastOp,
  checkNewClients,
  applyClientListEntries,
  applyOwnContainerEntries,
  pollOwnContainer,
  unregisterSelf,
  resetClientSync,
  flushClientAppends,
  takeClientContainerAcks,
  queueClientContainerAcks,
  LIST_CONTAINER,
  CLIENT_CONTAINER_PREFIX,
} from '../../src/services/clientSync'

function entry(id, obj) {
  return { id, payload: 'enc:' + JSON.stringify(obj) }
}

function appendedEntries(call) {
  const request = call[0]
  return request.entries || [{ name: request.name, payload: request.payload }]
}

function payloadOf(entry) {
  return JSON.parse(String(entry.payload).replace(/^enc:/, ''))
}

describe('client synchronize', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    resetClientSync()
    vi.clearAllMocks()
    const identity = useIdentityStore()
    identity.x25519PublicKey = new Uint8Array([1])
    identity.x25519PrivateKey = new Uint8Array([2])
  })

  it('generates and persists a stable client id', () => {
    const id = getClientId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem('fm_client_id')).toBe(id)
    expect(getClientId()).toBe(id)
  })

  it('applies add/remove ops when reading the client list', async () => {
    apiService.clientSynchronize.mockResolvedValue({
      entries: [
        entry(1, { op: 'add', client: 'a' }),
        entry(2, { op: 'add', client: 'b' }),
        entry(3, { op: 'remove', client: 'a' }),
      ],
    })
    expect(await listClients()).toEqual(['b'])
  })

  it('registers itself only once and only if absent', async () => {
    setSyncEnabled(true)
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') return { entries: [] }
      return { id: 1 }
    })

    const clients = await ensureRegistered()
    const me = getClientId()
    expect(clients).toContain(me)
    expect(apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'append')).toHaveLength(0)
    await flushClientAppends()

    const appends = apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'append')
    expect(appends).toHaveLength(1)
    const entries = appendedEntries(appends[0])
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe(LIST_CONTAINER)
    expect(payloadOf(entries[0])).toEqual({ op: 'add', client: me })

    // Already registered -> no further read/append.
    const callsBefore = apiService.clientSynchronize.mock.calls.length
    await ensureRegistered()
    expect(apiService.clientSynchronize.mock.calls.length).toBe(callsBefore)
  })

  it('uploads received messages to the other clients only', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return { entries: [entry(1, { op: 'add', client: me }), entry(2, { op: 'add', client: 'other-1' })] }
      }
      return { id: 1 }
    })

    const uploaded = await uploadToOtherClients([{ message_id: 'm1' }])
    expect(uploaded).toBe(1)

    const appends = apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'append')
    expect(appends).toHaveLength(1)
    const entries = appendedEntries(appends[0])
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe(CLIENT_CONTAINER_PREFIX + 'other-1')
    expect(payloadOf(entries[0])).toEqual({ op: 'message', message: { message_id: 'm1' } })
  })

  it('does not upload when this client is the only one', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') return { entries: [entry(1, { op: 'add', client: me })] }
      return { id: 1 }
    })
    expect(await uploadToOtherClients([{ message_id: 'm1' }])).toBe(0)
  })

  it('consumes its own container and ACKs the entries', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return { entries: [entry(7, { op: 'message', message: { message_id: 'm1' } })] }
      }
      return { deleted: 1 }
    })

    const ops = await pollOwnContainer()
    expect(ops).toEqual([{ op: 'message', message: { message_id: 'm1' } }])

    // ACKs are sent with the next send_receive, not as a separate request.
    expect(apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'delete')).toHaveLength(0)
    expect(takeClientContainerAcks()).toEqual([
      { name: CLIENT_CONTAINER_PREFIX + me, ids: [7] },
    ])
  })

  it('unwraps the node layer and the client layer', async () => {
    setSyncEnabled(true)
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        // The node wraps the client-encrypted payload: two enc: layers.
        return { entries: [{ id: 9, payload: 'enc:enc:' + JSON.stringify({ op: 'message', message: { message_id: 'm9' } }) }] }
      }
      return { deleted: 1 }
    })
    expect(await pollOwnContainer()).toEqual([{ op: 'message', message: { message_id: 'm9' } }])
  })

  it('broadcasts a sent netmail copy to the other clients', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return { entries: [entry(1, { op: 'add', client: me }), entry(2, { op: 'add', client: 'other-1' })] }
      }
      return { id: 1 }
    })
    const uploaded = await broadcastOp({ op: 'sent', message: { message_id: 'sent-1', type: 'netmail' } })
    expect(uploaded).toBe(1)
    const appends = apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'append')
    expect(payloadOf(appendedEntries(appends[0])[0])).toEqual({
      op: 'sent',
      message: { message_id: 'sent-1', type: 'netmail' },
    })
  })

  it('broadcasts blog changes to the other clients', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return { entries: [entry(1, { op: 'add', client: me }), entry(2, { op: 'add', client: 'other-1' })] }
      }
      return { id: 1 }
    })
    expect(await broadcastOp({ op: 'blogPost', post: { id: 'p1' } })).toBe(1)
    expect(await broadcastOp({ op: 'blogDelete', id: 'b1' })).toBe(1)
  })

  it('detects newly joined clients (history upload trigger)', async () => {
    setSyncEnabled(true)
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return { entries: [entry(1, { op: 'add', client: 'c1' }), entry(2, { op: 'add', client: 'c2' })] }
      }
      return { id: 1 }
    })
    expect(await checkNewClients()).toEqual(['c1', 'c2'])
    // Already known -> nothing new.
    expect(await checkNewClients()).toEqual([])

    // A third client joins: the poll refreshes the list from the send_receive
    // response (applyClientListEntries), checkNewClients uses the cached list.
    apiService.clientSynchronize.mockClear()
    await applyClientListEntries([
      entry(1, { op: 'add', client: 'c1' }),
      entry(2, { op: 'add', client: 'c2' }),
      entry(3, { op: 'add', client: 'c3' }),
    ])
    expect(await checkNewClients()).toEqual(['c3'])
    expect(apiService.clientSynchronize).not.toHaveBeenCalled()
  })

  it('applies own container entries from the send_receive response and ACKs them', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'delete') return { deleted: req.ids.length }
      return { id: 1 }
    })

    const name = CLIENT_CONTAINER_PREFIX + me
    const ops = await applyOwnContainerEntries(name, [
      entry(11, { op: 'message', message: { message_id: 'm1' } }),
      entry(12, { op: 'blogPost', post: { id: 'p1' } }),
    ])

    expect(ops).toEqual([
      { op: 'message', message: { message_id: 'm1' } },
      { op: 'blogPost', post: { id: 'p1' } },
    ])
    expect(apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'delete')).toHaveLength(0)
    expect(takeClientContainerAcks()).toEqual([{ name, ids: [11, 12] }])
  })

  it('applies client list entries from the send_receive response', async () => {
    const clients = await applyClientListEntries([
      entry(1, { op: 'add', client: 'c1' }),
      entry(2, { op: 'add', client: 'c2' }),
      entry(3, { op: 'remove', client: 'c1' }),
    ])
    expect(clients).toEqual(['c2'])
    expect(apiService.clientSynchronize).not.toHaveBeenCalled()
  })

  it('skips the client-side encryption layer when the setting is off (#258)', async () => {
    setSyncEnabled(true)
    const { useSettingsStore } = await import('../../src/stores/settings')
    useSettingsStore().privacy.encryptClientSync = false
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return { entries: [entry(1, { op: 'add', client: getClientId() }), entry(2, { op: 'add', client: 'other' })] }
      }
      return { id: 1 }
    })

    await broadcastOp({ op: 'sent', message: { message_id: 'x' } })

    const append = apiService.clientSynchronize.mock.calls.find(c => c[0].action === 'append')
    const savedCopy = appendedEntries(append)[0]
    expect(String(savedCopy.payload).startsWith('enc:')).toBe(false)
    expect(JSON.parse(savedCopy.payload)).toEqual({ op: 'sent', message: { message_id: 'x' } })
  })

  it('batches all appends for one poll into one request', async () => {
    setSyncEnabled(true)
    await applyClientListEntries([
      entry(1, { op: 'add', client: getClientId() }),
      entry(2, { op: 'add', client: 'other-1' }),
      entry(3, { op: 'add', client: 'other-2' }),
    ])
    apiService.clientSynchronize.mockResolvedValue({ entries: [] })

    const uploaded = await uploadToOtherClients([
      { message_id: 'm1' },
      { message_id: 'm2' },
    ])

    expect(uploaded).toBe(4)
    const appends = apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'append')
    expect(appends).toHaveLength(1)
    const entries = appendedEntries(appends[0])
    expect(entries.map(e => e.name)).toEqual([
      CLIENT_CONTAINER_PREFIX + 'other-1',
      CLIENT_CONTAINER_PREFIX + 'other-2',
      CLIENT_CONTAINER_PREFIX + 'other-1',
      CLIENT_CONTAINER_PREFIX + 'other-2',
    ])
    expect(payloadOf(entries[0])).toEqual({ op: 'message', message: { message_id: 'm1' } })
    expect(payloadOf(entries[2])).toEqual({ op: 'message', message: { message_id: 'm2' } })
  })

  it('queues container ACKs for the next send_receive and clears them on take', () => {
    queueClientContainerAcks('outbound_client_x', [1, 2])
    queueClientContainerAcks('outbound_client_x', [2, 3])
    expect(takeClientContainerAcks()).toEqual([
      { name: 'outbound_client_x', ids: [1, 2, 3] },
    ])
    expect(takeClientContainerAcks()).toEqual([])
  })

  it('removes itself from the list on logout', async () => {
    setSyncEnabled(true)
    apiService.clientSynchronize.mockResolvedValue({ id: 1 })
    await unregisterSelf()
    const appends = apiService.clientSynchronize.mock.calls.filter(c => c[0].action === 'append')
    expect(appends).toHaveLength(1)
    expect(payloadOf(appendedEntries(appends[0])[0])).toEqual({
      op: 'remove',
      client: getClientId(),
    })
  })

  it('does nothing when the node has client_synchronize disabled', async () => {
    setSyncEnabled(false)
    expect(await uploadToOtherClients([{ message_id: 'm1' }])).toBe(0)
    expect(await pollOwnContainer()).toEqual([])
    await unregisterSelf()
    expect(apiService.clientSynchronize).not.toHaveBeenCalled()
  })
})
