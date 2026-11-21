import { apiService } from './api'
import {
  setSyncEnabled,
  isSyncEnabled,
  ensureRegistered,
  uploadToOtherClients,
  consumeJustRegistered,
  checkNewClients,
  broadcastOp,
  getClientId,
  applyClientListEntries,
  applyOwnContainerEntries,
  beginClientSyncBatch,
  endClientSyncBatch,
  takeClientContainerAcks,
  restoreClientContainerAcks,
  takeClientAppends,
  restoreClientAppends,
  setSyncAppendSupported,
  isSyncAppendSupported,
  LIST_CONTAINER,
  CLIENT_CONTAINER_PREFIX,
} from './clientSync'
import {
  getRefillReadSpec,
  applyRefillOps,
  respondToRefillRequest,
} from './clientRefill'
import * as blogStore from './blogStore'
import { setRateLimitUsage } from './rateLimit'
import * as crypto from './crypto'
import { keyService } from './keyService'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useProtocolStore } from '../stores/protocol'
import { useNotificationsStore } from '../stores/notifications'
import { useSettingsStore } from '../stores/settings'
import { PROTOCOL_TYPES } from '../config/protocol'

function msgSubject(msg) {
  if (!msg?.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return d.subject || ''
  } catch { return '' }
}

/**
 * Создаёт подписанное сообщение, совместимое с JWS-верификацией бэкенда.
 * Сериализует данные в JSON, подписывает их через crypto.createJWS
 * и возвращает объект сообщения с полями type, data, timestamp, sender_address, jws.
 */
/**
 * Append the user's tagline and the client tearline to the message data
 * (#309, #311). A per-message `tagline` field (the composer field) always wins
 * — including an explicitly empty one, which removes the tagline for that
 * message. The tearline is written by the client (`<app> v<version> <address>`)
 * and is never edited by the user. Protocol, reaction and moderation payloads
 * get neither.
 */
async function withUserLines(data, type, address = '') {
  if (!data || typeof data !== 'object') return data
  if (type !== 'echomail' && type !== 'announcement' && type !== 'netmail') return data
  if (data.reaction !== undefined || data.severity !== undefined || data.proto !== undefined) return data
  const out = { ...data }
  if (out.tagline === undefined) {
    try {
      const { useSettingsStore } = await import('../stores/settings')
      const tagline = (useSettingsStore().userProfile?.tagline || '').trim()
      if (tagline) out.tagline = tagline
    } catch { /* ignore */ }
  }
  if (out.tearline === undefined) {
    try {
      const { useSettingsStore } = await import('../stores/settings')
      if (useSettingsStore().userProfile?.showTearline === true) {
        const tearline = clientTearline(address)
        if (tearline) out.tearline = tearline
      }
    } catch { /* ignore */ }
  }
  return out
}

/** The client tearline: `<app> v<version> <sender address>` (#311). */
export function clientTearline(address = '') {
  const app = typeof __APP_NAME__ !== 'undefined' ? __APP_NAME__ : 'fm-app'
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
  const parts = [app]
  if (version) parts.push(`v${version}`)
  if (address) parts.push(address)
  return parts.join(' ')
}

export async function createSignedMessage(type, data, options = {}) {
  const identity = useIdentityStore()
  data = await withUserLines(data, type, identity.user?.address || '')
  
  if (!identity.hasKeys || !identity.user?.address) {
    throw new Error('No identity or address available')
  }

  const timestamp = Math.floor(Date.now() / 1000)

  // Бэкенд ожидает поле sender_name внутри data. Если отправитель явно указал
  // имя для этого сообщения (поле «От:» в композере) — берём его; иначе — имя
  // пользователя (единственный источник, #296).
  const explicitName = data && typeof data.sender_name === 'string' && data.sender_name.trim()
    ? data.sender_name.trim()
    : ''
  const senderName = explicitName || identity.user?.name || ''
  const enrichedData = { ...data, sender_name: senderName }

  // Запоминаем своё имя (в т.ч. переопределённое для конкретного сообщения)
  // в справочнике «адрес → имена», чтобы оно показывалось в тултипах.
  try {
    if (identity.user?.address && senderName && senderName !== identity.user.address) {
      const { useNamesStore } = await import('../stores/names')
      useNamesStore().record(identity.user.address, senderName)
    }
  } catch { /* ignore */ }
  const messageData = {
    type,
    data: JSON.stringify(enrichedData),
    timestamp,
    sender_address: identity.user.address, // FM-адрес, не hex-ключ
    ...options,
  }

  // Подписываем строку data через JWS (заголовок + подпись Ed25519)
  const jws = await crypto.createJWS(identity.privateKey, messageData.data, identity.signPublicKey)

  // data НЕ кладём в сообщение: оно уже внутри JWS (payload = base64url(data)).
  // Получатель восстанавливает data из JWS после верификации подписи.
  const { data: _dropped, ...rest } = messageData
  return {
    ...rest,
    jws,
  }
}

