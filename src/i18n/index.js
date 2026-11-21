import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import ru from './locales/ru.json'

const messages = {
  en,
  ru
}

function detectBrowserLocale() {
  const langs = navigator.languages || [navigator.language || 'en']
  for (const lang of langs) {
    const match = ['en', 'ru'].find(l => lang.startsWith(l))
    if (match) return match
  }
  return 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: detectBrowserLocale(),
  fallbackLocale: 'en',
  messages,
})

export function getBrowserLocale() {
  return detectBrowserLocale()
}

export default i18n