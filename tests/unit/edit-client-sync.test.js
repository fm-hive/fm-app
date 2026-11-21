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
    encryptJWE: vi.fn(async (bytes) => 'enc:' + new TextDecoder().decode(bytes)),
    decryptJWE: vi.fn(async (token) => new TextEncoder().encode(String(token).replace(/^enc:/, ''))),
  }
})

import { apiService } from '../../src/services/api'
import { useIdentityStore } from '../../src/stores/identity'
import { useEchoStore } from '../../src/stores/echo'
import {
  getClientId,
  setSyncEnabled,
  uploadToOtherClients,
  applyOwnContainerEntries,
  resetClientSync,
  takeClientContainerAcks,
  LIST_CONTAINER,
  CLIENT_CONTAINER_PREFIX,
} from '../../src/services/clientSync'

const ECHO = 'Edits'

function entry(id, obj) {
  return { id, payload: 'enc:' + JSON.stringify(obj) }
}

function updateMessage() {
  return {
    message_id: 'upd-1',
    type: 'echomail',
    echo_name: ECHO,
    sender_address: ':0:1',
    timestamp: 2000,
    data: JSON.stringify({
      subject: 'First (fixed)',
      body: 'new text',
      updateMessageId: 'orig-1',
    }),
    jws: 'jws-upd-1',
  }
}

function originalMessage() {
  return {
    message_id: 'orig-1',
    type: 'echomail',
    echo_name: ECHO,
    sender_address: ':0:1',
    timestamp: 1000,
    data: JSON.stringify({ subject: 'First', body: 'old text' }),
    jws: 'jws-orig-1',
  }
}

describe('message edits through client synchronize (#382)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    resetClientSync()
    vi.clearAllMocks()
    const identity = useIdentityStore()
    identity.x25519PublicKey = new Uint8Array([1])
    identity.x25519PrivateKey = new Uint8Array([2])
  })

  it('uploads an edit as a message op without losing updateMessageId', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (req) => {
      if (req.action === 'read') {
        return {
          entries: [
            entry(1, { op: 'add', client: me }),
            entry(2, { op: 'add', client: 'other-1' }),
          ],
        }
      }
      return { id: 1 }
    })

    const uploaded = await uploadToOtherClients([updateMessage()])
    expect(uploaded).toBe(1)

    const append = apiService.clientSynchronize.mock.calls.find(
      (call) => call[0].action === 'append',
    )
    const savedEntry = append[0].entries[0]
    expect(savedEntry.name).toBe(CLIENT_CONTAINER_PREFIX + 'other-1')
    const payload = JSON.parse(String(savedEntry.payload).replace(/^enc:/, ''))
    expect(payload.op).toBe('message')
    expect(payload.message.message_id).toBe('upd-1')
    expect(JSON.parse(payload.message.data).updateMessageId).toBe('orig-1')
  })

  it('applies an edit read from the own container to the original message', async () => {
    setSyncEnabled(true)
    const me = getClientId()
    apiService.clientSynchronize.mockResolvedValue({ deleted: 1 })

    const echo = useEchoStore()
    await echo.addMessages(ECHO, [originalMessage()])

    const ops = await applyOwnContainerEntries(
      CLIENT_CONTAINER_PREFIX + me,
      [entry(7, { op: 'message', message: updateMessage() })],
    )
    expect(ops).toHaveLength(1)
    await echo.addMessages(ECHO, ops.map((op) => op.message))

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('orig-1')
    expect(JSON.parse(list[0].data).body).toBe('new text')
    expect(list[0]._edited).toBe(true)
    expect(list[0]._versions).toHaveLength(1)
    expect(JSON.parse(list[0]._versions[0].data).body).toBe('old text')

    // ACKs are queued for the next send_receive instead of a separate delete.
    expect(apiService.clientSynchronize.mock.calls.filter(
      (call) => call[0].action === 'delete',
    )).toHaveLength(0)
    expect(takeClientContainerAcks()).toEqual([
      { name: CLIENT_CONTAINER_PREFIX + me, ids: [7] },
    ])
  })
})
