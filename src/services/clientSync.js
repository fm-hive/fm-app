// Client synchronize: sync several clients (devices) of one address.
//
// The node stores named, append-only, encrypted containers per address
// (request:"client_synchronize", node setting client_synchronize). This module:
//   - keeps a per-browser client id (fm_client_id),
//   - registers it in the client_synchronize container (the client list),
//   - uploads the messages this client received to the other clients'
//     containers (outbound_client_<clientID>),
//   - consumes this client's own container.
//
// All container payloads are encrypted with the user's public key, so only
// clients holding the address's private key can read them.
import { apiService } from './api'
import * as crypto from './crypto'

const CLIENT_ID_KEY = 'fm_client_id'
const KNOWN_CLIENTS_KEY = 'fm_client_sync_known'
const CLIENT_ACKS_KEY = 'fm_client_sync_acks'
const CLIENT_APPENDS_KEY = 'fm_client_sync_appends'
// Matches the node's per-request cap for a batched append.
const CLIENT_APPEND_BATCH = 200
// Keep the HTTP body under the node's max_request_bytes (default 10 MiB).
const CLIENT_APPEND_BATCH_BYTES = 4 * 1024 * 1024
export const LIST_CONTAINER = 'client_synchronize'
export const CLIENT_CONTAINER_PREFIX = 'outbound_client_'

let syncEnabled = false
let clientId = null
let registered = false
let registerPromise = null
let justRegistered = false
let clientsCache = []
let clientListLoaded = false
// Batched appends and ACKs: one client_synchronize request per poll instead
// of one request per operation and target device.
let pendingAppends = loadPendingAppends()
let batchDepth = 0
let pendingClientAcks = loadPendingClientAcks()
// Whether the node accepts client_sync_append inside send_receive (stage 2).
// Older nodes do not advertise it, and the client falls back to the dedicated
// client_synchronize append.
let syncAppendSupported = false

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch { /* ignore */ }
  const bytes = new Uint8Array(16)
  try { globalThis.crypto.getRandomValues(bytes) } catch { /* ignore */ }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Stable per-browser client id (persisted in localStorage). */
export function getClientId() {
  if (clientId) return clientId
  try {
    clientId = localStorage.getItem(CLIENT_ID_KEY)
    if (!clientId) {
      clientId = randomId()
      localStorage.setItem(CLIENT_ID_KEY, clientId)
    }
  } catch {
    clientId = 'client'
  }
  return clientId
}

/** Remember whether the node has client_synchronize enabled. */
export function setSyncEnabled(enabled) {
  syncEnabled = !!enabled
}

export function isSyncEnabled() {
  return syncEnabled
}

/** Remember whether send_receive can carry client_sync_append. */
export function setSyncAppendSupported(enabled) {
  syncAppendSupported = !!enabled
}

export function isSyncAppendSupported() {
  return syncAppendSupported
}

async function identityStore() {
  const { useIdentityStore } = await import('../stores/identity')
  return useIdentityStore()
}

/**
 * Whether container payloads are additionally encrypted with the user's own key
 * before they are sent to the node (privacy.encryptClientSync, on by default).
 * With it off the node still encrypts the payload with the user's public key.
 */
async function clientSideEncryptionEnabled() {
  try {
    const { useSettingsStore } = await import('../stores/settings')
    return useSettingsStore().privacy?.encryptClientSync !== false
  } catch {
    return true
  }
}

async function encryptPayload(obj) {
  const json = JSON.stringify(obj)
  if (!(await clientSideEncryptionEnabled())) return json
  const identity = await identityStore()
  if (!identity.x25519PublicKey) throw new Error('no user public key')
  const bytes = new TextEncoder().encode(json)
  return crypto.encryptJWE(bytes, identity.x25519PublicKey)
}

async function decryptPayload(jwe) {
  const identity = await identityStore()
  if (!identity.x25519PrivateKey) throw new Error('no user private key')
  // The node wraps the client-encrypted payload with the user's public key, so
  // two layers are removed: the node layer and then the client layer.
  const outer = await crypto.decryptJWE(jwe, identity.x25519PrivateKey)
  const outerText = new TextDecoder().decode(outer)
  try {
    return JSON.parse(outerText)
  } catch {
    const inner = await crypto.decryptJWE(outerText, identity.x25519PrivateKey)
    return JSON.parse(new TextDecoder().decode(inner))
  }
}

