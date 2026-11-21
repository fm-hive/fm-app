import { describe, it, expect } from 'vitest'
import { protocolTypeOf, ribbonKind, ribbonFillClass, PROTOCOL_TYPES } from '../../src/utils/messageKind'

describe('messageKind helpers (#322)', () => {
  it('detects protocol types from the message type and data.proto', () => {
    expect(protocolTypeOf({ type: 'vote' })).toBe('vote')
    expect(protocolTypeOf({ type: 'echomail', data: JSON.stringify({ proto: 'election' }) })).toBe('election')
    expect(protocolTypeOf({ type: 'echomail', data: 'no json' })).toBeNull()
    expect(protocolTypeOf(null)).toBeNull()
    expect(PROTOCOL_TYPES).toContain('change_policy')
  })

  it('classifies moderation severity, announcements, subscribe and error messages', () => {
    expect(ribbonKind({ data: JSON.stringify({ severity: 'warning' }) })).toBe('warning')
    expect(ribbonKind({ data: JSON.stringify({ severity: 'punishment' }) })).toBe('punishment')
    expect(ribbonKind({ type: 'announcement', data: '{}' })).toBe('announcement')
    expect(ribbonKind({ type: 'control', data: JSON.stringify({ type: 'subscribe_notification' }) })).toBe('subscribe')
    expect(ribbonKind({ data: JSON.stringify({ type: 'error' }) })).toBe('error')
    expect(ribbonKind({ type: 'echomail', data: JSON.stringify({ subject: 'x' }) })).toBe('')
  })

  it('fills the tile per message kind (#322)', () => {
    expect(ribbonFillClass({ data: JSON.stringify({ severity: 'warning' }) })).toContain('bg-yellow-300')
    expect(ribbonFillClass({ data: JSON.stringify({ severity: 'punishment' }) })).toContain('bg-red-400')
    expect(ribbonFillClass({ type: 'vote' })).toContain('bg-green-200')
    expect(ribbonFillClass({ type: 'election' })).toContain('bg-blue-200')
    expect(ribbonFillClass({ type: 'echomail', data: JSON.stringify({ subject: 'x' }) })).toBe('')
  })
})
