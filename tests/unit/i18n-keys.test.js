import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from '../../src/i18n/locales/en.json'
import ru from '../../src/i18n/locales/ru.json'

/** Collect every static t('...') key used in src/. */
function collectUsedKeys(dir = 'src', out = new Set()) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      collectUsedKeys(path, out)
      continue
    }
    if (!/\.(vue|js)$/.test(entry)) continue
    const text = readFileSync(path, 'utf-8')
    const re = /(?<![a-zA-Z0-9_$])t\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g
    let m
    while ((m = re.exec(text)) !== null) {
      out.add(m[1])
    }
  }
  return out
}

function hasKey(dict, key) {
  let cur = dict
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return false
    cur = cur[part]
  }
  return true
}

describe('i18n keys (#278)', () => {
  it('every t() key used in src exists in en and ru', () => {
    const missing = []
    for (const key of collectUsedKeys()) {
      if (key.endsWith('.')) continue // dynamic key prefix (e.g. t('rateLimit.kinds.' + kind))
      if (!hasKey(en, key)) missing.push('en: ' + key)
      if (!hasKey(ru, key)) missing.push('ru: ' + key)
    }
    expect(missing).toEqual([])
  })
})