async function readContainer(name) {
  const response = await apiService.clientSynchronize({ action: 'read', name })
  return response?.entries || []
}

function loadPendingAppends() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIENT_APPENDS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(entry => entry && typeof entry.name === 'string' && typeof entry.payload === 'string')
      .map(entry => ({ name: entry.name, payload: entry.payload }))
  } catch {
    return []
  }
}

function savePendingAppends() {
  try {
    localStorage.setItem(CLIENT_APPENDS_KEY, JSON.stringify(pendingAppends))
  } catch { /* ignore */ }
}

function loadPendingClientAcks() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIENT_ACKS_KEY) || '{}')
    const out = {}
    for (const [name, ids] of Object.entries(raw)) {
      if (!name || !Array.isArray(ids)) continue
      const clean = ids.map(Number).filter(id => Number.isFinite(id))
      if (clean.length > 0) out[name] = clean
    }
    return out
  } catch {
    return {}
  }
}

function savePendingClientAcks() {
  try {
    localStorage.setItem(CLIENT_ACKS_KEY, JSON.stringify(pendingClientAcks))
  } catch { /* ignore */ }
}

/**
 * Queue entries read from this client's own container for the next
 * send_receive. The node accepts them as `client_container_ack` and deletes
 * the entries in the same request as the next poll.
 */
export function queueClientContainerAcks(name, ids) {
  if (!name || !ids || ids.length === 0) return
  const set = new Set(pendingClientAcks[name] || [])
  for (const id of ids) {
    const value = Number(id)
    if (Number.isFinite(value)) set.add(value)
  }
  pendingClientAcks[name] = [...set]
  savePendingClientAcks()
}

/** Take the pending ACKs for the next send_receive request. */
export function takeClientContainerAcks() {
  const acks = Object.entries(pendingClientAcks)
    .map(([name, ids]) => ({ name, ids: [...ids] }))
    .filter(ack => ack.ids.length > 0)
  pendingClientAcks = {}
  savePendingClientAcks()
  return acks
}

/** Put ACKs back when the send_receive request failed. */
export function restoreClientContainerAcks(acks) {
  for (const ack of acks || []) {
    queueClientContainerAcks(ack.name, ack.ids)
  }
}

/**
 * Take a prefix of the append queue for the next send_receive. The rest stays
 * queued so one poll never exceeds the node's count/body limits.
 */
export function takeClientAppends() {
  const entries = []
  let bytes = 0
  while (pendingAppends.length > 0 && entries.length < CLIENT_APPEND_BATCH) {
    const next = pendingAppends[0]
    const size = (next.payload || '').length
    if (entries.length > 0 && bytes + size > CLIENT_APPEND_BATCH_BYTES) break
    pendingAppends.shift()
    entries.push(next)
    bytes += size
  }
  if (entries.length > 0) savePendingAppends()
  return entries
}

/** Put appends back when the send_receive request failed. */
export function restoreClientAppends(entries) {
  if (!entries || entries.length === 0) return
  pendingAppends = entries.concat(pendingAppends)
  savePendingAppends()
}

/**
 * Queue an encrypted op for the next batched append. The payload is encrypted
 * once and reused for every target container of this address.
 */
function enqueueAppend(name, payload) {
  if (!syncEnabled || !name || !payload) return false
  pendingAppends.push({ name, payload })
  savePendingAppends()
  return true
}

