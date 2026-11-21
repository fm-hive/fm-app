// Refill between the clients (devices) of one address (#387).
//
// The requester creates a one-time container refill_client_<requesterID> and
// asks every other client (through its normal outbound_client_<id> queue) to
// dump its complete local mailbox there. Responders send chunks plus a
// refillDone marker; the requester imports the chunks with the usual echo-store
// de-duplication and ACKs the consumed container entries.
import { reactive } from 'vue'
import {
  CLIENT_CONTAINER_PREFIX,
  getClientId,
  isSyncEnabled,
  ensureRegistered,
  listClients,
  enqueueClientSyncOp,
  flushClientAppends,
} from './clientSync'

export const REFILL_CONTAINER_PREFIX = 'refill_client_'
const ACTIVE_KEY = 'fm_client_refill_active'
const SERVED_KEY = 'fm_client_refill_served'
const TIMEOUT_MS = 2 * 60 * 1000
const CHUNK_MESSAGES = 50
const CHUNK_BYTES = 256 * 1024
// Small enough to keep one send_receive response manageable while a bulk
// container is drained over several polls.
export const REFILL_READ_LIMIT = 10

export const clientRefillState = reactive({
  status: 'idle', // idle | waiting | receiving | done | partial | no_clients | error
  active: false,
  requestId: '',
  container: '',
  expected: 0,
  done: 0,
  messages: 0,
  startedAt: 0,
  error: '',
})

let activeRefill = null

