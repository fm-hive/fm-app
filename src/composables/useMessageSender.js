import { ref } from 'vue'
import { useOutbox } from './useOutbox'
import { keyService } from '../services/keyService'
import { useSettingsStore } from '../stores/settings'

export function useMessageSender() {
  const sending = ref(false)
  const error = ref(null)

  /**
   * Auto-flush a freshly queued entry (privacy.autoFlush*). The entry is
   * already in the outbox, so a failure only warns: the user can still send it
   * manually. Rate-limit blocks notify from the outbox itself.
   */
  async function autoFlush(outbox, id) {
    try {
      await outbox.flushEntry(id)
    } catch (err) {
      console.warn('[useMessageSender] auto-flush failed', err)
      try {
        const { useNotificationsStore } = await import('../stores/notifications')
        const { default: i18n } = await import('../i18n')
        useNotificationsStore().warning(
          i18n.global.t('outbox.autoFlushFailed', { error: err.message }),
          i18n.global.t('outbox.autoFlushFailedTitle'),
        )
      } catch (e) {
        console.warn('[useMessageSender] auto-flush notification failed', e)
      }
    }
  }

  // Echo messages are queued with raw data; they are signed at send time.
  // extraEntry carries outbox-only fields (e.g. dedupKey for message updates).
  async function sendToEcho(echoName, messageType, data, extraOptions = {}, extraEntry = {}) {
    sending.value = true
    error.value = null
    try {
      const outbox = useOutbox()
      const label = data.subject || data.message || data.body?.slice(0, 60) || messageType
      const id = outbox.add({
        type: messageType,
        echoName,
        rawData: data,
        extraOptions,
        label,
        detail: data.body?.slice(0, 120) || data.variants?.join(', ') || '',
        ...extraEntry,
      })
      if (useSettingsStore().privacy?.autoFlushEchomail === true) {
        await autoFlush(outbox, id)
      }
      return { queued: true }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      sending.value = false
    }
  }

  /**
   * Netmail is always queued into the outbox as raw data (editable, not yet
   * encrypted); it is sent only when the user presses "Отправить" in the outbox
   * window. If the recipient key is unknown the entry is marked noKey and a key
   * request may be sent (auto-request per settings, or manual later).
   * Returns { queued, noKey, keyRequested } for the composer UI.
   */
  async function sendNetmail(recipientAddress, data) {
    sending.value = true
    error.value = null
    try {
      const outbox = useOutbox()
      const hasKey = keyService.hasPublicKey(recipientAddress)

      const label = data.subject || data.message?.slice(0, 60) || 'Netmail'
      const id = outbox.add({
        type: 'netmail',
        echoName: recipientAddress,
        recipient: recipientAddress,
        rawData: data,
        noKey: !hasKey,
        selected: hasKey, // если ключ есть — запись выбрана и ждёт кнопки «Отправить»
        label,
        detail: data.subject || '',
        dedupKey: `netmail_${recipientAddress}_${data.subject || ''}_${data.body || data.message || ''}`,
      })

      // Auto-flush when enabled and the recipient key is already known.
      if (hasKey && useSettingsStore().privacy?.autoFlushNetmail === true) {
        await autoFlush(outbox, id)
      }

      // Ключа нет: авто-запрос, если включён в настройках
      if (!hasKey) {
        const settings = useSettingsStore()
        if (settings.privacy.autoRequestPubkeys && !keyService.hasRequestedKey(recipientAddress)) {
          try {
            await keyService.requestPublicKey(recipientAddress, true)
            return { queued: true, noKey: true, keyRequested: true }
          } catch (err) {
            console.warn('[sendNetmail] auto-request failed', err)
          }
        }
      }
      return { queued: true, noKey: !hasKey }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      sending.value = false
    }
  }

  return {
    sending,
    error,
    sendToEcho,
    sendNetmail,
  }
}
