import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import SelectedMessagesDialog from '../../src/components/SelectedMessagesDialog.vue'
import { useSelectedMessages } from '../../src/composables/useSelectedMessages'
import { useEchoStore } from '../../src/stores/echo'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function message(id, echoName = 'Newcomers') {
  return {
    message_id: id,
    type: 'echomail',
    echo_name: echoName,
    echo_id: 4,
    sender_address: ':0:7',
    timestamp: 1700000000,
    jws: `jws-${id}`,
    data: JSON.stringify({ subject: `Subject ${id}`, body: 'body text' }),
  }
}

function mountDialog() {
  return mount(SelectedMessagesDialog, {
    props: { visible: true },
    global: {
      plugins: [i18n],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

describe('SelectedMessagesDialog (#306)', () => {
  let selected

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    selected = useSelectedMessages()
    selected.clear()
  })

  it('lists the selected messages with checkboxes and removes them', async () => {
    selected.add(message('m1'), { echoName: 'Newcomers', echoId: 4 })
    selected.add(message('m2'), { echoName: 'Newcomers', echoId: 4 })

    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('Subject m1')
    expect(wrapper.text()).toContain('Subject m2')
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect(boxes.every(b => b.element.checked)).toBe(true)

    // Unchecking only marks the entry, it stays in the list
    await boxes[0].setValue(false)
    expect(selected.items.value[0].checked).toBe(false)
    expect(selected.count.value).toBe(2)

    // Remove drops it
    const removeButtons = wrapper.findAll('button').filter(b => b.text() === '✕')
    await removeButtons[0].trigger('click')
    expect(selected.count.value).toBe(1)
    expect(wrapper.text()).not.toContain('Subject m2')
  })

  it('lists attachment entries with a checkbox', async () => {
    selected.addAttachment(
      { name: 'punishment.json', type: 'application/json', size: 2048, data: 'data:...' },
      { messageId: 'm1', index: 0, echoName: 'Newcomers', echoId: 4 }
    )
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('punishment.json')
    expect(wrapper.text()).toContain('2.0 KB')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
  })

  it('offers nothing but marking, removing and clearing', () => {
    selected.add(message('m1'), { echoName: 'Newcomers', echoId: 4 })
    const wrapper = mountDialog()
    const labels = wrapper.findAll('button').map(b => b.text())
    expect(labels.some(l => l.includes('Send as JSON'))).toBe(false)
    expect(labels.some(l => l.includes('Attach to message'))).toBe(false)
    expect(wrapper.find('select').exists()).toBe(false)
    expect(labels.some(l => l.includes('Clear'))).toBe(true)
  })

  it('shows the empty state', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('No selected messages')
  })

  it('keeps the echo store untouched', () => {
    expect(useEchoStore().messages).toEqual({})
  })
})
