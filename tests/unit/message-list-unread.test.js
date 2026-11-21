import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageList from '../../src/components/MessageList.vue'
import { useEchoStore } from '../../src/stores/echo'
import en from '../../src/i18n/locales/en.json'

vi.mock('../../src/services/message', () => ({
  fetchEchoMessages: vi.fn(async () => []),
}))
vi.mock('../../src/services/keyService', () => ({
  keyService: { hasPublicKey: () => true, hasRequestedKey: () => true, requestPublicKey: async () => {} },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function msg(id, timestamp, extra = {}) {
  return {
    message_id: id,
    type: 'echomail',
    sender_address: ':0:7',
    timestamp,
    data: JSON.stringify({ subject: `Subject ${id}`, body: `Body ${id}` }),
    ...extra,
  }
}

async function mountList(messages, lastRead) {
  const wrapper = mount(MessageList, {
    props: { echoName: 'Newcomers', lastRead },
    global: {
      plugins: [i18n],
      stubs: {
        MessageActions: true,
        CollapsibleContent: true,
        AttachmentsGallery: true,
        SenderLabel: true,
        MarkdownRenderer: true,
        VoteProtocolCard: true,
        ModerationMessage: true,
        ModeratorMenu: true,
        AppealDialog: true,
        MessageVersionsDialog: true,
      },
    },
    attachTo: document.body,
  })
  await new Promise(r => setTimeout(r, 30))
  return wrapper
}

describe('chronological feed with unread block (#302)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders messages oldest first and marks the unread ones', async () => {
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m3', 3000), msg('m1', 1000), msg('m2', 2000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 1000)

    const ids = wrapper.findAll('[data-message-id]').map(n => n.attributes('data-message-id'))
    expect(ids).toEqual(['m1', 'm2', 'm3'])
    // m2 and m3 are unread (watermark = m1)
    expect(wrapper.findAll('.unread-dot')).toHaveLength(2)
    expect(wrapper.findAll('.feed-card-unread')).toHaveLength(2)
  })

  it('puts the new-messages divider before the first unread card', async () => {
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 1000)

    const divider = wrapper.find('[data-unread-divider]')
    expect(divider.exists()).toBe(true)
    expect(divider.text()).toContain('New messages')
    // The divider precedes m2 (the first unread), not m1
    const nodes = wrapper.findAll('[data-unread-divider], [data-message-id]')
    const order = nodes.map(n => n.attributes('data-unread-divider') !== undefined ? 'divider' : n.attributes('data-message-id'))
    expect(order).toEqual(['m1', 'divider', 'm2', 'm3'])
  })

  it('renders no divider when everything is read', async () => {
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 2000)
    expect(wrapper.find('[data-unread-divider]').exists()).toBe(false)
    expect(wrapper.findAll('.unread-dot')).toHaveLength(0)
  })

  it('scrollToUnread scrolls the divider into view', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 1000)

    const ok = await wrapper.vm.scrollToUnread()
    expect(ok).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-unread-divider')).not.toBeNull()
  })

  it('scrollToLastRead scrolls the last read message to the top (#302)', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 1000)

    const ok = await wrapper.vm.scrollToLastRead()
    expect(ok).toBe(true)
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-message-id')).toBe('m1')
  })

  it('scrollToLastRead scrolls to the newest card when everything is read', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 3000)

    const ok = await wrapper.vm.scrollToLastRead()
    expect(ok).toBe(true)
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-message-id')).toBe('m3')
  })

  it('scrollToLastRead falls back to the divider when nothing is read yet', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 0)

    // Watermark 0 → firstUnreadId is empty → the newest card (bottom)
    const ok = await wrapper.vm.scrollToLastRead()
    expect(ok).toBe(true)
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-message-id')).toBe('m2')
  })

  it('scrollToBottom scrolls the newest card into view', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)]
    const wrapper = await mountList(echo.messages['Newcomers'], 3000)

    const ok = await wrapper.vm.scrollToBottom({ smooth: false })
    expect(ok).toBe(true)
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-message-id')).toBe('m3')
  })
})
