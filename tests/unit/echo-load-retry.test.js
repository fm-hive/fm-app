import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/db', () => ({
  getAllMessages: vi.fn(async () => []),
  markStoreExists: vi.fn(),
  putMessage: vi.fn(async () => {}),
  bulkPutMessages: vi.fn(async () => {}),
  deleteMessage: vi.fn(async () => {}),
  ensureEchoStores: vi.fn(async () => {}),
  getLastMessageTimestamp: vi.fn(async () => 0),
}))

import { useEchoStore } from '../../src/stores/echo'
import * as db from '../../src/services/db'

const stored = [{ message_id: 'm1', type: 'echomail', timestamp: 1, data: '{"subject":"s"}' }]

describe('echo store load retry (#274)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not cache an empty echo when the first IndexedDB read fails', async () => {
    db.getAllMessages
      .mockRejectedValueOnce(new Error('db not ready'))
      .mockRejectedValueOnce(new Error('db not ready'))
      .mockResolvedValueOnce(stored)

    const echo = useEchoStore()
    await echo.loadEcho('E')
    // The failed read must not be remembered as an empty echo.
    expect(echo.messages.E || []).toHaveLength(0)

    await echo.loadEcho('E')
    expect(db.getAllMessages).toHaveBeenCalledTimes(3)
    expect((echo.messages.E || []).map(m => m.message_id)).toEqual(['m1'])
  })

  it('retries a failing read once before giving up', async () => {
    db.getAllMessages
      .mockRejectedValueOnce(new Error('db not ready'))
      .mockResolvedValueOnce(stored)

    const echo = useEchoStore()
    await echo.loadEcho('E')
    expect(db.getAllMessages).toHaveBeenCalledTimes(2)
    expect((echo.messages.E || []).map(m => m.message_id)).toEqual(['m1'])
  })

  it('does not read the store again once the echo is loaded', async () => {
    db.getAllMessages.mockResolvedValue(stored)
    const echo = useEchoStore()
    await echo.loadEcho('E')
    await echo.loadEcho('E')
    expect(db.getAllMessages).toHaveBeenCalledTimes(1)
  })
})
