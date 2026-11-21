import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageActions from '../../src/components/MessageActions.vue'
import AppealDialog from '../../src/components/AppealDialog.vue'
import en from '../../src/i18n/locales/en.json'

const mocks = vi.hoisted(() => ({
  sendToEcho: vi.fn(async () => ({ queued: true })),
}))

vi.mock('../../src/composables/useMessageSender', () => ({
  useMessageSender: () => ({ sendToEcho: mocks.sendToEcho, sending: false, error: null }),
}))
vi.mock('../../src/composables/useProtocolPhases', () => ({
  getPolicyParams: () => ({ special_echogroups: { admin: 'Admin council' } }),
  ensurePolicyParams: async () => {},
  paramsReady: () => true,
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const punishment = {
  message_id: 'punishment_msg_1',
  type: 'echomail',
  echo_name: 'Test echo',
  echo_id: 7,
  sender_address: ':0:1',
  timestamp: 1700000000,
  jws: 'header.payload.sig',
  data: JSON.stringify({ severity: 'punishment', to: ':0:2', subject: 'moderation', message: 'rule violation' }),
}

describe('appeal UI (#222)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mocks.sendToEcho.mockClear()
  })

  it('shows the appeal action to admins on moderation messages only', () => {
    const wrapper = mount(MessageActions, {
      props: { message: punishment, isAdmin: true, echoName: 'Test echo' },
      global: { plugins: [i18n], stubs: { ReactionButton: true } },
    })
    const appealBtn = wrapper.findAll('button').find(b => b.text().includes('Appeal'))
    expect(appealBtn).toBeTruthy()
    appealBtn.trigger('click')
    expect(wrapper.emitted('appeal')).toBeTruthy()

    const nonAdmin = mount(MessageActions, {
      props: { message: punishment, isAdmin: false, echoName: 'Test echo' },
      global: { plugins: [i18n], stubs: { ReactionButton: true } },
    })
    expect(nonAdmin.findAll('button').find(b => b.text().includes('Appeal'))).toBeFalsy()
  })

  it('submits the appeal with the punishment attached as a bundle', async () => {
    const wrapper = mount(AppealDialog, {
      props: { message: punishment, echoName: 'Test echo' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain(':0:1')
    expect(wrapper.text()).toContain('Test echo')

    await wrapper.find('textarea').setValue('it was not my fault')
    const submit = wrapper.findAll('button').find(b => b.text().includes('Submit appeal'))
    await submit.trigger('click')
    await new Promise(r => setTimeout(r, 30))

    expect(mocks.sendToEcho).toHaveBeenCalledTimes(1)
    const [echoName, type, data] = mocks.sendToEcho.mock.calls[0]
    expect(echoName).toBe('Admin council')
    expect(type).toBe('appeal')
    expect(data.proto).toBe('appeal')
    expect(data.type).toBe('poster')
    expect(data.protoAddress).toBe(':0:1')
    expect(data.punishmentMessageId).toBe('punishment_msg_1')
    expect(data.punishmentEcho).toBe('Test echo')
    expect(data.severity).toBe('punishment')
    expect(data.targetAddress).toBe(':0:2')
    expect(data.message).toBe('it was not my fault')
    expect(data.attachments).toHaveLength(1)
    expect(data.attachments[0].name).toBe('punishment_msg_1.json')
    expect(data.attachments[0].type).toBe('application/json')
    expect(wrapper.emitted('submitted')).toBeTruthy()
  })
})
