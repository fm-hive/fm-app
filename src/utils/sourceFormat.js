/**
 * Formatting of raw message sources (#316): long `data:` URIs (embedded
 * attachments) are replaced with a small "copy" chip so the source stays
 * readable, while the full value stays in the DOM (a hidden span) and is copied
 * to the clipboard on click.
 */

/** Minimum length of a data: URI that gets collapsed into a chip. */
export const DATA_CHIP_MIN_LEN = 100

// data:[<mime>][;param=value][;base64],<payload> — stops at JSON delimiters
// (quote, backslash, whitespace) so it also matches inside JSON strings.
const DATA_URL_SRC = 'data:[a-z0-9.+-]+\\/[a-z0-9.+-]*(?:;[a-z0-9.+-]+=[^,;"\\\\\\s]*)*(?:;base64)?,[^\\s"\\\\]*'
// JWS compact serialization (header.payload.signature): pure signature data,
// useless to read inline but worth copying (the payload carries the message).
const JWS_SRC = 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+'
const CHIP_RE = new RegExp(`${DATA_URL_SRC}|${JWS_SRC}`, 'g')

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escape text for safe insertion into HTML. */
export function escapeHtmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

/** Human size of a base64/URL-encoded payload. */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Approximate decoded size of a base64/base64url string. */
function base64Bytes(value) {
  const padding = (value.match(/=+$/) || [''])[0].length
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding)
}

/** Label of a collapsed value: data: URI type/size or "jws · size". */
function chipLabel(value) {
  if (value.startsWith('data:')) return dataUrlLabel(value)
  return `jws · ${formatBytes(base64Bytes(value))}`
}

/**
 * Short label of a data: URI: mime type and decoded payload size
 * (e.g. "image/png · 12.3 KB").
 */
export function dataUrlLabel(url) {
  const match = /^data:([^;,]*)(;[^,]*)?,([\s\S]*)$/.exec(url || '')
  if (!match) return ''
  const mime = match[1] || 'data'
  const params = match[2] || ''
  const payload = match[3] || ''
  let bytes
  if (/;base64/i.test(params)) {
    bytes = base64Bytes(payload)
  } else {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(payload)).length
    } catch {
      bytes = payload.length
    }
  }
  return `${mime} · ${formatBytes(bytes)}`
}

let chipSeq = 0

/**
 * Pretty-printed JSON (or a plain string) where every data: URI longer than
 * `minLen` is replaced by a copy chip. The chip copies the full value from the
 * hidden span next to it; `installCopyChipHandler` handles the clicks.
 *
 * @param {*} value - value to serialize (objects are JSON.stringify-ed)
 * @param {object} [labels] - { minLen, copyTitle, copiedLabel }
 * @returns {string} HTML
 */
export function formatJsonWithDataChips(value, labels = {}) {
  const minLen = labels.minLen || DATA_CHIP_MIN_LEN
  const copyTitle = labels.copyTitle || 'Copy'
  const copiedLabel = labels.copiedLabel || '✓'
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

  let html = ''
  let last = 0
  for (const match of text.matchAll(CHIP_RE)) {
    const value = match[0]
    if (value.length < minLen) continue
    const id = `fm-data-${++chipSeq}`
    html += escapeHtmlText(text.slice(last, match.index))
    html += `<button type="button" class="fm-data-chip" data-fm-copy-el="${id}"`
      + ` title="${escapeHtmlText(copyTitle)}" data-copied-label="${escapeHtmlText(copiedLabel)}">`
      + `📋 ${escapeHtmlText(chipLabel(value))}</button>`
      + `<span id="${id}" hidden>${escapeHtmlText(value)}</span>`
    last = match.index + value.length
  }
  html += escapeHtmlText(text.slice(last))
  return html
}

let copyHandlerInstalled = false

/**
 * Global click handler for copy chips: copies the hidden span's text and shows
 * a short "copied" feedback on the chip. Safe to call several times.
 */
export function installCopyChipHandler() {
  if (copyHandlerInstalled) return
  copyHandlerInstalled = true
  document.addEventListener('click', async (event) => {
    const chip = event.target?.closest?.('[data-fm-copy-el]')
    if (!chip) return
    event.preventDefault()
    const value = document.getElementById(chip.dataset.fmCopyEl)?.textContent || ''
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    const original = chip.textContent
    const copied = chip.dataset.copiedLabel || '✓'
    chip.textContent = copied
    chip.classList.add('fm-data-chip-copied')
    setTimeout(() => {
      chip.textContent = original
      chip.classList.remove('fm-data-chip-copied')
    }, 1500)
  })
}
