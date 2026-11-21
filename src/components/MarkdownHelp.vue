<template>
  <div class="inline-block">
    <button
      ref="btnRef"
      @click="toggle"
      class="w-5 h-5 text-xs rounded-full border border-gray-400 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700"
      :title="t('markdownHelp.title')"
    >?</button>

    <div v-if="show"
      class="fixed z-[100] w-72 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl text-xs select-none"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    >
      <div
        @pointerdown="startDrag"
        class="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 cursor-move"
      >
        <span class="font-semibold text-gray-700 dark:text-gray-200">{{ t('markdownHelp.title') }}</span>
        <button @click="show = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-base leading-none">&times;</button>
      </div>

      <div class="p-3">
        <table class="w-full text-gray-600 dark:text-gray-300">
          <tbody>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap"># Текст</td><td>{{ t('markdownHelp.header') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">**жирный**</td><td>{{ t('markdownHelp.bold') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">*курсив*</td><td>{{ t('markdownHelp.italic') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">[текст](url)</td><td>{{ t('markdownHelp.link') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">- пункт</td><td>{{ t('markdownHelp.list') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">1. пункт</td><td>{{ t('markdownHelp.orderedList') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">`код`</td><td>{{ t('markdownHelp.code') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">&gt; цитата</td><td>{{ t('markdownHelp.quote') }}</td></tr>
            <tr><td class="py-1 pr-2 font-mono whitespace-nowrap">![alt](url)</td><td>{{ t('markdownHelp.image') }}</td></tr>
          </tbody>
        </table>

        <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
          {{ t('markdownHelp.attachments') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const show = ref(false)
const pos = ref({ x: 0, y: 0 })
const btnRef = ref(null)

function toggle() {
  show.value = !show.value
  if (show.value) position()
}

function position() {
  const btn = btnRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  let x = r.right + 8
  let y = r.top
  if (x + 300 > window.innerWidth) {
    x = Math.max(8, r.left - 300 - 8)
  }
  pos.value = { x, y }
}

function startDrag(e) {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const origX = pos.value.x
  const origY = pos.value.y

  const onMove = (ev) => {
    pos.value = { x: origX + ev.clientX - startX, y: origY + ev.clientY - startY }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>