function uniqueId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch { /* ignore */ }
  return `refill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadServed() {
  try {
    const raw = JSON.parse(localStorage.getItem(SERVED_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
}

function markServed(requestId) {
  const served = loadServed()
  if (!served.includes(requestId)) served.push(requestId)
  try {
    localStorage.setItem(SERVED_KEY, JSON.stringify(served.slice(-50)))
  } catch { /* ignore */ }
}

function persistActiveRefill() {
  if (!activeRefill) {
    try { localStorage.removeItem(ACTIVE_KEY) } catch { /* ignore */ }
    return
  }
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeRefill))
  } catch { /* ignore */ }
}

function syncState() {
  if (!activeRefill) {
    clientRefillState.active = false
    clientRefillState.requestId = ''
    clientRefillState.container = ''
    clientRefillState.expected = 0
    clientRefillState.done = 0
    clientRefillState.messages = 0
    clientRefillState.startedAt = 0
    return
  }
  clientRefillState.active = true
  clientRefillState.requestId = activeRefill.requestId
  clientRefillState.container = activeRefill.container
  clientRefillState.expected = activeRefill.expected.length
  clientRefillState.done = activeRefill.done.length
  clientRefillState.messages = activeRefill.messages
  clientRefillState.startedAt = activeRefill.startedAt
}

function finishClientRefill(status) {
  if (activeRefill) {
    clientRefillState.messages = activeRefill.messages
    clientRefillState.expected = activeRefill.expected.length
    clientRefillState.done = activeRefill.done.length
  }
  clientRefillState.status = status
  clientRefillState.active = false
  clientRefillState.error = ''
  activeRefill = null
  persistActiveRefill()
}

/** Rehydrate the active request after a page reload. */
export function loadClientRefillState() {
  if (activeRefill) return clientRefillState
  try {
    const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null')
    if (!raw || !raw.requestId || !raw.container || !Array.isArray(raw.expected)) {
      syncState()
      return clientRefillState
    }
    activeRefill = {
      requestId: raw.requestId,
      container: raw.container,
      expected: raw.expected.filter(id => typeof id === 'string'),
      done: Array.isArray(raw.done) ? raw.done.filter(id => typeof id === 'string') : [],
      messages: Number(raw.messages) || 0,
      startedAt: Number(raw.startedAt) || Date.now(),
    }
    syncState()
    clientRefillState.status = activeRefill.done.length > 0 ? 'receiving' : 'waiting'
    if (Date.now() - activeRefill.startedAt > TIMEOUT_MS) {
      finishClientRefill('partial')
    }
  } catch {
    syncState()
  }
  return clientRefillState
}

/** Read spec for send_receive while a refill is active. */
export function getRefillReadSpec() {
  if (!activeRefill) return null
  if (Date.now() - activeRefill.startedAt > TIMEOUT_MS) {
    finishClientRefill('partial')
    return null
  }
  return { name: activeRefill.container, limit: REFILL_READ_LIMIT }
}

/** Ask all other clients of this address for their full mailbox. */
export async function startClientRefill() {
  if (!isSyncEnabled()) {
    clientRefillState.status = 'error'
    clientRefillState.error = 'disabled'
    return clientRefillState
  }
  if (activeRefill) return clientRefillState
  await ensureRegistered()
  let clients = []
  try {
    clients = await listClients()
  } catch (err) {
    console.warn('[clientRefill] client list failed:', err.message)
  }
  const me = getClientId()
  const others = clients.filter(id => id && id !== me)
  if (others.length === 0) {
    clientRefillState.status = 'no_clients'
    clientRefillState.error = ''
    return clientRefillState
  }
  const requestId = uniqueId()
  const container = REFILL_CONTAINER_PREFIX + me
  activeRefill = {
    requestId,
    container,
    expected: [...others],
    done: [],
    messages: 0,
    startedAt: Date.now(),
  }
  clientRefillState.status = 'waiting'
  clientRefillState.error = ''
  syncState()
  persistActiveRefill()

  const op = {
    op: 'refillRequest',
    requestId,
    from: me,
    container,
    createdAt: Date.now(),
  }
  let queued = 0
  for (const other of others) {
    try {
      if (await enqueueClientSyncOp(CLIENT_CONTAINER_PREFIX + other, op)) queued++
    } catch (err) {
      console.warn('[clientRefill] request enqueue failed:', err.message)
    }
  }
  if (queued === 0) {
    finishClientRefill('error')
    clientRefillState.error = 'queue'
    return clientRefillState
  }
  await flushClientAppends()
  return clientRefillState
}

/** Stop waiting and forget the active request (leftover entries expire on the node). */
export function cancelClientRefill() {
  finishClientRefill('idle')
  clientRefillState.error = ''
}

/** Collect this client's complete local mail from IndexedDB. */
async function collectAllMail() {
  const db = await import('./db')
  const conn = await db.openReadConnection()
  const items = []
  try {
    const stores = Array.from(conn.objectStoreNames)
      .filter(name => name === '__netmail__' || name.startsWith('echo_'))
    for (const storeName of stores) {
      const messages = await new Promise((resolve, reject) => {
        const tx = conn.transaction(storeName, 'readonly')
        const request = tx.objectStore(storeName).getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
      for (const message of messages) {
        if (message && message.message_id) items.push({ store: storeName, message })
      }
    }
  } finally {
    try { conn.close() } catch { /* ignore */ }
  }
  return items
}

function buildRefillChunks(items) {
  const chunks = []
  let current = []
  let bytes = 0
  for (const item of items) {
    const size = JSON.stringify(item).length
    if (current.length > 0 &&
        (current.length >= CHUNK_MESSAGES || bytes + size > CHUNK_BYTES)) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(item)
    bytes += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/**
 * Handle a refillRequest delivered through this client's own queue. The full
 * mailbox is written once into the requester's refill container.
 */
export async function respondToRefillRequest(op) {
  if (!isSyncEnabled() || !op || op.op !== 'refillRequest') return 0
  const requestId = String(op.requestId || '')
  const from = String(op.from || '')
  if (!requestId || !from || from === getClientId()) return 0
  const container = REFILL_CONTAINER_PREFIX + from
  if (op.container && op.container !== container) return 0
  if (loadServed().includes(requestId)) return 0

  const items = await collectAllMail()
  const chunks = buildRefillChunks(items)
  const me = getClientId()
  let queued = 0
  for (let index = 0; index < chunks.length; index++) {
    const queuedOk = await enqueueClientSyncOp(container, {
      op: 'refillChunk',
      requestId,
      from: me,
      index,
      entries: chunks[index],
    })
    if (queuedOk) queued++
  }
  const doneOk = await enqueueClientSyncOp(container, {
    op: 'refillDone',
    requestId,
    from: me,
    messages: items.length,
    chunks: chunks.length,
  })
  if (doneOk) queued++
  markServed(requestId)
  // The poll's outer batch flushes these appends (embedded next poll on a
  // stage-2 node, or one batched client_synchronize otherwise).
  return items.length
}

/** Import refill chunk entries into the echo store (dedup by message_id). */
async function importRefillEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0
  const { useEchoStore } = await import('../stores/echo')
  const echo = useEchoStore()
  const byStore = new Map()
  for (const item of entries) {
    if (!item || typeof item.store !== 'string' || !item.message) continue
    if (item.store !== '__netmail__' && !item.store.startsWith('echo_')) continue
    if (!byStore.has(item.store)) byStore.set(item.store, [])
    byStore.get(item.store).push(item.message)
  }
  let imported = 0
  for (const [store, messages] of byStore) {
    const echoName = store === '__netmail__' ? '__netmail__' : store.slice('echo_'.length)
    try {
      await echo.addMessages(echoName, messages)
      imported += messages.length
    } catch (err) {
      console.warn('[clientRefill] import failed:', echoName, err.message)
    }
  }
  return imported
}

/** Apply ops read from the requester's refill container. */
export async function applyRefillOps(ops) {
  if (!activeRefill || !Array.isArray(ops) || ops.length === 0) return 0
  let imported = 0
  for (const op of ops) {
    if (!op || op.requestId !== activeRefill.requestId) continue
    if (op.op === 'refillChunk') {
      imported += await importRefillEntries(op.entries)
    } else if (op.op === 'refillDone') {
      const from = String(op.from || '')
      if (from && !activeRefill.done.includes(from)) activeRefill.done.push(from)
    }
  }
  if (imported > 0) {
    activeRefill.messages += imported
    clientRefillState.status = 'receiving'
  }
  syncState()
  persistActiveRefill()
  if (activeRefill.done.length >= activeRefill.expected.length) {
    finishClientRefill('done')
  }
  return imported
}

/** Reset module/local state (tests and logout). */
export function resetClientRefill() {
  activeRefill = null
  clientRefillState.status = 'idle'
  clientRefillState.active = false
  clientRefillState.error = ''
  clientRefillState.messages = 0
  clientRefillState.expected = 0
  clientRefillState.done = 0
  try {
    localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(SERVED_KEY)
  } catch { /* ignore */ }
}
