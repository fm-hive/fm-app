import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/api', () => ({
  apiService: {
    sendReceive: vi.fn(),
  },
}))

import { apiService } from '../../src/services/api'
import { fetchMessages } from '../../src/services/message'

const KEY = 'fm_pending_delivery_acks'

describe('local delivery ACKs (#delivering requeue)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('persists packet ids until the next successful request confirms them', async () => {
    apiService.sendReceive.mockResolvedValueOnce({ messages: [], local_packet_ids: [7, 8] })
    await fetchMessages()
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([7, 8])

    apiService.sendReceive.mockResolvedValueOnce({ messages: [], local_packet_ids: [] })
    await fetchMessages()
    expect(apiService.sendReceive.mock.calls[1][0].delivered_local_ids).toEqual([7, 8])
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([])
  })

  it('keeps the ids when the request fails and ACKs them later', async () => {
    apiService.sendReceive.mockResolvedValueOnce({ messages: [], local_packet_ids: [9] })
    await fetchMessages()

    apiService.sendReceive.mockRejectedValueOnce(new Error('network down'))
    await expect(fetchMessages()).rejects.toThrow('network down')
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([9])

    apiService.sendReceive.mockResolvedValueOnce({ messages: [], local_packet_ids: [] })
    await fetchMessages()
    expect(apiService.sendReceive.mock.calls[2][0].delivered_local_ids).toEqual([9])
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([])
  })

  it('sends ids persisted before a reload (fresh module state)', async () => {
    localStorage.setItem(KEY, JSON.stringify([42]))
    apiService.sendReceive.mockResolvedValueOnce({ messages: [], local_packet_ids: [] })
    await fetchMessages()
    expect(apiService.sendReceive.mock.calls[0][0].delivered_local_ids).toEqual([42])
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([])
  })
})
