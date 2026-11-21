import { describe, it, expect } from 'vitest'
import { buildForwardData, forwardSubjectOf } from '../../src/utils/forward'
import { BUNDLE_TYPE, jwsPayloadOf } from '../../src/utils/selectedBundle'

function originalMessage() {
  const data = JSON.stringify({ subject: 'New user joined the network', body: 'User :0:28 has joined.' })
  return {
    message_id: 'wJOjwPatO24v0RBttiHwTkhxV4nDBkkj0EPJ8A-yNsk',
    type: 'echomail',
    sender_address: ':0:0',
    timestamp: 1790325951,
    echo_name: 'Network news',
    echo_id: 12,
    data,
    jws: 'eyJhbGciOiJFZERTQSJ9.' + btoa(data).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.sig',
  }
}

describe('forward as a bundle attachment (#325)', () => {
  it('takes the real subject of the original message', () => {
    expect(forwardSubjectOf(originalMessage())).toBe('Forwarded: New user joined the network')
    expect(forwardSubjectOf({})).toBe('Forwarded: Message')
  })

  it('puts the comment in the body with a link to the bundle attachment', () => {
    const msg = originalMessage()
    const data = buildForwardData(msg, 'тест форварда')
    expect(data.subject).toBe('Forwarded: New user joined the network')
    expect(data.body).toBe('тест форварда\n\n[wJOjwPatO24v0RBttiHwTkhxV4nDBkkj0EPJ8A-yNsk.json](attachment:0)')
    expect(data.attachments).toHaveLength(1)
    const att = data.attachments[0]
    expect(att.name).toBe('wJOjwPatO24v0RBttiHwTkhxV4nDBkkj0EPJ8A-yNsk.json')
    expect(att.type).toBe('application/json')
    expect(att.data.startsWith('data:application/json;base64,')).toBe(true)
  })

  it('renders just the attachment link when there is no comment', () => {
    const data = buildForwardData(originalMessage(), '')
    expect(data.body).toBe('[wJOjwPatO24v0RBttiHwTkhxV4nDBkkj0EPJ8A-yNsk.json](attachment:0)')
  })

  it('bundle carries the wire message (jws, no expanded data)', () => {
    const msg = originalMessage()
    const att = buildForwardData(msg, null).attachments[0]
    const payload = att.data.split(',')[1]
    const bundle = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))))
    expect(bundle.type).toBe(BUNDLE_TYPE)
    expect(bundle.messages).toHaveLength(1)
    const entry = bundle.messages[0]
    expect(entry.message_id).toBe(msg.message_id)
    expect(entry.jws).toBe(msg.jws)
    expect(entry.data).toBeUndefined()
    // The receiver recovers the content from the JWS payload (#306).
    expect(jwsPayloadOf(entry.jws).subject).toBe('New user joined the network')
  })
})
