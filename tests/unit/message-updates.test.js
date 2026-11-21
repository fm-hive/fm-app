import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEchoStore } from '../../src/stores/echo'

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

describe('echo store message updates (#267)', () => {
  let echo

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    echo = useEchoStore()
  })

  it('replaces the original content and keeps its message ID', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'new text')])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    const m = list[0]
    expect(m.message_id).toBe('orig-1')
    expect(m.timestamp).toBe(1000)
    expect(m._edited).toBe(true)
    expect(m._update_message_id).toBe('upd-1')
    expect(m.jws).toBe('jws-upd-1')
    expect(JSON.parse(m.data).body).toBe('new text')
  })

  it('keeps the previous copy of every edit (#282)', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'second version', 2000)])
    await echo.addMessages(ECHO, [update('upd-2', ':0:1', 'orig-1', 'third version', 3000)])

    const m = echo.messages[ECHO][0]
    expect(JSON.parse(m.data).body).toBe('third version')
    expect(m._versions).toHaveLength(2)
    // First version: the original post, replaced by the first update.
    expect(JSON.parse(m._versions[0].data).body).toBe('old text')
    expect(m._versions[0].timestamp).toBe(1000)
    expect(m._versions[0].replaced_at).toBe(2000)
    expect(m._versions[0].jws).toBe('jws-orig-1')
    // Second version: the first update, replaced by the second one.
    expect(JSON.parse(m._versions[1].data).body).toBe('second version')
    expect(m._versions[1].timestamp).toBe(2000)
    expect(m._versions[1].replaced_at).toBe(3000)
  })

  it('does not duplicate a version when the same update arrives again (#282)', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'second version', 2000)])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'second version', 2000)])

    expect(echo.messages[ECHO][0]._versions).toHaveLength(1)
  })

  it('ignores an update from a different author', async () => {
    await echo.addMessages(ECHO, [original('orig-1', ':0:1')])
    await echo.addMessages(ECHO, [update('upd-evil', ':0:2', 'orig-1', 'hijacked')])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(JSON.parse(list[0].data).body).toBe('old text')
    expect(list[0]._edited).toBeUndefined()
  })

  it('keeps an update with an unknown original as a normal message', async () => {
    await echo.addMessages(ECHO, [update('upd-lone', ':0:1', 'missing', 'standalone')])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(list[0].message_id).toBe('upd-lone')
  })

  it('applies the latest update and does not duplicate it', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'second')])
    await echo.addMessages(ECHO, [update('upd-1', ':0:1', 'orig-1', 'second')])
    await echo.addMessages(ECHO, [update('upd-2', ':0:1', 'orig-1', 'third')])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(1)
    expect(JSON.parse(list[0].data).body).toBe('third')
    expect(list[0]._update_message_id).toBe('upd-2')
  })

  it('does not treat moderation or reaction updates as message edits', async () => {
    await echo.addMessages(ECHO, [original()])
    await echo.addMessages(ECHO, [
      msg('mod-1', ':0:9', { severity: 'none', updateMessageId: 'orig-1', message: 'retracted' }, 2000),
    ])

    const list = echo.messages[ECHO]
    expect(list).toHaveLength(2)
    expect(list[0]._edited).toBeUndefined()
  })
})
