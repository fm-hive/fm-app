import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/services/api', () => ({
  apiService: {
    getEchoes: vi.fn(),
  },
}))

import { apiService } from '../../src/services/api'
import { useEchoStore } from '../../src/stores/echo'
import { useIdentityStore } from '../../src/stores/identity'
import { isEchoVisibleInSidebar } from '../../src/utils/echoVisibility'

function withKeys(identity) {
  identity.privateKey = new Uint8Array([1, 2, 3])
  identity.publicKey = new Uint8Array([4, 5, 6])
  identity.user = { address: ':0:28' }
}

describe('echo list refresh and subscriptions (#270/#271)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('syncs subscribed echoes from the server flags', async () => {
    const echo = useEchoStore()
    const identity = useIdentityStore()
    withKeys(identity)
    apiService.getEchoes.mockResolvedValue([
      { id: 1, name: 'Newcomers', subscribed: true },
      { id: 2, name: 'FM доработки', subscribed: true },
      { id: 3, name: 'Other', subscribed: false },
    ])

    await echo.refreshEchoes()

    expect(echo.subscribedEchoes).toEqual(['Newcomers', 'FM доработки'])
    expect(echo.subscribedEchoesList.map(e => e.name)).toEqual(['Newcomers', 'FM доработки'])
  })

  it('keeps echoes missing from the response (filtered for unapproved users)', async () => {
    const echo = useEchoStore()
    const identity = useIdentityStore()
    withKeys(identity)
    echo.subscribedEchoes = ['Newcomers', 'FM доработки']
    apiService.getEchoes.mockResolvedValue([
      { id: 1, name: 'Newcomers', subscribed: true },
    ])

    await echo.refreshEchoes()

    expect(echo.subscribedEchoes).toEqual(['Newcomers', 'FM доработки'])
  })

  it('drops echoes the server explicitly reports as not subscribed', async () => {
    const echo = useEchoStore()
    const identity = useIdentityStore()
    withKeys(identity)
    echo.subscribedEchoes = ['Newcomers', 'Old echo']
    apiService.getEchoes.mockResolvedValue([
      { id: 1, name: 'Newcomers', subscribed: true },
      { id: 2, name: 'Old echo', subscribed: false },
    ])

    await echo.refreshEchoes()

    expect(echo.subscribedEchoes).toEqual(['Newcomers'])
  })

  it('removes an unsubscribed echo from the sidebar sources', () => {
    const echo = useEchoStore()
    const identity = useIdentityStore()
    echo.echoes = [
      { id: 1, name: 'News', subscribed: true },
      { id: 2, name: 'Other', subscribed: true },
    ]
    echo.subscribedEchoes = ['News', 'Other']
    identity.subscriptions.add('News')
    identity.subscriptions.add('Other')

    echo.unsubscribe('News')

    expect(echo.subscribedEchoes).toEqual(['Other'])
    expect(echo.echoes.find(e => e.name === 'News').subscribed).toBe(false)
    expect(identity.isSubscribed('News')).toBe(false)
    expect(identity.isSubscribed('Other')).toBe(true)
    expect(isEchoVisibleInSidebar(echo.echoes[0], {
      subscribedEchoes: echo.subscribedEchoes,
      isSubscribed: identity.isSubscribed,
    })).toBe(false)
  })

  it('picks up new echoes and subscriptions on refresh', async () => {
    const echo = useEchoStore()
    const identity = useIdentityStore()
    withKeys(identity)
    apiService.getEchoes.mockResolvedValue([
      { id: 1, name: 'Newcomers', subscribed: true },
      { id: 9, name: 'Brand new', subscribed: true },
    ])

    await echo.refreshEchoes()

    expect(echo.echoes.map(e => e.name)).toEqual(['Newcomers', 'Brand new'])
    expect(echo.subscribedEchoesList.map(e => e.name)).toEqual(['Newcomers', 'Brand new'])
  })
})
