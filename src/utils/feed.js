/**
 * Feed helpers: author colors and conversation grouping for the flat feed
 * (issues #283, #287).
 */

// Narrow left stripe per author. Literal class strings so Tailwind keeps them.
// The dark: variants are needed because the card's dark:border-gray-700 would
// otherwise win over the stripe color in dark mode.
const AUTHOR_BORDER_CLASSES = [
  'border-l-2 border-l-sky-400 dark:border-l-sky-400',
  'border-l-2 border-l-emerald-400 dark:border-l-emerald-400',
  'border-l-2 border-l-amber-400 dark:border-l-amber-400',
  'border-l-2 border-l-rose-400 dark:border-l-rose-400',
  'border-l-2 border-l-violet-400 dark:border-l-violet-400',
  'border-l-2 border-l-teal-400 dark:border-l-teal-400',
  'border-l-2 border-l-orange-400 dark:border-l-orange-400',
  'border-l-2 border-l-indigo-400 dark:border-l-indigo-400',
]

/** Deterministic stripe color for an address (same address → same color). */
export function authorBorderClass(address) {
  const s = String(address || '')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return AUTHOR_BORDER_CLASSES[h % AUTHOR_BORDER_CLASSES.length]
}

/** Normalize a subject for grouping (drop Re:/Fwd: prefixes), like the threads view. */
export function normalizeSubject(subject) {
  return String(subject || '')
    .replace(/^(Re:\s*|re:\s*|RE:\s*|Re\s+|re\s+|RE\s+|Re|re|RE)/, '')
    .replace(/^(Fwd:\s*|fwd:\s*|FWD:\s*|Fw:\s*|fw:\s*)/i, '')
    .trim()
}

function parseData(msg) {
  if (!msg || !msg.data) return null
  try {
    return typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
  } catch {
    return null
  }
}

function subjectOf(msg) {
  return normalizeSubject(parseData(msg)?.subject || '')
}

/**
 * Subject of the message a moderation action refers to (data.originalMessage,
 * whose own data is usually a JSON string). Moderation messages carry no
 * subject of their own (#287).
 */
function originalSubjectOf(msg) {
  const om = parseData(msg)?.originalMessage
  if (!om || typeof om !== 'object') return ''
  let inner = om.data
  if (typeof inner === 'string') {
    try { inner = JSON.parse(inner) } catch { inner = null }
  }
  if (!inner || typeof inner !== 'object') inner = om
  return normalizeSubject(inner.subject || '')
}

/** Subject used for grouping when the parent message is not loaded. */
function fallbackSubject(msg) {
  return subjectOf(msg) || originalSubjectOf(msg)
}

/**
 * Message id a moderation action points at (data.originalMessage.message_id).
 * Moderation messages (severity warning/punishment) carry no subject; they
 * belong to the conversation of the message they were issued for (#287).
 */
export function moderationTargetId(msg) {
  const d = parseData(msg)
  if (!d || (d.severity !== 'warning' && d.severity !== 'punishment')) return ''
  const om = d.originalMessage
  return om && typeof om === 'object' && typeof om.message_id === 'string' ? om.message_id : ''
}

/**
 * Parent used for threading: the explicit reply target or, for moderation
 * messages, the message the action was issued for (#287).
 */
export function effectiveParentId(msg) {
  return msg?.reply_to_message_id || moderationTargetId(msg)
}

/**
 * Conversation key of a message: the root of its reply chain. When the chain
 * ends at a message whose parent is not loaded, the normalized subject is used
 * instead, so replies to a missing parent still group together.
 * @param {object} msg - message with message_id/reply_to_message_id
 * @param {Map<string, object>} byId - message_id → message
 */
export function conversationKey(msg, byId) {
  if (!msg) return ''
  let cur = msg
  const seen = new Set()
  while (cur) {
    const parentId = effectiveParentId(cur)
    if (!parentId || seen.has(cur.message_id)) break
    seen.add(cur.message_id)
    const parent = byId instanceof Map ? byId.get(parentId) : null
    if (!parent) {
      // Parent missing (not loaded): group by subject.
      return 'subject:' + fallbackSubject(msg)
    }
    cur = parent
  }
  return cur && cur.message_id ? cur.message_id : 'subject:' + fallbackSubject(msg)
}

/**
 * Reply depth inside the conversation (0 = root), capped. A missing parent
 * stops the walk.
 */
export function conversationDepth(msg, byId, max = 3) {
  if (!msg) return 0
  let depth = 0
  let cur = msg
  const seen = new Set()
  while (cur && depth < max && !seen.has(cur.message_id)) {
    const parentId = effectiveParentId(cur)
    if (!parentId) break
    seen.add(cur.message_id)
    const parent = byId instanceof Map ? byId.get(parentId) : null
    if (!parent) break
    depth++
    cur = parent
  }
  return depth
}

/**
 * Visible nodes of a flattened thread tree: children of collapsed nodes are
 * hidden (the tree is DFS-ordered, so all descendants follow their parent).
 * @param {Array<{msg, depth}>} items - buildMessageTree output
 * @param {Map<string, number>} childrenCount - direct reply count per message id
 * @param {Set<string>} expandedIds - nodes whose replies are shown
 */
export function visibleThreadItems(items, childrenCount, expandedIds) {
  const out = []
  let hideBelow = Infinity
  for (const item of items) {
    if (item.depth > hideBelow) continue
    hideBelow = Infinity
    out.push(item)
    if (childrenCount.get(item.msg.message_id) && !expandedIds.has(item.msg.message_id)) {
      hideBelow = item.depth
    }
  }
  return out
}

