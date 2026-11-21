import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEchoStore } from '../../src/stores/echo'
import { useIdentityStore } from '../../src/stores/identity'

describe('echo store unread / read logic', () => {
  let echo
  const now = () => Math.floor(Date.now() / 1000)

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    echo = useEchoStore()
  })

  it('markRead advances the read watermark to the max loaded message timestamp', () => {
    // Messages with timestamps in the "future" (server clock ahead of client)
    // must still be considered read after markRead (regression: watermark used
    // Date.now(), so future-dated messages stayed unread forever).
    const future = now() + 3600
    echo.messages['News'] = [
      { message_id: '1', type: 'echomail', timestamp: future },
      { message_id: '2', type: 'echomail', timestamp: future + 5 },
    ]
    echo.markRead('News')
    expect(echo.lastReadTimestamps['News']).toBe(future + 5)
  })

  it('markRead with only past messages sets the watermark to now', () => {
    echo.messages['News'] = [
      { message_id: '1', type: 'echomail', timestamp: now() - 200 },
      { message_id: '2', type: 'echomail', timestamp: now() - 100 },
    ]
    echo.markRead('News')
    expect(echo.lastReadTimestamps['News']).toBeGreaterThanOrEqual(now() - 100)
  })

  it('markNetmailRead advances the netmail watermark to the max received netmail timestamp', () => {
    const future = now() + 3600
    echo.messages['__netmail__'] = [
      { message_id: 'n1', type: 'netmail', sender_address: ':0:2', timestamp: future },
      { message_id: 'n2', type: 'netmail', sender_address: ':0:3', timestamp: future + 10 },
      // self-sent copy must not push the watermark
      { message_id: 'n3', type: 'netmail', sender_address: ':0:9', timestamp: future + 1000 },
    ]
    // Set identity user so self-sent copies are excluded
    const identity = useIdentityStore()
    identity.user = { address: ':0:9' }

    expect(echo.netmailUnreadCount).toBe(2)
    echo.markNetmailRead()
    expect(echo.lastReadNetmailTimestamp).toBe(future + 10)
    expect(echo.netmailUnreadCount).toBe(0)
  })

  it('tracks seen echoes (subscriptions badge) and persists them', () => {
    expect(echo.isEchoSeen('Foo')).toBe(false)
    echo.markEchoesSeen(['Foo', 'Bar'])
    expect(echo.isEchoSeen('Foo')).toBe(true)
    expect(echo.isEchoSeen('Bar')).toBe(true)
    expect(echo.isEchoSeen('Baz')).toBe(false)
    expect(JSON.parse(localStorage.getItem('fm_echo_seen'))).toEqual(['Foo', 'Bar'])
  })
})

describe('echo store per-echo moderation', () => {
  let echo
  let identity

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    echo = useEchoStore()
    identity = useIdentityStore()
    identity.user = { address: ':0:5' }
  })

  it('isModeratorOf is true only for the echo where the user is a moderator', () => {
    echo.setEchoes([
      { id: 1, name: 'Modded', rules: JSON.stringify({ parameters: { moderators: [':0:5'] } }) },
      { id: 2, name: 'Other', rules: JSON.stringify({ parameters: { moderators: [':0:9'] } }) },
    ])
    expect(echo.isModeratorOf('Modded')).toBe(true)
    // regression: being a moderator elsewhere must not leak into this echo
    expect(echo.isModeratorOf('Other')).toBe(false)
  })

  it('isModeratorOf accepts rules as an object and a top-level moderators list', () => {
    echo.setEchoes([
      { id: 1, name: 'Obj', rules: { moderators: [':0:5'] } },
    ])
    expect(echo.isModeratorOf('Obj')).toBe(true)
  })

  it('isModeratorOf is false for unknown echoes, missing rules or no user', () => {
    echo.setEchoes([{ id: 1, name: 'NoRules' }])
    expect(echo.isModeratorOf('NoRules')).toBe(false)
    expect(echo.isModeratorOf('Missing')).toBe(false)
    expect(echo.isModeratorOf('')).toBe(false)
    identity.user = null
    echo.setEchoes([{ id: 1, name: 'Modded', rules: JSON.stringify({ moderators: [':0:5'] }) }])
    expect(echo.isModeratorOf('Modded')).toBe(false)
  })
})

describe('unread block helpers (#302)', () => {
  let echo
  const now = () => Math.floor(Date.now() / 1000)

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    echo = useEchoStore()
  })

  it('unreadCount counts non-netmail messages above the watermark', () => {
    echo.messages['News'] = [
      { message_id: '1', type: 'echomail', timestamp: 100 },
      { message_id: '2', type: 'echomail', timestamp: 200 },
      { message_id: '3', type: 'netmail', timestamp: 300 },
    ]
    echo.lastReadTimestamps['News'] = 100
    expect(echo.unreadCount('News')).toBe(1)
    expect(echo.unreadCount('Missing')).toBe(0)
  })

  it('lastReadOf returns the echo watermark', () => {
    echo.lastReadTimestamps['News'] = 100
    expect(echo.lastReadOf('News')).toBe(100)
    expect(echo.lastReadOf('Missing')).toBe(0)
  })

  it('markReadUpTo advances the watermark but never goes back (#317)', () => {
    echo.lastReadTimestamps['News'] = 100
    echo.markReadUpTo('News', 200)
    expect(echo.lastReadOf('News')).toBe(200)
    // Going back to an earlier message keeps the watermark
    echo.markReadUpTo('News', 150)
    expect(echo.lastReadOf('News')).toBe(200)
    // No timestamp (e.g. a message without one) is ignored
    echo.markReadUpTo('News', 0)
    expect(echo.lastReadOf('News')).toBe(200)
    // Persisted for the next session
    expect(JSON.parse(localStorage.getItem('fm_echo_last_read'))['News']).toBe(200)
  })

  it('isNetmailUnread ignores own copies and broken mail', () => {
    const identity = useIdentityStore()
    identity.user = { address: ':0:5' }
    echo.lastReadNetmailTimestamp = 100
    expect(echo.isNetmailUnread({ type: 'netmail', sender_address: ':0:2', timestamp: 200 })).toBe(true)
    expect(echo.isNetmailUnread({ type: 'netmail', sender_address: ':0:5', timestamp: 200 })).toBe(false)
    expect(echo.isNetmailUnread({ type: 'netmail', sender_address: ':0:2', timestamp: 200, _decryptError: true })).toBe(false)
    expect(echo.isNetmailUnread({ type: 'netmail', sender_address: ':0:2', timestamp: 50 })).toBe(false)
  })

  it('firstUnreadNetmail returns the oldest unread incoming letter', () => {
    const identity = useIdentityStore()
    identity.user = { address: ':0:5' }
    echo.messages['__netmail__'] = [
      { message_id: 'a', type: 'netmail', sender_address: ':0:2', timestamp: 300 },
      { message_id: 'b', type: 'netmail', sender_address: ':0:3', timestamp: 200 },
      { message_id: 'c', type: 'netmail', sender_address: ':0:5', timestamp: 150 },
    ]
    echo.lastReadNetmailTimestamp = 100
    expect(echo.firstUnreadNetmail().message_id).toBe('b')
  })
})