/** Splits entries by count and by an approximate body-size budget. */
function appendChunks(entries) {
  const chunks = []
  let current = []
  let bytes = 0
  for (const entry of entries) {
    const size = (entry.payload || '').length
    if (current.length > 0 &&
        (current.length >= CLIENT_APPEND_BATCH || bytes + size > CLIENT_APPEND_BATCH_BYTES)) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(entry)
    bytes += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** Send all queued appends in one `client_synchronize` request. */
export async function flushClientAppends() {
  if (!syncEnabled) {
    pendingAppends = []
    savePendingAppends()
    return 0
  }
  if (pendingAppends.length === 0) return 0
  const entries = pendingAppends
  pendingAppends = []
  savePendingAppends()
  let sent = 0
  try {
    for (const chunk of appendChunks(entries)) {
      await apiService.clientSynchronize({ action: 'append', entries: chunk })
      sent += chunk.length
    }
    return sent
  } catch (err) {
    // Keep the unsent part of the queue for the next poll; do not lose
    // operations on a flaky network.
    pendingAppends = entries.slice(sent).concat(pendingAppends)
    savePendingAppends()
    console.warn('[clientSync] batch append failed:', err.message)
    return 0
  }
}

/** Start a batch: nested endClientSyncBatch calls flush only at depth 0. */
export function beginClientSyncBatch() {
  batchDepth++
}

/**
 * Finish a batch. The outermost call flushes only when [flush] is true: with
 * embedded appends the queue is kept for the next send_receive instead.
 */
export async function endClientSyncBatch(flush = true) {
  batchDepth = Math.max(0, batchDepth - 1)
  if (batchDepth === 0 && flush) await flushClientAppends()
}

async function appendEntry(name, obj) {
  if (!syncEnabled) return false
  const payload = await encryptPayload(obj)
  return enqueueAppend(name, payload)
}

/**
 * Queue an arbitrary op for a client-sync container. Used by the refill
 * protocol; the caller flushes or lets the next poll send it.
 */
export async function enqueueClientSyncOp(name, obj) {
  return appendEntry(name, obj)
}

/**
 * Read the client list: entries {op:"add"|"remove", client} are applied in
 * order, so the result is the set of currently registered clients.
 */
export async function listClients() {
  const entries = await readContainer(LIST_CONTAINER)
  const set = new Set()
  for (const entry of entries) {
    try {
      const op = await decryptPayload(entry.payload)
      if (!op || !op.client) continue
      if (op.op === 'remove') set.delete(op.client)
      else set.add(op.client)
    } catch {
      // Undecryptable entry (another key) — ignore.
    }
  }
  clientsCache = [...set]
  clientListLoaded = true
  return clientsCache
}

/** Register this client in the list (once per session). */
export async function ensureRegistered() {
  if (!syncEnabled) return clientsCache
  if (registered) return clientsCache
  // Several fetches may run concurrently — register only once.
  if (registerPromise) return registerPromise
  registerPromise = (async () => {
    const id = getClientId()
    // The list may already be known from the send_receive response.
    let clients = clientsCache
    if (!clientListLoaded && clients.length === 0) {
      clients = await listClients()
    }
    if (!clients.includes(id)) {
      await appendEntry(LIST_CONTAINER, { op: 'add', client: id })
      clientsCache = [...clients, id]
      justRegistered = true
    }
    registered = true
    return clientsCache
  })().finally(() => {
    registerPromise = null
  })
  return registerPromise
}

/**
 * Send one operation to every other client's container. Ops used by the app:
 * {op:"message", message} — a message this client received;
 * {op:"sent", message}    — a sent netmail copy;
 * {op:"blog"|"blogPost", ...} / {op:"blogDelete"|"blogPostDelete", id}.
 * Returns the number of uploaded entries.
 */
export async function broadcastOp(op) {
  if (!syncEnabled || !op) return 0
  await ensureRegistered()
  // The client list is refreshed from the send_receive response every poll;
  // fetch it here only when nothing is known yet (e.g. an outbox send between
  // polls right after the start).
  let clients = clientsCache
  if (!clientListLoaded && clients.length === 0) {
    try {
      clients = await listClients()
    } catch (err) {
      console.warn('[clientSync] client list refresh failed:', err.message)
    }
  }
  const me = getClientId()
  const others = clients.filter(id => id && id !== me)
  if (others.length === 0) {
    // A registration append may still be queued.
    if (batchDepth === 0) await flushClientAppends()
    return 0
  }

  let payload
  try {
    // Encrypt once: the same ciphertext is valid for every target container
    // of this address (the node re-encrypts it with the user's key anyway).
    payload = await encryptPayload(op)
  } catch (err) {
    console.warn('[clientSync] upload failed:', err.message)
    if (batchDepth === 0) await flushClientAppends()
    return 0
  }
  for (const other of others) {
    enqueueAppend(CLIENT_CONTAINER_PREFIX + other, payload)
  }
  if (batchDepth === 0) await flushClientAppends()
  return others.length
}

/** Upload the messages received by this client to every other client. */
export async function uploadToOtherClients(messages) {
  if (!syncEnabled || !messages || messages.length === 0) return 0
  beginClientSyncBatch()
  try {
    let uploaded = 0
    for (const message of messages) {
      uploaded += await broadcastOp({ op: 'message', message })
    }
    return uploaded
  } finally {
    await endClientSyncBatch()
  }
}

/**
 * Read this client's own container: returns the ops and ACKs (deletes) the
 * consumed entries.
 */
export async function pollOwnContainer() {
  if (!syncEnabled) return []
  const me = getClientId()
  const name = CLIENT_CONTAINER_PREFIX + me

  let entries = []
  try {
    entries = await readContainer(name)
  } catch (err) {
    console.warn('[clientSync] container read failed:', err.message)
    return []
  }
  if (entries.length === 0) return []

  const ops = []
  const ids = []
  for (const entry of entries) {
    ids.push(entry.id)
    try {
      const op = await decryptPayload(entry.payload)
      if (op && op.op) ops.push(op)
    } catch {
      // Undecryptable entry — ACK it anyway so it is not retried forever.
    }
  }
  queueClientContainerAcks(name, ids)
  return ops
}

/**
 * Apply the client list entries embedded in a send_receive response (issue
 * #257): the list is refreshed in the poll request itself, no extra read.
 */
export async function applyClientListEntries(entries) {
  if (!Array.isArray(entries)) return clientsCache
  const set = new Set()
  for (const entry of entries) {
    try {
      const op = await decryptPayload(entry.payload)
      if (!op || !op.client) continue
      if (op.op === 'remove') set.delete(op.client)
      else set.add(op.client)
    } catch {
      // Undecryptable entry (another key) — ignore.
    }
  }
  clientsCache = [...set]
  clientListLoaded = true
  return clientsCache
}

/**
 * Apply this client's own container entries embedded in a send_receive
 * response: decrypt them, ACK the entries and return the ops to process.
 */
export async function applyOwnContainerEntries(name, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return []
  const ops = []
  const ids = []
  for (const entry of entries) {
    ids.push(entry.id)
    try {
      const op = await decryptPayload(entry.payload)
      if (op && op.op) ops.push(op)
    } catch {
      // Undecryptable entry — ACK it anyway so it is not retried forever.
    }
  }
  queueClientContainerAcks(name, ids)
  return ops
}

/**
 * Client ids seen for the first time (and remembered in localStorage). Used to
 * share this client's history with a newly joined client.
 */
let checkNewClientsPromise = null

export async function checkNewClients() {
  if (!syncEnabled) return []
  if (checkNewClientsPromise) return checkNewClientsPromise
  checkNewClientsPromise = doCheckNewClients().finally(() => { checkNewClientsPromise = null })
  return checkNewClientsPromise
}

async function doCheckNewClients() {
  // The list comes from the send_receive response; only fetch it when nothing
  // is known yet.
  let clients = clientsCache
  if (!clientListLoaded && clients.length === 0) {
    try {
      clients = await listClients()
    } catch (err) {
      console.warn('[clientSync] client list refresh failed:', err.message)
      return []
    }
  }
  let known = []
  try {
    known = JSON.parse(localStorage.getItem(KNOWN_CLIENTS_KEY) || '[]')
  } catch {
    known = []
  }
  const knownSet = new Set(known)
  const fresh = clients.filter(id => id && !knownSet.has(id))
  if (fresh.length > 0) {
    try {
      localStorage.setItem(KNOWN_CLIENTS_KEY, JSON.stringify([...new Set([...known, ...clients])]))
    } catch { /* ignore */ }
  }
  return fresh
}

/** True once, right after this client registered itself (history upload hook). */
export function consumeJustRegistered() {
  const value = justRegistered
  justRegistered = false
  return value
}

/** Remove this client from the list (best effort, e.g. on logout). */
export async function unregisterSelf() {
  if (!syncEnabled) return
  try {
    await appendEntry(LIST_CONTAINER, { op: 'remove', client: getClientId() })
    await flushClientAppends()
    registered = false
  } catch (err) {
    console.warn('[clientSync] unregister failed:', err.message)
  }
}

/** Reset in-memory state (tests). */
export function resetClientSync() {
  syncEnabled = false
  clientId = null
  registered = false
  registerPromise = null
  justRegistered = false
  clientsCache = []
  clientListLoaded = false
  pendingAppends = []
  batchDepth = 0
  pendingClientAcks = {}
  syncAppendSupported = false
  try {
    localStorage.removeItem(CLIENT_ACKS_KEY)
    localStorage.removeItem(CLIENT_APPENDS_KEY)
  } catch { /* ignore */ }
}
