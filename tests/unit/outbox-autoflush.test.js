import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOutbox } from '../../src/composables/useOutbox'
import { useEchoStore } from '../../src/stores/echo'

const sendReceive = vi.fn()
vi.mock('../../src/services/api', () => ({
  apiService: {
    sendReceive: (...args) => sendReceive(...args),
  },
}))

// Messages are signed lazily; keep the crypto out of these tests.
vi.mock('../../src/services/message', () => ({
  createSignedMessage: vi.fn(async (type, data, options) => ({
    type,
    echo_name: options?.echo_name,
    data: JSON.stringify(data),
    jws: 'jws-test',
    message_id: 'sent-1',
  })),
  buildNetmailMessage: vi.fn(async (recipient, data) => ({
    type: 'netmail',
    recipient_address: recipient,
    data: JSON.stringify(data),
    jws: 'jws-netmail',
    message_id: 'sent-netmail',
  })),
}))

vi.mock('../../src/services/clientSync', () => ({
  broadcastOp: vi.fn(async () => {}),
}))

const ECHO = 'Newcomers'

function entry(overrides = {}) {
  return {
    type: 'echomail',
    echoName: ECHO,
    rawData: { subject: 'Hi', body: 'text', timestamp: 1000 },
    label: 'Hi',
    ...overrides,
  }
}

// A node response with the delivered copy of the sent message.
function responseFor(msg) {
  return {
    messages: [{
      message_id: 'srv-1',
      type: msg.type,
      echo_name: msg.echo_name,
      sender_address: ':0:1',
      timestamp: 1000,
      data: msg.data,
      jws: msg.jws,
    }],
  }
}

describe('outbox auto-flush (#305)', () => {
  let outbox
  let echo

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    outbox = useOutbox()
    echo = useEchoStore()
    outbox.clear()
    sendReceive.mockReset()
  })

  it('flushEntry sends a single entry and adds the response to the echo store', async () => {
    sendReceive.mockImplementation(async ({ messages }) => responseFor(messages[0]))
    const id = outbox.add(entry())

    const result = await outbox.flushEntry(id)

    expect(result.sent).toBe(1)
    expect(sendReceive).toHaveBeenCalledTimes(1)
    // The sender sees their own message immediately (the bug in #305).
    const stored = echo.messages[ECHO] || []
    expect(stored.map(m => m.message_id)).toContain('srv-1')
    // And the queue entry is gone.
    expect(outbox.queue.value.find(e => e.id === id)).toBeUndefined()
  })

  it('flushEntry only sends the requested entry', async () => {
    sendReceive.mockImplementation(async ({ messages }) => responseFor(messages[0]))
    const first = outbox.add(entry({ rawData: { subject: 'First', body: 'a', timestamp: 1 } }))
    const second = outbox.add(entry({ rawData: { subject: 'Second', body: 'b', timestamp: 2 } }))

    await outbox.flushEntry(second)

    expect(outbox.queue.value.map(e => e.id)).toEqual([first])
  })

  it('flushEntry keeps the entry when sending fails', async () => {
    sendReceive.mockRejectedValue(new Error('network down'))
    const id = outbox.add(entry())

    await expect(outbox.flushEntry(id)).rejects.toThrow('network down')
    expect(outbox.queue.value.map(e => e.id)).toEqual([id])
  })

  it('flushReactions sends reactions through the shared path', async () => {
    sendReceive.mockImplementation(async ({ messages }) => responseFor(messages[0]))
    const id = outbox.add({
      type: 'echomail',
      echoName: ECHO,
      message: { type: 'echomail', echo_name: ECHO, data: JSON.stringify({ reaction: '👍' }), jws: 'jws-r' },
      isReaction: true,
      label: '👍',
    })

    const result = await outbox.flushReactions()

    expect(result.sent).toBe(1)
    expect(outbox.queue.value.find(e => e.id === id)).toBeUndefined()
    expect((echo.messages[ECHO] || []).map(m => m.message_id)).toContain('srv-1')
  })

  it('respects the daily rate limit for auto-flushed entries', async () => {
    // The node reports the current usage in every response; a reached limit
    // blocks the auto-flush (the entry stays in the queue).
    const { setRateLimitUsage } = await import('../../src/services/rateLimit')
    setRateLimitUsage({ echomail: { used: 5, limit: 5 } })
    const id = outbox.add(entry())
    sendReceive.mockImplementation(async ({ messages }) => responseFor(messages[0]))

    const result = await outbox.flushEntry(id)

    expect(result.sent).toBe(0)
    expect(result.blocked).toBe(1)
    expect(sendReceive).not.toHaveBeenCalled()
    expect(outbox.queue.value.find(e => e.id === id)).toBeTruthy()
  })
})
