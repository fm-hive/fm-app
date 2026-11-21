<template>
  <div>
    <button @click="show = true" class="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm flex items-center gap-1">
      📱 {{ t('qr.show') }}
    </button>

    <div v-if="show" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="show = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 text-center">
        <h3 class="font-bold text-lg mb-4 dark:text-white">{{ t('qr.title') }}</h3>
        <canvas ref="canvas" class="mx-auto mb-4"></canvas>
        <p v-if="url" class="text-sm text-gray-600 dark:text-gray-400 break-all mb-4">{{ url }}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">{{ t('qr.scanToConnect') }}</p>
        <div class="flex justify-center gap-3">
          <button @click="copyUrl" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {{ t('qr.copyUrl') }}
          </button>
          <button @click="show = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded dark:text-gray-300">{{ t('app.close') }}</button>
        </div>
        <div v-if="copied" class="mt-2 text-sm text-green-600">{{ t('qr.copied') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  url: { type: String, required: true }
})

const { t } = useI18n()
const show = ref(false)
const canvas = ref(null)
const copied = ref(false)

watch(show, async (val) => {
  if (val) {
    await nextTick()
    generateQR()
  }
})

async function generateQR() {
  if (!canvas.value || !props.url) return
  try {
    const QRCode = await import('qrcode')
    QRCode.toCanvas(canvas.value, props.url, {
      width: 256,
      margin: 2,
      color: { dark: '#000', light: '#fff' }
    })
  } catch (err) {
    console.error('QR generation failed:', err)
  }
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* ignore */ }
}
</script>
