import { apiService } from './api'
import * as crypto from './crypto'
import { ref } from 'vue'
import { useIdentityStore } from '../stores/identity'
import i18n from '../i18n/index'

/**
 * Сервис управления публичными ключами других пользователей.
 * Запрашивает ключи через service/pubkey, кеширует их локально,
 * обрабатывает входящие запросы ключей с дедупликацией.
 * Вся структура данных (keyCache, requestedKeys, pendingPubkeyRequests):
 *   - keyCache:        адрес -> { signPublicKey (Uint8Array), keyThumbprint, x25519PublicKey (Uint8Array|null) }
 *   - requestedKeys:   адрес -> { requestedAt: timestamp, autoRequested: boolean }
 *   - pendingPubkeyRequests: Set<адрес> — для дедупликации входящих запросов
 */
class KeyService {
  constructor() {
    // Cache of known public keys: address -> { signPublicKey, keyThumbprint, x25519PublicKey }
    this.keyCache = new Map()
    // Track requested keys: address -> { requestedAt: timestamp, autoRequested: boolean }
    this.requestedKeys = new Map()
    // Track pending incoming pubkey requests for dedup: Set<address>
    // Не сохраняется между сессиями — dedup только в рамках одного page load
    this.pendingPubkeyRequests = new Set()
    // Track addresses we've already responded to (persistent): Map<address, timestamp>
    this.respondedPubkeys = new Map()
    // Реактивная версия кеша — увеличивается при добавлении ключа (для перерисовки UI)
    this.keyCacheVersion = ref(0)
    this.loadFromStorage()
    // Сбрасываем dedup при загрузке страницы, чтобы не блокировать повторные запросы
    this.pendingPubkeyRequests.clear()
  }

