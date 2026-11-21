import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNamesStore } from '../../src/stores/names'

describe('names store (address → sender names)', () => {
  let names

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    names = useNamesStore()
  })

  it('records a name for an address and exposes it', () => {
    names.record(':0:8', 'Ivan Ivanov')
    expect(names.namesFor(':0:8')).toEqual(['Ivan Ivanov'])
    expect(names.currentName(':0:8')).toBe('Ivan Ivanov')
    expect(names.alternates(':0:8')).toEqual([])
    expect(names.count).toBe(1)
  })

  it('keeps the most recent name first and dedupes', () => {
    names.record(':0:8', 'Ivan Ivanov')
    names.record(':0:8', 'Petr Petrov')
    names.record(':0:8', 'Ivan Ivanov') // повтор — должен стать самым свежим
    expect(names.namesFor(':0:8')).toEqual(['Ivan Ivanov', 'Petr Petrov'])
    expect(names.currentName(':0:8')).toBe('Ivan Ivanov')
    expect(names.alternates(':0:8')).toEqual(['Petr Petrov'])
  })

  it('ignores empty/whitespace/address-as-name', () => {
    names.record('', 'X')
    names.record(':0:8', '  ')
    names.record(':0:8', ':0:8')
    expect(names.count).toBe(0)
  })

  it('persists across store instances', () => {
    names.record(':0:8', 'Ivan Ivanov')
    const second = useNamesStore()
    expect(second.currentName(':0:8')).toBe('Ivan Ivanov')
  })

  it('renameAddress moves names to the new address (merge)', () => {
    names.record(':0:8', 'Ivan Ivanov')
    names.record(':0:8', 'Petr Petrov')
    names.record(':0:9', 'Sasha')

    names.renameAddress(':0:8', ':0:9')
    expect(names.namesFor(':0:8')).toEqual([])
    // старые имена (самое свежее первым: Petr, Ivan) переехали к :0:9
    expect(names.currentName(':0:9')).toBe('Petr Petrov')
    expect(names.namesFor(':0:9')).toEqual(['Petr Petrov', 'Ivan Ivanov', 'Sasha'])
  })

  it('clear removes everything', () => {
    names.record(':0:8', 'Ivan')
    names.clear()
    expect(names.count).toBe(0)
    expect(names.namesFor(':0:8')).toEqual([])
  })
})
