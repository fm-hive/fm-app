import { ref, computed } from 'vue'
import { apiService } from '../services/api'
import { keyService } from '../services/keyService'

const queue = ref([])

// Можно ли выбрать/отправить элемент (для noKey — только если ключ уже есть)
function isSendable(entry) {
  if (!entry.noKey) return true
  return keyService.hasPublicKey(entry.recipient)
}

export function useOutbox() {
  const count = computed(() => queue.value.length)

  function add(entry) {
    // Deduplicate: remove existing entry with same dedupKey
    if (entry.dedupKey) {
      queue.value = queue.value.filter(e => e.dedupKey !== entry.dedupKey)
    }
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    queue.value.push({
      id,
      // Reactions are marked for sending like any other message (#269).
      selected: !entry.noKey,
      ...entry,
    })
    return id
  }

  function remove(id) {
    queue.value = queue.value.filter(e => e.id !== id)
  }

  function toggle(id) {
    const entry = queue.value.find(e => e.id === id)
    if (entry) {
      if (entry.noKey && !keyService.hasPublicKey(entry.recipient)) return // без ключа — нельзя выбрать
      entry.selected = !entry.selected
    }
  }

  function selectAll() {
    queue.value.forEach(e => { if (isSendable(e)) e.selected = true })
  }

  function deselectAll() {
    queue.value.forEach(e => { e.selected = false })
  }

  // Build (encrypt/sign) a single queued entry. Returns the ready message.
  // Overridden entries carry a danger marker in the message data so other
  // clients can show it (issue #175).
  async function buildEntryMessage(entry, { rateLimitOverride = false } = {}) {
    const rawData = rateLimitOverride && entry.rawData
      ? { ...entry.rawData, rate_limit_override: true }
      : entry.rawData
    if (entry.type === 'netmail') {
      const { buildNetmailMessage } = await import('../services/message')
      return buildNetmailMessage(entry.recipient, rawData)
    }
    if (rawData) {
      const { createSignedMessage } = await import('../services/message')
      return createSignedMessage(entry.type || 'echomail', rawData, {
        echo_name: entry.echoName,
        ...(entry.extraOptions || {}),
      })
    }
    if (entry.message) {
      return entry.message // legacy entry already carries a signed message
    }
    throw new Error('Unsupported outbox entry')
  }

  // Process a send_receive response: add the delivered messages to the echo
  // store (so the sender sees their own message immediately) and record the
  // local copies (netmail "Sent" folder + client sync). Every send path must
  // use this — the discarded response was why auto-flushed reactions never
  // appeared (#305).
  async function processSendResponse(response, sent) {
    if (response?.messages?.length > 0) {
      const { useEchoStore } = await import('../stores/echo')
      const echo = useEchoStore()
      const echoByName = {}
      for (const msg of response.messages) {
        if (msg._internal) continue
        const echoName = msg.echo_name || msg.echo || '__netmail__'
        if (!echoByName[echoName]) echoByName[echoName] = []
        echoByName[echoName].push(msg)
      }
      for (const [name, msgs] of Object.entries(echoByName)) {
        echo.addMessages(name, msgs)
      }
    }
    for (const { entry, msg } of sent) {
      await recordSentEntry(entry, msg)
    }
  }

  /**
   * Send the given queue entries with the shared rate-limit handling.
   * Entries over the daily limit stay in the queue (a warning notification is
   * shown) unless the user allowed sending without the limit.
   * Returns { sent, blocked, noKey }.
   */
  async function sendEntries(entries, { throwOnEmpty = false } = {}) {
    const candidates = entries.filter(Boolean)
    if (candidates.length === 0) return { sent: 0, blocked: 0, noKey: 0 }

    const { useSettingsStore } = await import('../stores/settings')
    const { splitByRateLimit } = await import('../services/rateLimit')
    const allowOverride = useSettingsStore().privacy?.allowSendingWithoutRateLimit === true
    const { exceeded } = splitByRateLimit(candidates)
    const exceededIds = new Set(exceeded.map(e => e.id))
    for (const entry of candidates) {
      if (!exceededIds.has(entry.id)) {
        entry.rateLimitBlocked = false
        entry.rateLimitOverride = false
        continue
      }
      entry.rateLimitBlocked = !allowOverride
      entry.rateLimitOverride = allowOverride
    }
    if (exceeded.length > 0 && !allowOverride) {
      try {
        const { useNotificationsStore } = await import('../stores/notifications')
        const { default: i18n } = await import('../i18n')
        useNotificationsStore().warning(
          i18n.global.t('outbox.rateLimitBlocked', { count: exceeded.length }),
          i18n.global.t('outbox.rateLimitTitle'),
        )
      } catch (err) {
        console.warn('[outbox] rate limit notification failed', err)
      }
    }
    const toSend = allowOverride ? candidates : candidates.filter(e => !exceededIds.has(e.id))

    // Refresh the address before building messages: a merge may have changed
    // the network prefix while the client stayed open (issue #280).
    const { useIdentityStore } = await import('../stores/identity')
    await useIdentityStore().syncAdminStatus()

    const messages = []
    const sentIds = []
    let noKey = 0
    for (const entry of toSend) {
      try {
        const msg = await buildEntryMessage(entry, { rateLimitOverride: entry.rateLimitOverride })
        messages.push({ entry, msg })
        sentIds.push(entry.id)
      } catch (err) {
        // Netmail without key or build failure — keep in queue with noKey marker
        if (entry.type === 'netmail' && (err.message === 'NO_PUBLIC_KEY' || err.message.includes('NO_PUBLIC_KEY'))) {
          entry.noKey = true
          noKey++
          continue
        }
        throw err
      }
    }

    if (messages.length === 0) {
      if (throwOnEmpty && exceeded.length > 0 && !allowOverride) {
        const err = new Error('RATE_LIMIT_EXCEEDED')
        err.rateLimitBlocked = exceeded.length
        throw err
      }
      if (throwOnEmpty) {
        const err = new Error('NO_PUBLIC_KEY')
        err.noKeyPending = true
        throw err
      }
      return { sent: 0, blocked: allowOverride ? 0 : exceededIds.size, noKey }
    }

    const response = await apiService.sendReceive({ messages: messages.map(m => m.msg) })
    await processSendResponse(response, messages)
    queue.value = queue.value.filter(e => !sentIds.includes(e.id))
    return { sent: messages.length, blocked: allowOverride ? 0 : exceededIds.size, noKey }
  }

  // Отправить один конкретный элемент очереди (по id). Не влияет на остальные.
  async function sendOne(id) {
    const entry = queue.value.find(e => e.id === id)
    if (!entry || !isSendable(entry)) return { sent: false, noKey: false }

    try {
      const msg = await buildEntryMessage(entry)
      const response = await apiService.sendReceive({ messages: [msg] })
      await processSendResponse(response, [{ entry, msg }])
      queue.value = queue.value.filter(e => e.id !== id)
      return { sent: true }
    } catch (err) {
      if (err.message === 'NO_PUBLIC_KEY' || err.message.includes('NO_PUBLIC_KEY')) {
        entry.noKey = true
        return { sent: false, noKey: true }
      }
      throw err
    }
  }

  async function send() {
    const selected = queue.value.filter(e => e.selected)
    if (selected.length === 0) return
    return sendEntries(selected, { throwOnEmpty: true })
  }

  // Для netmail: сохраняем локальную копию отправленного письма, чтобы оно
  // появилось в папке «Отправленные» (data заполнена сырым текстом, т.к. отправитель сам его писал).
  async function recordSentEntry(entry, msg) {
    if (entry.type !== 'netmail') return
    try {
      const { useEchoStore } = await import('../stores/echo')
      const echo = useEchoStore()
      const rawData = entry.rawData || {}
      const sent = {
        ...(msg || {}),
        message_id: msg?.message_id || `sent_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: 'netmail',
        recipient_address: msg?.recipient_address || entry.recipient,
        data: typeof rawData === 'string' ? rawData : JSON.stringify(rawData),
        jwe: null,
        _internal: true,
      }
      echo.addMessages('__netmail__', [sent])
      // Share the sent copy with the other clients of this address.
      try {
        const { broadcastOp } = await import('../services/clientSync')
        await broadcastOp({ op: 'sent', message: sent })
      } catch (err) {
        console.warn('[outbox] client sync sent copy failed', err.message)
      }
    } catch (err) {
      console.warn('[outbox] record sent failed', err)
    }
  }

  /**
   * Send the queued reactions (auto-flush). Uses the shared send path, so the
   * response is added to the echo store and the rate limit is respected.
   */
  async function flushReactions() {
    return sendEntries(queue.value.filter(e => e.isReaction))
  }

  /**
   * Send one queue entry right after it was added (auto-flush of a fresh
   * message). Errors propagate; a rate-limit block only returns a status.
   */
  async function flushEntry(id) {
    const entry = queue.value.find(e => e.id === id)
    if (!entry) return { sent: 0, blocked: 0, noKey: 0 }
    return sendEntries([entry])
  }

  function clear() {
    queue.value = []
  }

  return { queue, count, add, remove, toggle, selectAll, deselectAll, send, sendOne, flushEntry, flushReactions, clear }
}
