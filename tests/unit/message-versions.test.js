import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageVersionsDialog from '../../src/components/MessageVersionsDialog.vue'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function editedMessage() {
  return {
    message_id: 'orig-1',
    type: 'echomail',
    sender_address: ':0:1',
    timestamp: 1000,
    data: JSON.stringify({ subject: 'Question', body: 'third version' }),
    jws: 'jws-3',
    _edited: true,
    _edited_at: 3000,
    _versions: [
      { data: JSON.stringify({ subject: 'Question', body: 'first version' }), jws: 'jws-1', timestamp: 1000, replaced_at: 2000 },
      { data: JSON.stringify({ subject: 'Question', body: 'second version' }), jws: 'jws-2', timestamp: 2000, replaced_at: 3000 },
    ],
  }
}

function mountDialog(props) {
  return mount(MessageVersionsDialog, {
    props: { visible: true, ...props },
    global: { plugins: [i18n, createPinia()] },
  })
}

describe('MessageVersionsDialog (#282)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('lists the previous copies with their dates', () => {
    const wrapper = mountDialog({ message: editedMessage() })
    const text = wrapper.text()
    expect(text).toContain('Previous versions')
    expect(text).toContain('Question')
    expect(text).toContain('Version 1')
    expect(text).toContain('Version 2')
    expect(text).toContain('first version')
    expect(text).toContain('second version')
    // Not the current content.
    expect(text).not.toContain('third version')
  })

  it('shows a note when no versions were saved', () => {
    const message = { ...editedMessage(), _versions: [] }
    const wrapper = mountDialog({ message })
    expect(wrapper.text()).toContain('were not saved')
  })

  it('renders nothing while hidden', () => {
    const wrapper = mountDialog({ visible: false, message: editedMessage() })
    expect(wrapper.text()).toBe('')
  })
})
