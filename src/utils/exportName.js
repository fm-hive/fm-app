// Export file name helpers.
//
// The name includes the client's name and address so backups are easy to tell
// apart: fm-full-export-Admin-One-0-1-2026-09-16.json

/**
 * Sanitize one part of the file name: keep letters, digits and dashes, replace
 * everything else (spaces, punctuation) with a single dash and trim the edges.
 * @param {string} value
 * @returns {string}
 */
export function sanitizeFilePart(value) {
  if (!value) return ''
  return String(value)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Turn a network address into a file-name part (":0:1" -> "0-1").
 * @param {string} address
 * @returns {string}
 */
export function addressFilePart(address) {
  return sanitizeFilePart(String(address || '').replace(/:/g, '-'))
}

/**
 * Build an export file name.
 * @param {string} prefix - e.g. "fm-full-export"
 * @param {{name?: string, address?: string}} identity
 * @param {Date} [date]
 * @returns {string}
 */
export function exportFileName(prefix, identity = {}, date = new Date()) {
  const parts = [prefix]
  const name = sanitizeFilePart(identity.name)
  if (name) parts.push(name)
  const address = addressFilePart(identity.address)
  if (address) parts.push(address)
  parts.push(date.toISOString().split('T')[0])
  return parts.join('-') + '.json'
}
