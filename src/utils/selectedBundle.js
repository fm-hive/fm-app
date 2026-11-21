// JSON bundle of selected messages (#306).
//
// A bundle is attached to a message as `<Message-ID>.json` (numbered when
// chunked) and rendered specially in the body. Messages travel in their
// wire-ish form: everything except the expanded `data` field, which lives
// inside the JWS payload (the receiver recovers it after verifying the
// signature, like the refill protocol and the client synchronize containers
// do). Blog posts have no JWS: their content travels as plain `data`.

export const BUNDLE_TYPE = 'fm-selected-messages'
export const BUNDLE_VERSION = 1

// Message fields kept in the bundle (no `data`, no client-side `_` fields).
const MESSAGE_FIELDS = [
  'message_id',
  'type',
  'sender_address',
  'recipient_address',
  'timestamp',
  'jws',
  'echo_name',
  'echo_id',
  'echo',
]

/** Wire-ish copy of a message: full message with jws but without expanded data. */
export function messageForBundle(message) {
  const out = {}
  if (!message) return out
  // Blog posts (#306) have no JWS, so their content travels as plain `data`.
  const fields = message.jws ? MESSAGE_FIELDS : [...MESSAGE_FIELDS, 'data']
  for (const key of fields) {
    const value = message[key]
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

/** Build one bundle object from resolved messages. */
export function buildBundle(messages, { now = Math.floor(Date.now() / 1000) } = {}) {
  return {
    type: BUNDLE_TYPE,
    version: BUNDLE_VERSION,
    generated_at: now,
    messages: (messages || []).map(messageForBundle),
  }
}

/** UTF-8 safe base64 data URL for a JSON payload. */
export function jsonDataUrl(value) {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:application/json;base64,${btoa(binary)}`
}

/** Decode the payload of a compact JWS (no verification). */
export function jwsPayloadOf(jws) {
  try {
    const parts = String(jws || '').split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/**
 * Content of a bundled message entry (#306).
 *
 * Wire entries carry the message inside the JWS payload and have no `data`.
 * Locally stored messages (blog posts, decrypted netmail, client-synchronize
 * copies) keep the content in `data` while their JWS payload is something else
 * (an auth hash, or nothing at all) — prefer `data` when it is present.
 */
export function bundlePayloadOf(entry) {
  if (!entry) return {}
  if (typeof entry.data === 'string' && entry.data) {
    try {
      return JSON.parse(entry.data) || {}
    } catch { /* fall through to the JWS payload */ }
  }
  return jwsPayloadOf(entry.jws) || {}
}

/**
 * File name of a bundle: the first message's id (#306), e.g. `<Message-ID>.json`.
 * Chunked bundles get a numeric suffix; unsafe characters are replaced.
 */
export function bundleFileName(bundle, index = 0, total = 1) {
  const first = (bundle?.messages || [])[0] || {}
  const base = String(first.message_id || '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'selected-messages'
  return total > 1 ? `${base}-${index + 1}.json` : `${base}.json`
}

/** Attachment object for a bundle (the shape stored in message data). */
export function bundleAttachment(bundle, index, total) {
  const json = JSON.stringify(bundle)
  return {
    name: bundleFileName(bundle, index, total),
    type: 'application/json',
    size: json.length,
    data: jsonDataUrl(bundle),
  }
}
