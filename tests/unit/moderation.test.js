import { describe, it, expect } from 'vitest'
import { moderationSeverity, moderationBorderClass, moderationStripeClass, moderationOriginalMessage } from '../../src/services/moderation'

describe('moderation highlight helpers', () => {
  it('detects warning and punishment severities only', () => {
    expect(moderationSeverity({ severity: 'warning' })).toBe('warning')
    expect(moderationSeverity({ severity: 'punishment' })).toBe('punishment')
    expect(moderationSeverity({ severity: 'none' })).toBe(null)
    expect(moderationSeverity({})).toBe(null)
    expect(moderationSeverity(null)).toBe(null)
  })

  it('returns a yellow outline for warnings and red for punishments', () => {
    expect(moderationBorderClass({ severity: 'warning' })).toContain('border-yellow-500')
    expect(moderationBorderClass({ severity: 'punishment' })).toContain('border-red-500')
    expect(moderationBorderClass({ severity: 'none' })).toBe('')
    expect(moderationBorderClass({})).toBe('')
  })

  it('returns a colored left stripe for compact tree rows', () => {
    expect(moderationStripeClass({ severity: 'warning' })).toBe('border-l-4 border-l-yellow-500')
    expect(moderationStripeClass({ severity: 'punishment' })).toBe('border-l-4 border-l-red-500')
    expect(moderationStripeClass({})).toBe('')
  })
})

describe('moderationOriginalMessage', () => {
  it('extracts from/date/subject/body from a nested message with string data', () => {
    const data = {
      severity: 'warning',
      originalMessage: {
        sender_address: ':0:6',
        timestamp: 1786312001,
        message_id: 'orig_1',
        data: JSON.stringify({ subject: 'Hello', body: 'Body text', sender_name: 'Alice' }),
      },
    }
    expect(moderationOriginalMessage(data)).toEqual({
      from: ':0:6',
      fromName: 'Alice',
      date: 1786312001,
      subject: 'Hello',
      body: 'Body text',
    })
  })

  it('accepts object data and falls back to message for the body', () => {
    const data = {
      originalMessage: {
        sender_address: ':0:2',
        data: { message: 'protocol text' },
      },
    }
    const out = moderationOriginalMessage(data)
    expect(out.from).toBe(':0:2')
    expect(out.body).toBe('protocol text')
    expect(out.subject).toBe('')
  })

  it('returns null when there is no original message', () => {
    expect(moderationOriginalMessage({ severity: 'warning' })).toBe(null)
    expect(moderationOriginalMessage({ originalMessage: null })).toBe(null)
    expect(moderationOriginalMessage(null)).toBe(null)
  })
})
