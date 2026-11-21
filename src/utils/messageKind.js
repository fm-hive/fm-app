/**
 * Message kind helpers shared by the message list and the reader ribbon (#322):
 * protocol type detection and the ribbon tile fill per message type.
 */
import { moderationSeverity } from '../services/moderation'

/** Message types treated as protocol traffic. */
export const PROTOCOL_TYPES = ['vote', 'election', 'merge', 'conflict', 'recover', 'refill', 'change_policy', 'remove_echo', 'excommunicate', 'appeal']

/** Protocol type of a message: its `type` field or `data.proto`. */
export function protocolTypeOf(message) {
  if (!message) return null
  if (PROTOCOL_TYPES.includes(message.type)) return message.type
  try {
    const d = JSON.parse(message.data)
    if (d.proto) return d.proto
  } catch { /* не JSON — не протокол */ }
  return null
}

/** Parsed data of a message (never throws). */
export function messageDataOf(message) {
  if (!message) return {}
  if (typeof message.data === 'object' && message.data !== null) return message.data
  try {
    return JSON.parse(message.data || '{}')
  } catch {
    return {}
  }
}

/** Short kind label of a message (for tooltips/tests). */
export function ribbonKind(message) {
  if (!message) return ''
  const data = messageDataOf(message)
  const severity = moderationSeverity(data)
  if (severity) return severity
  if (message.type === 'announcement') return 'announcement'
  if (message.type === 'control' && data.type === 'subscribe_notification') return 'subscribe'
  if (data.type === 'error') return 'error'
  return protocolTypeOf(message) || ''
}

/**
 * Tile fill class of a ribbon card (#322): moderation punishments are yellow
 * (warning) or red (punishment), votes are light green, and every other type
 * gets a light tint of its color. Plain messages have no fill.
 */
export function ribbonFillClass(message) {
  const kind = ribbonKind(message)
  switch (kind) {
    case 'warning': return 'bg-yellow-300 dark:bg-yellow-900/70'
    case 'punishment': return 'bg-red-400 dark:bg-red-900/70'
    case 'announcement': return 'bg-amber-200 dark:bg-amber-900/60'
    case 'subscribe': return 'bg-sky-200 dark:bg-sky-900/60'
    case 'error': return 'bg-red-300 dark:bg-red-900/60'
    case 'vote': return 'bg-green-200 dark:bg-green-900/60'
    case 'election': return 'bg-blue-200 dark:bg-blue-900/60'
    case 'refill': return 'bg-purple-200 dark:bg-purple-900/60'
    case 'merge': return 'bg-yellow-200 dark:bg-yellow-900/60'
    case 'conflict': return 'bg-red-200 dark:bg-red-900/60'
    case 'recover': return 'bg-indigo-200 dark:bg-indigo-900/60'
    case 'change_policy': return 'bg-pink-200 dark:bg-pink-900/60'
    case 'remove_echo': return 'bg-orange-200 dark:bg-orange-900/60'
    case 'excommunicate': return 'bg-gray-300 dark:bg-gray-700'
    case 'appeal': return 'bg-amber-200 dark:bg-amber-900/60'
    default: return ''
  }
}