/**
 * Отправляет сообщение в эху.
 * Создаёт подписанное сообщение и шлёт его через send_receive.
 */
export async function sendToEcho(echoName, messageType, data) {
  const signedMessage = await createSignedMessage(messageType, data, {
    echo_name: echoName,
  })

  return apiService.sendReceive({
    messages: [signedMessage],
  })
}

/**
 * Строит зашифрованное (JWE) netmail-сообщение для получателя.
 * Получает публичный ключ получателя, конвертирует в X25519,
 * шифрует payload и возвращает готовое сообщение (data пустая, контент в jwe).
 * Бросает NO_PUBLIC_KEY если ключ недоступен, KEY_CONVERSION_FAILED если конвертация не удалась.
 * @param {string} recipientAddress - FM-адрес получателя
 * @param {object} data - Данные сообщения (subject, body, ...)
 * @returns {Promise<object>} Подписанное и зашифрованное netmail-сообщение
 */
export async function buildNetmailMessage(recipientAddress, data) {
  const identity = useIdentityStore()
  data = await withUserLines(data, 'netmail', identity.user?.address || '')
  // Получаем Ed25519 публичный ключ получателя из кеша
  let keyInfo
  try {
    keyInfo = await keyService.getPublicKey(recipientAddress)
  } catch (err) {
    throw new Error('NO_PUBLIC_KEY')
  }

  // Убеждаемся, что X25519 ключ доступен для шифрования
  if (!keyInfo.x25519PublicKey) {
    try {
      keyInfo.x25519PublicKey = crypto.ed25519PublicKeyToX25519(keyInfo.signPublicKey)
    } catch (err) {
      console.error('Failed to convert public key to X25519:', err)
      throw new Error('KEY_CONVERSION_FAILED')
    }
  }

  // Шифруем тело сообщения для получателя через JWE (ChaCha20-Poly1305)
  const plaintext = JSON.stringify(data)
  const plaintextBytes = new TextEncoder().encode(plaintext)
  const jweToken = await crypto.encryptJWE(plaintextBytes, keyInfo.x25519PublicKey)

  // Формируем подписанное сообщение: data пустая, контент в jwe
  const timestamp = Math.floor(Date.now() / 1000)
  const jws = await crypto.createJWS(identity.privateKey, '', identity.signPublicKey)

  return {
    type: 'netmail',
    sender_address: identity.user?.address || '',
    timestamp,
    recipient_address: recipientAddress,
    data: '',
    jws,
    jwe: jweToken,
  }
}

/**
 * Отправляет приватное сообщение (netmail).
 * Получает публичный ключ получателя, конвертирует в X25519,
 * шифрует payload через JWE и отправляет зашифрованное сообщение.
 * Если ключ недоступен — бросает NO_PUBLIC_KEY (UI показывает кнопку «запросить ключ»).
 */
export async function sendNetmail(recipientAddress, data) {
  const message = await buildNetmailMessage(recipientAddress, data)
  return apiService.sendReceive({
    messages: [message],
  })
}

/**
 * Обрабатывает входящий запрос публичного ключа от другого пользователя.
 * Если autoSend включён — отправляет ключ автоматически.
 * Иначе показывает уведомление с кнопками Send / Ignore.
 * Дедуплицирует запросы по адресу (чтобы не плодить уведомления).
 * После Send/Ignore помечает адрес как отвеченный (persistent) — повторные запросы авто-скипаются.
 */
