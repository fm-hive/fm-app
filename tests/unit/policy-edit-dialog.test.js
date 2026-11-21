import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import PolicyEditDialog from '../../src/components/PolicyEditDialog.vue'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

// The dialog is always mounted and opened by the visible prop (as in
// PolicyViewer), so the fields are filled by the watcher on open.
async function mountDialog(params) {
  const wrapper = mount(PolicyEditDialog, {
    props: {
      visible: false,
      policyData: { policy: { text: 'Policy text', parameters: params } },
    },
    global: {
      plugins: [i18n, createPinia()],
      stubs: { MarkdownEditor: true },
    },
  })
  await wrapper.setProps({ visible: true })
  return wrapper
}

describe('PolicyEditDialog parameters (#83)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the voucher and encrypted flow parameters as boolean selects', async () => {
    const wrapper = await mountDialog({ voucher_enable: 'true', voucher_autologin: 'false', encrypted_policy_flow: 'true' })
    const text = wrapper.text()
    for (const key of ['voucher_enable', 'voucher_autologin', 'encrypted_policy_flow']) {
      expect(text).toContain(key)
    }
    // Each of the three selects offers Enabled/Disabled.
    const selects = wrapper.findAll('select')
    expect(selects.length).toBeGreaterThanOrEqual(3)
    const options = selects.flatMap(s => s.findAll('option').map(o => o.text()))
    expect(options).toContain('Enabled')
    expect(options).toContain('Disabled')
  })

  it('allows duration strings for voting periods', async () => {
    const wrapper = await mountDialog({ voting_period: '12h', change_policy_vote_period: '0.5d' })
    const inputs = wrapper.findAll('input')
    expect(inputs.some(i => i.element.value === '12h')).toBe(true)
    expect(inputs.some(i => i.element.value === '0.5d')).toBe(true)
    expect(wrapper.text()).toContain('0.5d')
  })

  it('renders unknown policy parameters as generic text fields', async () => {
    const wrapper = await mountDialog({ voting_period: '30', brand_new_param: 'x' })
    const text = wrapper.text()
    expect(text).toContain('brand_new_param')
    expect(text).toContain(en.policyEdit.unknownParam)
    const inputs = wrapper.findAll('input')
    const unknown = inputs.find(i => i.element.value === 'x')
    expect(unknown).toBeTruthy()
  })
})
