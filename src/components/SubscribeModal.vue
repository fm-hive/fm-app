<template>
  <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg dark:text-white">{{ t('echoes.manageSubscriptions') }}</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
      </div>

      <div class="mb-3 flex gap-2">
          <button @click="goRemoteSubscribe" class="px-3 py-1 text-sm border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {{ t('remoteSubscribe.title') }}
          </button>
      </div>
      <div class="space-y-1 max-h-[50vh] overflow-y-auto">
        <div v-for="echoItem in sortedEchoes" :key="echoItem.name"
          class="flex items-center justify-between p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium dark:text-gray-200 flex items-center gap-2">
              {{ echoItem.name }}
              <span v-if="!echoItem.subscribed && !echoItem.no_subscribe" class="text-xs text-blue-500 font-normal">{{ t('echoes.new') }}</span>
            </div>
            <div v-if="echoItem.description" class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ echoItem.description }}</div>
          </div>
          <!-- System echoes (e.g. the admin broadcast echo) deliver their
               messages automatically and cannot be subscribed to (#234). -->
          <span
            v-if="echoItem.no_subscribe"
            class="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded flex-shrink-0"
            :title="t('echoes.systemEchoHint')"
          >{{ t('echoes.systemEcho') }}</span>
          <button
            v-else-if="echoItem.subscribed"
            @click="unsubscribe(echoItem.name)"
            class="ml-2 px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0 dark:text-gray-300"
          >{{ t('echoes.unsubscribe') }}</button>
          <button
            v-else
            @click="subscribe(echoItem.name)"
            class="ml-2 px-2 py-0.5 text-xs bg-blue-500 text-white rounded flex-shrink-0"
          >{{ t('echoes.subscribe') }}</button>
        </div>
      </div>
    </div>

    <!-- Rules acceptance overlay -->
    <div v-if="rulesAccept" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" @click.self="cancelRulesAccept">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h3 class="font-bold text-lg mb-4 dark:text-white">{{ rulesAccept.name }} — {{ t('echoes.rules') }}</h3>
        <div v-if="rulesAccept.text" class="text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded mb-4 dark:text-gray-200">
          <MarkdownRenderer :content="rulesAccept.text" />
        </div>
        <div v-if="rulesAccept.paramsJson" class="text-sm">
          <h4 class="font-medium text-gray-600 dark:text-gray-400 mb-2">{{ t('echoes.rulesParams') }}</h4>
          <pre class="text-xs whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded dark:text-gray-300">{{ rulesAccept.paramsJson }}</pre>
        </div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">{{ t('echoes.acceptRulesHint') }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button @click="cancelRulesAccept" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded dark:text-gray-300">{{ t('app.cancel') }}</button>
          <button @click="acceptRulesAndSubscribe" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:text-white text-sm">
            {{ t('echoes.acceptAndSubscribe') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEchoStore } from '../stores/echo'
import { useNotificationsStore } from '../stores/notifications'
import { useIdentityStore } from '../stores/identity'
import { apiService } from '../services/api'
import { buildRulesSignature } from '../utils/rules'
import MarkdownRenderer from './MarkdownRenderer.vue'

const { t } = useI18n()
const echo = useEchoStore()
const notifications = useNotificationsStore()
const identity = useIdentityStore()

const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'remote-subscribe'])

const rulesAccept = ref(null)

function goRemoteSubscribe() {
  emit('remote-subscribe')
}

const sortedEchoes = computed(() => {
  const list = [...echo.echoes]
  list.sort((a, b) => {
    const aSub = a.subscribed || echo.subscribedEchoes.includes(a.name)
    const bSub = b.subscribed || echo.subscribedEchoes.includes(b.name)
    if (aSub !== bSub) return aSub ? 1 : -1
    return 0
  })
  return list
})

async function subscribe(echoName) {
  const item = echo.echoes.find(e => e.name === echoName)
  if (!item) return
  if (item.rules) {
    openRulesAccept(item)
    return
  }
  await performSubscribe(item)
}

function openRulesAccept(item) {
  let text = ''
  let paramsJson = ''
  try {
    const obj = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules
    if (obj && typeof obj === 'object') {
      text = typeof obj.text === 'string' ? obj.text : (obj.text != null ? String(obj.text) : '')
      const { text: _omitText, ...params } = obj
      paramsJson = Object.keys(params).length ? JSON.stringify(params, null, 2) : ''
    } else {
      text = String(item.rules)
    }
  } catch {
    text = String(item.rules)
  }
  rulesAccept.value = { name: item.name, text, paramsJson }
}

function cancelRulesAccept() {
  rulesAccept.value = null
}

async function acceptRulesAndSubscribe() {
  const pending = rulesAccept.value
  if (!pending) return
  const item = echo.echoes.find(e => e.name === pending.name)
  if (!item) {
    rulesAccept.value = null
    return
  }
  if (identity.privateKey && identity.publicKey) {
    try {
      const sig = await buildRulesSignature(item.rules, identity.privateKey, identity.publicKey)
      await apiService.acceptRules({ echo_name: item.name, ...sig })
    } catch (err) {
      rulesAccept.value = null
      notifications.error(err.message, t('echoes.acceptRulesError'))
      return
    }
  }
  rulesAccept.value = null
  await performSubscribe(item)
}

async function performSubscribe(item) {
  const echoName = item.name
  try {
    await apiService.subscribeEcho({ echo_name: echoName })
    echo.subscribe(echoName)
    item.subscribed = true
  } catch (err) {
    if ((err.message.includes('Already subscribed') || err.message.includes('409')) && !err.message.includes('Rules have changed')) {
      echo.subscribe(echoName)
      item.subscribed = true
      return
    }
    notifications.error(err.message, t('echoes.subscribeError'))
  }
}

async function unsubscribe(echoName) {
  try {
    await apiService.unsubscribeEcho({ echo_name: echoName })
    echo.unsubscribe(echoName)
    const item = echo.echoes.find(e => e.name === echoName)
    if (item) item.subscribed = false
  } catch (err) {
    if (err.message.includes('Subscription not found') || err.message.includes('404')) {
      echo.unsubscribe(echoName)
      const item = echo.echoes.find(e => e.name === echoName)
      if (item) item.subscribed = false
      return
    }
    notifications.error(err.message, t('echoes.unsubscribeError'))
  }
}

</script>
