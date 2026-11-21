import { describe, it, expect } from 'vitest'
import {
  messageForBundle,
  buildBundle,
  bundleAttachment,
  bundlePayloadOf,
  BUNDLE_TYPE,
} from '../../src/utils/selectedBundle'

const msg = (id, extra = {}) => ({
  message_id: id,
  type: 'echomail',
  sender_address: ':0:7',
  timestamp: 1700000000,
  echo_name: 'Newcomers',
  echo_id: 4,
  jws: `jws-${id}`,
  data: JSON.stringify({ subject: `Subject ${id}`, body: 'x'.repeat(50) }),
  _versions: [{ data: 'history' }],
  _edited: true,
  ...extra,
})

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function jwsWithPayload(payload) {
  const b64 = utf8Base64(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `header.${b64}.sig`
}

describe('selected message bundle (#306)', () => {
  it('keeps the full message with jws but drops the expanded data and client fields', () => {
    const out = messageForBundle(msg('m1'))
    expect(out).toMatchObject({
      message_id: 'm1',
      type: 'echomail',
      sender_address: ':0:7',
      timestamp: 1700000000,
      echo_name: 'Newcomers',
      echo_id: 4,
      jws: 'jws-m1',
    })
    expect(out.data).toBeUndefined()
    expect(out._versions).toBeUndefined()
    expect(out._edited).toBeUndefined()
  })

  it('builds a typed bundle', () => {
    const bundle = buildBundle([msg('m1')], { now: 42 })
    expect(bundle).toEqual({
      type: BUNDLE_TYPE,
      version: 1,
      generated_at: 42,
      messages: [expect.objectContaining({ message_id: 'm1' })],
    })
  })

  it('builds a JSON attachment named after the first message id', () => {
    const bundle = buildBundle([msg('m1')], { now: 1 })
    const single = bundleAttachment(bundle, 0, 1)
    expect(single.name).toBe('m1.json')
    expect(single.type).toBe('application/json')
    expect(single.data.startsWith('data:application/json;base64,')).toBe(true)
    // The payload round-trips (UTF-8 safe)
    const json = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(single.data.split(',')[1]), c => c.charCodeAt(0))
    ))
    expect(json.type).toBe(BUNDLE_TYPE)

    const chunked = bundleAttachment(bundle, 1, 3)
    expect(chunked.name).toBe('m1-2.json')
  })

  it('sanitizes message ids for the file name and falls back when there is none', () => {
    const scoped = buildBundle([msg('merge_:0:0_:_1414535735_1')], { now: 1 })
    expect(bundleAttachment(scoped, 0, 1).name).toBe('merge__0_0___1414535735_1.json')
    const anonymous = buildBundle([{ type: 'echomail', sender_address: ':0:7' }], { now: 1 })
    expect(bundleAttachment(anonymous, 0, 1).name).toBe('selected-messages.json')
  })

  it('keeps plain data for messages without a JWS (blog posts)', () => {
    const blogPost = {
      message_id: 'blog_1_ab',
      type: 'echomail',
      sender_address: '',
      timestamp: 1700000000,
      echo_name: 'My blog',
      data: JSON.stringify({ subject: 'Post', body: 'text', attachments: [] }),
    }
    const out = messageForBundle(blogPost)
    expect(out.jws).toBeUndefined()
    expect(out.data).toContain('"Post"')
  })
})

describe('bundlePayloadOf (#306)', () => {
  it('prefers plain data over the JWS payload', () => {
    const entry = { data: JSON.stringify({ subject: 'From data' }), jws: jwsWithPayload({ subject: 'From jws' }) }
    expect(bundlePayloadOf(entry).subject).toBe('From data')
  })

  it('falls back to the JWS payload of a wire entry', () => {
    const entry = { jws: jwsWithPayload({ subject: 'From jws', body: 'x' }) }
    expect(bundlePayloadOf(entry).subject).toBe('From jws')
  })

  it('returns an empty object for broken or missing entries', () => {
    expect(bundlePayloadOf(null)).toEqual({})
    expect(bundlePayloadOf({ data: 'not json', jws: 'broken' })).toEqual({})
  })
})
