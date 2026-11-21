import { describe, it, expect } from 'vitest'
import { buildMessageTree } from '../../src/utils/tree'

const m = (id, replyTo, ts) => ({ message_id: id, reply_to_message_id: replyTo, timestamp: ts })

function ids(flat) {
  return flat.map(n => n.msg.message_id)
}

function depths(flat) {
  return Object.fromEntries(flat.map(n => [n.msg.message_id, n.depth]))
}

describe('buildMessageTree (#272)', () => {
  it('builds parent→children chains', () => {
    const flat = buildMessageTree([m('a', null, 1), m('b', 'a', 2), m('c', 'b', 3)])
    expect(ids(flat)).toEqual(['a', 'b', 'c'])
    expect(depths(flat)).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('keeps replies whose parent is not in the feed as roots', () => {
    const flat = buildMessageTree([m('a', null, 1), m('orphan', 'missing', 2), m('child', 'orphan', 3)])
    expect(ids(flat)).toEqual(['a', 'orphan', 'child'])
    expect(depths(flat)).toEqual({ a: 0, orphan: 0, child: 1 })
  })

  it('shows every message exactly once', () => {
    const msgs = [m('a', null, 1), m('b', 'a', 2), m('c', 'x', 3), m('d', 'b', 4), m('e', null, 5)]
    const flat = buildMessageTree(msgs)
    expect(flat).toHaveLength(msgs.length)
    expect(new Set(ids(flat)).size).toBe(msgs.length)
  })

  it('orders children by timestamp ascending', () => {
    const flat = buildMessageTree([m('root', null, 1), m('late', 'root', 5), m('early', 'root', 3)])
    expect(ids(flat)).toEqual(['root', 'early', 'late'])
  })

  it('does not loop on cycles', () => {
    const flat = buildMessageTree([m('a', 'b', 1), m('b', 'a', 2)])
    expect(flat).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(buildMessageTree([])).toEqual([])
    expect(buildMessageTree(null)).toEqual([])
  })
})
