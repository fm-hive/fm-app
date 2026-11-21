import { describe, it, expect, beforeEach } from 'vitest'
import {
  ECHO_GROUPS_KEY,
  emptyEchoGroups,
  loadEchoGroups,
  saveEchoGroups,
  assignEchoesToGroup,
  removeEchoGroup,
  renameEchoInGroups,
} from '../../src/utils/echoGroups'

describe('echo groups (#366)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('moves selected echoes between groups and removes them from the previous one', () => {
    const groups = [
      { id: 'g1', name: 'One', echoes: ['A', 'B'] },
      { id: 'g2', name: 'Two', echoes: ['C'] },
    ]

    const next = assignEchoesToGroup(groups, ['B', 'C'], 'g2')

    expect(next.find(g => g.id === 'g1').echoes).toEqual(['A'])
    expect(next.find(g => g.id === 'g2').echoes).toEqual(['B', 'C'])
  })

  it('moves selected echoes out of all groups when the target is empty', () => {
    const groups = [
      { id: 'g1', name: 'One', echoes: ['A', 'B'] },
    ]

    const next = assignEchoesToGroup(groups, ['A'], null)

    expect(next.find(g => g.id === 'g1').echoes).toEqual(['B'])
  })

  it('renames an echo inside all groups and deduplicates', () => {
    const groups = [
      { id: 'g1', name: 'One', echoes: ['Old', 'Other', 'Old'] },
      { id: 'g2', name: 'Two', echoes: ['Old'] },
    ]

    const next = renameEchoInGroups(groups, 'Old', 'New')

    expect(next[0].echoes).toEqual(['New', 'Other'])
    expect(next[1].echoes).toEqual(['New'])
  })

  it('persists groups and expanded state', () => {
    const state = emptyEchoGroups()
    state.groups = [{ id: 'g1', name: 'One', echoes: ['A'] }]
    state.expanded.g1 = false
    saveEchoGroups(state)

    expect(JSON.parse(localStorage.getItem(ECHO_GROUPS_KEY))).toMatchObject({
      groups: [{ id: 'g1', name: 'One', echoes: ['A'] }],
      expanded: { g1: false },
    })
    expect(loadEchoGroups().groups).toEqual([{ id: 'g1', name: 'One', echoes: ['A'] }])
    expect(loadEchoGroups().expanded.g1).toBe(false)
  })

  it('removes a group without touching its conferences', () => {
    const groups = [
      { id: 'g1', name: 'One', echoes: ['A', 'B'] },
      { id: 'g2', name: 'Two', echoes: ['C'] },
    ]

    const next = removeEchoGroup(groups, 'g1')

    expect(next).toEqual([{ id: 'g2', name: 'Two', echoes: ['C'] }])
    // The input is not mutated; the now-ungrouped conferences still exist in
    // the echo list and show up under "Ungrouped".
    expect(groups).toHaveLength(2)
  })

  it('returns empty defaults for invalid stored data', () => {
    localStorage.setItem(ECHO_GROUPS_KEY, '{bad json')
    expect(loadEchoGroups()).toEqual(emptyEchoGroups())
  })
})
