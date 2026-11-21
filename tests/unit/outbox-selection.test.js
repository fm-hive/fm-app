import { describe, it, expect, beforeEach } from 'vitest'
import { useOutbox } from '../../src/composables/useOutbox'

describe('outbox entry selection (#269)', () => {
  beforeEach(() => {
    localStorage.clear()
    useOutbox().clear()
  })

  it('marks reactions for sending like other messages', () => {
    const outbox = useOutbox()
    outbox.add({ type: 'echomail', echoName: 'E', message: { jws: 'x' }, isReaction: true })
    expect(outbox.queue.value[0].selected).toBe(true)
  })

  it('keeps netmail without a recipient key unselected', () => {
    const outbox = useOutbox()
    outbox.add({ type: 'netmail', recipient: ':0:9', noKey: true, message: { jws: 'x' } })
    expect(outbox.queue.value[0].selected).toBe(false)
  })

  it('respects an explicit selected flag', () => {
    const outbox = useOutbox()
    outbox.add({ type: 'netmail', recipient: ':0:9', selected: false, message: { jws: 'x' } })
    expect(outbox.queue.value[0].selected).toBe(false)
  })
})
