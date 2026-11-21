/**
 * Small helpers shared by the message views.
 */

/**
 * sender_name carried inside the message payload (for SenderLabel). The `data`
 * field may be a JSON string or an already parsed object; returns '' when it is
 * missing or unparseable.
 * @param {object} message - message with a `data` field
 * @returns {string}
 */
export function senderNameFromData(message) {
  if (!message?.data) return ''
  try {
    const d = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
    return (d && typeof d.sender_name === 'string') ? d.sender_name : ''
  } catch {
    return ''
  }
}

/**
 * Whether a message is a reaction (emoji) — including a retraction, which
 * carries an empty reaction string. Such messages are counted by the reaction
 * helpers but must not be rendered as empty cards in the feed.
 * @param {object} msg - message with `type` and `data`
 * @returns {boolean}
 */
export function isReactionMessage(msg) {
  if (!msg) return false
  if (msg.type === 'reaction') return true
  if (msg.type !== 'echomail') return false
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return !!d && Object.prototype.hasOwnProperty.call(d, 'reaction')
  } catch {
    return false
  }
}

/**
 * User tagline carried inside the message payload (#309). The `data` field
 * may be a JSON string or an already parsed object; returns '' when it is
 * missing or unparseable.
 * @param {object} message - message with a `data` field
 * @returns {string}
 */
export function taglineFromData(message) {
  if (!message?.data) return ''
  try {
    const d = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
    return (d && typeof d.tagline === 'string') ? d.tagline : ''
  } catch {
    return ''
  }
}

/**
 * Client tearline carried inside the message payload (#311). Like the tagline,
 * the `data` field may be a JSON string or an already parsed object.
 * @param {object} message - message with a `data` field
 * @returns {string}
 */
export function tearlineFromData(message) {
  if (!message?.data) return ''
  try {
    const d = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
    return (d && typeof d.tearline === 'string') ? d.tearline : ''
  } catch {
    return ''
  }
}
