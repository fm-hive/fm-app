import { describe, it, expect } from 'vitest'
import { exportFileName, sanitizeFilePart, addressFilePart } from '../../src/utils/exportName.js'

describe('export file name', () => {
  const date = new Date('2026-09-16T12:00:00Z')

  it('includes the client name and address with dashes instead of colons', () => {
    expect(exportFileName('fm-full-export', { name: 'Admin One', address: ':0:1' }, date))
      .toBe('fm-full-export-Admin-One-0-1-2026-09-16.json')
  })

  it('keeps a deep address', () => {
    expect(addressFilePart(':0:1:2')).toBe('0-1-2')
  })

  it('skips an empty name and address', () => {
    expect(exportFileName('fm-keys', {}, date)).toBe('fm-keys-2026-09-16.json')
    expect(exportFileName('fm-keys', { name: '', address: '' }, date)).toBe('fm-keys-2026-09-16.json')
  })

  it('sanitizes unsafe characters', () => {
    expect(exportFileName('fm-full-export', { name: 'a/b:c d', address: ':0:1' }, date))
      .toBe('fm-full-export-a-b-c-d-0-1-2026-09-16.json')
  })

  it('sanitizeFilePart trims and collapses dashes', () => {
    expect(sanitizeFilePart('  --Hello   world--  ')).toBe('Hello-world')
    expect(sanitizeFilePart('')).toBe('')
    expect(sanitizeFilePart(null)).toBe('')
  })
})
