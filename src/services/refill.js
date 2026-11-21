import { createSignedMessage } from './message'
import { getPolicyParams } from '../composables/useProtocolPhases'

const DEFAULT_MAX_MESSAGE_SIZE = 1048576 // 1 MB server default

/** Node address (e.g. :0:0 or :1:2:0) — the last segment is 0. */
function isNodeAddress(address) {
  return typeof address === 'string' && address.endsWith(':0')
}

/**
 * echomail-сообщение, которое можно переслать по refill: есть подпись для
 * проверки и отправитель — пользователь. Сообщения, сгенерированные узлом
 * (welcome, ошибки), другой узел доставить не сможет (его нет в списке
 * пользователей), поэтому в refill они не попадают.
 */
export function isRefillableMessage(m) {
  return !!(m && m.type === 'echomail' && typeof m.data === 'string' && m.data &&
    typeof m.jws === 'string' && m.jws && !isNodeAddress(m.sender_address))
}

/**
 * Граница refill-запроса. `before` — дата без времени (полночь UTC): тогда
 * берётся конец этого дня, потому что запрос «до 18.09» включает и сообщения,
 * отправленные 18.09 до самого запроса (issue #274). Точное время
 * используется как есть.
 */
export function refillCutoff(before) {
  const ms = new Date(before).getTime()
  if (!Number.isFinite(ms)) return NaN
  const d = new Date(ms)
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  return isDateOnly ? ms + 24 * 60 * 60 * 1000 - 1 : ms
}

/**
 * `before` для нового запроса: выбранный в календаре день включительно
 * (конец дня), чтобы и клиенты без правила refillCutoff отправляли сообщения
 * этого дня. Принимает `YYYY-MM-DD` (значение input[type=date]).
 */
export function refillBeforeDate(dateStr) {
  const day = String(dateStr || '').trim()
  const ms = new Date(day.length === 10 ? `${day}T00:00:00.000Z` : day).getTime()
  if (!Number.isFinite(ms)) return new Date().toISOString()
  return new Date(ms + 24 * 60 * 60 * 1000 - 1).toISOString()
}

/**
 * Количество локальных сообщений, которые можно отправить в ответ на refill
 * (echomail с подписью, отправленные до границы запроса).
 */
export function countRefillableMessages(messages, before) {
  const list = Array.isArray(messages) ? messages : []
  const cutoff = refillCutoff(before)
  if (!Number.isFinite(cutoff)) return 0
  let count = 0
  for (const m of list) {
    if (isRefillableMessage(m) && (m.timestamp || 0) * 1000 < cutoff) count++
  }
  return count
}

/**
 * Разбирает refill-запрос (message type=refill, data.type=request) в запись
 * сайдбара. Возвращает null, если сообщение не является запросом.
 */
export function refillRequestFromMessage(msg) {
  if (!msg || msg.type !== 'refill' || !msg.message_id) return null
  let data = msg.data
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { return null }
  }
  if (!data || data.type !== 'request' || !data.refill) return null
  const refill = data.refill
  const echoName = refill.echo || data.echo || ''
  if (!echoName) return null
  return {
    messageId: msg.message_id,
    from: refill.from || data.from || '',
    echoName,
    before: refill.before || '',
    timestamp: msg.timestamp,
  }
}

/**
 * Wire-форма старого сообщения для refill-ответа: только JWS (без отдельного
 * data — содержимое уже в payload JWS) + поля, нужные бэкенду для доставки.
 */
export function toRefillWireForm(m) {
  return {
    type: m.type || 'echomail',
    sender_address: m.sender_address,
    timestamp: m.timestamp,
    message_id: m.message_id,
    jws: m.jws,
  }
}

/** Раскрывает сообщение в JSON размер (байт). */
function msgJsonSize(m) {
  try { return JSON.stringify(m).length } catch { return 0 }
}

/**
 * Бьёт список старых сообщений на чанки так, чтобы каждый ответ умещался в
 * maxMessageSize (серверный лимит на data сообщения). Одиночное сообщение,
 * большее лимита, пропускается (считается в skipped).
 */
export function splitRefillChunks(messages, maxMessageSize) {
  const budget = Math.max(1024, Math.floor((maxMessageSize || DEFAULT_MAX_MESSAGE_SIZE) * 0.8))
  const overhead = 512 // proto/type/refill-обёртка вокруг массива
  const cap = Math.max(512, budget - overhead)

  const chunks = []
  let skipped = 0
  let current = []
  let currentSize = 0
  for (const m of messages || []) {
    const size = msgJsonSize(m)
    if (size > cap) {
      skipped++
      continue
    }
    if (current.length > 0 && currentSize + size > cap) {
      chunks.push(current)
      current = []
      currentSize = 0
    }
    current.push(m)
    currentSize += size
  }
  if (current.length > 0) chunks.push(current)
  return { chunks, skipped }
}

