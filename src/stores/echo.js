import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useIdentityStore } from './identity'
import { useNamesStore } from './names'
import * as db from '../services/db'
import { decodeJwsPayload } from '../services/crypto'
import { loadEchoGroups, saveEchoGroups, renameEchoInGroups } from '../utils/echoGroups'

const MAX_MSGS_PER_ECHO = 500
const MAX_LOADED_ECHOES = 5
const ECHO_CATALOG_KEY = 'fm_echo_catalog'

export const useEchoStore = defineStore('echo', () => {
  const echoes = ref([])
  const subscribedEchoes = ref([])
  const messages = ref({})
  const loading = ref(false)
  const error = ref(null)
  // Old name -> new name for conferences renamed on the node. Echoes.vue uses
  // this to keep the open conference selected after refresh.
  const renamedEchoes = ref({})
  const lastReadTimestamps = ref(loadLastReadTimestamps())
  const dismissedMessages = ref(loadDismissed())
  const hideDismissed = ref(true)
  // Показывать ли ленту сгруппированной в нити бесед (#287).
  const showThreads = ref(loadShowThreads())
  watch(showThreads, (v) => {
    try { localStorage.setItem('fm_show_threads', String(v)) } catch { /* ignore */ }
  })
  const lastReadNetmailTimestamp = ref(loadLastReadNetmailTimestamp())
  const seenEchoNames = ref(loadSeenEchoNames())

  const loadedEchoes = new Map() // echoName -> lastAccessTime (для LRU выгрузки)

  function loadLastReadNetmailTimestamp() {
    try { return parseInt(localStorage.getItem('fm_netmail_last_read') || '0', 10) }
    catch { return 0 }
  }
  function saveLastReadNetmailTimestamp() {
    try { localStorage.setItem('fm_netmail_last_read', String(lastReadNetmailTimestamp.value)) }
    catch { /* ignore */ }
  }
  function loadLastReadTimestamps() {
    try { return JSON.parse(localStorage.getItem('fm_echo_last_read') || '{}') } catch { return {} }
  }
  function saveLastReadTimestamps() {
    try { localStorage.setItem('fm_echo_last_read', JSON.stringify(lastReadTimestamps.value)) } catch { /* ignore */ }
  }
  function loadDismissed() {
    try { return JSON.parse(localStorage.getItem('fm_dismissed_messages') || '[]') } catch { return [] }
  }
  function loadShowThreads() {
    try { return localStorage.getItem('fm_show_threads') !== 'false' } catch { return true }
  }
  function saveDismissed() {
    try { localStorage.setItem('fm_dismissed_messages', JSON.stringify(dismissedMessages.value)) } catch { /* ignore */ }
  }
  function loadSeenEchoNames() {
    try { return JSON.parse(localStorage.getItem('fm_echo_seen') || '[]') } catch { return [] }
  }
  function saveSeenEchoNames() {
    try { localStorage.setItem('fm_echo_seen', JSON.stringify(seenEchoNames.value)) } catch { /* ignore */ }
  }
  // Echo IDs are stable across renames; the catalog remembers the last known
  // name for every ID so a rename is detected even after an app restart.
  function loadEchoCatalog() {
    try { return JSON.parse(localStorage.getItem(ECHO_CATALOG_KEY) || '{}') } catch { return {} }
  }
  function saveEchoCatalog(catalog) {
    try { localStorage.setItem(ECHO_CATALOG_KEY, JSON.stringify(catalog)) } catch { /* ignore */ }
  }

  function dismissMessage(messageId) {
    if (!dismissedMessages.value.includes(messageId)) {
      dismissedMessages.value.push(messageId)
      saveDismissed()
    }
  }

  const totalUnread = computed(() => {
    let count = 0
    for (const echoName in messages.value) {
      const lastRead = lastReadTimestamps.value[echoName] || 0
      if (messages.value[echoName]) {
        count += messages.value[echoName].filter(m => m.timestamp > lastRead).length
      }
    }
    return count
  })

  const netmailUnreadCount = computed(() => {
    const identity = useIdentityStore()
    let count = 0
    const ts = lastReadNetmailTimestamp.value
    for (const echoName in messages.value) {
      for (const msg of messages.value[echoName]) {
        if (msg.type === 'netmail' && msg.sender_address !== identity.user?.address && msg.timestamp > ts) {
          count++
        }
      }
    }
    return count
  })

  /** Непрочитанные по эхам (echomail/protocol), без netmail — для бейджа «Эхо» */
  const echoUnreadCount = computed(() => {
    let count = 0
    for (const echoName in messages.value) {
      if (echoName === '__netmail__') continue
      count += unreadCount(echoName)
    }
    return count
  })

  /** Максимальный timestamp среди загруженных сообщений эхи (или 0) */
  function maxMsgTimestamp(echoName) {
    const msgs = messages.value[echoName]
    if (!msgs || msgs.length === 0) return 0
    return msgs.reduce((max, m) => (typeof m.timestamp === 'number' && m.timestamp > max ? m.timestamp : max), 0)
  }

  /** Максимальный timestamp среди входящих (не своих) netmail-сообщений */
  function maxNetmailTimestamp() {
    const identity = useIdentityStore()
    let max = 0
    for (const echoName in messages.value) {
      for (const msg of messages.value[echoName]) {
        if (msg.type === 'netmail' && msg.sender_address !== identity.user?.address
            && typeof msg.timestamp === 'number' && msg.timestamp > max) {
          max = msg.timestamp
        }
      }
    }
    return max
  }

  function markNetmailRead() {
    // Все уже загруженные входящие netmail считаем прочитанными. Используем максимум
    // по их timestamp (а не Date.now()), чтобы не зависеть от рассинхрона часов.
    const now = Math.floor(Date.now() / 1000)
    lastReadNetmailTimestamp.value = Math.max(now, maxNetmailTimestamp())
    saveLastReadNetmailTimestamp()
  }

  const subscribedEchoesList = computed(() => {
    return echoes.value.filter(echo => subscribedEchoes.value.includes(echo.name))
  })

  /** Разобранные правила эхи (объект) или null */
  function getEchoRules(echoName) {
    const item = echoes.value.find(e => e.name === echoName)
    if (!item?.rules) return null
    try {
      return typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules
    } catch {
      return null
    }
  }

  /** Является ли текущий пользователь модератором указанной эхи (по её правилам) */
  function isModeratorOf(echoName) {
    const identity = useIdentityStore()
    const address = identity.user?.address
    if (!address || !echoName) return false
    const rules = getEchoRules(echoName)
    if (!rules) return false
    const mods = rules.parameters?.moderators || rules.moderators
    return Array.isArray(mods) && mods.includes(address)
  }

  // ---- Lazy-load из IndexedDB ----

  function touchEcho(echoName) {
    loadedEchoes.set(echoName, Date.now())
  }

  function unloadEcho(echoName) {
    delete messages.value[echoName]
    loadedEchoes.delete(echoName)
  }

  function evictIfNeeded() {
    if (loadedEchoes.size <= MAX_LOADED_ECHOES) return
    const sorted = [...loadedEchoes.entries()].sort((a, b) => a[1] - b[1])
    const toEvict = sorted.slice(0, loadedEchoes.size - MAX_LOADED_ECHOES)
    for (const [name] of toEvict) {
      unloadEcho(name)
    }
  }

  /** Загрузить сообщения для эхи из IndexedDB в memory */
  /** Read stored messages, retrying once: the first read on a fresh page can
   * race the IndexedDB open (deep link to a message, issue #274). */
  async function readStoredMessages(echoName) {
    try {
      return await db.getAllMessages(echoName)
    } catch (e) {
      console.warn('[echo] loadEcho read failed, retrying', echoName, e)
      await new Promise(resolve => setTimeout(resolve, 150))
      return db.getAllMessages(echoName)
    }
  }

  async function loadEcho(echoName) {
    if (loadedEchoes.has(echoName)) {
      touchEcho(echoName)
      return
    }
    loading.value = true
    try {
      const stored = await readStoredMessages(echoName)
      // Drop node election phase notices persisted by older versions; they are
      // shown in the protocols panel, not the feed.
      const msgs = (stored || []).filter(m => {
        try { const d = JSON.parse(m.data); return !(m.type === 'election' && d.type === 'phase') } catch { return true }
      })
      messages.value = { ...messages.value, [echoName]: msgs }
      for (const m of msgs) learnSenderName(m)
      // Updates that arrived while the original was not in memory were stored
      // as normal messages: fold them back into their originals (#303).
      await reconcileUpdates(echoName)
      // Mark as loaded only after a successful read: a transient error must not
      // cache an empty echo until it is reselected (deep-link reload, #274).
      touchEcho(echoName)
    } catch (e) {
      console.warn('[echo] loadEcho failed, will retry on next access', echoName, e)
    }
    evictIfNeeded()
    loading.value = false
  }

  /** Выгрузить эху из memory (данные остаются в IndexedDB) */
  function unload(echoName) {
    unloadEcho(echoName)
  }

  /** Извлечь sender_name из data и запомнить его для адреса отправителя */
  function learnSenderName(message) {
    if (!message || !message.sender_address || !message.data) return
    try {
      const d = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
      if (d && typeof d.sender_name === 'string' && d.sender_name.trim()) {
        useNamesStore().record(message.sender_address, d.sender_name)
      }
    } catch { /* ignore */ }
  }

  // ---- CRUD ----

  /**
   * A plain message update (docs/service/echomail.md §Обновления сообщений):
   * the author re-sends the full text with updateMessageId pointing at the
   * original. Moderation/reaction updates carry their own fields and are
   * handled by their protocols.
   */
  function isPlainUpdate(d) {
    return !!(d && d.updateMessageId && !d.severity && !d.reaction && !d.proto)
  }

  /**
   * Resolve the update target in the store.
   * Returns { found: false } when the original is unknown (the update is then
   * kept as a normal message), { found: true, drop: true } for a foreign-author
   * update (only the author may edit a message — the update is discarded), and
   * { found: true, original } when it must be applied.
   *
   * The original is looked up in memory first, then in IndexedDB: after a page
   * reload (or an evicted echo) the original lives only in the local database,
   * and without this fallback the update would be kept as a separate message
   * and the edit history would be lost (#303).
   */
  async function resolveUpdateTarget(echoName, msg, d) {
    let original = (messages.value[echoName] || []).find(m => m.message_id === d.updateMessageId)
    if (!original) {
      try {
        const stored = await db.getMessage(echoName, d.updateMessageId)
        if (stored) {
          if (!stored.data && stored.jws) stored.data = decodeJwsPayload(stored.jws)
          original = stored
          // Hydrate the original into memory so the UI shows the updated text.
          if (!messages.value[echoName]) messages.value[echoName] = []
          if (!messages.value[echoName].some(m => m.message_id === original.message_id)) {
            messages.value[echoName].push(original)
            messages.value[echoName].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            learnSenderName(original)
          }
        }
      } catch (e) {
        console.warn('[echo] update target lookup failed', e)
      }
    }
    if (!original) return { found: false }
    if (original.sender_address !== msg.sender_address) {
      console.warn('[echo] ignoring message update from a different author', msg.message_id)
      return { found: true, drop: true }
    }
    return { found: true, original }
  }

  /**
   * Replace the original's content with the update's (same message ID) and keep
   * the previous copy in `_versions`, so the UI can show the edit history (#282).
   */
  function applyUpdate(original, msg) {
    if (original.message_id === msg.message_id) return false // never apply to itself
    if (original._update_message_id === msg.message_id) return false // already applied
    // A late-arriving older update must not roll the content back: keep it in
    // the history (sorted by time), but leave the newer text in place (#303).
    const incomingTs = msg.timestamp || 0
    const currentTs = original._edited_at || original.timestamp || 0
    if (incomingTs && currentTs && incomingTs < currentTs) {
      if (!Array.isArray(original._versions)) original._versions = []
      original._versions.push({
        data: msg.data,
        jws: msg.jws || '',
        timestamp: incomingTs,
        replaced_at: incomingTs,
      })
      original._versions.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      return true
    }
    if (!Array.isArray(original._versions)) original._versions = []
    original._versions.push({
      data: original.data,
      jws: original.jws || '',
      // When this version was created: the original post time for the first
      // version, the previous update's time afterwards.
      timestamp: original._versions.length === 0
        ? (original.timestamp || null)
        : (original._edited_at || original.timestamp || null),
      replaced_at: msg.timestamp || null,
    })
    original.data = msg.data
    if (msg.jws) original.jws = msg.jws
    original._edited = true
    original._edited_at = msg.timestamp || null
    original._update_message_id = msg.message_id
    return true
  }

  /**
   * IndexedDB structured clone cannot serialize Vue reactive proxies: messages
   * taken from the store (e.g. an update target) must be stored as plain data,
   * otherwise the whole batch write fails with DataCloneError (#303).
   */
  function plainMessage(message) {
    try {
      return JSON.parse(JSON.stringify(message))
    } catch {
      return message
    }
  }

  /**
   * Fold standalone updates into their originals (#303).
   *
   * A client that received an update while the original was not in memory kept
   * it as a normal message (see the fall-through in addMessages). This pass
   * re-applies such updates to their originals (oldest first), rebuilds
   * `_versions`, and removes the standalone copies from memory and IndexedDB.
   * It repairs both freshly received batches and clients that lost the history
   * before this fix.
   */
  async function reconcileUpdates(echoName) {
    const list = messages.value[echoName]
    if (!Array.isArray(list) || list.length === 0) return
    const byId = new Map(list.map(m => [m.message_id, m]))
    const pending = []
    for (const m of list) {
      // An already edited original carries the update's data, which points at
      // itself: it is not a standalone update.
      if (m._update_message_id || m._edited) continue
      let d = null
      try { d = JSON.parse(m.data) } catch { continue }
      if (!isPlainUpdate(d) || d.updateMessageId === m.message_id) continue
      const original = byId.get(d.updateMessageId)
      if (!original || original.sender_address !== m.sender_address) continue
      pending.push({ msg: m, targetId: d.updateMessageId })
    }
    if (pending.length === 0) return
    pending.sort((a, b) => (a.msg.timestamp || 0) - (b.msg.timestamp || 0))
    const changed = new Set()
    const removed = []
    for (const { msg, targetId } of pending) {
      const original = byId.get(targetId)
      if (!original) continue
      if (applyUpdate(original, msg)) changed.add(original)
      removed.push(msg.message_id)
    }
    if (removed.length > 0) {
      const removedSet = new Set(removed)
      messages.value[echoName] = list.filter(m => !removedSet.has(m.message_id))
      for (const id of removed) {
        try { await db.deleteMessage(echoName, id) } catch (e) { console.warn('[echo] db.delete failed', e) }
      }
    }
    for (const original of changed) {
      try { await db.putMessage(echoName, plainMessage(original)) } catch (e) { console.warn('[echo] db.put failed', e) }
    }
  }

  async function addMessage(echoName, message) {
    // data travels inside the JWS payload on the wire — recover it before use.
    if (message && !message.data && typeof message.jws === 'string' && message.jws) {
      message.data = decodeJwsPayload(message.jws)
    }
    if (!messages.value[echoName]) {
      messages.value[echoName] = []
    }
    let d = null
    try { d = JSON.parse(message.data) } catch {}
    if (isPlainUpdate(d)) {
      const target = await resolveUpdateTarget(echoName, message, d)
      if (target.found) {
        if (target.original && applyUpdate(target.original, message)) {
          try { await db.putMessage(echoName, plainMessage(target.original)) } catch (e) { console.warn('[echo] db.put failed', e) }
        }
        return // updates are never shown as separate messages
      }
    }
    if (!messages.value[echoName].some(m => m.message_id === message.message_id)) {
      messages.value[echoName].push(message)
      learnSenderName(message)
      messages.value[echoName].sort((a, b) => a.timestamp - b.timestamp)
      if (messages.value[echoName].length > MAX_MSGS_PER_ECHO) {
        messages.value[echoName] = messages.value[echoName].slice(-MAX_MSGS_PER_ECHO)
      }
      try {
        db.markStoreExists(echoName)
        await db.putMessage(echoName, plainMessage(message))
      } catch (e) {
        console.warn('[echo] db.put failed', e)
      }
      // A newly arrived original may resolve updates stored earlier (#303).
      await reconcileUpdates(echoName)
    }
  }

  async function addMessages(echoName, newMessages) {
    if (!messages.value[echoName]) {
      messages.value[echoName] = []
    }
    try { db.markStoreExists(echoName) } catch {}
    const batch = []
    let batchHasUpdate = false
    for (const msg of newMessages) {
      // data travels inside the JWS payload on the wire — recover it before use.
      if (msg && !msg.data && typeof msg.jws === 'string' && msg.jws) {
        msg.data = decodeJwsPayload(msg.jws)
      }
      let d = null
      try { d = JSON.parse(msg.data) } catch {}
      // Message updates replace the original in place and are not shown as
      // separate messages (issue #267).
      if (isPlainUpdate(d)) {
        batchHasUpdate = true
        const target = await resolveUpdateTarget(echoName, msg, d)
        if (target.found) {
          if (target.original && applyUpdate(target.original, msg)) batch.push(target.original)
          continue
        }
        // Unknown original — fall through and keep the update as a message.
      }
      // Skip cancel and protocol vote messages in the echo feed
      try {
        if (d.type === 'cancel' || (d.type === 'vote' && d.poster_message)) continue
        // Node election phase notices carry no user content; they are shown in
        // the protocols panel, not the feed.
        if (msg.type === 'election' && d.type === 'phase') continue
      } catch {}
      if (!messages.value[echoName].some(m => m.message_id === msg.message_id)) {
        messages.value[echoName].push(msg)
        learnSenderName(msg)
        batch.push(msg)
      }
    }
    if (batch.length > 0) {
      messages.value[echoName].sort((a, b) => a.timestamp - b.timestamp)
      if (messages.value[echoName].length > MAX_MSGS_PER_ECHO) {
        messages.value[echoName] = messages.value[echoName].slice(-MAX_MSGS_PER_ECHO)
      }
      try { await db.bulkPutMessages(echoName, batch.map(plainMessage)) } catch (e) { console.warn('[echo] db.bulkPut failed', e) }
    }
    // An update may have arrived before its original (in the same batch or in
    // an earlier one): fold the leftovers now (#303).
    if (batchHasUpdate) {
      await reconcileUpdates(echoName)
    }
  }

  function clearMessages(echoName) {
    if (messages.value[echoName]) {
      messages.value[echoName] = []
    }
  }

  /**
   * Удалить локальную копию эхи: сообщения из IndexedDB и памяти, а также
   * отметку прочтения. Подписка на эху сохраняется — новые сообщения снова
   * начнут приходить и сохраняться.
   */
  async function deleteLocalCopy(echoName) {
    if (!echoName) return
    await db.clearEchoMessages(echoName)
    delete messages.value[echoName]
    loadedEchoes.delete(echoName)
    if (Object.prototype.hasOwnProperty.call(lastReadTimestamps.value, echoName)) {
      delete lastReadTimestamps.value[echoName]
    }
  }

  function clearAll() {
    for (const echoName in messages.value) {
      delete messages.value[echoName]
    }
    echoes.value = []
    subscribedEchoes.value = []
    loadedEchoes.clear()
    lastReadTimestamps.value = {}
    dismissedMessages.value = []
    lastReadNetmailTimestamp.value = 0
    seenEchoNames.value = []
    renamedEchoes.value = {}
    loading.value = false
    error.value = null
  }

  async function migrateEchoLocalState(oldName, newName) {
    const oldMessages = messages.value[oldName]
    if (Array.isArray(oldMessages)) {
      const merged = new Map((messages.value[newName] || []).map(m => [m.message_id, m]))
      for (const message of oldMessages) merged.set(message.message_id, message)
      messages.value = {
        ...messages.value,
        [newName]: [...merged.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)),
      }
      delete messages.value[oldName]
    }
    if (loadedEchoes.has(oldName)) {
      loadedEchoes.set(newName, loadedEchoes.get(oldName))
      loadedEchoes.delete(oldName)
    }
    if (Object.prototype.hasOwnProperty.call(lastReadTimestamps.value, oldName)) {
      lastReadTimestamps.value[newName] = Math.max(
        lastReadTimestamps.value[newName] || 0,
        lastReadTimestamps.value[oldName] || 0,
      )
      delete lastReadTimestamps.value[oldName]
      saveLastReadTimestamps()
    }
    if (seenEchoNames.value.includes(oldName)) {
      seenEchoNames.value = seenEchoNames.value.map(name => name === oldName ? newName : name)
      saveSeenEchoNames()
    }
    if (subscribedEchoes.value.includes(oldName)) {
      subscribedEchoes.value = subscribedEchoes.value.map(name => name === oldName ? newName : name)
    }
    try {
      useIdentityStore().renameEchoState(oldName, newName)
    } catch (e) { console.warn('[echo] rename identity state', e) }
    // Drafts are stored in localStorage and are keyed by the echo name.
    try {
      const raw = localStorage.getItem('fm_drafts')
      if (raw) {
        const drafts = JSON.parse(raw)
        let changed = false
        for (const draft of drafts) {
          if (draft?.type === 'echo' && draft.echoName === oldName) {
            draft.echoName = newName
            changed = true
          }
        }
        if (changed) localStorage.setItem('fm_drafts', JSON.stringify(drafts))
      }
    } catch (e) { console.warn('[echo] rename drafts', e) }
    // User-defined conference groups refer to echoes by name.
    try {
      const groups = loadEchoGroups()
      groups.groups = renameEchoInGroups(groups.groups, oldName, newName)
      saveEchoGroups(groups)
    } catch (e) { console.warn('[echo] rename groups', e) }
    // Protocol cards and election phase state are grouped by echo name too.
    try {
      const { useProtocolStore } = await import('./protocol')
      await useProtocolStore().renameEchoState(oldName, newName)
    } catch (e) {
      console.warn('[echo] rename protocol state', e)
    }
  }

  /**
   * Detect conference renames by their stable server ID and migrate local
   * messages, subscriptions, read marks, drafts and protocol state.
   */
  async function reconcileEchoRenames(list) {
    const catalog = loadEchoCatalog()
    const knownById = new Map()
    for (const item of echoes.value) {
      if (item?.id != null) knownById.set(String(item.id), item.name)
    }
    const renames = []
    const seen = new Set()
    for (const item of list || []) {
      if (!item || item.id == null || !item.name) continue
      const id = String(item.id)
      for (const oldName of [catalog[id], knownById.get(id)]) {
        if (!oldName || oldName === item.name) continue
        const key = `${oldName}\u0000${item.name}`
        if (seen.has(key)) continue
        seen.add(key)
        renames.push({ oldName, newName: item.name })
      }
    }

    const renameMap = {}
    for (const { oldName, newName } of renames) {
      try {
        if (typeof db.renameEchoStore === 'function') {
          await db.renameEchoStore(oldName, newName)
        }
      } catch (e) {
        console.warn('[echo] rename message store failed', oldName, newName, e)
      }
      await migrateEchoLocalState(oldName, newName)
      renameMap[oldName] = newName
    }
    if (renames.length > 0) renamedEchoes.value = renameMap

    const nextCatalog = { ...catalog }
    for (const item of list || []) {
      if (item?.id != null && item.name) nextCatalog[String(item.id)] = item.name
    }
    saveEchoCatalog(nextCatalog)
    return renameMap
  }

  function setEchoes(list) {
    echoes.value = list
    // Migrate data of renamed conferences before other views read the list.
    // refreshEchoes() awaits this explicitly; direct callers still get the
    // background migration as a safety net.
    reconcileEchoRenames(list).catch(e => console.warn('[echo] reconcile renames', e))
    // Keep the subscribed list in sync with the server's flags (#271) so the
    // forward dialog and other consumers always see every subscribed echo.
    syncSubscribedFromEchoes(list)
    // Создаём ObjectStore в IndexedDB для новых эх
    db.ensureEchoStores(list.map(e => e.name)).catch(e => console.warn('[echo] ensureEchoStores', e))
  }

  /**
   * Sync the subscribed-echo list from the server's `subscribed` flags
   * (issue #271): add every echo the node reports as subscribed and drop the
   * ones it explicitly reports as not subscribed. Echoes missing from the
   * response are kept — the node filters the list for unapproved users.
   */
  function syncSubscribedFromEchoes(list) {
    const next = new Set(subscribedEchoes.value)
    for (const item of list) {
      if (item.subscribed) next.add(item.name)
      else next.delete(item.name)
    }
    subscribedEchoes.value = [...next]
  }

  /**
   * Refresh the echo list from the node (issues #270/#271): updates the
   * moderator rules, the `subscribed` flags and the subscribed-echo list so the
   * subscriptions modal and the forward dialog always see the current state.
   */
  async function refreshEchoes() {
    const identity = useIdentityStore()
    if (!identity.hasKeys || !identity.user?.address) return
    loading.value = true
    try {
      const { apiService } = await import('../services/api')
      const data = await apiService.getEchoes()
      const list = Array.isArray(data) ? data : []

      // Moderator rules: the user may moderate at least one conference.
      let isMod = false
      for (const item of list) {
        if (!item.rules) continue
        try {
          const rulesData = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules
          const mods = rulesData.parameters?.moderators || rulesData.moderators
          if (mods && Array.isArray(mods) && mods.includes(identity.user.address)) {
            isMod = true
            identity.setRules(rulesData)
            break
          }
        } catch { /* ignore */ }
      }
      if (!isMod) identity.setRules({})

      const withSubscribed = list.map(echoItem => {
        const subscribed = echoItem.subscribed !== undefined
          ? echoItem.subscribed
          : (identity.isSubscribed(echoItem.name) || subscribedEchoes.value.includes(echoItem.name))
        return { ...echoItem, subscribed }
      })
      await reconcileEchoRenames(withSubscribed)
      setEchoes(withSubscribed)
    } catch (err) {
      error.value = err.message
      // В режиме разработки подставляем тестовые данные
      if (import.meta.env.DEV) {
        setEchoes([
          { id: 1, name: 'General', description: 'General discussions', subscribed: true },
          { id: 2, name: 'Tech', description: 'Technology talks', subscribed: false },
          { id: 3, name: 'News', description: 'Network news', subscribed: true },
          { id: 4, name: 'Council', description: 'Node council', subscribed: false },
        ])
      }
    } finally {
      loading.value = false
    }
  }
  function addEcho(echo) {
    echoes.value.push(echo)
  }
  function removeEcho(echoId) {
    const index = echoes.value.findIndex(e => e.id === echoId)
    if (index !== -1) echoes.value.splice(index, 1)
  }
  function subscribe(echoName) {
    if (!subscribedEchoes.value.includes(echoName)) {
      subscribedEchoes.value.push(echoName)
    }
    try {
      const identity = useIdentityStore()
      identity.addSubscription(echoName)
    } catch { /* ignore */ }
  }
  function unsubscribe(echoName) {
    // Replace the array instead of splicing it: the sidebar predicate reads
    // this ref and must re-evaluate even when the call comes from outside the
    // component that owns the list (#388).
    subscribedEchoes.value = subscribedEchoes.value.filter(name => name !== echoName)
    const item = echoes.value.find(echo => echo.name === echoName)
    if (item) item.subscribed = false
    try {
      const identity = useIdentityStore()
      identity.removeSubscription(echoName)
    } catch { /* ignore */ }
  }
  function syncFromIdentity() {
    try {
      const identity = useIdentityStore()
      const subs = identity.subscriptions
      if (subs && subs.size > 0 && subscribedEchoes.value.length === 0) {
        subs.forEach(name => {
          if (!subscribedEchoes.value.includes(name)) {
            subscribedEchoes.value.push(name)
          }
        })
      }
    } catch { /* ignore */ }
  }

  function setLoading(val) { loading.value = val }
  function setError(err) { error.value = err }
  function clearError() { error.value = null }

  function markRead(echoName) {
    const now = Date.now() / 1000
    lastReadTimestamps.value[echoName] = Math.max(now, maxMsgTimestamp(echoName))
    saveLastReadTimestamps()
  }

  /** Отметить эху как непрочитанную до указанного сообщения */
  function markUnread(echoName, messageTimestamp) {
    lastReadTimestamps.value[echoName] = messageTimestamp - 1
    saveLastReadTimestamps()
  }

  /**
   * Отметить прочитанным всё до указанного сообщения включительно (#317).
   * Watermark никогда не уменьшается: возврат назад в читалке не делает
   * сообщения непрочитанными.
   */
  function markReadUpTo(echoName, messageTimestamp) {
    if (!messageTimestamp) return
    if (messageTimestamp <= lastReadOf(echoName)) return
    lastReadTimestamps.value[echoName] = messageTimestamp
    saveLastReadTimestamps()
  }

  /** Read watermark of an echo (unix seconds). */
  function lastReadOf(echoName) {
    return lastReadTimestamps.value[echoName] || 0
  }

  /** Unread messages of an echo, without netmail (badge and divider, #302). */
  function unreadCount(echoName) {
    const msgs = messages.value[echoName]
    if (!msgs || msgs.length === 0) return 0
    const lastRead = lastReadOf(echoName)
    let count = 0
    for (const m of msgs) {
      if (m.type === 'netmail') continue
      if ((m.timestamp || 0) > lastRead) count++
    }
    return count
  }

  /** Whether an incoming netmail is unread (#302). */
  function isNetmailUnread(message) {
    if (!message || message.type !== 'netmail') return false
    try {
      const identity = useIdentityStore()
      if (message.sender_address === identity.user?.address) return false
    } catch { /* ignore */ }
    if (message._decryptError || message._isDup) return false
    return (message.timestamp || 0) > lastReadNetmailTimestamp.value
  }

  /** Oldest unread incoming netmail (divider position, #302). */
  function firstUnreadNetmail() {
    const msgs = messages.value['__netmail__'] || []
    let best = null
    for (const m of msgs) {
      if (!isNetmailUnread(m)) continue
      if (!best || (m.timestamp || 0) < (best.timestamp || 0)) best = m
    }
    return best
  }

  function markAllRead() {
    const now = Date.now() / 1000
    for (const echoName in messages.value) {
      lastReadTimestamps.value[echoName] = Math.max(now, maxMsgTimestamp(echoName))
    }
    saveLastReadTimestamps()
  }

  function isEchoSeen(echoName) {
    return seenEchoNames.value.includes(echoName)
  }

  /** Пометить эхи как «увиденные» (для бейджа новых конференций) */
  function markEchoesSeen(names) {
    let changed = false
    for (const name of names || []) {
      if (!seenEchoNames.value.includes(name)) {
        seenEchoNames.value.push(name)
        changed = true
      }
    }
    if (changed) saveSeenEchoNames()
  }

  function getReactionCounts(messageId) {
    const counts = {}
    const lastByVoter = {}
    for (const echoName in messages.value) {
      for (const m of messages.value[echoName]) {
        if (m.type !== 'echomail' && m.type !== 'reaction') continue
        try {
          const d = JSON.parse(m.data)
          if (d.reactionMessageId === messageId) {
            const voter = m.sender_address
            const existing = lastByVoter[voter]
            if (!existing || m.timestamp > existing.timestamp) {
              lastByVoter[voter] = { reaction: d.reaction || '', timestamp: m.timestamp }
            }
          }
        } catch { continue }
      }
    }
    for (const voter in lastByVoter) {
      const r = lastByVoter[voter].reaction
      if (r) counts[r] = (counts[r] || 0) + 1
    }
    return counts
  }

  function getUserReaction(messageId, userAddress) {
    let last = null
    for (const echoName in messages.value) {
      for (const m of messages.value[echoName]) {
        if ((m.type !== 'echomail' && m.type !== 'reaction') || m.sender_address !== userAddress) continue
        try {
          const d = JSON.parse(m.data)
          if (d.reactionMessageId === messageId) {
            if (!last || m.timestamp > last.timestamp) {
              last = { reaction: d.reaction || '', timestamp: m.timestamp }
            }
          }
        } catch { continue }
      }
    }
    return last ? last.reaction : null
  }

  return {
    echoes,
    subscribedEchoes,
    messages,
    renamedEchoes,
    loading,
    error,
    subscribedEchoesList,
    getEchoRules,
    isModeratorOf,
    totalUnread,
    echoUnreadCount,
    netmailUnreadCount,
    lastReadTimestamps,
    lastReadNetmailTimestamp,
    markNetmailRead,
    dismissedMessages,
    loadEcho,
    unload,
    setEchoes,
    refreshEchoes,
    reconcileEchoRenames,
    syncSubscribedFromEchoes,
    addEcho,
    removeEcho,
    subscribe,
    unsubscribe,
    syncFromIdentity,
    addMessage,
    addMessages,
    clearMessages,
    deleteLocalCopy,
    clearAll,
    setLoading,
    setError,
    clearError,
    markRead,
    markUnread,
    markReadUpTo,
    lastReadOf,
    unreadCount,
    isNetmailUnread,
    firstUnreadNetmail,
    markAllRead,
    markEchoesSeen,
    isEchoSeen,
    dismissMessage,
    hideDismissed,
    showThreads,
    getReactionCounts,
    getUserReaction,
  }
})
