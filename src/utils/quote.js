/**
 * FIDO-style quoting utilities for FM Network
 */

/**
 * Generate short identifier from FM address (e.g., :0:1 -> "01")
 * @param {string} address - FM address like ":0:1"
 * @returns {string} Two-character identifier
 */
export function addressToShortId(address) {
  if (!address) return '??'
  // Remove colons and take last 2 characters
  const clean = address.replace(/:/g, '')
  if (clean.length >= 2) {
    return clean.slice(-2)
  }
  // Pad with zeros if needed
  return clean.padStart(2, '0')
}

/**
 * Derive initials from a display name (e.g. "Павел Романов" -> "ПР",
 * "Александр Григорьевич" -> "АГ"). Uses the first letters of the first two
 * words; a single-word name yields its first letter.
 * @param {string} name - display name
 * @returns {string} initials (uppercase), or '' if the name is empty
 */
export function initialsFromName(name) {
  const n = String(name || '').trim()
  if (!n) return ''
  const words = n.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    return words[0][0].toUpperCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Format a message quote in newsgroup style using the author's name initials:
 * every quoted line is prefixed with "<initials>> " (e.g. "ПР> текст").
 * If the given identifier is an address (starts with ':'), falls back to the
 * short address id for compatibility.
 * @param {string} senderIdOrName - display name (or address)
 * @param {string} messageBody - Original message text
 * @returns {string} Formatted quote
 */
export function formatFidoQuote(senderIdOrName, messageBody) {
  const tag = (typeof senderIdOrName === 'string' && senderIdOrName.startsWith(':'))
    ? addressToShortId(senderIdOrName)
    : initialsFromName(senderIdOrName) || addressToShortId(senderIdOrName)
  const lines = String(messageBody || '').split('\n')
  return lines.filter(line => line !== '' || lines.length > 1).map(line => `${tag}> ${line}`).join('\n')
}

/**
 * Make attachment references in quoted text point at the quoted message
 * (issue #268): `[img](attachment:0)` becomes `[img](attachment:<message_id>:0)`
 * so the renderer resolves it against the original message instead of the
 * message being written. References that already carry a message ID (nested
 * quotes) are left untouched.
 * @param {string} text - Quoted message body
 * @param {string} messageId - message_id of the quoted message
 * @returns {string} Body with message-scoped attachment references
 */
export function scopeAttachmentRefs(text, messageId) {
  if (!text || !messageId) return text
  return String(text).replace(/attachment:(\d+)/g, (match, idx) => `attachment:${messageId}:${idx}`)
}

/**
 * Parse a quoted message to extract original sender and content.
 * Recognizes formats:
 * - "AB> text"
 * - "AB>> text"
 * - "AB> text\n> more text"
 * @param {string} quotedText - Text containing quote
 * @returns {object|null} { senderId, originalText } or null if not a quote
 */
export function parseFidoQuote(quotedText) {
  const lines = String(quotedText || '').split('\n')
  if (lines.length === 0) return null

  // Check first line for "XX> " / "XX>> " pattern (letters or letters+digits)
  const firstLine = lines[0]
  const match = firstLine.match(/^([^>]+)>>?\s+(.*)$/)
  if (!match) return null

  const senderId = match[1].trim()
  const firstLineText = match[2]

  // Reconstruct original text
  const originalLines = [firstLineText]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Continuation lines keep a "<tag>> " prefix (every quoted line is prefixed)
    // or use a plain "> " prefix; stop at the first unprefixed line (own text).
    const m = line.match(/^\s*(.+?)>>?\s+(.*)$/)
    if (m) {
      originalLines.push(m[2])
    } else if (/^> ?/.test(line)) {
      originalLines.push(line.replace(/^> ?/, ''))
    } else {
      break
    }
  }

  return {
    senderId,
    originalText: originalLines.join('\n')
  }
}

/**
 * Check if text contains newsgroup-style quote
 * @param {string} text
 * @returns {boolean}
 */
export function hasFidoQuote(text) {
  return parseFidoQuote(text) !== null
}

/**
 * Wrap existing quote with another level of quoting (nesting).
 * Example: "АГ> original" becomes "ПР> АГ> original".
 * @param {string} existingQuote - Existing quoted text
 * @param {string} currentSenderName - Current replier's name (or address)
 * @returns {string} Nested quote
 */
export function nestFidoQuote(existingQuote, currentSenderName) {
  const tag = (typeof currentSenderName === 'string' && currentSenderName.startsWith(':'))
    ? addressToShortId(currentSenderName)
    : initialsFromName(currentSenderName) || addressToShortId(currentSenderName)
  const lines = String(existingQuote || '').split('\n')
  return lines.map(line => `${tag}> ${line}`).join('\n')
}