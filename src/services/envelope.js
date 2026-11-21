// Envelope authentication payload.
//
// The JWS attached to a control envelope signs the hash of the transmitted
// payload carrier — the JWE (encrypted requests) or the plaintext data
// (bootstrap requests, e.g. the first policy request) — never the request
// itself. This way the request does not appear in the clear in the signed
// payload, and the signature cannot be replayed with another JWE.

/** SHA-256 of a string, base64url without padding (same encoding as the JWS kid). */
export async function sha256Base64Url(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Build the JSON payload to sign for the envelope: {"jwe_sha256": ...} when the
 * envelope carries a JWE, otherwise {"data_sha256": ...} for the plaintext data.
 */
export async function buildEnvelopeAuthPayload(envelope) {
  if (envelope.jwe) {
    return JSON.stringify({ jwe_sha256: await sha256Base64Url(envelope.jwe) })
  }
  if (envelope.data) {
    return JSON.stringify({ data_sha256: await sha256Base64Url(JSON.stringify(envelope.data)) })
  }
  throw new Error('envelope has neither jwe nor data')
}
