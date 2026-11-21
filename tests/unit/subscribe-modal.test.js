import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import SubscribeModal from '../../src/components/SubscribeModal.vue'
import { useEchoStore } from '../../src/stores/echo'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountModal() {
  return mount(SubscribeModal, {
    props: { visible: true },
    global: { plugins: [i18n], stubs: { MarkdownRenderer: true } },
  })
}

function rowOf(wrapper, name) {
  return wrapper.findAll('.space-y-1 > div').find(r => r.text().includes(name))
}

describe('SubscribeModal system echoes (#234)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hides the subscribe action for a system echo and labels it', () => {
    const echo = useEchoStore()
    echo.echoes = [
      { id: 1, name: 'Newcomers', description: '', subscribed: false },
      { id: 2, name: 'Broadcasts', description: 'Admin-only echo for broadcast messages', subscribed: false, no_subscribe: true },
    ]
    const wrapper = mountModal()

    const system = rowOf(wrapper, 'Broadcasts')
    expect(system.text()).toContain('System echo')
    expect(system.find('button').exists()).toBe(false)
    expect(system.text()).not.toContain('new')

    // A regular echo keeps its subscribe button.
    const normal = rowOf(wrapper, 'Newcomers')
    expect(normal.find('button').text()).toBe('Subscribe')
  })

  it('keeps the unsubscribe button for subscribed echoes', () => {
    const echo = useEchoStore()
    echo.echoes = [{ id: 1, name: 'Newcomers', subscribed: true }]
    const wrapper = mountModal()

    expect(rowOf(wrapper, 'Newcomers').find('button').text()).toBe('Unsubscribe')
  })
})
