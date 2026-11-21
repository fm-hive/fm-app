import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageEditor from '../../src/components/MessageEditor.vue'
import { useSettingsStore } from '../../src/stores/settings'
import en from '../../src/i18n/locales/en.json'

vi.mock('../../src/services/api', () => ({
  apiService: { sendReceive: vi.fn(async () => ({})), getEchoes: vi.fn(async () => []) },
}))
vi.mock('../../src/services/keyService', () => ({
  keyService: {
    hasPublicKey: vi.fn(() => true),
    hasRequestedKey: vi.fn(() => true),
    requestPublicKey: vi.fn(async () => {}),
    keyCache: new Map(),
  },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function mountEditor() {
  // The composer prefills its fields in the `visible` watcher, so mount closed
  // and open it (like the real dialog).
  const wrapper = mount(MessageEditor, {
    props: { visible: false, echoName: 'Newcomers' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  await wrapper.setProps({ visible: true })
  await new Promise(r => setTimeout(r, 50))
  return wrapper
}

describe('MessageEditor tagline (#309)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    localStorage.setItem('fm_settings', JSON.stringify({
      userProfile: { tagline: '— Ivan' },
    }))
  })

  function setGlobalTagline(value) {
    useSettingsStore().userProfile.tagline = value
  }

  it('shows the configured tagline as text under the message', async () => {
    setGlobalTagline('— Ivan')
    const wrapper = await mountEditor()
    await new Promise(r => setTimeout(r, 50))
    expect(wrapper.text()).toContain('— Ivan')
    // No inline input until the edit link is used.
    expect(wrapper.find('input[placeholder="Optional tagline"]').exists()).toBe(false)
  })

  it('edits the tagline in place and applies the trimmed value', async () => {
    setGlobalTagline('— Ivan')
    const wrapper = await mountEditor()
    await new Promise(r => setTimeout(r, 50))
    const editLink = wrapper.findAll('button').find(b => b.text() === 'Edit')
    expect(editLink).toBeTruthy()
    await editLink.trigger('click')

    const input = wrapper.find('input[placeholder="Optional tagline"]')
    expect(input.exists()).toBe(true)
    await input.setValue('  — New sig  ')
    const save = wrapper.findAll('button').find(b => b.text() === 'Save')
    await save.trigger('click')

    expect(wrapper.text()).toContain('— New sig')
    expect(wrapper.find('input[placeholder="Optional tagline"]').exists()).toBe(false)
  })

  it('cancels the in-place edit without changing the tagline', async () => {
    setGlobalTagline('— Ivan')
    const wrapper = await mountEditor()
    await new Promise(r => setTimeout(r, 50))
    const editLink = wrapper.findAll('button').find(b => b.text() === 'Edit')
    await editLink.trigger('click')
    const input = wrapper.find('input[placeholder="Optional tagline"]')
    await input.setValue('discarded')
    const cancel = wrapper.findAll('button').find(b => b.text() === 'Cancel')
    await cancel.trigger('click')

    expect(wrapper.text()).toContain('— Ivan')
    expect(wrapper.text()).not.toContain('discarded')
  })
})

describe('MessageEditor tagline default (#309)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function settings() {
    return useSettingsStore()
  }

  async function applyTagline(wrapper, value) {
    const editLink = wrapper.findAll('button').find(b => b.text() === 'Edit')
    await editLink.trigger('click')
    const input = wrapper.find('input[placeholder="Optional tagline"]')
    await input.setValue(value)
    const save = wrapper.findAll('button').find(b => b.text() === 'Save')
    await save.trigger('click')
    await new Promise(r => setTimeout(r, 50))
  }

  it('adopts the written tagline when the default was empty', async () => {
    const wrapper = await mountEditor()
    await applyTagline(wrapper, '— Ivan')

    expect(settings().userProfile.tagline).toBe('— Ivan')
    // Nothing left to save: no floppy button
    expect(wrapper.findAll('button').some(b => b.text() === '💾')).toBe(false)
  })

  it('offers a floppy button when the tagline differs from the default', async () => {
    settings().userProfile.tagline = '— Old'
    const wrapper = await mountEditor()
    await applyTagline(wrapper, '— New')

    const floppy = wrapper.findAll('button').find(b => b.text() === '💾')
    expect(floppy).toBeTruthy()
    // Still the old default until the button is used
    expect(settings().userProfile.tagline).toBe('— Old')

    await floppy.trigger('click')
    await new Promise(r => setTimeout(r, 50))
    expect(settings().userProfile.tagline).toBe('— New')
    expect(wrapper.findAll('button').some(b => b.text() === '💾')).toBe(false)
  })

  it('shows no floppy button when the tagline matches the default', async () => {
    settings().userProfile.tagline = '— Ivan'
    const wrapper = await mountEditor()
    expect(wrapper.findAll('button').some(b => b.text() === '💾')).toBe(false)
  })

  it('does not save an empty tagline', async () => {
    settings().userProfile.tagline = ''
    const wrapper = await mountEditor()
    await applyTagline(wrapper, '   ')

    expect(settings().userProfile.tagline).toBe('')
    expect(wrapper.findAll('button').some(b => b.text() === '💾')).toBe(false)
  })
})
