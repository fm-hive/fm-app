import { formatJsonWithDataChips } from './sourceFormat'
import { marked } from 'marked'

// Configure marked for security and formatting
marked.setOptions({
  breaks: true,        // Convert \n to <br>
  gfm: true,           // GitHub Flavored Markdown (tables, strikethrough, etc.)
})

/**
 * Resolve attachment references in rendered HTML.
 * Plain refs point at the current message's attachments:
 *   Images: `![name](attachment:0)` -> `src="<data url>"`
 *   Links:  `[name](attachment:0)` -> `href="<data url>"`
 * Message-scoped refs (quotes, issue #268) carry the original message ID:
 *   `attachment:<message_id>:<N>` is resolved via `attachmentResolver(messageId)`
 *   (usually the message store lookup); unresolved refs are left untouched.
 * @param {string} html - Rendered HTML
 * @param {Array} attachments - Array of attachment objects {name, type, data, preview}
 * @param {Function} [attachmentResolver] - (messageId) => attachments array or null
 * @returns {string} HTML with resolved attachment references
 */
function resolveAttachments(html, attachments, attachmentResolver) {
  const hasOwn = attachments && Array.isArray(attachments) && attachments.length > 0
  if (!hasOwn && !attachmentResolver) {
    return html
  }
  return html.replace(/(src|href)="attachment:([^"]+)"/g, (match, attr, ref) => {
    let att = null
    const plain = ref.match(/^(\d+)$/)
    if (plain) {
      if (!hasOwn) return match
      att = attachments[parseInt(plain[1], 10)]
    } else {
      const scoped = ref.match(/^([A-Za-z0-9_-]+):(\d+)$/)
      if (!scoped || !attachmentResolver) return match
      const list = attachmentResolver(scoped[1])
      if (!list || !Array.isArray(list)) return match
      att = list[parseInt(scoped[2], 10)]
    }
    if (!att) return match
    const src = att.data || att.preview || att.src || ''
    if (!src) return match
    return `${attr}="${src}"${attr === 'href' && att.name ? ` download="${escapeHtmlAttr(att.name)}"` : ''}`
  })
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Return attachments that are NOT referenced as `attachment:N` in the given text.
 * Used to avoid showing an attachment twice (inline in the body and again in the
 * bottom gallery).
 * @param {string} text - Raw body text (markdown) that may contain `attachment:N` refs
 * @param {Array} attachments - Array of attachment objects
 * @returns {Array} attachments not referenced inline
 */
export function unreferencedAttachments(text, attachments) {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return Array.isArray(attachments) ? attachments : []
  }
  if (typeof text !== 'string' || text.length === 0) {
    return attachments
  }
  const referenced = new Set()
  const re = /attachment:(\d+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    referenced.add(parseInt(m[1], 10))
  }
  if (referenced.size === 0) {
    return attachments
  }
  return attachments.filter((_, i) => !referenced.has(i))
}

/**
 * Mark the leading FIDO quote block ("АБ> text") as a markdown blockquote so it
 * is rendered dimmed instead of as plain paragraphs (#283). The prefixes stay
 * visible for attribution; own text below the quote is untouched.
 * @param {string} text - Raw message body
 * @returns {string} Body with the leading quote block marked as "> ..."
 */
export function markQuoteBlock(text) {
  if (typeof text !== 'string' || !text) return text
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && /^[^\s>]{1,4}>\s?/.test(lines[i])) i++
  if (i === 0) return text
  return lines.map((line, idx) => (idx < i ? '> ' + line : line)).join('\n')
}

// ---------------------------------------------------------------------------
// JSON attachments (#306)
// ---------------------------------------------------------------------------

const JSON_ANCHOR_RE = /<a\s+[^>]*href="attachment:([^"]+)"[^>]*>([\s\S]*?)<\/a>/g

/**
 * Parse an attachment ref into its source message and index.
 * Plain refs (`N`) belong to `fallbackMessageId`; scoped refs
 * (`<message_id>:N`, produced by quoting) carry their own message id.
 * @returns {{messageId: string, index: number}|null}
 */
export function parseAttachmentRef(ref, fallbackMessageId = '') {
  const plain = String(ref || '').match(/^(\d+)$/)
  if (plain) return { messageId: fallbackMessageId, index: parseInt(plain[1], 10) }
  const scoped = String(ref || '').match(/^([A-Za-z0-9_-]+):(\d+)$/)
  if (!scoped) return null
  return { messageId: scoped[1], index: parseInt(scoped[2], 10) }
}

function selectButton(ref, label) {
  return `<button type="button" class="fm-json-select" data-fm-attachment="${escapeHtmlText(ref)}" title="${escapeHtmlText(label)}">📌</button>`
}

/** Look up an attachment by a plain (`N`) or message-scoped (`id:N`) ref. */
export function lookupAttachment(ref, attachments, attachmentResolver) {
  const plain = ref.match(/^(\d+)$/)
  if (plain) {
    if (!Array.isArray(attachments)) return null
    return attachments[parseInt(plain[1], 10)] || null
  }
  const scoped = ref.match(/^([A-Za-z0-9_-]+):(\d+)$/)
  if (!scoped || !attachmentResolver) return null
  const list = attachmentResolver(scoped[1])
  if (!Array.isArray(list)) return null
  return list[parseInt(scoped[2], 10)] || null
}

function escapeHtmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Decode a data URL (base64 or percent-encoded) into a UTF-8 string. */
export function decodeDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]*)?(;base64)?,([\s\S]*)$/)
  if (!m) return ''
  try {
    if (m[2]) {
      const binary = atob(m[3])
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    }
    return decodeURIComponent(m[3])
  } catch {
    return ''
  }
}

/**
 * Placeholder for a selected-messages bundle (#306). The markdown renderer
 * cannot build Vue components inside `v-html`, so the card is rendered by the
 * `BundleMessages` component at the placeholder position.
 */
function bundleSlot(ref) {
  return `<div class="fm-bundle-slot" data-fm-bundle-ref="${escapeHtmlText(ref)}"></div>`
}

const BUNDLE_SLOT_RE = /<div class="fm-bundle-slot" data-fm-bundle-ref="([^"]*)"><\/div>/g

/**
 * Split rendered HTML into plain HTML chunks and bundle slots, so a Vue
 * component can be rendered at every bundle position.
 * @returns {Array<{html: string}|{ref: string}>}
 */
export function splitBundleSlots(html) {
  const out = []
  const re = new RegExp(BUNDLE_SLOT_RE.source, 'g')
  let last = 0
  let m
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) out.push({ html: html.slice(last, m.index) })
    out.push({ ref: m[1] })
    last = m.index + m[0].length
  }
  if (last < html.length) out.push({ html: html.slice(last) })
  return out
}

/** Pretty-printed, collapsible JSON for any other JSON attachment. */
function renderJsonBlock(json, name, labels, ref) {
  let pretty = json
  try {
    pretty = JSON.stringify(JSON.parse(json), null, 2)
  } catch { /* keep the raw text */ }
  return `<div class="fm-json-bundle">`
    + `<div class="fm-json-bundle-title">📎 ${escapeHtmlText(name || 'JSON')} ${selectButton(ref, labels.selectLabel)}</div>`
    + `<details><summary>${escapeHtmlText(labels.showContent)}</summary><pre class="fm-json-body">`
    + formatJsonWithDataChips(pretty, { copyTitle: labels.copyTitle, copiedLabel: labels.copiedLabel })
    + `</pre></details>`
    + `</div>`
}

/**
 * Replace links to JSON attachments with a special rendering: a placeholder for
 * selected-message bundles (rendered as message cards by the caller, #306), a
 * pretty-printed collapsible block otherwise. Non-JSON attachments are left for
 * resolveAttachments.
 *
 * `labels.bundles === false` leaves bundle links untouched (used at the nesting
 * depth limit so a bundle inside a bundle cannot recurse forever).
 */
export function renderJsonAttachments(html, attachments, attachmentResolver, labels = {}) {
  const l = {
    bundleTitle: labels.bundleTitle || 'Selected messages',
    showContent: labels.showContent || 'Show content',
    noSubject: labels.noSubject || '(no subject)',
    selectLabel: labels.selectLabel || 'Add attachment to selected',
    rawLabel: labels.rawLabel || 'Source',
    copyTitle: labels.copyTitle || 'Copy',
    copiedLabel: labels.copiedLabel || '✓',
    echoLabel: labels.echoLabel || 'Echo',
    showTearline: labels.showTearline === true,
    bundles: labels.bundles !== false,
  }
  return html.replace(JSON_ANCHOR_RE, (match, ref) => {
    const att = lookupAttachment(ref, attachments, attachmentResolver)
    if (!att) return match
    const isJson = att.type === 'application/json' || /\.json$/i.test(att.name || '')
    if (!isJson) return match
    const json = decodeDataUrl(att.data || att.preview || att.src || '')
    if (!json) return match
    try {
      const parsed = JSON.parse(json)
      if (parsed && parsed.type === 'fm-selected-messages' && Array.isArray(parsed.messages)) {
        return l.bundles ? bundleSlot(ref) : match
      }
      return renderJsonBlock(json, att.name, l, ref)
    } catch {
      return renderJsonBlock(json, att.name, l, ref)
    }
  })
}

/**
 * Render markdown to HTML
 * @param {string} text - Markdown text
 * @param {Array} attachments - Optional attachments array for `attachment:N` refs
 * @param {Function} [attachmentResolver] - Optional (messageId) => attachments lookup
 * @param {object} [labels] - Optional i18n labels for the JSON attachment rendering
 * @returns {string} Rendered HTML
 */
export function renderMarkdown(text, attachments, attachmentResolver, labels) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  
  try {
    const html = marked.parse(markQuoteBlock(text))
    return resolveAttachments(renderJsonAttachments(html, attachments, attachmentResolver, labels), attachments, attachmentResolver)
  } catch (error) {
    console.error('Error rendering markdown:', error)
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}

/**
 * Render markdown inline (without paragraph wrappers)
 * @param {string} text - Markdown text
 * @param {Array} attachments - Optional attachments array for `attachment:N` refs
 * @param {Function} [attachmentResolver] - Optional (messageId) => attachments lookup
 * @returns {string} Rendered HTML
 */
export function renderMarkdownInline(text, attachments, attachmentResolver) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  
  try {
    return resolveAttachments(marked.parseInline(text), attachments, attachmentResolver)
  } catch (error) {
    console.error('Error rendering inline markdown:', error)
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}

