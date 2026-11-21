import { createJWS, sha256Hex } from '../services/crypto'

/**
 * Normalize rules into the canonical {text, parameters} shape.
 * Mirrors backend Echo.RulesMap: when a "parameters" key already exists the
 * object is used as-is, otherwise legacy flat rules are wrapped.
 * @param {object|string} rules - rules object or JSON string
 * @returns {object} canonical rules object (possibly {})
 */
export function canonicalRules(rules) {
  let obj = rules
  if (typeof rules === 'string') {
    try { obj = JSON.parse(rules) } catch { obj = {} }
  }
  if (!obj || typeof obj !== 'object') return {}
  if (Object.prototype.hasOwnProperty.call(obj, 'parameters')) return obj
  const parameters = {}
  let text = ''
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'text') { text = typeof v === 'string' ? v : ''; continue }
    parameters[k] = v
  }
  return { text, parameters }
}

/**
 * Whether an echo restricts who may post: `parameters.writers` is a non-empty
 * list and not exactly `["all"]` (mirrors the backend writers check in
 * processMessageData). Such echoes are called channels.
 * @param {object|string} rules - rules object or JSON string
 * @returns {boolean}
 */
export function hasRestrictedWriters(rules) {
  const { parameters } = canonicalRules(rules)
  const writers = parameters?.writers
  if (!Array.isArray(writers) || writers.length === 0) return false
  if (writers.length === 1 && writers[0] === 'all') return false
  return true
}

/**
 * Whether the user may post to the echo (and therefore react to its messages).
 * Network news is node-only; echoes with a restricted writers list require the
 * address to be in it. Returns true for normal echoes and `writers: ["all"]`.
 * @param {object|string} rules - rules object or JSON string
 * @param {string} address - user address
 * @param {{networkNews?: boolean}} [options]
 * @returns {boolean}
 */
export function canWriteToEcho(rules, address, options = {}) {
  if (options.networkNews) return false
  const { parameters } = canonicalRules(rules)
  const writers = parameters?.writers
  if (!Array.isArray(writers) || writers.length === 0) return true
  if (writers.length === 1 && writers[0] === 'all') return true
  return typeof address === 'string' && address !== '' && writers.includes(address)
}

/**
 * Escape a JSON string the way Go's encoding/json does (HTMLEscape on by
 * default): `"`/`\`/control chars are escaped and `<`, `>`, `&`, U+2028 and
 * U+2029 are written as \uXXXX escapes.
 */
function jsonEscapeString(s) {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0x22) out += '\\"'
    else if (c === 0x5c) out += '\\\\'
    else if (c === 0x08) out += '\\b'
    else if (c === 0x09) out += '\\t'
    else if (c === 0x0a) out += '\\n'
    else if (c === 0x0c) out += '\\f'
    else if (c === 0x0d) out += '\\r'
    else if (c < 0x20) out += '\\u00' + c.toString(16).padStart(2, '0')
    else if (c === 0x3c) out += '\\u003c'
    else if (c === 0x3e) out += '\\u003e'
    else if (c === 0x26) out += '\\u0026'
    else if (c === 0x2028) out += '\\u2028'
    else if (c === 0x2029) out += '\\u2029'
    else out += s[i]
  }
  return out + '"'
}

/**
 * Serialize a JSON value exactly like Go's json.Marshal: object keys sorted
 * lexicographically (recursively), compact separators, Go-compatible escaping.
 * Produces the same bytes as encoding/json so rules hashes match the backend.
 */
export function canonicalStringify(value) {
  if (value === null) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'string') return jsonEscapeString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']'
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map(k => jsonEscapeString(k) + ':' + canonicalStringify(value[k])).join(',') + '}'
  }
  return 'null'
}

/**
 * Compute the canonical rules hash (SHA256 of Go-serialized {text, parameters}).
 * Mirrors backend Echo.ComputeRulesID.
 * @param {object|string} rules - rules object or JSON string
 * @returns {Promise<string>} hex sha256 hash
 */
export async function computeRulesId(rules) {
  return sha256Hex(canonicalStringify(canonicalRules(rules)))
}

/**
 * Build a signed rules acceptance payload: { id, rules } signed with the user key.
 * @param {object|string} rules - rules object or JSON string
 * @param {Uint8Array} privateKey
 * @param {Uint8Array} publicKey
 * @returns {Promise<{rules_jws: string, sig_pkey: string, rules_id: string}>}
 */
export async function buildRulesSignature(rules, privateKey, publicKey) {
  const canonical = canonicalRules(rules)
  const rulesId = await computeRulesId(canonical)
  const payload = JSON.stringify({ id: rulesId, rules: canonical })
  const jws = await createJWS(privateKey, payload, publicKey)
  const sigPkey = btoa(String.fromCharCode(...publicKey))
  return { rules_jws: jws, sig_pkey: sigPkey, rules_id: rulesId }
}
