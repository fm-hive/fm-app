import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/api', () => ({
  apiService: {
    clientSynchronize: vi.fn(),
    sendReceive: vi.fn(),
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

const getAll = vi.fn()
vi.mock('../../src/services/db', () => ({
  openReadConnection: vi.fn(async () => ({
    objectStoreNames: ['echo_General', '__netmail__', '__trash__', 'netmail_inbox'],
    transaction: (name) => ({
      objectStore: () => ({
        getAll: () => {
          const request = {}
          const values = name === 'echo_General'
            ? [{ message_id: 'm1', type: 'echomail', echo_name: 'General' }]
            : name === '__netmail__'
              ? [{ message_id: 'n1', type: 'netmail' }]
              : []
          getAll(values)
          queueMicrotask(() => {
            request.result = values
            request.onsuccess?.()
          })
          return request
        },
      }),
    }),
    close: vi.fn(),
  })),
}))

import { apiService } from '../../src/services/api'
import { useIdentityStore } from '../../src/stores/identity'
import { useEchoStore } from '../../src/stores/echo'
import {
  getClientId,
  setSyncEnabled,
  resetClientSync,
  flushClientAppends,
} from '../../src/services/clientSync'
import {
  clientRefillState,
  startClientRefill,
  respondToRefillRequest,
  applyRefillOps,
  getRefillReadSpec,
  resetClientRefill,
} from '../../src/services/clientRefill'

function clientEntry(id, op) {
  return { id, payload: 'enc:' + JSON.stringify(op) }
}

function listWithOthers(me) {
  return {
    entries: [
      clientEntry(1, { op: 'add', client: me }),
      clientEntry(2, { op: 'add', client: 'other-1' }),
    ],
  }
}

function appendPayloads() {
  return apiService.clientSynchronize.mock.calls
    .filter((call) => call[0]?.action === 'append')
    .flatMap((call) => call[0].entries || [])
    .map((entry) => ({ name: entry.name, op: JSON.parse(String(entry.payload).replace(/^enc:/, '')) }))
}

describe('client refill (#387)', () => {
  let me

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    resetClientSync()
    resetClientRefill()
    vi.clearAllMocks()
    getAll.mockClear()
    const identity = useIdentityStore()
    identity.x25519PublicKey = new Uint8Array([1])
    identity.x25519PrivateKey = new Uint8Array([2])
    setSyncEnabled(true)
    me = getClientId()
    apiService.clientSynchronize.mockImplementation(async (request) => {
      if (request.action === 'read') return listWithOthers(me)
      return { entries: [] }
    })
    vi.spyOn(useEchoStore(), 'addMessages').mockResolvedValue()
  })

  it('asks every other client for its mailbox and exposes a read spec', async () => {
    const state = await startClientRefill()

    expect(state.status).toBe('waiting')
    expect(state.expected).toBe(1)
    const payloads = appendPayloads()
    const request = payloads.find((entry) => entry.op.op === 'refillRequest')
    expect(request.name).toBe('outbound_client_other-1')
    expect(request.op.from).toBe(me)
    expect(request.op.container).toBe(`refill_client_${me}`)

    expect(getRefillReadSpec()).toEqual({
      name: `refill_client_${me}`,
      limit: 10,
    })
  })

  it('does nothing when this address has no other clients', async () => {
    apiService.clientSynchronize.mockImplementation(async (request) => {
      if (request.action === 'read') return { entries: [clientEntry(1, { op: 'add', client: me })] }
      return { entries: [] }
    })
    const state = await startClientRefill()
    expect(state.status).toBe('no_clients')
    expect(getRefillReadSpec()).toBeNull()
  })

  it('responds with chunks and a done marker once per request', async () => {
    const op = {
      op: 'refillRequest',
      requestId: 'req-1',
      from: 'requester-1',
      container: 'refill_client_requester-1',
    }
    await respondToRefillRequest(op)
    await flushClientAppends()

    let payloads = appendPayloads().filter(
      (entry) => entry.name === 'refill_client_requester-1',
    )
    expect(payloads.length).toBeGreaterThanOrEqual(2)
    expect(payloads[0].op.op).toBe('refillChunk')
    expect(payloads[0].op.entries.map((item) => item.store)).toEqual([
      'echo_General',
      '__netmail__',
    ])
    expect(payloads[payloads.length - 1].op.op).toBe('refillDone')
    expect(payloads[payloads.length - 1].op.messages).toBe(2)

    // The same request must not be served twice (the outbound op can be
    // re-delivered after a reconnect).
    apiService.clientSynchronize.mockClear()
    await respondToRefillRequest(op)
    await flushClientAppends()
    expect(appendPayloads()).toHaveLength(0)
  })

  it('imports chunks, tracks progress and finishes after done', async () => {
    await startClientRefill()
    const requestId = clientRefillState.requestId
    const echo = useEchoStore()

    await applyRefillOps([
      {
        op: 'refillChunk',
        requestId,
        from: 'other-1',
        entries: [
          { store: 'echo_General', message: { message_id: 'm1', data: '{}' } },
          { store: '__netmail__', message: { message_id: 'n1', data: '{}' } },
        ],
      },
      { op: 'refillDone', requestId, from: 'other-1', messages: 2 },
    ])

    expect(echo.addMessages).toHaveBeenCalledWith(
      'General',
      [expect.objectContaining({ message_id: 'm1' })],
    )
    expect(echo.addMessages).toHaveBeenCalledWith(
      '__netmail__',
      [expect.objectContaining({ message_id: 'n1' })],
    )
    expect(clientRefillState.messages).toBe(2)
    expect(clientRefillState.status).toBe('done')
    expect(clientRefillState.active).toBe(false)
    expect(getRefillReadSpec()).toBeNull()
  })
})
