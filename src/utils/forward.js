/**
 * Forward message data (#325): the original travels as a JSON bundle
 * attachment (the same format as the selected-messages bundles, #306), so the
 * receiver renders it as a message card instead of raw JSON. Only the local
 * "save to a netmail folder" case keeps the message open.
 */
import { buildBundle, bundleAttachment, bundleFileName } from './selectedBundle'

/** Subject of the forwarded message: the original's real subject. */
export function forwardSubjectOf(message) {
  let subject = ''
  if (message && message.data) {
    try {
      subject = JSON.parse(message.data).subject || ''
    } catch { /* not JSON */ }
  }
  return `Forwarded: ${subject || 'Message'}`
}

/**
 * Data of the forwarded message: the comment (note) as the body with a link
 * to the bundle attachment carrying the original message.
 */
export function buildForwardData(message, comment) {
  const bundle = buildBundle([message])
  const attachment = bundleAttachment(bundle)
  const ref = `[${bundleFileName(bundle)}](attachment:0)`
  const body = comment ? `${comment}\n\n${ref}` : ref
  return {
    subject: forwardSubjectOf(message),
    body,
    attachments: [attachment],
    timestamp: Math.floor(Date.now() / 1000),
  }
}