async function handlePubkeyRequest(requestData) {
  // Если уже отвечали на запрос с этого адреса — не беспокоим снова
  if (keyService.hasRespondedPubkey(requestData.address)) {
    const settingsStore = useSettingsStore()
    if (settingsStore.privacy?.autoSendPubkey) {
      try {
        await sendPubkeyResponse(requestData.address, requestData.requestor_pubkey)
        console.log('[pubkey] auto-responded to', requestData.address, '(previously responded)')
      } catch (err) {
        console.error('[pubkey] auto-respond failed:', err)
      }
    }
    return
  }

  // Дедупликация: пропускаем, если уже показываем уведомление для этого адреса
  if (keyService.hasPendingPubkeyRequest(requestData.address)) {
    return
  }

  const notifications = useNotificationsStore()
  const identity = useIdentityStore()
  
  const settingsStore = useSettingsStore()
  const autoSend = settingsStore.privacy?.autoSendPubkey || false
  
  if (autoSend) {
    try {
      await sendPubkeyResponse(requestData.address, requestData.requestor_pubkey)
      keyService.addRespondedPubkey(requestData.address)
      notifications.success(`Public key automatically sent to ${requestData.address}`)
    } catch (err) {
      console.error('Auto-send pubkey failed:', err)
    }
  } else {
    keyService.addPendingPubkeyRequest(requestData.address)

    const notificationId = notifications.addNotification({
      type: 'info',
      title: 'Public Key Request',
      message: `User ${requestData.address} is requesting your public key. Send it?`,
      duration: 0,
      dismissible: true,
      actions: [
        {
          label: 'Send',
          handler: async () => {
            try {
              await sendPubkeyResponse(requestData.address, requestData.requestor_pubkey)
            } catch (err) {
              console.error('Failed to send pubkey response:', err)
            }
            keyService.addRespondedPubkey(requestData.address)
            keyService.removePendingPubkeyRequest(requestData.address)
            notifications.removeNotification(notificationId)
          }
        },
        {
          label: 'Ignore',
          handler: () => {
            keyService.addRespondedPubkey(requestData.address)
            keyService.removePendingPubkeyRequest(requestData.address)
            notifications.removeNotification(notificationId)
          }
        }
      ]
    })
  }
}

/**
 * Отправляет ответ на запрос публичного ключа.
 * Шифрует ответ (pubkey_response) через JWE, используя X25519 запросившего,
 * и отправляет как netmail.
 */
async function sendPubkeyResponse(requesterAddress, requestorPubkeyBase64) {
  const identity = useIdentityStore()
  
  // Декодируем Ed25519 публичный ключ запросившего из base64
  const requestorSignPubkey = Uint8Array.from(atob(requestorPubkeyBase64), c => c.charCodeAt(0))
  
  // Конвертируем Ed25519 -> X25519 для шифрования
  let requestorX25519Pubkey
  try {
    requestorX25519Pubkey = crypto.ed25519PublicKeyToX25519(requestorSignPubkey)
  } catch (err) {
    console.error('Failed to convert requestor public key to X25519:', err)
    throw new Error('KEY_CONVERSION_FAILED')
  }
  
  // Формируем данные ответа: адрес, ключ, отпечаток
  const responseData = {
    type: 'pubkey_response',
    address: identity.user.address,
    sign_public_key: btoa(String.fromCharCode(...identity.signPublicKey)),
    key_thumbprint: identity.keyThumbprint,
    requestor_pubkey: requestorPubkeyBase64
  }
  
  const plaintext = JSON.stringify(responseData)
  const plaintextBytes = new TextEncoder().encode(plaintext)
  
  // Шифруем ответ для запросившего
  const jweToken = await crypto.encryptJWE(plaintextBytes, requestorX25519Pubkey)
  
  // Создаём подписанный netmail: data пустая, подпись над пустой строкой
  const timestamp = Math.floor(Date.now() / 1000)
  const jws = await crypto.createJWS(identity.privateKey, '', identity.signPublicKey)
  
  return apiService.sendReceive({
    messages: [{
      type: 'netmail',
      data: '',
      jws,
      jwe: jweToken,
      sender_address: identity.user.address,
      recipient_address: requesterAddress,
      timestamp,
    }],
  })
}

/**
 * Обрабатывает входящее сообщение: расшифровывает JWE,
 * обрабатывает ответы на запрос ключа (pubkey_response) и запросы (pubkey_request).
 * Если JWE отсутствует — возвращает сообщение как есть.
 */
