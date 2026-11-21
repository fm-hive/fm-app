// Network rate limit helpers (issue #175).
//
// The node enforces the policy parameter `rate_limit` (daily limits per message
// kind) and reports the current usage in every send_receive response. The
// outbox uses that usage plus the locally queued entries to block sends that
// would exceed a limit, unless the user allowed sending without the limit.

import { ref } from 'vue'

// kind -> {used, limit} as reported by the node.
const usage = ref({})

/** Store the usage reported in a send_receive response. */
export function setRateLimitUsage(value) {
  if (value && typeof value === 'object') {
    usage.value = value
  }
}

/** Current usage map (kind -> {used, limit}). */
export function rateLimitUsage() {
  return usage.value
}

/** The policy limit for a kind (0 = disabled). */
export function rateLimitFor(kind) {
  const entry = usage.value?.[kind]
  return entry ? Number(entry.limit) || 0 : 0
}

/** Parsed data of an already signed message carried by the entry. */
function signedDataOf(entry) {
  try {
    const msg = entry?.message
    if (!msg) return {}
    if (msg.data) return typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    // The data travels inside the JWS payload (omitted on the wire), so decode
    // it to classify the entry.
    if (typeof msg.jws === 'string' && msg.jws) {
      const parts = msg.jws.split('.')
      if (parts.length === 3) {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        while (b64.length % 4) b64 += '='
        return JSON.parse(atob(b64))
      }
    }
    return {}
  } catch {
    return {}
  }
}

/** Kind of an outbox entry, matching the backend classification. */
export function kindOfEntry(entry) {
  if (!entry) return ''
  if (entry.type === 'netmail') return 'netmail'
  if (entry.isReaction) return 'reaction'
  if (entry.type === 'vote' || entry.type === 'election') {
    const data = signedDataOf(entry)
    // A poster counts only as a poster; results are node-generated.
    if (data.type === 'poster') return 'poster'
    if (data.type === 'result') return ''
    return 'vote'
  }
  // Announcements have their own per-echo limit, not the network rate limit.
  if (entry.type === 'echomail') return 'echomail'
  return ''
}

/**
 * Split entries into those within the limit and those over it. Counts start at
 * the server-reported usage and grow with every entry of the same kind in the
 * batch, so a batch stops at the limit.
 * Returns {allowed: [], exceeded: []}.
 */
export function splitByRateLimit(entries) {
  const counts = {}
  for (const [kind, value] of Object.entries(usage.value || {})) {
    counts[kind] = Number(value?.used) || 0
  }
  const allowed = []
  const exceeded = []
  for (const entry of entries) {
    const kind = kindOfEntry(entry)
    const limit = rateLimitFor(kind)
    if (!kind || limit <= 0) {
      allowed.push(entry)
      continue
    }
    const used = (counts[kind] || 0) + 1
    if (used > limit) {
      exceeded.push(entry)
      continue
    }
    counts[kind] = used
    allowed.push(entry)
  }
  return { allowed, exceeded }
}
