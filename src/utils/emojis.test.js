import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CUSTOM_EMOJIS,
  isDefaultEmojis,
  settingsWithoutDefaultEmojis,
} from './emojis'

describe('emoji export helpers', () => {
  it('recognizes the default list', () => {
    expect(isDefaultEmojis([...DEFAULT_CUSTOM_EMOJIS])).toBe(true)
    expect(isDefaultEmojis(undefined)).toBe(true)
  })

  it('detects changed lists', () => {
    expect(isDefaultEmojis(['👍'])).toBe(false)
    expect(isDefaultEmojis([...DEFAULT_CUSTOM_EMOJIS, '🦄'])).toBe(false)
  })

  it('removes unchanged emojis from exported settings', () => {
    const data = {
      ui: { fontSize: 'medium', customEmojis: [...DEFAULT_CUSTOM_EMOJIS] },
      privacy: { autoRequestPubkeys: true },
    }
    const exported = settingsWithoutDefaultEmojis(data)
    expect(exported.ui).toEqual({ fontSize: 'medium' })
    expect(data.ui.customEmojis).toHaveLength(DEFAULT_CUSTOM_EMOJIS.length)
  })

  it('keeps changed emojis in exported settings', () => {
    const data = { ui: { customEmojis: ['🦄'] } }
    expect(settingsWithoutDefaultEmojis(data).ui.customEmojis).toEqual(['🦄'])
  })
})
