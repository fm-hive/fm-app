import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref(localStorage.getItem('theme') || 'system')
  
  const isDark = computed(() => {
    if (theme.value === 'dark') return true
    if (theme.value === 'light') return false
    // system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  
  const themeClass = computed(() => {
    if (theme.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme.value
  })
  
  function setTheme(newTheme) {
    if (!['light', 'dark', 'system'].includes(newTheme)) {
      console.error('Invalid theme:', newTheme)
      return
    }
    theme.value = newTheme
    localStorage.setItem('theme', newTheme)
    applyTheme()
  }
  
  function toggleTheme() {
    if (theme.value === 'system') {
      // If system, switch to opposite of current preference
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark')
    } else {
      setTheme(theme.value === 'light' ? 'dark' : 'light')
    }
  }
  
  function applyTheme() {
    const root = document.documentElement
    const currentThemeClass = themeClass.value
    
    // Remove existing theme classes
    root.classList.remove('light', 'dark')
    
    // Add current theme class
    if (currentThemeClass) {
      root.classList.add(currentThemeClass)
    }
    
    // Update data-theme attribute for compatibility
    root.setAttribute('data-theme', currentThemeClass)
  }
  
  // Initialize theme on store creation
  applyTheme()
  
  // Watch for system theme changes if theme is set to 'system'
  if (theme.value === 'system') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
  }
  
  // Clean up event listener on store unmount
  const stopWatcher = watch(theme, (newTheme) => {
    if (newTheme === 'system') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
    } else {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', applyTheme)
    }
  })
  
  return {
    theme,
    isDark,
    themeClass,
    setTheme,
    toggleTheme,
    applyTheme
  }
})