/**
 * Лимит размера сообщения для эхи: правила эхи → параметры политики → 1 МБ.
 * echoes — список эх из echo store (с полем rules).
 */
export function resolveRefillMaxMessageSize(echoes, echoName) {
  const item = (echoes || []).find(e => e.name === echoName)
  try {
    if (item?.rules) {
      const r = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules
      const ms = r?.parameters?.max_message_size
      if (ms != null) {
        const v = parseInt(ms, 10)
        if (v > 0) return v
      }
    }
  } catch { /* ignore */ }

  try {
    const policyParams = getPolicyParams()
    const pms = policyParams?.max_message_size
    if (pms != null) {
      const v = parseInt(pms, 10)
      if (v > 0) return v
    }
  } catch { /* ignore */ }

  return DEFAULT_MAX_MESSAGE_SIZE
}

/**
 * Запросы рефилла, относящиеся к указанной эхе. В сайдбаре показываются только
 * запросы текущей открытой эхи — рефиллы других конференций не должны в ней
 * появляться (issue #274).
 */
export function refillRequestsForEcho(requests, echoName) {
  if (!echoName) return []
  return (Array.isArray(requests) ? requests : []).filter(req => req && req.echoName === echoName)
}

/**
 * Собирает и сразу отправляет refill-ответ (без outbox): подписанные чанки
 * уходят одним send_receive. Используется карточкой ленты и детальным видом.
 * @param {object} req - { echoName, from, before, messageId }
 * @param {Array} messages - локальные сообщения для отправки (уже отфильтрованные)
 * @param {object} opts - { echoes } — список эх для лимита размера
 * @returns {Promise<{count: number, sent: number, skipped: number}>}
 */
export async function sendRefillResponse(req, messages, { echoes } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const res = await buildRefillResponseChunks(list, {
    echo: req.echoName,
    to: req.from,
    echoes,
  })
  if (res.messages.length > 0) {
    const { apiService } = await import('./api')
    await apiService.sendReceive({ messages: res.messages })
  }
  return { count: list.length, sent: res.messages.length, skipped: res.skipped }
}

/**
 * Локальные сообщения, подходящие под refill-запрос (echomail с подписью,
 * отправленные до границы запроса — см. refillCutoff).
 */
export function refillableMessagesFor(messages, before) {
  const cutoff = refillCutoff(before)
  if (!Number.isFinite(cutoff)) return []
  return (Array.isArray(messages) ? messages : [])
    .filter(m => isRefillableMessage(m) && (m.timestamp || 0) * 1000 < cutoff)
}

/**
 * Собирает подписанные refill-ответы для всех чанков старых сообщений.
 * Каждое пересылаемое сообщение несёт только JWS (без отдельного data) — его
 * содержимое уже в payload JWS, бэкенд восстанавливает его при верификации.
 * @param {Array} messages - старые echomail-сообщения (локально содержат data)
 * @param {object} opts { echo, to, echoes }
 * @returns {Promise<{messages: Array, skipped: number, total: number}>}
 */
export async function buildRefillResponseChunks(messages, { echo, to, echoes }) {
  const maxMessageSize = resolveRefillMaxMessageSize(echoes, echo)
  // Передаём только сообщения, которые бэкенд сможет проверить и доставить
  // (с непустой подписью); без-jws (welcome/error) отбрасываем.
  const refillable = (messages || []).filter(isRefillableMessage)
  const droppedNoJws = (messages || []).length - refillable.length
  // Wire-форма: data не дублируется (уже в JWS). Размер меряем по wire-форме.
  const wireForm = refillable.map(toRefillWireForm)
  const { chunks, skipped } = splitRefillChunks(wireForm, maxMessageSize)

  const signed = []
  for (const chunk of chunks) {
    const data = {
      proto: 'refill',
      type: 'response',
      echo,
      // Уникальная дата -> уникальный jws/message_id у каждого отправляемого
      // ответа (иначе повторная отправка падала бы в UNIQUE messages.message_id).
      date: new Date().toISOString(),
      refill: { echo, to, messages: chunk },
    }
    signed.push(await createSignedMessage('refill', data, { echo_name: echo }))
  }

  return { messages: signed, skipped: skipped + droppedNoJws, total: (messages || []).length }
}
