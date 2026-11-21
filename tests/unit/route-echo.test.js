import { describe, it, expect } from 'vitest'
import { resolveQueryEcho } from '../../src/utils/routeEcho'

const echoes = [{ id: 4, name: 'Newcomers' }, { id: 1, name: 'Admin council' }]
const blogs = [{ name: 'My blog' }]

describe('resolveQueryEcho (#312)', () => {
  it('resolves an echo by name', () => {
    expect(resolveQueryEcho('Newcomers', echoes, blogs)).toEqual({ kind: 'echo', name: 'Newcomers' })
  })

  it('resolves a local blog by name', () => {
    expect(resolveQueryEcho('My blog', echoes, blogs)).toEqual({ kind: 'blog', name: 'My blog' })
  })

  it('returns null for unknown, empty or non-string values', () => {
    expect(resolveQueryEcho('nope', echoes, blogs)).toBeNull()
    expect(resolveQueryEcho('', echoes, blogs)).toBeNull()
    expect(resolveQueryEcho(undefined, echoes, blogs)).toBeNull()
    expect(resolveQueryEcho(['a'], echoes, blogs)).toBeNull()
    expect(resolveQueryEcho('Newcomers', null, null)).toBeNull()
  })
})