/** Index messages by message_id (for reply-chain lookups). */
export function buildMessageIndex(messages) {
  const list = Array.isArray(messages) ? messages : []
  return new Map(list.filter(m => m && m.message_id).map(m => [m.message_id, m]))
}

/**
 * Ancestor chain of a message inside the conversation (root first, the message
 * itself excluded). Stops at a missing parent or a cycle.
 * @param {object} msg - message with message_id/reply_to_message_id
 * @param {Map<string, object>} byId - message_id → message
 * @returns {string[]} ancestor message ids, root first
 */
export function ancestorChain(msg, byId) {
  const chain = []
  if (!msg) return chain
  let cur = msg
  const seen = new Set([msg.message_id])
  while (cur) {
    const parentId = effectiveParentId(cur)
    if (!parentId) break
    const parent = byId instanceof Map ? byId.get(parentId) : null
    if (!parent || seen.has(parent.message_id)) break
    seen.add(parent.message_id)
    chain.unshift(parent.message_id)
    cur = parent
  }
  return chain
}

/**
 * Messages belonging to the conversation identified by `key` (#285).
 * @param {string} key - conversationKey of the conversation
 * @param {Array} messages - candidate messages
 * @param {Map<string, object>} [byId] - message index (built when omitted)
 */
export function conversationMessages(key, messages, byId) {
  const list = Array.isArray(messages) ? messages : []
  const index = byId instanceof Map ? byId : buildMessageIndex(list)
  return list.filter(m => conversationKey(m, index) === key)
}

/**
 * Subject of the conversation a message belongs to: the first non-empty subject
 * along the chain from the root (own subject or the subject of the moderated
 * message, #287). Empty for conversations without any subject — such messages
 * are not shown or opened as threads.
 * @param {object} msg - message
 * @param {Map<string, object>} byId - message index
 * @returns {string} normalized subject or ''
 */
export function conversationSubject(msg, byId) {
  if (!msg) return ''
  const chain = []
  let cur = msg
  const seen = new Set()
  while (cur && !seen.has(cur.message_id)) {
    seen.add(cur.message_id)
    chain.unshift(cur)
    const parentId = effectiveParentId(cur)
    if (!parentId) break
    const parent = byId instanceof Map ? byId.get(parentId) : null
    if (!parent) break
    cur = parent
  }
  for (const m of chain) {
    const s = subjectOf(m) || originalSubjectOf(m)
    if (s) return s
  }
  return ''
}

/** Whether the message's conversation has a subject (can be a thread, #287). */
export function isThreadable(msg, byId) {
  return !!conversationSubject(msg, byId)
}

/**
 * Group messages into threads by their conversation subject (#287). Messages
 * without a subject are skipped — they are not threads.
 * @param {Array} messages - candidate messages
 * @param {Map<string, object>} [byId] - message index (built when omitted)
 * @returns {Array<{subject: string, messages: Array}>} newest group first
 */
export function groupByConversationSubject(messages, byId) {
  const list = Array.isArray(messages) ? messages : []
  const index = byId instanceof Map ? byId : buildMessageIndex(list)
  const groups = new Map()
  for (const m of list) {
    const subject = conversationSubject(m, index)
    if (!subject) continue
    if (!groups.has(subject)) groups.set(subject, [])
    groups.get(subject).push(m)
  }
  const out = Array.from(groups, ([subject, msgs]) => ({ subject, messages: msgs }))
  const lastTs = (g) => g.messages[g.messages.length - 1]?.timestamp || 0
  out.sort((a, b) => lastTs(b) - lastTs(a))
  return out
}

/**
 * Build the display list for the flat feed: keeps the incoming order and
 * returns shallow copies of the messages with a `_feed` grouping descriptor
 * (so the template can keep using `message.xxx`).
 * @param {Array} messages - displayed messages (already sorted)
 * @param {Map<string, object>} [byId] - full message index (defaults to the passed list)
 * @param {object} [options]
 * @param {boolean} [options.groupThreads=true] - false turns conversation
 *   separators and reply-chain indentation off (the "Нити" toggle, #287);
 *   author grouping and stripes are kept either way.
 * @returns {Array} messages with `_feed: {key, depth, startsConversation, hasThread, showAuthor, conversationSubject, authorClass}`
 */
export function buildFeedItems(messages, byId, options = {}) {
  const list = Array.isArray(messages) ? messages : []
  if (!(byId instanceof Map)) byId = buildMessageIndex(list)
  const groupThreads = options.groupThreads !== false
  const subjectCache = new Map()
  const out = []
  let lastKey = null
  let lastAuthor = null
  for (const msg of list) {
    const key = conversationKey(msg, byId)
    let conversationSubjectText = subjectCache.get(key)
    if (conversationSubjectText === undefined) {
      conversationSubjectText = conversationSubject(msg, byId)
      subjectCache.set(key, conversationSubjectText)
    }
    const startsConversation = groupThreads && key !== lastKey
    const showAuthor = startsConversation || msg.sender_address !== lastAuthor
    out.push({
      ...msg,
      _feed: {
        key,
        depth: groupThreads ? conversationDepth(msg, byId) : 0,
        startsConversation,
        hasThread: !!conversationSubjectText,
        showAuthor,
        conversationSubject: startsConversation ? conversationSubjectText : '',
        authorClass: authorBorderClass(msg.sender_address),
      },
    })
    lastKey = key
    lastAuthor = msg.sender_address
  }
  return out
}
