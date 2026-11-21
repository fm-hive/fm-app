// QR invite helpers: parsing/building invite URLs and local storage.
//
// An invite URL looks like:
//   https://node.example.com?pubkey=<base64url Ed25519>&voucher=<code>
//
// The public key is the node's Ed25519 key (used to verify the node JWS and to
// derive the X25519 key that encrypts packets to the node); the voucher code is
// issued by the node (see docs/api/voucher.md).
import { base64UrlEncode, base64UrlDecode } from './crypto.js'

const INVITE_STORAGE_KEY = 'fm_invite'
const VOUCHER_DISABLED_KEY = 'fm_voucher_disabled'

/**
 * Encode bytes as standard base64 (API convention for keys, e.g. sig_pkey).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  if (!bytes) return ''
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Convert a node API URL (e.g. https://host/api) to the app URL
 * (https://host/app) so the QR link can be opened in a browser.
 * @param {string} apiUrl
 * @returns {string}
 */
export function apiUrlToAppUrl(apiUrl) {
  const url = (apiUrl || '').replace(/\/+$/, '')
  if (!url) return '/app'
  if (/\/api$/.test(url)) return url.replace(/\/api$/, '/app')
  return url + '/app'
}

/**
 * Convert an app URL (https://host/app) to the node API URL (https://host/api).
 * @param {string} appUrl
 * @returns {string}
 */
export function appUrlToApiUrl(appUrl) {
  const url = (appUrl || '').replace(/\/+$/, '')
  if (!url) return '/api'
  if (/\/app$/.test(url)) return url.replace(/\/app$/, '/api')
  if (/\/api$/.test(url)) return url
  return url + '/api'
}

/**
 * Derive the node's network address from a user address
 * (":0:1" -> ":0:0", ":0:1:2" -> ":0:1:0").
 * @param {string} userAddress
 * @returns {string}
 */
export function nodeAddressFromUser(userAddress) {
  if (!userAddress) return ''
  const parts = String(userAddress).split(':')
  if (parts.length < 2) return ''
  parts[parts.length - 1] = '0'
  return parts.join(':')
}

/**
 * Parse an invite URL (or a plain node URL) into its parts.
 * @param {string} url
 * @returns {{baseUrl: string, appUrl: string, pubkey: Uint8Array|null, voucher: string|null, address: string|null}|null}
 */
export function parseInviteURL(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    const appUrl = (parsed.origin + parsed.pathname).replace(/\/+$/, '') || parsed.origin
    const pubkeyParam = parsed.searchParams.get('pubkey')
    const voucherParam = parsed.searchParams.get('voucher')

    let pubkey = null
    if (pubkeyParam) {
      try {
        const bytes = base64UrlDecode(pubkeyParam)
        if (bytes.length > 0) pubkey = bytes
      } catch {
        pubkey = null
      }
    }

    return {
      baseUrl: appUrlToApiUrl(appUrl),
      appUrl,
      pubkey,
      voucher: voucherParam || null,
      address: parsed.searchParams.get('address') || null,
    }
  } catch {
    return null
  }
}

/**
 * Build an invite URL with the node public key, its address and (optionally) a
 * voucher code.
 * @param {string} appUrl - app URL, e.g. https://host/app
 * @param {{pubkey?: Uint8Array|string|null, voucher?: string|null, address?: string|null}} options
 * @returns {string}
 */
export function buildInviteURL(appUrl, options = {}) {
  const { pubkey = null, voucher = null, address = null } = options
  const url = new URL(appUrl || window.location.origin)
  // Anchor the invite to the app directory: .../app?pubkey=... becomes
  // .../app/?pubkey=... so relative assets and reverse-proxy routes resolve
  // correctly (#386).
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  if (pubkey) {
    const encoded = typeof pubkey === 'string' ? pubkey : base64UrlEncode(pubkey)
    url.searchParams.set('pubkey', encoded)
  }
  if (voucher) {
    url.searchParams.set('voucher', voucher)
  }
  if (address) {
    url.searchParams.set('address', address)
  }
  return url.toString()
}

/**
 * Store the invite (node public key + voucher) until registration completes.
 * @param {{pubkey?: Uint8Array|null, voucher?: string|null}} invite
 */
export function saveInvite(invite) {
  const data = {}
  if (invite?.pubkey) {
    data.pubkey = typeof invite.pubkey === 'string' ? invite.pubkey : base64UrlEncode(invite.pubkey)
  }
  if (invite?.voucher) {
    data.voucher = invite.voucher
  }
  if (Object.keys(data).length === 0) return
  try {
    localStorage.setItem(INVITE_STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('[invite] failed to save invite:', err)
  }
}

/**
 * Load the stored invite.
 * @returns {{pubkey: Uint8Array|null, voucher: string|null}|null}
 */
export function loadInvite() {
  try {
    const raw = localStorage.getItem(INVITE_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    let pubkey = null
    if (data.pubkey) {
      try {
        const bytes = base64UrlDecode(data.pubkey)
        if (bytes.length > 0) pubkey = bytes
      } catch {
        pubkey = null
      }
    }
    if (!pubkey && !data.voucher) return null
    return { pubkey, voucher: data.voucher || null }
  } catch {
    return null
  }
}

/** Remove the stored invite (after successful registration). */
export function clearInvite() {
  try {
    localStorage.removeItem(INVITE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Remember that the node does not use vouchers (voucher_enable=false), so the
 * "Send voucher" button is not shown again.
 * @param {string} nodeUrl
 */
export function rememberVoucherDisabled(nodeUrl) {
  try {
    const map = JSON.parse(localStorage.getItem(VOUCHER_DISABLED_KEY) || '{}')
    map[nodeUrl || 'default'] = true
    localStorage.setItem(VOUCHER_DISABLED_KEY, JSON.stringify(map))
  } catch (err) {
    console.warn('[invite] failed to remember disabled vouchers:', err)
  }
}

/**
 * Whether the node is known to have vouchers disabled.
 * @param {string} nodeUrl
 * @returns {boolean}
 */
export function isVoucherDisabled(nodeUrl) {
  try {
    const map = JSON.parse(localStorage.getItem(VOUCHER_DISABLED_KEY) || '{}')
    return !!map[nodeUrl || 'default']
  } catch {
    return false
  }
}

/** Detect the "vouchers are disabled" error from the node. */
export function isVouchersDisabledError(err) {
  const message = err?.message || String(err || '')
  return message.includes('Vouchers are disabled')
}
