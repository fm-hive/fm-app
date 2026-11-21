import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import SenderLabel from '../../src/components/SenderLabel.vue'
import { useNamesStore } from '../../src/stores/names'
import { useIdentityStore } from '../../src/stores/identity'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountLabel(props) {
  return mount(SenderLabel, { props, global: { plugins: [i18n] } })
}

describe('SenderLabel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows the address with the directory name and a tooltip', () => {
    useNamesStore().record(':0:2', 'Bob')
    const wrapper = mountLabel({ address: ':0:2' })
    expect(wrapper.text()).toContain(':0:2')
    expect(wrapper.text()).toContain('Bob')
    expect(wrapper.find('.tip-box').exists()).toBe(true)
    expect(wrapper.find('.tip-box').text()).toContain('Bob')
  })

  it('lists all known names in the tooltip when there are several', () => {
    const names = useNamesStore()
    names.record(':0:2', 'Bob')
    names.record(':0:2', 'Robert')
    const wrapper = mountLabel({ address: ':0:2' })
    expect(wrapper.text()).toContain('Known names')
    expect(wrapper.text()).toContain('Bob')
    expect(wrapper.text()).toContain('Robert')
  })

  it('prefers the name from the message and marks alternates', () => {
    const names = useNamesStore()
    names.record(':0:2', 'Bob')
    names.record(':0:2', 'Robert')
    const wrapper = mountLabel({ address: ':0:2', nameFromMessage: 'Bobby' })
    expect(wrapper.text()).toContain('Bobby')
    expect(wrapper.find('.sender-star').exists()).toBe(true)
  })

  it('accepts an explicit name override', () => {
    const wrapper = mountLabel({ address: ':0:2', name: 'Contact Name' })
    expect(wrapper.text()).toContain('Contact Name')
  })

  it('renders Me for the own address', () => {
    useIdentityStore().setUser({ address: ':0:28', name: 'Me User' })
    const wrapper = mountLabel({ address: ':0:28', me: true })
    expect(wrapper.text()).toBe('Me')
  })

  it('renders a plain address when nothing is known', () => {
    const wrapper = mountLabel({ address: ':0:9' })
    expect(wrapper.text()).toBe(':0:9')
    expect(wrapper.find('.tip-box').exists()).toBe(false)
  })
})
