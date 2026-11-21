// Moderator warn/punishment messages carry data.severity ('warning' | 'punishment').
// These helpers keep the highlight styling in one place for the message list and
// the single-message detail view.

export function moderationSeverity(data) {
  const s = data?.severity
  return s === 'warning' || s === 'punishment' ? s : null
}

/** Full colored outline (all sides) for a message card */
export function moderationBorderClass(data) {
  const s = moderationSeverity(data)
  if (s === 'warning') return 'border-2 border-yellow-500 dark:border-yellow-400'
  if (s === 'punishment') return 'border-2 border-red-500 dark:border-red-400'
  return ''
}

/** Compact left stripe for one-line tree rows */
export function moderationStripeClass(data) {
  const s = moderationSeverity(data)
  if (s === 'warning') return 'border-l-4 border-l-yellow-500'
  if (s === 'punishment') return 'border-l-4 border-l-red-500'
  return ''
}

/**
 * Extract display fields of the original message a moderation action refers to.
 * The original message is nested as `data.originalMessage`, and its own `data`
 * field is a JSON string (the original message payload). Returns null when there
 * is nothing to show.
 */
export function moderationOriginalMessage(data) {
  const om = data?.originalMessage
  if (!om || typeof om !== 'object') return null

  let inner = {}
  if (typeof om.data === 'string') {
    try { inner = JSON.parse(om.data) } catch { inner = {} }
  } else if (om.data && typeof om.data === 'object') {
    inner = om.data
  }

  const from = om.sender_address || null
  const fromName = inner.sender_name || null
  const date = om.timestamp || inner.timestamp || null
  const subject = inner.subject || ''
  const body = inner.body || inner.message || ''

  if (!from && !date && !subject && !body) return null
  return { from, fromName, date, subject, body }
}
