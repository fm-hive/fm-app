import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageEditor from '../../src/components/MessageEditor.vue'
import AttachSelectedDialog from '../../src/components/AttachSelectedDialog.vue'
import { useSelectedMessages } from '../../src/composables/useSelectedMessages'
import en from '../../src/i18n/locales/en.json'

// IndexedDB stand-in: selected messages are resolved through it
const stored = new Map()
vi.mock('../../src/services/db', () => ({
  getMessage: vi.fn(async (storeName, id) => stored.get(`${storeName}:${id}`) || null),
}))

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

const attachment = {
  name: 'punishment.json',
  type: 'application/json',
  size: 12,
  data: `data:application/json;base64,${btoa('{"hello":1}')}`,
}

async function mountEditor() {
  const wrapper = mount(MessageEditor, {
    props: { visible: false, echoName: 'Newcomers' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  await wrapper.setProps({ visible: true })
  await new Promise(r => setTimeout(r, 60))
  return wrapper
}

describe('MessageEditor attach selected (#306)', () => {
  let selected

  beforeEach(() => {
    localStorage.clear()
    stored.clear()
    setActivePinia(createPinia())
    selected = useSelectedMessages()
    selected.clear()
  })

  it('shows the button only when the container has entries', async () => {
    let wrapper = await mountEditor()
    expect(wrapper.text()).not.toContain('Attach selected')

    selected.add(message('m1'), { echoName: 'Newcomers', echoId: 4 })
    wrapper = await mountEditor()
    expect(wrapper.text()).toContain('Attach selected')
  })

  it('attaches every chosen message as its own JSON bundle file', async () => {
    stored.set('Newcomers:m1', { ...message('m1'), timestamp: 1700000000 })
    stored.set('Newcomers:m2', { ...message('m2'), timestamp: 1700000100 })
    selected.add(message('m1'), { echoName: 'Newcomers', echoId: 4 })
    selected.add(message('m2'), { echoName: 'Newcomers', echoId: 4 })

    const wrapper = await mountEditor()
    const open = wrapper.findAll('button').find(b => b.text().includes('Attach selected'))
    await open.trigger('click')
    await new Promise(r => setTimeout(r, 60))

    const picker = wrapper.findComponent(AttachSelectedDialog)
    expect(picker.exists()).toBe(true)
    expect(picker.text()).toContain('Subject m1')
    expect(picker.text()).toContain('Subject m2')

    const attachBtn = picker.findAll('button').find(b => b.text().includes('Attach'))
    await attachBtn.trigger('click')
    await new Promise(r => setTimeout(r, 120))

    // Both files landed in the composer and the body references both
    expect(wrapper.text()).toContain('m1.json')
    expect(wrapper.text()).toContain('m2.json')
    const body = wrapper.find('textarea').element.value
    const refs = body.match(/\[[^\]]+\.json\]\(attachment:(\d+)\)/g) || []
    expect(refs).toHaveLength(2)
    expect(body).toMatch(/\[m1\.json\]\(attachment:\d\)/)
    expect(body).toMatch(/\[m2\.json\]\(attachment:\d\)/)
  })

  it('emits one single-message bundle per chosen entry', async () => {
    stored.set('Newcomers:m1', { ...message('m1'), timestamp: 1700000000 })
    stored.set('Newcomers:m2', { ...message('m2'), timestamp: 1700000100 })
    selected.add(message('m1'), { echoName: 'Newcomers', echoId: 4 })
    selected.add(message('m2'), { echoName: 'Newcomers', echoId: 4 })

    const wrapper = mount(AttachSelectedDialog, {
      props: { visible: true },
      global: { plugins: [i18n] },
    })
    await new Promise(r => setTimeout(r, 60))
    const attachBtn = wrapper.findAll('button').find(b => b.text().includes('Attach'))
    await attachBtn.trigger('click')
    await new Promise(r => setTimeout(r, 150))

    const payload = wrapper.emitted('attach')
    expect(payload).toBeTruthy()
    const attachments = payload[0][0].attachments
    expect(attachments).toHaveLength(2)
    expect(attachments.map(a => a.name).sort()).toEqual(['m1.json', 'm2.json'])

    const ids = []
    for (const att of attachments) {
      const bundle = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(att.data.split(',')[1]), c => c.charCodeAt(0))
      ))
      expect(bundle.type).toBe('fm-selected-messages')
      expect(bundle.messages).toHaveLength(1)
      ids.push(bundle.messages[0].message_id)
    }
    expect(ids.sort()).toEqual(['m1', 'm2'])
  })

  it('attaches a selected attachment as-is', async () => {
    stored.set('Newcomers:m1', {
      ...message('m1'),
      data: JSON.stringify({ subject: 'Punishment', body: 'x', attachments: [attachment] }),
    })
    selected.addAttachment(attachment, { messageId: 'm1', index: 0, echoName: 'Newcomers', echoId: 4 })

    const wrapper = await mountEditor()
    const open = wrapper.findAll('button').find(b => b.text().includes('Attach selected'))
    await open.trigger('click')
    await new Promise(r => setTimeout(r, 60))
    const picker = wrapper.findComponent(AttachSelectedDialog)
    const attachBtn = picker.findAll('button').find(b => b.text().includes('Attach'))
    await attachBtn.trigger('click')
    await new Promise(r => setTimeout(r, 120))

    expect(wrapper.text()).toContain('punishment.json')
    expect(wrapper.find('textarea').element.value).toContain('[punishment.json](attachment:0)')
  })

  it('pre-selects only the entries marked in the container', async () => {
    stored.set('Newcomers:m1', message('m1'))
    stored.set('Newcomers:m2', message('m2'))
    selected.add(message('m1'), { echoName: 'Newcomers', echoId: 4 })
    selected.add(message('m2'), { echoName: 'Newcomers', echoId: 4 })
    selected.toggleChecked('m2')

    const wrapper = await mountEditor()
    await wrapper.findAll('button').find(b => b.text().includes('Attach selected')).trigger('click')
    await new Promise(r => setTimeout(r, 60))
    const picker = wrapper.findComponent(AttachSelectedDialog)
    const boxes = picker.findAll('input[type="checkbox"]')
    expect(boxes.map(b => b.element.checked)).toEqual([false, true])
  })
})
