/**
 * Message tree utilities (tree view of the message feed).
 */

/**
 * Build a flattened parent→children tree from text messages.
 *
 * Messages with `reply_to_message_id` become children of that message. A reply
 * whose parent is not present (parent filtered out of the feed, not loaded yet
 * or a protocol message) is treated as a root, so no chain is ever dropped
 * (issue #272). Cycles (e.g. forged reply_to links) are guarded by a visited
 * set. Children are ordered by timestamp ascending; roots keep the order of the
 * input (the feed is sorted newest-first).
 *
 * @param {Array} messages - Messages with `message_id`, `reply_to_message_id`, `timestamp`
 * @param {Function} [parentOf] - resolves the effective parent id (defaults to
 *   `reply_to_message_id`); used for moderation messages, which nest under the
 *   message they were issued for (#287)
 * @returns {Array<{msg: Object, depth: number}>} Flattened tree
 */
export function buildMessageTree(messages, parentOf = (m) => m.reply_to_message_id) {
  const list = Array.isArray(messages) ? messages : []
  const ids = new Set()
  for (const m of list) {
    if (m && m.message_id) ids.add(m.message_id)
  }

  const children = {}
  const roots = []
  for (const m of list) {
    if (!m) continue
    const parent = parentOf(m)
    if (parent && ids.has(parent)) {
      ;(children[parent] ||= []).push(m)
    } else {
      roots.push(m)
    }
  }

  const flat = []
  const visited = new Set()
  function walk(node, depth) {
    if (!node || visited.has(node.message_id)) return
    visited.add(node.message_id)
    flat.push({ msg: node, depth })
    const kids = (children[node.message_id] || [])
      .slice()
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    for (const kid of kids) walk(kid, depth + 1)
  }

  for (const root of roots) walk(root, 0)
  // Nodes unreachable from any root (e.g. a cycle of forged reply links) must
  // still be shown — walk them as roots.
  for (const m of list) {
    if (m && !visited.has(m.message_id)) walk(m, 0)
  }
  return flat
}
