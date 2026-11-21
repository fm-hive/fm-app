import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSelectedMessages, selectionEntry } from '../../src/composables/useSelectedMessages'

const STORAGE_KEY = 'fm_selected_messages'

function msg(id, data = {}, extra = {}) {
  return {
    message_id: id,
    type: 'echomail',
    sender_address: ':0:7',
    timestamp: 1700000000,
    data: JSON.stringify(data),
    ...extra,
  }
}

describe('useSelectedMessages (#306)', () => {
  let store

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    store = useSelectedMessages()
    store.clear()
  })

  it('adds a message with a display snapshot and persists it', () => {
    const added = store.add(msg('m1', { subject: 'Hello', sender_name: 'Ivan' }), { echoName: 'Newcomers', echoId: 4 })

    expect(added).toBe(true)
    expect(store.count.value).toBe(1)
    const entry = store.items.value[0]
    expect(entry).toMatchObject({
      message_id: 'm1',
      echo_name: 'Newcomers',
      echo_id: 4,
      subject: 'Hello',
      sender_name: 'Ivan',
      sender_address: ':0:7',
    })
    expect(entry.saved_at).toBeGreaterThan(0)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveLength(1)
  })

  it('does not add the same message twice and reports membership', () => {
    store.add(msg('m1', { subject: 'A' }), { echoName: 'E' })
    const again = store.add(msg('m1', { subject: 'A' }), { echoName: 'E' })

    expect(again).toBe(false)
    expect(store.count.value).toBe(1)
    expect(store.has('m1')).toBe(true)
    expect(store.has('m2')).toBe(false)
  })

  it('toggles a message in and out', () => {
    expect(store.toggle(msg('m1', { subject: 'A' }), { echoName: 'E' })).toBe(true)
    expect(store.has('m1')).toBe(true)
    expect(store.toggle(msg('m1', { subject: 'A' }), { echoName: 'E' })).toBe(false)
    expect(store.has('m1')).toBe(false)
    expect(store.count.value).toBe(0)
  })

  it('removes and clears entries', () => {
    store.add(msg('m1'), { echoName: 'E' })
    store.add(msg('m2'), { echoName: 'E' })
    store.remove('m1')
    expect(store.items.value.map(e => e.message_id)).toEqual(['m2'])

    store.clear()
    expect(store.count.value).toBe(0)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual([])
  })

  it('keeps the newest entry first and survives a reload', () => {
    store.add(msg('m1', { subject: 'First' }), { echoName: 'E' })
    store.add(msg('m2', { subject: 'Second' }), { echoName: 'E' })
    expect(store.items.value.map(e => e.message_id)).toEqual(['m2', 'm1'])

    // A fresh instance reads the persisted list (localStorage is the source).
    setActivePinia(createPinia())
    const reloaded = useSelectedMessages()
    expect(reloaded.items.value.map(e => e.message_id)).toEqual(['m2', 'm1'])
  })

  it('selectionEntry tolerates broken data', () => {
    const entry = selectionEntry({ message_id: 'm1', type: 'echomail', data: 'not json' }, { echoName: 'E' })
    expect(entry.subject).toBe('')
    expect(entry.message_id).toBe('m1')
    expect(selectionEntry(null)).toBeNull()
    expect(selectionEntry({})).toBeNull()
  })
})

describe('selected attachments (#306)', () => {
  let store

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    store = useSelectedMessages()
    store.clear()
  })

  it('stores an attachment by reference (no data) and dedups it', () => {
    const att = { name: 'punishment.json', type: 'application/json', size: 123, data: 'data:...' }
    const added = store.addAttachment(att, { messageId: 'm1', index: 0, echoName: 'Newcomers', echoId: 4 })

    expect(added).toBe(true)
    const entry = store.items.value[0]
    expect(entry).toMatchObject({
      kind: 'attachment',
      attachment_id: 'm1:0',
      name: 'punishment.json',
      type: 'application/json',
      size: 123,
      message_id: 'm1',
      index: 0,
      echo_name: 'Newcomers',
      echo_id: 4,
    })
    expect(entry.data).toBeUndefined()
    expect(store.hasAttachment('m1:0')).toBe(true)

    expect(store.addAttachment(att, { messageId: 'm1', index: 0 })).toBe(false)
    expect(store.count.value).toBe(1)
  })

  it('toggles attachments and removes them without touching messages', () => {
    const att = { name: 'a.json', type: 'application/json', size: 1 }
    store.add(msg('m1', { subject: 'Message' }), { echoName: 'E' })
    expect(store.toggleAttachment(att, { messageId: 'm2', index: 1 })).toBe(true)
    expect(store.count.value).toBe(2)

    expect(store.toggleAttachment(att, { messageId: 'm2', index: 1 })).toBe(false)
    expect(store.count.value).toBe(1)
    expect(store.has('m1')).toBe(true)

    // Removing by kind keeps the other kind intact
    store.addAttachment(att, { messageId: 'm2', index: 1 })
    store.remove('m1')
    expect(store.items.value).toHaveLength(1)
    expect(store.items.value[0].kind).toBe('attachment')
    expect(store.has('m1')).toBe(false)
  })

  it('selectionEntry marks messages explicitly', () => {
    const entry = selectionEntry(msg('m1', { subject: 'A' }), { echoName: 'E' })
    expect(entry.kind).toBe('message')
  })
})
