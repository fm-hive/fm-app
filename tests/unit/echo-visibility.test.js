import { describe, it, expect } from 'vitest'
import { isEchoVisibleInSidebar } from '../../src/utils/echoVisibility'

describe('echo sidebar visibility (#388)', () => {
  it('shows a subscribed echo', () => {
    expect(isEchoVisibleInSidebar({ name: 'News', subscribed: true })).toBe(true)
  })

  it('shows a system echo that cannot be subscribed to', () => {
    expect(isEchoVisibleInSidebar({ name: 'Broadcast', subscribed: false, no_subscribe: true })).toBe(true)
  })

  it('shows an echo known only to the local subscription list', () => {
    expect(isEchoVisibleInSidebar({ name: 'News', subscribed: false }, {
      subscribedEchoes: ['News'],
    })).toBe(true)
    expect(isEchoVisibleInSidebar({ name: 'News', subscribed: false }, {
      isSubscribed: name => name === 'News',
    })).toBe(true)
  })

  it('hides an unsubscribed echo', () => {
    expect(isEchoVisibleInSidebar({ name: 'News', subscribed: false }, {
      subscribedEchoes: [],
      isSubscribed: () => false,
    })).toBe(false)
  })
})
