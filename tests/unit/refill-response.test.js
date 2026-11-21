import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/services/api', () => ({
  apiService: {
    sendReceive: vi.fn(),
  },
}))

vi.mock('../../src/services/message', () => ({
  createSignedMessage: vi.fn(async (type, data) => ({
    type,
    sender_address: ':0:1',
    timestamp: 1,
    data: JSON.stringify(data),
    jws: 'signed',
  })),
}))

import { apiService } from '../../src/services/api'
import { sendRefillResponse } from '../../src/services/refill'

const before = '2026-09-18T00:00:00.000Z'
const oldMsg = {
  message_id: 'old-1',
  type: 'echomail',
  sender_address: ':0:1',
  timestamp: Math.floor(new Date(before).getTime() / 1000) - 100,
  data: '{"subject":"old"}',
  jws: 'sig-old',
}

describe('sendRefillResponse (#274)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the signed chunks immediately and reports counts', async () => {
    const res = await sendRefillResponse(
      { echoName: 'E', from: ':0:2', before },
      [oldMsg],
      { echoes: [] },
    )
    expect(res.count).toBe(1)
    expect(res.skipped).toBe(0)
    expect(apiService.sendReceive).toHaveBeenCalledTimes(1)
    const sent = apiService.sendReceive.mock.calls[0][0].messages
    expect(sent).toHaveLength(1)
    const payload = JSON.parse(sent[0].data)
    expect(payload.type).toBe('response')
    expect(payload.refill.to).toBe(':0:2')
    expect(payload.refill.messages[0].message_id).toBe('old-1')
  })

  it('does not call the API when there is nothing to send', async () => {
    const res = await sendRefillResponse({ echoName: 'E', from: ':0:2', before }, [], {})
    expect(res.count).toBe(0)
    expect(apiService.sendReceive).not.toHaveBeenCalled()
  })
})
