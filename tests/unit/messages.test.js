import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { senderNameFromData, isReactionMessage, taglineFromData, tearlineFromData } from '../../src/utils/messages'

describe('senderNameFromData (#288)', () => {
  it('reads sender_name from a JSON string payload', () => {
    expect(senderNameFromData({ data: JSON.stringify({ sender_name: 'User A' }) })).toBe('User A')
  })

  it('reads sender_name from an already parsed payload', () => {
    expect(senderNameFromData({ data: { sender_name: 'User B' } })).toBe('User B')
  })

  it('returns an empty string when there is no name or no payload', () => {
    expect(senderNameFromData({ data: JSON.stringify({ subject: 'x' }) })).toBe('')
    expect(senderNameFromData({ data: { sender_name: 42 } })).toBe('')
    expect(senderNameFromData({})).toBe('')
    expect(senderNameFromData(null)).toBe('')
  })

  it('survives invalid JSON', () => {
    expect(senderNameFromData({ data: '{not json' })).toBe('')
  })
})

// Guards against the #288 class of bug: a template calling a helper that is not
// defined/imported in that SFC (it compiles fine but throws at render time).
const SHARED_TEMPLATE_HELPERS = ['senderNameFromData']

function collectVueFiles(dir = 'src', out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      collectVueFiles(path, out)
    } else if (entry.endsWith('.vue')) {
      out.push(path)
    }
  }
  return out
}

describe('shared template helpers (#288)', () => {
  it('are imported or declared in every component that calls them', () => {
    const missing = []
    for (const file of collectVueFiles()) {
      const text = readFileSync(file, 'utf-8')
      const template = text.match(/<template>([\s\S]*)<\/template>/)?.[1] || ''
      const script = text.match(/<script[^>]*>([\s\S]*)<\/script>/)?.[1] || ''
      for (const name of SHARED_TEMPLATE_HELPERS) {
        if (!new RegExp(`(?<![\\w.$])${name}\\s*\\(`).test(template)) continue
        const imported = new RegExp(`\\bimport\\b[^;\\n]*\\b${name}\\b`).test(script)
        const declared = new RegExp(`\\b(function|const|let|var)\\s+${name}\\b`).test(script)
        if (!imported && !declared) missing.push(`${file}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('isReactionMessage (#297)', () => {
  const m = (data, type = 'echomail') => ({ type, data: JSON.stringify(data) })

  it('detects reactions and retractions', () => {
    expect(isReactionMessage(m({ reaction: '👍', reactionMessageId: 'x' }))).toBe(true)
    // A retraction carries an empty reaction string: still a reaction message.
    expect(isReactionMessage(m({ reaction: '', reactionMessageId: 'x' }))).toBe(true)
    expect(isReactionMessage({ type: 'reaction', data: '{}' })).toBe(true)
  })

  it('ignores plain messages and other protocols', () => {
    expect(isReactionMessage(m({ subject: 'hi', body: 'text' }))).toBe(false)
    expect(isReactionMessage(m({ updateMessageId: 'x', body: 'edit' }))).toBe(false)
    expect(isReactionMessage(m({ reaction: '👍' }, 'vote'))).toBe(false)
    expect(isReactionMessage(null)).toBe(false)
    expect(isReactionMessage({ type: 'echomail', data: 'not json' })).toBe(false)
  })
})

describe('taglineFromData (#300)', () => {
  it('reads the tagline from a JSON string payload', () => {
    expect(taglineFromData({ data: JSON.stringify({ body: 'x', tagline: '— Ivan' }) })).toBe('— Ivan')
  })

  it('reads the tagline from an already parsed payload', () => {
    expect(taglineFromData({ data: { tagline: '— Ivan' } })).toBe('— Ivan')
  })

  it('returns an empty string when there is no tagline', () => {
    expect(taglineFromData({ data: JSON.stringify({ body: 'x' }) })).toBe('')
    expect(taglineFromData({ data: { tagline: 42 } })).toBe('')
    expect(taglineFromData({})).toBe('')
    expect(taglineFromData(null)).toBe('')
  })
})

describe('tearlineFromData (#311)', () => {
  it('reads the tearline from a payload', () => {
    expect(tearlineFromData({ data: JSON.stringify({ tearline: 'fm-app v1.2.3 :0:1' }) })).toBe('fm-app v1.2.3 :0:1')
    expect(tearlineFromData({ data: { tearline: 'x' } })).toBe('x')
  })

  it('returns an empty string without a tearline', () => {
    expect(tearlineFromData({ data: JSON.stringify({ body: 'x' }) })).toBe('')
    expect(tearlineFromData({ data: { tearline: 42 } })).toBe('')
    expect(tearlineFromData(null)).toBe('')
  })
})
