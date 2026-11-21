import { describe, it, expect } from 'vitest'
import { initialsFromName, formatFidoQuote, parseFidoQuote, addressToShortId, scopeAttachmentRefs } from '../../src/utils/quote'

describe('initialsFromName', () => {
  it('takes first letters of first two words', () => {
    expect(initialsFromName('Павел Романов')).toBe('ПР')
    expect(initialsFromName('Александр Григорьевич')).toBe('АГ')
    expect(initialsFromName('Jane Doe')).toBe('JD')
  })
  it('single word yields first letter', () => {
    expect(initialsFromName('Pavel')).toBe('P')
  })
  it('empty name yields empty string', () => {
    expect(initialsFromName('')).toBe('')
    expect(initialsFromName('   ')).toBe('')
  })
})

describe('formatFidoQuote', () => {
  it('prefixes every quoted line with the author initials', () => {
    const out = formatFidoQuote('Павел Романов', 'первая строка\nвторая строка')
    expect(out).toBe('ПР> первая строка\nПР> вторая строка')
  })
  it('falls back to address short id when given an address', () => {
    const out = formatFidoQuote(':0:1', 'hi')
    expect(out).toBe(`${addressToShortId(':0:1')}> hi`)
  })
  it('handles empty body', () => {
    expect(formatFidoQuote('Павел Романов', '')).toBe('')
  })
})

describe('parseFidoQuote', () => {
  it('parses "XX> text" quotes', () => {
    const q = parseFidoQuote('ПР> первая\nПР> вторая\nсвоё сообщение')
    expect(q.senderId).toBe('ПР')
    expect(q.originalText).toBe('первая\nвторая')
  })
  it('returns null for non-quotes', () => {
    expect(parseFidoQuote('обычный текст')).toBeNull()
  })
})

describe('scopeAttachmentRefs (#268)', () => {
  it('scopes plain attachment refs to the quoted message', () => {
    const out = scopeAttachmentRefs('see ![img.png](attachment:0) and [f.pdf](attachment:2)', 'MSG_1')
    expect(out).toBe('see ![img.png](attachment:MSG_1:0) and [f.pdf](attachment:MSG_1:2)')
  })
  it('leaves already scoped refs (nested quotes) untouched', () => {
    const text = 'AB> ![old.png](attachment:ORIG:1) and ![mine](attachment:0)'
    const out = scopeAttachmentRefs(text, 'MSG_2')
    expect(out).toBe('AB> ![old.png](attachment:ORIG:1) and ![mine](attachment:MSG_2:0)')
  })
  it('returns the text unchanged without a message id', () => {
    expect(scopeAttachmentRefs('![a](attachment:0)', '')).toBe('![a](attachment:0)')
    expect(scopeAttachmentRefs('', 'MSG')).toBe('')
    expect(scopeAttachmentRefs(null, 'MSG')).toBe(null)
  })
})
