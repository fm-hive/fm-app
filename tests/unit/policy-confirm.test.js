import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import PolicyConfirm from '../../src/components/PolicyConfirm.vue'
import PolicyDiff from '../../src/components/PolicyDiff.vue'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const policy = (id, text = 'body') => ({ id, policy: { text, parameters: {} } })

function mountDialog(props = {}) {
  return mount(PolicyConfirm, {
    props: { visible: true, policyData: policy('new'), ...props },
    global: {
      plugins: [i18n, createPinia()],
      stubs: { PolicyDisplay: true },
    },
  })
}

describe('PolicyConfirm display name input (#333)', () => {
  it('shows the name field only when showNameInput is true', () => {
    const withField = mountDialog({ showNameInput: true })
    expect(withField.find('input[type="text"]').exists()).toBe(true)

    const withoutField = mountDialog({ showNameInput: false })
    expect(withoutField.find('input[type="text"]').exists()).toBe(false)
  })

  it('requires the name before confirming when the field is shown', async () => {
    const wrapper = mountDialog({ showNameInput: true, signatureVerified: true })
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Accept Policy'))
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.text()).toContain('Display name is required')
  })

  it('emits the trimmed name with confirm', async () => {
    const wrapper = mountDialog({ showNameInput: true, signatureVerified: true })
    await wrapper.find('input[type="text"]').setValue('  Maksim  ')
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Accept Policy'))
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')[0][0].name).toBe('Maksim')
  })
})

describe('PolicyConfirm diff toggle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the Changes / Full policy toggle when a baseline exists', () => {
    const wrapper = mountDialog({ previousPolicy: policy('old') })
    const text = wrapper.text()
    expect(text).toContain('Changes')
    expect(text).toContain('Full policy')
  })

  it('hides the toggle without a baseline', () => {
    const wrapper = mountDialog({ previousPolicy: null })
    const text = wrapper.text()
    expect(text).not.toContain('Full policy')
  })

  it('switches to Changes when the baseline arrives after mount', async () => {
    const wrapper = mountDialog({ previousPolicy: null })
    expect(wrapper.text()).not.toContain('Full policy')

    await wrapper.setProps({ previousPolicy: policy('old') })
    expect(wrapper.text()).toContain('Full policy')
    // Default view is the changes tab once a baseline exists.
    expect(wrapper.findComponent(PolicyDiff).exists()).toBe(true)
  })
})
