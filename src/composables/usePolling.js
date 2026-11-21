import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useSettingsStore } from '../stores/settings'
import { useEchoStore } from '../stores/echo'
import { useNotificationsStore } from '../stores/notifications'

// Shared polling state. usePolling() is instantiated by App.vue and by the
// views (Home/Echoes/Netmail); without sharing, every instance ran its own
// 30s timer and the node saw several identical poll requests (issue #257).
const status = ref('idle') // 'idle' | 'polling' | 'ok' | 'error'
const lastPollTime = ref(null)
const pollVersion = ref(0)
let timer = null
let inFlight = false
let activeInstances = 0
let translate = (key) => key

/**
 * Polling composable for periodic send_receive calls.
 * Shows request-response status in the header.
 */
export function usePolling() {
  const identity = useIdentityStore()
  const settings = useSettingsStore()
  const { t } = useI18n()
  translate = t
  activeInstances++

  async function poll() {
    if (inFlight) return
    inFlight = true
    try {
      await doPoll()
    } finally {
      inFlight = false
    }
  }

  async function doPoll() {
    if (!identity.hasKeys || !identity.user?.address) return
    status.value = 'polling'
    try {
      const echo = useEchoStore()
      const notifications = useNotificationsStore()
      const { fetchMessages } = await import('../services/message')
      const messages = await fetchMessages()
      if (messages && messages.length > 0) {
        const echoByName = {}
        const newErrors = []
        for (const msg of messages) {
          // Пропускаем внутренние протокольные сообщения (pubkey_request/response)
          if (msg._internal) continue

          const echoName = msg.type === 'netmail' ? '__netmail__' : (msg.echo_name || msg.echo)
          if (!echoName) continue
          if (!echoByName[echoName]) echoByName[echoName] = []

          const isDup = echo.messages[echoName]?.some(m => m.message_id === msg.message_id)
          if (isDup) {
            msg._isDup = true
          }

          echoByName[echoName].push(msg)
          if (msg.type === 'netmail') {
            console.log('[poll] netmail received', 'from', msg.sender_address, 'msg_id', msg.message_id)
          }
          // Новое сообщение-ошибка от ноды — показываем тост (дедуп по message_id)
          if (!isDup) {
            const errText = errorTextOf(msg)
            if (errText) newErrors.push(errText)
          }
        }
        for (const [name, msgs] of Object.entries(echoByName)) {
          echo.addMessages(name, msgs)
        }
        for (const errText of newErrors) {
          notifications.error(errText, translate('echoes.error'))
        }
      }
      // A merge may have reassigned this user's network prefix. The JWS key
      // is unchanged, so the node's identity endpoint maps it to the current
      // address; adopt it before the next send (issue #280).
      await identity.syncAdminStatus()
      status.value = 'ok'
      lastPollTime.value = new Date()
      pollVersion.value++
    } catch (err) {
      if (err.message.includes('Authentication failed')) {
        status.value = 'idle'
        return
      }
      if (err.message.includes('No policy signature')) {
        status.value = 'idle'
        stop()
        // Route into the policy re-sign flow WITHOUT deleting fm_user/keys and
        // without a hard reload (which previously could strand the app on
        // "Setup identity" after an import/restore).
        try {
          const { getActiveBoot } = await import('./useBoot')
          const active = getActiveBoot()
          if (active?.handlePolicySignatureMissing) {
            await active.handlePolicySignatureMissing()
            return
          }
        } catch (e) {
          console.warn('[poll] failed to route to policy re-sign', e)
        }
        // Fallback to legacy behaviour only if the boot handle is unavailable.
        localStorage.removeItem('fm_user')
        window.location.reload()
        return
      }
      if (err?.status === 429 || /429|Too many requests/i.test(err.message || '')) {
        // Node request limit (issue #209): show it in the status, not as a toast.
        status.value = 'rateLimited'
        return
      }
      console.warn('[poll] send_receive failed:', err.message)
      status.value = 'error'
    }
  }

  function start() {
    stopTimer()
    const interval = (settings.application?.refreshInterval || 30) * 1000
    poll() // immediate first poll
    timer = setInterval(poll, interval)
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    status.value = 'idle'
  }

  function stop() {
    stopTimer()
  }

  // Start/stop based on auth + registration + settings
  watch(
    () => [identity.hasKeys, identity.user?.address, settings.application?.autoRefresh],
    ([hasKeys, address, autoRefresh]) => {
      if (hasKeys && address && autoRefresh !== false) {
        start()
      } else {
        stop()
      }
    },
    { immediate: true }
  )

  // Restart on interval change
  watch(
    () => settings.application?.refreshInterval,
    () => {
      if (identity.hasKeys && identity.user?.address && settings.application?.autoRefresh !== false) {
        start()
      }
    }
  )

  function forcePoll() {
    stop()
    start()
  }

  onUnmounted(() => {
    activeInstances = Math.max(0, activeInstances - 1)
    if (activeInstances === 0) stopTimer()
  })

  return { status, lastPollTime, pollVersion, poll, forcePoll }
}

/** Вернуть текст, если сообщение — это ошибка от ноды (data.type === 'error') */
function errorTextOf(msg) {
  if (!msg?.data) return ''
  try {
    const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    return d && d.type === 'error' && typeof d.error === 'string' ? d.error : ''
  } catch { return '' }
}
