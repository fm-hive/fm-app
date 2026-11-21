import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import CollapsibleContent from '../../src/components/CollapsibleContent.vue'
import { useSettingsStore } from '../../src/stores/settings'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountBody(props) {
  // Use the active pinia so the test can configure the settings store
  return mount(CollapsibleContent, { props, global: { plugins: [i18n] } })
}

describe('CollapsibleContent tagline (#309)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the tagline as a separate line under the body', () => {
    const wrapper = mountBody({ content: 'hello', tagline: '— Ivan' })
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('— Ivan')
  })

  it('renders the tagline inside the clamped element (hidden while collapsed)', () => {
    const wrapper = mountBody({ content: 'a long message', tagline: '— Ivan' })
    // The tagline must live inside the element that receives max-height, so a
    // collapsed card hides it.
    const clamped = wrapper.element.querySelector('div')
    expect(clamped.textContent).toContain('a long message')
    expect(clamped.textContent).toContain('— Ivan')
    expect(clamped.querySelector('[title="Tagline"]')).toBeTruthy()
  })

  it('renders nothing extra without a tagline', () => {
    const wrapper = mountBody({ content: 'hello' })
    expect(wrapper.text().trim()).toBe('hello')
  })
})

describe('CollapsibleContent no-collapse (#322)', () => {
  it('renders the content fully expanded without the toggle button', async () => {
    const longContent = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    const wrapper = mountBody({ content: longContent, maxHeight: 40, noCollapse: true })
    await new Promise(r => setTimeout(r, 30))
    const body = wrapper.element.querySelector('div')
    // No max-height clamp and no "expand/collapse" button
    expect(body.getAttribute('style')).toBeNull()
    expect(wrapper.text()).not.toContain('Show more')
  })

  it('keeps the toggle when noCollapse is off', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 500 })
    try {
      const longContent = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
      const wrapper = mountBody({ content: longContent, maxHeight: 40 })
      await new Promise(r => setTimeout(r, 30))
      expect(wrapper.text()).toContain('Show more')
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
      else delete HTMLElement.prototype.scrollHeight
    }
  })
})

describe('CollapsibleContent tearline (#311)', () => {
  it('shows the tearline under the tagline when enabled', async () => {
    const settings = useSettingsStore()
    settings.userProfile.showTearline = true
    const wrapper = mountBody({ content: 'hello', tagline: '— Ivan', tearline: 'fm-app v1.2.3 :0:1' })
    const text = wrapper.text()
    expect(text).toContain('... — Ivan')
    expect(text).toContain('--- fm-app v1.2.3 :0:1')
    // The tagline comes first
    expect(text.indexOf('— Ivan')).toBeLessThan(text.indexOf('fm-app v1.2.3'))
  })

  it('hides the tearline when the setting is off (default)', () => {
    useSettingsStore().userProfile.showTearline = false
    const wrapper = mountBody({ content: 'hello', tagline: '— Ivan', tearline: 'fm-app v1.2.3 :0:1' })
    expect(wrapper.text()).toContain('... — Ivan')
    expect(wrapper.text()).not.toContain('fm-app v1.2.3')
  })
})