async function processIncomingMessage(msg) {
  // Messages travel on the wire without the separate `data` field — the content is
  // embedded in the JWS payload. Recover it here so downstream code (display,
  // protocol parsing, refill) keeps working unchanged. Netmail data stays empty
  // (its content is in the encrypted `jwe`, handled below).
  if (msg && !msg.data && typeof msg.jws === 'string' && msg.jws) {
    msg.data = crypto.decodeJwsPayload(msg.jws)
  }
  // Логируем входящий netmail
  if (msg.type === 'netmail') {
    console.log('[msg] netmail received', 'from', msg.sender_address, 'to', msg.recipient_address, 'jwe', !!msg.jwe, 'msg_id', msg.message_id)
  }
  // Если есть JWE — пробуем расшифровать
  if (msg.jwe && typeof msg.jwe === 'string') {
    const identity = useIdentityStore()
    if (identity.x25519PrivateKey) {
      try {
        const plaintextBytes = await crypto.decryptJWE(msg.jwe, identity.x25519PrivateKey)
        const plaintext = new TextDecoder().decode(plaintextBytes)
        console.log('[msg] JWE decrypted', 'msg_id', msg.message_id, 'plaintext_len', plaintext.length)
        // Парсим расшифрованный JSON
        try {
          const decryptedData = JSON.parse(plaintext)
          // Если это ответ с публичным ключом — сохраняем в кеш
          if (decryptedData.type === 'pubkey_response' && decryptedData.address && decryptedData.sign_public_key) {
            keyService.storePublicKey(decryptedData)
            msg._internal = true
            msg.jwe = null
          } else if (decryptedData.type === 'pubkey_request' && decryptedData.address && decryptedData.requestor_pubkey) {
            handlePubkeyRequest(decryptedData)
            msg._internal = true
            msg.jwe = null
          } else {
            // Обычный netmail: просто заменяем data расшифрованным текстом
            msg.decrypted = true
            msg.data = plaintext
            console.log('[msg] netmail decrypted', 'from', msg.sender_address, 'subject', decryptedData.subject)
          }
        } catch (parseErr) {
          console.warn('Failed to parse decrypted JWE data:', parseErr)
          msg._decryptError = true
        }
      } catch (decryptErr) {
        console.warn('Failed to decrypt JWE:', decryptErr)
        msg._decryptError = true
      }
    } else {
      console.warn('No X25519 private key available to decrypt JWE')
      if (msg.jwe) msg._decryptError = true
    }
  }
  return msg
}

// Очередь ID локальных пакетов для подтверждения (ACK) при следующем fetch.
// Дублируется в localStorage: перезагрузка страницы не должна терять ACK —
// иначе нода считает доставку незавершённой и переотправляет сообщения
// (RequeueStaleDelivering), либо, без переотправки, они теряются.
const ACK_STORAGE_KEY = 'fm_pending_delivery_acks'
let pendingDeliveredLocalIds = []

function loadStoredAckIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(ACK_STORAGE_KEY) || '[]')
    return Array.isArray(ids) ? ids.filter(id => Number.isFinite(id)) : []
  } catch { return [] }
}

