import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/db', () => ({
  clearEchoMessages: vi.fn(),
  putMessage: vi.fn(),
  bulkPutMessages: vi.fn(),
  getMessage: vi.fn(),
  getAllMessages: vi.fn(async () => []),
  deleteMessage: vi.fn(),
  getLastMessageTimestamp: vi.fn(async () => 0),
  ensureEchoStores: vi.fn(async () => {}),
  renameEchoStore: vi.fn(async () => {}),
  markStoreExists: vi.fn(),
  moveToTrash: vi.fn(async () => {}),
  getNetmailFolders: vi.fn(() => ({})),
  netmailStoreName: (name) => `netmail_${name}`,
  echoStoreName: (name) => `echo_${name}`,
}))

import * as db from '../../src/services/db'
import { useEchoStore } from '../../src/stores/echo'

describe('echo local copy deletion (#388)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deletes stored and in-memory messages of one echo and resets its read mark', async () => {
    const echo = useEchoStore()
    echo.messages.News = [{ message_id: '1', timestamp: 10 }]
    echo.messages.Other = [{ message_id: '2', timestamp: 20 }]
    echo.lastReadTimestamps.News = 10
    echo.lastReadTimestamps.Other = 20

    await echo.deleteLocalCopy('News')

    expect(db.clearEchoMessages).toHaveBeenCalledWith('News')
    expect(echo.messages.News).toBeUndefined()
    expect(echo.messages.Other).toEqual([{ message_id: '2', timestamp: 20 }])
    expect(echo.lastReadTimestamps.News).toBeUndefined()
    expect(echo.lastReadTimestamps.Other).toBe(20)
  })

  it('keeps the subscription after deleting the local copy', async () => {
    const echo = useEchoStore()
    echo.subscribedEchoes = ['News']

    await echo.deleteLocalCopy('News')

    expect(echo.subscribedEchoes).toEqual(['News'])
  })

  it('ignores an empty echo name', async () => {
    const echo = useEchoStore()
    await echo.deleteLocalCopy('')
    expect(db.clearEchoMessages).not.toHaveBeenCalled()
  })
})
