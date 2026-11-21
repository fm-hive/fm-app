<script setup>
import { useThemeStore } from '../stores/theme'
import { computed } from 'vue'

const themeStore = useThemeStore()

const themeIcon = computed(() => {
  if (themeStore.theme === 'light') return '☀️'
  if (themeStore.theme === 'dark') return '🌙'
  return '🌓'
})

function cycleTheme() {
  const themes = ['light', 'dark', 'system']
  const idx = themes.indexOf(themeStore.theme)
  themeStore.setTheme(themes[(idx + 1) % themes.length])
}
</script>

<template>
  <button
    @click="cycleTheme"
    class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-lg"
    :title="themeStore.theme"
    aria-label="Toggle theme"
  >
    {{ themeIcon }}
  </button>
</template>
