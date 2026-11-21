import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { renameEchoStore, renameProtocolEcho } = vi.hoisted(() => ({
  renameEchoStore: vi.fn(async () => {}),
  renameProtocolEcho: vi.fn(),
}))

vi.mock('../../src/services/db', () => ({
  renameEchoStore,
  ensureEchoStores: vi.fn(async () => {}),
  getAllMessages: vi.fn(async () => []),
  putMessage: vi.fn(async () => {}),
  bulkPutMessages: vi.fn(async () => {}),
  getMessage: vi.fn(async () => null),
  deleteMessage: vi.fn(async () => {}),
}))

vi.mock('../../src/stores/protocol', () => ({
  useProtocolStore: () => ({ renameEchoState: renameProtocolEcho }),
}))

import { useEchoStore } from '../../src/stores/echo'
import { useIdentityStore } from '../../src/stores/identity'

describe('echo rename migration (#299)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('moves messages, subscriptions, read marks, drafts and refills to the new name', async () => {
    const echo = useEchoStore()
    const identity = useIdentityStore()

    echo.echoes = [{ id: 1, name: 'OldEcho', subscribed: true }]
    echo.messages = {
      OldEcho: [{ message_id: 'm1', timestamp: 100 }],
    }
    echo.lastReadTimestamps = { OldEcho: 100 }
    echo.subscribedEchoes = ['OldEcho']
    echo.markEchoesSeen(['OldEcho'])
    identity.subscriptions.add('OldEcho')
    identity.myRefillRequests = { OldEcho: { messageId: 'r1', before: null } }
    localStorage.setItem('fm_echo_catalog', JSON.stringify({ 1: 'OldEcho' }))
    localStorage.setItem('fm_echo_groups', JSON.stringify({
      groups: [{ id: 'g1', name: 'Group', echoes: ['OldEcho', 'Other'] }],
      expanded: { g1: true },
    }))
    localStorage.setItem('fm_drafts', JSON.stringify([
      { id: 'd1', type: 'echo', echoName: 'OldEcho', subject: 's', body: 'b' },
      { id: 'd2', type: 'netmail', echoName: null, subject: 'n', body: 'b' },
    ]))

    const renames = await echo.reconcileEchoRenames([{ id: 1, name: 'NewEcho', subscribed: true }])

    expect(renameEchoStore).toHaveBeenCalledWith('OldEcho', 'NewEcho')
    expect(renames).toEqual({ OldEcho: 'NewEcho' })
    expect(echo.renamedEchoes).toEqual({ OldEcho: 'NewEcho' })
    expect(echo.messages.NewEcho).toEqual([{ message_id: 'm1', timestamp: 100 }])
    expect(echo.messages.OldEcho).toBeUndefined()
    expect(echo.lastReadTimestamps.NewEcho).toBe(100)
    expect(echo.lastReadTimestamps.OldEcho).toBeUndefined()
    expect(echo.subscribedEchoes).toEqual(['NewEcho'])
    expect(identity.subscriptions.has('NewEcho')).toBe(true)
    expect(identity.subscriptions.has('OldEcho')).toBe(false)
    expect(identity.myRefillRequests.NewEcho).toEqual({ messageId: 'r1', before: null })
    expect(identity.myRefillRequests.OldEcho).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('fm_echo_seen'))).toEqual(['NewEcho'])
    expect(JSON.parse(localStorage.getItem('fm_echo_catalog'))).toEqual({ 1: 'NewEcho' })
    const drafts = JSON.parse(localStorage.getItem('fm_drafts'))
    expect(drafts.find(d => d.id === 'd1').echoName).toBe('NewEcho')
    expect(drafts.find(d => d.id === 'd2').echoName).toBeNull()
    expect(JSON.parse(localStorage.getItem('fm_echo_groups')).groups[0].echoes).toEqual(['NewEcho', 'Other'])
    expect(renameProtocolEcho).toHaveBeenCalledWith('OldEcho', 'NewEcho')
  })

  it('does not rename an echo whose stable id kept the same name', async () => {
    const echo = useEchoStore()
    echo.echoes = [{ id: 2, name: 'Stable', subscribed: true }]
    localStorage.setItem('fm_echo_catalog', JSON.stringify({ 2: 'Stable' }))

    await echo.reconcileEchoRenames([{ id: 2, name: 'Stable', subscribed: true }])

    expect(renameEchoStore).not.toHaveBeenCalled()
    expect(echo.renamedEchoes).toEqual({})
  })
})