function saveStoredAckIds(ids) {
  try { localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

/** Все неподтверждённые ID (память + пережившие перезагрузку). */
function collectAckIds() {
  return [...new Set([...pendingDeliveredLocalIds, ...loadStoredAckIds()])]
}

/** Нода обработала запрос — подтверждённые ID больше не нужны. */
function clearAckIds(ids) {
  const done = new Set(ids)
  pendingDeliveredLocalIds = pendingDeliveredLocalIds.filter(id => !done.has(id))
  saveStoredAckIds(loadStoredAckIds().filter(id => !done.has(id)))
}

/** Запомнить ID выданных пакетов до следующего запроса. */
function addAckIds(ids) {
  const next = new Set([...pendingDeliveredLocalIds, ...loadStoredAckIds()])
  for (const id of ids) {
    if (Number.isFinite(id)) next.add(id)
  }
  pendingDeliveredLocalIds = [...next]
  saveStoredAckIds(pendingDeliveredLocalIds)
}

// Счётчик нарушений writers для отображения toast
let lastWritersViolations = 0
export function getWritersViolations() { return lastWritersViolations }
export function resetWritersViolations() { lastWritersViolations = 0 }

/**
 * Получает сообщения с сервера через send_receive.
 * Опции: ack (подтвердить получение), echo_name (фильтр по эхе), since (с какой даты).
 * Бэкенд возвращает сообщения для пользователя на основе адреса в envelope.
 * Обрабатывает расшифровку, pubkey-ответы, сохраняет протокольные сообщения в store.
 */
export async function fetchMessages(options = {}) {
  const { ack = [], echo_name = null, since = 0 } = options
  
  // Формируем тело запроса
  const requestData = {}
  if (ack.length > 0) {
    requestData.ack = ack
  }
  
  // Добавляем накопленные delivered_local_ids (подтверждение доставки) из
  // предыдущего fetch. Очередь очищается только после успешного ответа ноды.
  const ackIds = collectAckIds()
  if (ackIds.length > 0) {
    requestData.delivered_local_ids = ackIds
  }

  // Client synchronize (#257): ask for the client list and this client's own
  // container in the same request. The node ignores the field when the feature
  // is disabled, so this can be sent unconditionally.
  const syncClientId = getClientId()
  const ownContainerName = CLIENT_CONTAINER_PREFIX + syncClientId
  const refillRead = getRefillReadSpec()
  requestData.client_sync_read = [LIST_CONTAINER, ownContainerName]
  if (refillRead) requestData.client_sync_read.push(refillRead)

  // ACKs of the container entries processed on the previous poll: the node
  // deletes them in this send_receive, so no separate delete request is needed.
  const clientAcks = takeClientContainerAcks()
  if (clientAcks.length > 0) {
    requestData.client_container_ack = clientAcks
  }
  // Writes queued by the previous poll: one send_receive carries them when the
  // node supports embedded appends. The rest of the queue waits for the next
  // poll so a single request never exceeds the node's limits.
  const clientAppends = isSyncEnabled() && isSyncAppendSupported() ? takeClientAppends() : []
  if (clientAppends.length > 0) {
    requestData.client_sync_append = clientAppends
  }

  let response
  try {
    response = await apiService.sendReceive(requestData)
  } catch (err) {
    // Keep the ACKs and appends for the next successful poll.
    restoreClientContainerAcks(clientAcks)
    restoreClientAppends(clientAppends)
    throw err
  }
  if (ackIds.length > 0) {
    // Нода удалила подтверждённые пакеты — очередь можно очистить.
    clearAckIds(ackIds)
  }
  // Handle both old format (array) and new format ({messages, local_packet_ids})
  const receivedMessages = Array.isArray(response) ? response : (response.messages || [])
  const newPacketIds = response.local_packet_ids || []
  
  // Check for writers violations to notify UI
  lastWritersViolations = response.writers_violations || 0

  // Network rate limit usage reported by the node (issue #175).
  setRateLimitUsage(response.rate_limit)
  
  if (receivedMessages.length > 0) {
    console.log('[fetch] received', receivedMessages.length, 'messages', 'types', [...new Set(receivedMessages.map(m => m.type))])
  }
  if (newPacketIds.length > 0) {
    console.log('[fetch] local packet IDs to ACK', newPacketIds)
  }
  
  // Process each message (decryption, pubkey response handling)
  const processedMessages = await Promise.all(receivedMessages.map(msg => processIncomingMessage(msg)))

  // Client synchronize (multi-device): upload what this client received to the
  // other clients' containers and consume this client's own container.
  setSyncEnabled(response.client_synchronize === true)
  setSyncAppendSupported(response.client_sync_append_supported === true)
  let syncedMessages = []
  const sentCopies = []
  beginClientSyncBatch()
  try {
    if (isSyncEnabled()) {
      // Apply the client list from this response before registering: the list
      // is already in the poll response, and ensureRegistered would otherwise
      // make an extra client_synchronize read on the first poll.
      for (const container of response.client_container_entries || []) {
        if (container?.name === LIST_CONTAINER) {
          await applyClientListEntries(container.entries)
        }
      }
      await ensureRegistered()
      // Share this client's existing sent netmail and blogs with a newly joined
      // client (and right after this client itself joined the sync).
      const freshClients = await checkNewClients()
      if (consumeJustRegistered() || freshClients.length > 0) {
        await uploadLocalHistory()
      }
      await uploadToOtherClients(receivedMessages)

      // The node returns the requested containers in the same response.
      let ops = []
      for (const container of response.client_container_entries || []) {
        if (container?.name === ownContainerName) {
          ops = await applyOwnContainerEntries(container.name, container.entries)
        } else if (refillRead && container?.name === refillRead.name) {
          const refillOps = await applyOwnContainerEntries(container.name, container.entries)
          await applyRefillOps(refillOps)
        }
      }
      const messageOps = []
      for (const op of ops) {
        if (!op || !op.op) continue
        switch (op.op) {
          case 'message':
            if (op.message) messageOps.push(op.message)
            break
          case 'sent':
            // A netmail copy sent from another client: store it in the sent folder.
            if (op.message) sentCopies.push(op.message)
            break
          case 'refillRequest':
            // Another device asks for this client's full mailbox (#387).
            await respondToRefillRequest(op)
            break
          case 'blog':
            if (op.blog) await blogStore.putBlog(op.blog, { silent: true })
            break
          case 'blogPost':
            if (op.post) await blogStore.putBlogPost(op.post, { silent: true })
            break
          case 'blogDelete':
            if (op.id) await blogStore.deleteBlog(op.id, { silent: true })
            break
          case 'blogPostDelete':
            if (op.id) await blogStore.deleteBlogPost(op.id, { silent: true })
            break
        }
      }
      if (messageOps.length > 0) {
        console.log('[fetch] client sync: received', messageOps.length, 'messages from own container')
        syncedMessages = await Promise.all(messageOps.map(msg => processIncomingMessage(msg)))
      }
    }
  } catch (err) {
    console.warn('[fetch] client synchronize failed:', err.message)
  } finally {
    // With embedded appends the queue stays for the next poll (one request per
    // cycle). Older nodes fall back to one batched client_synchronize request.
    const useEmbeddedAppend = isSyncEnabled() && isSyncAppendSupported()
    await endClientSyncBatch(!useEmbeddedAppend)
  }
  const allMessages = processedMessages.concat(syncedMessages)

  // Netmail copies sent from the other clients: keep them in the sent folder.
  if (sentCopies.length > 0) {
    try {
      const { useEchoStore } = await import('../stores/echo')
      const echoStore = useEchoStore()
      echoStore.addMessages('__netmail__', sentCopies.map(msg => ({
        ...msg,
        type: 'netmail',
        data: typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data || {}),
        jwe: null,
        _internal: true,
      })))
    } catch (err) {
      console.warn('[fetch] failed to store synced sent netmail:', err.message)
    }
  }

  // Сохраняем новые packet IDs для ACK в следующем запросе (после успешной
  // обработки и сохранения сообщений). Очередь переживает перезагрузку.
  if (newPacketIds.length > 0) {
    addAckIds(newPacketIds)
  }
  
  // Сохраняем протокольные сообщения (голосования, выборы и т.д.) в protocolStore
  if (allMessages.length > 0) {
    try {
      const protocolStore = useProtocolStore()
      const protocolMessages = allMessages.filter(msg => 
        msg && msg.type && PROTOCOL_TYPES.includes(msg.type)
      )
      if (protocolMessages.length > 0) {
        // Await the encrypted save: the packet IDs are ACKed on the next poll,
        // so a reload must not race the protocol-store persistence (#350).
        await protocolStore.addMessages(protocolMessages)
      }
    } catch (error) {
      console.warn('Failed to save protocol messages:', error)
    }
  }
  
  // Если указана конкретная эха — фильтруем
  if (echo_name) {
    return allMessages.filter(msg => msg.echo_name === echo_name)
  }
  
  return allMessages
}

let historyUploadPromise = null

/**
 * Share this client's existing local netmail (sent + saved) and blogs with the
 * other clients of the address. Called once, right after registration.
 */
async function uploadLocalHistory() {
  if (historyUploadPromise) return historyUploadPromise
  historyUploadPromise = doUploadLocalHistory().finally(() => { historyUploadPromise = null })
  return historyUploadPromise
}

async function doUploadLocalHistory() {
  try {
    // Read from IndexedDB: the in-memory store may not be hydrated yet.
    const db = await import('./db')
    const netmail = (await db.getAllMessages('__netmail__'))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-100)
    for (const msg of netmail) {
      const isSent = !!(msg._internal && msg.recipient_address)
      await broadcastOp({ op: isSent ? 'sent' : 'message', message: msg })
    }
  } catch (err) {
    console.warn('[fetch] netmail history sync failed:', err.message)
  }
  try {
    const blogs = await blogStore.getBlogs()
    for (const blog of blogs) {
      await broadcastOp({ op: 'blog', blog })
    }
    const posts = (await blogStore.getAllBlogPosts()).slice(-100)
    for (const post of posts) {
      await broadcastOp({ op: 'blogPost', post })
    }
  } catch (err) {
    console.warn('[fetch] blog history sync failed:', err.message)
  }
}

/**
 * Удобная обёртка для получения сообщений из конкретной эхи.
 */
export async function fetchEchoMessages(echoName, since = 0) {
  return fetchMessages({ echo_name: echoName, since })
}