  /**
   * Загружает кеш ключей, запрошенные ключи и ожидающие запросы из localStorage
   * @private
   */
  loadFromStorage() {
    try {
      const cached = localStorage.getItem('fm_key_cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        for (const [address, data] of Object.entries(parsed)) {
          // Convert base64 strings back to Uint8Array
          const keyInfo = {
            signPublicKey: Uint8Array.from(atob(data.signPublicKey), c => c.charCodeAt(0)),
            keyThumbprint: data.keyThumbprint,
            x25519PublicKey: data.x25519PublicKey ? 
              Uint8Array.from(atob(data.x25519PublicKey), c => c.charCodeAt(0)) : null
          }
          this.keyCache.set(address, keyInfo)
        }
      }
      
      const requested = localStorage.getItem('fm_key_requests')
      if (requested) {
        this.requestedKeys = new Map(Object.entries(JSON.parse(requested)))
      }
      
      // pendingPubkeyRequests intentionally NOT loaded from storage — session-only dedup

      const responded = localStorage.getItem('fm_responded_pubkeys')
      if (responded) {
        this.respondedPubkeys = new Map(Object.entries(JSON.parse(responded)))
      }

      const settings = localStorage.getItem('fm_key_settings')
      if (settings) {
        const parsed = JSON.parse(settings)
        this.autoRequest = parsed.autoRequest || false
      }
    } catch (err) {
      console.warn('Failed to load key cache from storage:', err)
    }
  }

  /**
   * Сохраняет кеш ключей, запрошенные ключи и ожидающие запросы в localStorage
   * @private
   */
  saveToStorage() {
    try {
      // Convert Uint8Array to base64 for storage
      const cacheObj = {}
      for (const [address, data] of this.keyCache.entries()) {
        cacheObj[address] = {
          signPublicKey: btoa(String.fromCharCode(...data.signPublicKey)),
          keyThumbprint: data.keyThumbprint,
          x25519PublicKey: data.x25519PublicKey ? 
            btoa(String.fromCharCode(...data.x25519PublicKey)) : null
        }
      }
      localStorage.setItem('fm_key_cache', JSON.stringify(cacheObj))
      
      localStorage.setItem('fm_key_requests', JSON.stringify(Object.fromEntries(this.requestedKeys)))

      localStorage.setItem('fm_responded_pubkeys', JSON.stringify(Object.fromEntries(this.respondedPubkeys)))

      localStorage.setItem('fm_key_settings', JSON.stringify({
        autoRequest: this.autoRequest
      }))
    } catch (err) {
      console.warn('Failed to save key cache to storage:', err)
    }
  }

  /**
   * Возвращает публичный ключ для указанного адреса.
   * Если ключ есть в кеше — возвращает его, иначе бросает NO_PUBLIC_KEY.
   * @param {string} address - FM-адрес (напр. ':0:22')
   * @returns {Promise<{signPublicKey: Uint8Array, keyThumbprint: string, x25519PublicKey: Uint8Array}>}
   */
  async getPublicKey(address) {
    // Сначала проверяем кеш
    const cached = this.keyCache.get(address)
    if (cached) {
      return cached
    }

    // Ключ не найден — бросаем ошибку для UI (показывает кнопку «запросить ключ»)
    throw new Error('NO_PUBLIC_KEY')
  }

  /**
   * Запрашивает публичный ключ через service/pubkey endpoint.
   * Отправляет service-сообщение; ключ приходит асинхронно как netmail.
   * @param {string} address - Целевой адрес
   * @param {boolean} autoRequested - Был ли запрос автоматическим
   * @returns {Promise} Разрешается при принятии запроса (не при получении ключа)
   */
  async requestPublicKey(address, autoRequested = false) {
    // Получаем свой публичный ключ для поля requestor_pubkey
    const identity = useIdentityStore()
    let requestorPubkey = null
    if (identity.signPublicKey) {
      requestorPubkey = btoa(String.fromCharCode(...identity.signPublicKey))
    } else {
      console.warn('No sign public key available for requestor_pubkey')
    }
    
    // Формируем service-сообщение
    const serviceMsg = {
      type: 'pubkey',
      address,
    }
    if (requestorPubkey) {
      serviceMsg.requestor_pubkey = requestorPubkey
    }
    
    // Отправляем запрос
    const response = await apiService.service([serviceMsg])

    // Ответ: [{ index: 0, status: 'request_accepted' }]
    // Сам ключ придёт позже как netmail
    console.log('Pubkey request sent for', address, response)

    // Показать пользователю, что запрос был отправлен
    const ok = Array.isArray(response) && response.some(r => r.status === 'request_accepted')
    try {
      const { useNotificationsStore } = await import('../stores/notifications')
      const notifications = useNotificationsStore()
      // Call the global composer directly: extracting `t` into a variable
      // loses its binding and the raw key is rendered (#275).
      if (ok) {
        notifications.info(
          `${autoRequested ? '🔑 ' : ''}${i18n.global.t('netmail.keyRequestedFor', { address })}`,
          i18n.global.t('netmail.keyRequestSentTitle'),
        )
      } else {
        notifications.error(
          i18n.global.t('netmail.keyRequestFailedFor', { address }),
          i18n.global.t('netmail.keyRequestSentTitle'),
        )
      }
    } catch (err) {
      console.warn('[keyService] notification failed', err)
    }
    
    // Сохраняем timestamp запроса
    this.requestedKeys.set(address, {
      requestedAt: Date.now(),
      autoRequested
    })
    this.saveToStorage()
    
    return response
  }

  /**
   * Сохраняет публичный ключ, полученный из netmail (pubkey_response).
   * Конвертирует Ed25519 -> X25519 для последующего шифрования.
   * @param {Object} netmailData - Распарсенные данные из netmail
   * @param {string} netmailData.address - Адрес владельца ключа
   * @param {string} netmailData.sign_public_key - Ed25519 ключ в base64
   * @param {string} netmailData.key_thumbprint - Отпечаток ключа
   */
  storePublicKey(netmailData) {
    const { address, sign_public_key, key_thumbprint } = netmailData
    const signPublicKey = Uint8Array.from(atob(sign_public_key), c => c.charCodeAt(0))
    
    // Конвертируем в X25519 для шифрования (если не получится — сохраняем без X25519)
    let x25519PublicKey
    try {
      x25519PublicKey = crypto.ed25519PublicKeyToX25519(signPublicKey)
    } catch (err) {
      console.warn('Failed to convert public key to X25519:', err)
      // Всё равно сохраняем, конвертация может быть сделана позже
      x25519PublicKey = null
    }

    const keyInfo = {
      signPublicKey,
      keyThumbprint: key_thumbprint,
      x25519PublicKey,
    }

    this.keyCache.set(address, keyInfo)
    // Удаляем из запрошенных — ключ теперь у нас есть
    this.requestedKeys.delete(address)
    this.saveToStorage()
    // Увеличиваем версию верификации — MessageList перепроверит подписи
    this._verifyVersion = (this._verifyVersion || 0) + 1
    // Увеличиваем реактивную версию — outbox обновит маркер «нет ключа»
    this.keyCacheVersion.value++

    console.log('Stored public key for', address)

    // Письма, ждавшие ключ, теперь разблокированы (hasKey=true в OutboxDialog через
    // keyCacheVersion). Авто-отправка НЕ выполняется — пользователь сам жмёт «Отправить».
  }

  /**
   * Возвращает X25519 публичный ключ для шифрования.
   * null, если ключ не найден или конвертация не удалась.
   */
  getX25519PublicKey(address) {
    const cached = this.keyCache.get(address)
    if (!cached) return null
    return cached.x25519PublicKey
  }

  /**
   * Проверяет, есть ли у нас публичный ключ для адреса.
   */
  hasPublicKey(address) {
    return this.keyCache.has(address)
  }

  /**
   * Был ли уже запрошен ключ (но ещё не получен).
   */
  hasRequestedKey(address) {
    return this.requestedKeys.has(address)
  }

  /**
   * Возвращает статус запроса ключа.
   * @returns {Object|null} { requestedAt: timestamp, autoRequested: boolean }
   */
  getRequestStatus(address) {
    return this.requestedKeys.get(address) || null
  }

  /**
   * Включает/выключает авто-запрос ключей.
   */
  setAutoRequest(enabled) {
    this.autoRequest = enabled
    this.saveToStorage()
  }

  /**
   * Пытается получить ключ с опциональным авто-запросом.
   * Если ключа нет и autoRequest включён — отправляет запрос автоматически.
   * @returns {Promise<keyInfo|null>} Инфо о ключе если есть, null если отправлен запрос
   * @throws {Error} NO_PUBLIC_KEY если нет ключа и autoRequest выключен
   */
  async getPublicKeyWithAutoRequest(address) {
    // Сначала кеш
    const cached = this.keyCache.get(address)
    if (cached) {
      return cached
    }

    // Если авто-запрос включён и ключ ещё не запрашивался — запрашиваем
    if (this.autoRequest && !this.requestedKeys.has(address)) {
      try {
        await this.requestPublicKey(address, true)
        return null // Ключ запрошен, но ещё не получен
      } catch (err) {
        console.warn('Auto-request failed:', err)
        // Падаем в NO_PUBLIC_KEY
      }
    }

    throw new Error('NO_PUBLIC_KEY')
  }

  /**
   * Проверяет, показывали ли мы уже уведомление о входящем запросе ключа с этого адреса.
   * Используется для дедупликации уведомлений.
   */
  hasPendingPubkeyRequest(address) {
    return this.pendingPubkeyRequests.has(address)
  }

  /**
   * Добавляет адрес в список «ожидающих ответа» (дедупликация).
   */
  addPendingPubkeyRequest(address) {
    this.pendingPubkeyRequests.add(address)
    this.saveToStorage()
  }

  /**
   * Удаляет адрес из ожидающих (пользователь ответил Send или Ignore).
   */
  removePendingPubkeyRequest(address) {
    this.pendingPubkeyRequests.delete(address)
    this.saveToStorage()
  }

  /**
   * Проверяет, отвечали ли мы уже на запрос ключа с этого адреса.
   */
  hasRespondedPubkey(address) {
    return this.respondedPubkeys.has(address)
  }

  /**
   * Отмечает адрес как «уже ответили на запрос ключа».
   */
  addRespondedPubkey(address) {
    this.respondedPubkeys.set(address, Date.now())
    this.saveToStorage()
  }

  /**
   * Очищает кеш и все запросы (для тестирования или выхода).
   */
  clearCache() {
    this.keyCache.clear()
    this.requestedKeys.clear()
    this.pendingPubkeyRequests.clear()
    this.respondedPubkeys.clear()
    this.saveToStorage()
  }
}

export const keyService = new KeyService()