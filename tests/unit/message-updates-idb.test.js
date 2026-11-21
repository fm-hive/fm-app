import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEchoStore } from '../../src/stores/echo'

// In-memory stand-in for the IndexedDB layer, so the store's database
// fallbacks can be exercised (the plain unit tests let the calls fail).
vi.mock('../../src/services/db', () => {
  const stores = new Map()
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)
  }
  const clone = (v) => JSON.parse(JSON.stringify(v))
  return {
    __stores: stores,
    __clear: () => stores.clear(),
    markStoreExists: vi.fn(),
    putMessage: vi.fn(async (name, msg) => { store(name).set(msg.message_id, clone(msg)) }),
    bulkPutMessages: vi.fn(async (name, msgs) => { for (const m of msgs) store(name).set(m.message_id, clone(m)) }),
    getAllMessages: vi.fn(async (name) => Array.from(store(name).values()).map(clone)),
    getMessage: vi.fn(async (name, id) => { const m = store(name).get(id); return m ? clone(m) : null }),
    deleteMessage: vi.fn(async (name, id) => { store(name).delete(id) }),
    ensureEchoStores: vi.fn(async () => {}),
  }
})

import * as db from '../../src/services/db'

const ECHO = 'Edits'

function msg(id, sender, data, ts = 1000) {
  return {
    message_id: id,
    type: 'echomail',
    echo_name: ECHO,
    sender_address: sender,
    timestamp: ts,
    data: JSON.stringify(data),
    jws: `jws-${id}`,
  }
}

const original = (id = 'orig-1', sender = ':0:1') => msg(id, sender, { subject: 'First', body: 'old text', timestamp: 1000 })
const update = (id, sender, targetId, body, ts = 2000) => msg(id, sender, {
  subject: 'First (fixed)', body, updateMessageId: targetId, timestamp: ts,
}, ts)

describe('echo store message updates with IndexedDB (#303)', () => {
  let echo

  beforeEach(() => {
    localStorage.clear()
    db.__clear()
    setActivePinia(createPinia())
    echo = useEchoStore()
  })

  it('applies an update when the original is only in IndexedDB', async () => {
    await db.putMessage(ECHO, original())

    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'new text', 2000)])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('orig-1')
    expect(JSON.parse(list[0].data).body).toBe('new text')
    expect(list[0]._versions).toHaveLength(1)
    // The edited original is persisted back, including the edit history.
    const stored = await db.getMessage(ECHO, 'orig-1')
    expect(JSON.parse(stored.data).body).toBe('new text')
    expect(stored._edited).toBe(true)
    expect(stored._versions).toHaveLength(1)
    expect(JSON.parse(stored._versions[0].data).body).toBe('old text')
  })

  it('folds a standalone update into the original on loadEcho', async () => {
    // State of a client that lost the history before the fix: the original and
    // the update are stored as two independent messages.
    await db.putMessage(ECHO, original())
    await db.putMessage(ECHO, update('upd-1', ':0:1', 'orig-1', 'second version', 2000))

    await echo.loadEcho(ECHO)

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('orig-1')
    expect(JSON.parse(list[0].data).body).toBe('second version')
    expect(list[0]._versions).toHaveLength(1)
    expect(JSON.parse(list[0]._versions[0].data).body).toBe('old text')
    // The standalone copy is gone from IndexedDB too.
    expect(await db.getMessage(ECHO, 'upd-1')).toBeNull()
  })

  it('folds several standalone updates in timestamp order', async () => {
    await db.putMessage(ECHO, original())
    await db.putMessage(ECHO, update('upd-2', ':0:1', 'orig-1', 'third version', 3000))
    await db.putMessage(ECHO, update('upd-1', ':0:1', 'orig-1', 'second version', 2000))

    await echo.loadEcho(ECHO)

    const m = echo.messages[ECHO][0]
    expect(JSON.parse(m.data).body).toBe('third version')
    expect(m._versions.map(v => JSON.parse(v.data).body)).toEqual(['old text', 'second version'])
  })

  it('applies an update that arrives before its original in the same batch', async () => {
    await echo.addMessages(ECHO, [
      update('upd-1', ':0:1', 'orig-1', 'new text', 2000),
      original(),
    ])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('orig-1')
    expect(JSON.parse(list[0].data).body).toBe('new text')
    expect(list[0]._versions).toHaveLength(1)
  })

  it('does not roll the content back when an older update arrives late', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [update('upd-2', ':0:1', 'orig-1', 'third version', 3000)])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'second version', 2000)])

    const m = echo.messages[ECHO][0]
    expect(JSON.parse(m.data).body).toBe('third version')
    expect(m._versions.map(v => JSON.parse(v.data).body)).toEqual(['old text', 'second version'])
  })

  it('does not duplicate a version when the same update is re-delivered', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'new text', 2000)])
    // Re-delivery while the echo is loaded: already applied, ignored.
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'new text', 2000)])
    // Re-delivery after a reload (the standalone copy is folded again).
    await echo.loadEcho(ECHO)
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'new text', 2000)])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0]._versions).toHaveLength(1)
  })

  it('keeps an update with a truly unknown original as a normal message', async () => {
    await echo.addMessages(ECHO, [update('upd-lone', ':0:1', 'missing', 'standalone', 2000)])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('upd-lone')
    expect(await db.getMessage(ECHO, 'upd-lone')).not.toBeNull()
  })

  it('ignores an update from a different author even from IndexedDB', async () => {
    await db.putMessage(ECHO, original('orig-1', ':0:1'))

    await echo.addMessages(ECHO, [update('upd-evil', ':0:2', 'orig-1', 'hijacked', 2000)])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('orig-1')
    expect(JSON.parse(list[0].data).body).toBe('old text')
    expect(list[0]._edited).toBeUndefined()
  })
})
