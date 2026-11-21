<template>
  <div>
    <button @click="startScanning" class="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm flex items-center gap-1">
      📷 {{ t('qr.scan') }}
    </button>

    <div v-if="scanning" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="stopScanning">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="font-bold text-lg mb-4 dark:text-white">{{ t('qr.scanTitle') }}</h3>

        <video ref="video" class="w-full rounded mb-4 bg-black" autoplay playsinline></video>

        <div v-if="error" class="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">{{ error }}</div>
        <div v-if="result" class="mb-3 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-300 text-sm break-all">{{ result }}</div>

        <div class="flex justify-end gap-3">
          <button @click="stopScanning" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">{{ t('app.close') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationsStore } from '../stores/notifications'
import { parseInviteURL } from '../services/invite'

const props = defineProps({
  // 'merge' — the QR is another node's invite: emit its URL + public key for the
  //           merge request (which goes to OUR node, so the API URL is not changed).
  // 'invite' — apply the QR as a node invite (node URL + key + voucher).
  mode: { type: String, default: 'merge' },
})

const emit = defineEmits(['scanned', 'invite'])

const { t } = useI18n()
const notifications = useNotificationsStore()
const scanning = ref(false)
const video = ref(null)
const error = ref('')
const result = ref('')
let stream = null
let animationId = null

async function startScanning() {
  scanning.value = true
  error.value = ''
  result.value = ''

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    if (video.value) {
      video.value.srcObject = stream
      await video.value.play()
      scanLoop()
    }
  } catch (err) {
    error.value = 'Camera access denied: ' + err.message
  }
}

async function scanLoop() {
  if (!scanning.value) return

  const videoEl = video.value
  if (!videoEl || videoEl.readyState < 2) {
    animationId = requestAnimationFrame(scanLoop)
    return
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth
    canvas.height = videoEl.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoEl, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { default: jsQR } = await import('jsqr')
    const code = jsQR(imageData.data, imageData.width, imageData.height)

    if (code) {
      result.value = code.data
      stopScanning()
      handleScannedUrl(code.data)
      return
    }
  } catch { /* scan error, continue */ }

  animationId = requestAnimationFrame(scanLoop)
}

async function handleScannedUrl(url) {
  const invite = parseInviteURL(url)
  if (!invite) {
    notifications.error(t('qr.invalidCode'), t('qr.title'))
    return
  }

  // Invite mode (joining a node): the QR carries the node key and, optionally,
  // a voucher code. The caller applies it and restarts the policy flow.
  if (props.mode === 'invite') {
    if (!invite.pubkey && !invite.voucher) {
      notifications.warning(t('qr.notAnInvite'), t('qr.title'))
      return
    }
    if (confirm(t('qr.applyInviteConfirm', { url: invite.baseUrl }))) {
      emit('invite', invite)
      notifications.success(t('qr.inviteApplied', { url: invite.baseUrl }), t('qr.inviteTitle'))
    }
    return
  }

  // Merge mode: the QR is another node's invite (URL + public key). The merge
  // request is sent to OUR node, so the API base URL must not change here.
  if (!invite.pubkey) {
    notifications.error(t('qr.noNodeKey'), t('qr.title'))
    return
  }
  if (confirm(t('qr.mergeConfirm', { url: invite.baseUrl }))) {
    emit('scanned', { url: invite.baseUrl, pubkey: invite.pubkey, address: invite.address })
  }
}

function stopScanning() {
  scanning.value = false
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
}

onUnmounted(stopScanning)
</script>
