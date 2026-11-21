import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/api', () => ({
  apiService: {
    sendReceive: vi.fn(),
    clientSynchronize: vi.fn(),
  },
}))

vi.mock('../../src/services/crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    encryptJWE: vi.fn(async (bytes) => 'enc:' + new TextDecoder().decode(bytes)),
    decryptJWE: vi.fn(async (token) => new TextEncoder().encode(String(token).replace(/^enc:/, ''))),
  }
})

import { apiService } from '../../src/services/api'
import { useIdentityStore } from '../../src/stores/identity'
import { fetchMessages } from '../../src/services/message'
import {
  getClientId,
  resetClientSync,
  takeClientContainerAcks,
  queueClientContainerAcks,
  LIST_CONTAINER,
  CLIENT_CONTAINER_PREFIX,
} from '../../src/services/clientSync'

function entry(id, obj) {
  return { id, payload: 'enc:' + JSON.stringify(obj) }
}

function listWithMe(me) {
  return {
    messages: [],
    local_packet_ids: [],
    client_synchronize: true,
    client_container_entries: [
      { name: LIST_CONTAINER, entries: [entry(1, { op: 'add', client: me })] },
    ],
  }
}

describe('send_receive client sync (#257)', () => {
  let me

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    resetClientSync()
    vi.clearAllMocks()
    const identity = useIdentityStore()
    identity.x25519PublicKey = new Uint8Array([1])
    identity.x25519PrivateKey = new Uint8Array([2])
    me = getClientId()
    localStorage.setItem('fm_client_sync_known', JSON.stringify([me]))
  })

  it('uses the client list embedded in the poll instead of an extra read', async () => {
    apiService.sendReceive.mockResolvedValue(listWithMe(me))

    await fetchMessages()

    expect(apiService.sendReceive).toHaveBeenCalledTimes(1)
    // ensureRegistered finds this client in the list from the same response and
    // does not issue a client_synchronize read.
    expect(apiService.clientSynchronize).not.toHaveBeenCalled()
    const request = apiService.sendReceive.mock.calls[0][0]
    expect(request.client_sync_read).toEqual([
      LIST_CONTAINER,
      CLIENT_CONTAINER_PREFIX + me,
    ])
    expect(request.client_container_ack).toBeUndefined()
  })

  it('sends queued container ACKs in the next send_receive and clears them', async () => {
    apiService.sendReceive.mockResolvedValue(listWithMe(me))
    queueClientContainerAcks(CLIENT_CONTAINER_PREFIX + 'other', [5, 6])

    await fetchMessages()

    const request = apiService.sendReceive.mock.calls[0][0]
    expect(request.client_container_ack).toEqual([
      { name: CLIENT_CONTAINER_PREFIX + 'other', ids: [5, 6] },
    ])
    expect(takeClientContainerAcks()).toEqual([])
  })

  it('batches forwarded messages into one append request', async () => {
    apiService.sendReceive.mockResolvedValue({
      messages: [{
        message_id: 'm1',
        type: 'echomail',
        echo_name: 'General',
        sender_address: ':0:2',
        timestamp: 1000,
        data: JSON.stringify({ subject: 'Hi' }),
      }],
      local_packet_ids: [],
      client_synchronize: true,
      client_container_entries: [
        {
          name: LIST_CONTAINER,
          entries: [
            entry(1, { op: 'add', client: me }),
            entry(2, { op: 'add', client: 'other-1' }),
          ],
        },
      ],
    })
    apiService.clientSynchronize.mockResolvedValue({ entries: [] })
    localStorage.setItem('fm_client_sync_known', JSON.stringify([me, 'other-1']))

    await fetchMessages()

    expect(apiService.sendReceive).toHaveBeenCalledTimes(1)
    const appends = apiService.clientSynchronize.mock.calls.filter(
      (call) => call[0].action === 'append',
    )
    expect(appends).toHaveLength(1)
    expect(appends[0][0].entries).toHaveLength(1)
    expect(appends[0][0].entries[0].name).toBe(CLIENT_CONTAINER_PREFIX + 'other-1')
    const payload = JSON.parse(
      String(appends[0][0].entries[0].payload).replace(/^enc:/, ''),
    )
    expect(payload).toEqual({
      op: 'message',
      message: expect.objectContaining({ message_id: 'm1' }),
    })
  })

  it('embeds queued appends in the next send_receive when the node supports it', async () => {
    // Poll 1 receives a message and learns that the node supports embedded
    // appends. The message op is queued, not sent separately.
    apiService.sendReceive.mockResolvedValueOnce({
      messages: [{
        message_id: 'm1',
        type: 'echomail',
        echo_name: 'General',
        sender_address: ':0:2',
        timestamp: 1000,
        data: JSON.stringify({ subject: 'Hi' }),
      }],
      local_packet_ids: [],
      client_synchronize: true,
      client_sync_append_supported: true,
      client_container_entries: [
        {
          name: LIST_CONTAINER,
          entries: [
            entry(1, { op: 'add', client: me }),
            entry(2, { op: 'add', client: 'other-1' }),
          ],
        },
      ],
    })
    apiService.clientSynchronize.mockResolvedValue({ entries: [] })
    localStorage.setItem('fm_client_sync_known', JSON.stringify([me, 'other-1']))

    await fetchMessages()
    expect(apiService.clientSynchronize).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('fm_client_sync_appends'))).toHaveLength(1)

    // Poll 2 carries the queued op in the same send_receive request.
    apiService.sendReceive.mockResolvedValueOnce({
      messages: [],
      local_packet_ids: [],
      client_synchronize: true,
      client_sync_append_supported: true,
      client_container_entries: [],
    })
    await fetchMessages()

    const second = apiService.sendReceive.mock.calls[1][0]
    expect(second.client_sync_append).toHaveLength(1)
    expect(second.client_sync_append[0].name).toBe(CLIENT_CONTAINER_PREFIX + 'other-1')
    const payload = JSON.parse(
      String(second.client_sync_append[0].payload).replace(/^enc:/, ''),
    )
    expect(payload).toEqual({
      op: 'message',
      message: expect.objectContaining({ message_id: 'm1' }),
    })
    expect(apiService.clientSynchronize).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('fm_client_sync_appends'))).toEqual([])
  })

  it('keeps container ACKs when the poll fails', async () => {
    apiService.sendReceive.mockRejectedValue(new Error('node is offline'))
    queueClientContainerAcks(CLIENT_CONTAINER_PREFIX + 'other', [9])

    await expect(fetchMessages()).rejects.toThrow('node is offline')

    expect(takeClientContainerAcks()).toEqual([
      { name: CLIENT_CONTAINER_PREFIX + 'other', ids: [9] },
    ])
  })
})
