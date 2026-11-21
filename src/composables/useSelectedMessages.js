import { ref, computed } from 'vue'

// Selected messages (#306): a client-side container for messages picked from
// the feed. The list is a lightweight index — the message bodies stay in the
// echo store / IndexedDB and are resolved on demand (see selectedMessageOf).
const STORAGE_KEY = 'fm_selected_messages'
const MAX_SELECTED = 200

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('[selected] save failed', err)
  }
}

/**
 * Build a stored selection entry from a message. Keeps a small snapshot
 * (subject/author/date) so the container can render without loading the echo;
 * the full message is resolved later by message_id + echo_name.
 */
export function selectionEntry(message, { echoName = '', echoId = null } = {}) {
  if (!message?.message_id) return null
  let d = {}
  try { d = JSON.parse(message.data || '{}') } catch { /* ignore */ }
  return {
    kind: 'message',
    message_id: message.message_id,
    echo_name: echoName || message.echo_name || '',
    echo_id: echoId ?? (message.echo_id ?? null),
    type: message.type || 'echomail',
    timestamp: message.timestamp || null,
    saved_at: Math.floor(Date.now() / 1000),
    subject: d.subject || '',
    sender_address: message.sender_address || '',
    sender_name: d.sender_name || '',
    checked: true,
  }
}

/**
 * Build a stored selection entry for an attachment of a message (#306). Only
 * the reference is kept (the data would blow the localStorage quota); the
 * attachment itself is resolved through its source message.
 */
export function attachmentEntry(attachment, { messageId = '', index = null, echoName = '', echoId = null } = {}) {
  if (!attachment || !messageId || index === null || index === undefined) return null
  return {
    kind: 'attachment',
    attachment_id: `${messageId}:${index}`,
    index,
    message_id: messageId,
    echo_name: echoName || '',
    echo_id: echoId ?? null,
    name: attachment.name || 'file',
    type: attachment.type || '',
    size: attachment.size || 0,
    saved_at: Math.floor(Date.now() / 1000),
    checked: true,
  }
}

const items = ref(load())

export function useSelectedMessages() {
  const count = computed(() => items.value.length)

  function has(messageId) {
    return items.value.some(e => (e.kind || 'message') === 'message' && e.message_id === messageId)
  }

  /** Whether an attachment (of a message) is selected. */
  function hasAttachment(attachmentId) {
    return items.value.some(e => e.kind === 'attachment' && e.attachment_id === attachmentId)
  }

  function add(message, echoInfo = {}) {
    const entry = selectionEntry(message, echoInfo)
    if (!entry || has(entry.message_id)) return false
    items.value = [entry, ...items.value].slice(0, MAX_SELECTED)
    save(items.value)
    return true
  }

  function remove(id, kind = 'message') {
    const before = items.value.length
    items.value = items.value.filter(e => {
      if (kind === 'attachment') return !(e.kind === 'attachment' && e.attachment_id === id)
      return !((e.kind || 'message') === 'message' && e.message_id === id)
    })
    if (items.value.length !== before) save(items.value)
  }

  /** Add the message when absent, remove it when present. Returns true when selected. */
  function toggle(message, echoInfo = {}) {
    if (has(message?.message_id)) {
      remove(message.message_id)
      return false
    }
    return add(message, echoInfo)
  }

  /** Add an attachment of a message to the container. */
  function addAttachment(attachment, source = {}) {
    const entry = attachmentEntry(attachment, source)
    if (!entry || hasAttachment(entry.attachment_id)) return false
    items.value = [entry, ...items.value].slice(0, MAX_SELECTED)
    save(items.value)
    return true
  }

  /** Add the attachment when absent, remove it when present. */
  function toggleAttachment(attachment, source = {}) {
    const entry = attachmentEntry(attachment, source)
    if (!entry) return false
    if (hasAttachment(entry.attachment_id)) {
      remove(entry.attachment_id, 'attachment')
      return false
    }
    return addAttachment(attachment, source)
  }

  /** Entry id used by the UI (messages and attachments differ). */
  function entryId(entry) {
    return entry?.kind === 'attachment' ? entry.attachment_id : entry?.message_id
  }

  /** Whether an entry is marked in the container (missing flag = marked). */
  function isChecked(entry) {
    return entry?.checked !== false
  }

  /** Toggle the mark of an entry (the container popup only marks and removes). */
  function toggleChecked(id) {
    let changed = false
    items.value = items.value.map(e => {
      if (entryId(e) !== id) return e
      changed = true
      return { ...e, checked: e.checked === false }
    })
    if (changed) save(items.value)
  }

  function clear() {
    items.value = []
    save(items.value)
  }

  return {
    items, count, has, hasAttachment, add, addAttachment, remove, toggle, toggleAttachment,
    entryId, isChecked, toggleChecked, clear,
  }
}

/**
 * Resolve the attachment of a selection entry through its source message.
 * @returns {Promise<object|null>} attachment object {name, type, size, data}
 */
export async function resolveSelectedAttachment(entry) {
  if (entry?.kind !== 'attachment') return null
  const message = await resolveSelectedMessage({ message_id: entry.message_id, echo_name: entry.echo_name })
  if (!message) return null
  let d = {}
  try { d = JSON.parse(message.data || '{}') } catch { /* ignore */ }
  const list = Array.isArray(d.attachments) ? d.attachments : []
  return list[entry.index] || null
}

/** A blog post (#306) as a message-like object: blogs are local and have no JWS. */
export function blogPostAsMessage(post) {
  return {
    message_id: post.id,
    type: 'echomail',
    sender_address: '',
    timestamp: Math.floor((post.timestamp || 0) / 1000),
    data: JSON.stringify({
      subject: post.title || '',
      body: post.body || '',
      attachments: post.attachments || [],
    }),
  }
}

/**
 * Resolve the full stored message of a selection entry: the in-memory echo
 * store first, then IndexedDB (the echo may not be loaded at all).
 * @param {object} entry - selection entry
 * @returns {Promise<object|null>}
 */
export async function resolveSelectedMessage(entry) {
  if (!entry?.message_id || !entry.echo_name) return null
  // Blog posts live in the client's blog store, not in an echo.
  if (String(entry.message_id).startsWith('blog_')) {
    try {
      const blogStore = await import('../services/blogStore')
      const posts = await blogStore.getAllBlogPosts()
      const post = posts.find(p => p.id === entry.message_id)
      if (post) return blogPostAsMessage(post)
    } catch (err) {
      console.warn('[selected] blog resolve failed', err)
    }
  }
  const { useEchoStore } = await import('../stores/echo')
  const echoStore = useEchoStore()
  const inMemory = (echoStore.messages[entry.echo_name] || [])
    .find(m => m.message_id === entry.message_id)
  if (inMemory) return inMemory

  const db = await import('../services/db')
  const { decodeJwsPayload } = await import('../services/crypto')
  // Netmail folders keep their messages in `netmail_<folder>`, but the client
  // also aggregates every netmail copy in `__netmail__` (sent copies live only
  // there), so try both.
  const stores = [entry.echo_name]
  if (String(entry.echo_name).startsWith('netmail_')) stores.push('__netmail__')
  for (const store of stores) {
    try {
      const stored = await db.getMessage(store, entry.message_id)
      if (stored) {
        if (!stored.data && stored.jws) stored.data = decodeJwsPayload(stored.jws)
        return stored
      }
    } catch (err) {
      console.warn('[selected] resolve failed', err)
    }
  }
  return null
}
