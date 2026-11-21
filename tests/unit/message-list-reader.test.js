import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageList from '../../src/components/MessageList.vue'
import MessageRibbon from '../../src/components/MessageRibbon.vue'
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

async function mountReader(messages, lastRead) {
  const echo = useEchoStore()
  echo.messages['Newcomers'] = messages
  const wrapper = mount(MessageList, {
    props: { echoName: 'Newcomers', lastRead, viewMode: 'reader' },
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
  return { wrapper, echo }
}

describe('reader view (#317)', () => {
  it('opens at the top of the scroll container, not at the previous offset (#302)', async () => {
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000)]
    const container = document.createElement('div')
    container.style.overflowY = 'auto'
    container.scrollTo = vi.fn()
    document.body.appendChild(container)
    const wrapper = mount(MessageList, {
      props: { echoName: 'Newcomers', lastRead: 0, viewMode: 'reader' },
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
      attachTo: container,
    })
    await new Promise(r => setTimeout(r, 30))
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    wrapper.unmount()
    container.remove()
  })

  beforeEach(() => {
    localStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    setActivePinia(createPinia())
  })

  it('shows one message starting at the first unread and marks it read', async () => {
    const { wrapper, echo } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 1000)

    const cards = wrapper.findAll('[data-message-id]')
    expect(cards).toHaveLength(1)
    expect(cards[0].attributes('data-message-id')).toBe('m2')
    // The shown message becomes the read watermark (#317)
    expect(echo.lastReadOf('Newcomers')).toBe(2000)
    // The reader has no "new messages" divider
    expect(wrapper.find('[data-unread-divider]').exists()).toBe(false)
  })

  it('starts at the oldest message when the echo was never read', async () => {
    const { wrapper } = await mountReader([msg('m1', 1000), msg('m2', 2000)], 0)
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')
  })

  it('starts at the newest message when everything is read', async () => {
    const { wrapper } = await mountReader([msg('m1', 1000), msg('m2', 2000)], 2000)
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m2')
  })

  it('pages forward and backward and marks each shown message read', async () => {
    const { wrapper, echo } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 1000)

    wrapper.vm.goNext()
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m3')
    expect(echo.lastReadOf('Newcomers')).toBe(3000)

    wrapper.vm.goPrev()
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m2')
    // Going back does not un-read anything
    expect(echo.lastReadOf('Newcomers')).toBe(3000)
  })

  it('goFirst/goLast jump to the ends and stop there', async () => {
    const { wrapper } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 3000)

    wrapper.vm.goFirst()
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')
    wrapper.vm.goPrev()
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')

    wrapper.vm.goLast()
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m3')
    wrapper.vm.goNext()
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m3')
  })

  it('renders the ribbon with a marker on the current message and jumps on click', async () => {
    const { wrapper } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 3000)

    const ribbon = wrapper.findComponent(MessageRibbon)
    expect(ribbon.exists()).toBe(true)
    expect(ribbon.props('currentId')).toBe('m3')
    expect(ribbon.findAll('[data-ribbon-id]')).toHaveLength(3)

    await ribbon.findAll('[data-ribbon-id]')[0].trigger('click')
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')
    expect(wrapper.findComponent(MessageRibbon).props('currentId')).toBe('m1')
  })

  it('pages with the arrow keys and jumps with Home/End', async () => {
    const { wrapper } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 3000)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m2')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m3')
  })

  it('ignores arrow keys typed into inputs', async () => {
    const { wrapper } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000)], 2000)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m2')
    input.remove()
  })

  it('showUnreadMessage jumps without marking the message read', async () => {
    const { wrapper, echo } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 3000)

    wrapper.vm.showUnreadMessage('m1')
    await new Promise(r => setTimeout(r, 10))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')
    // The watermark stays where it was: the message remains unread
    expect(echo.lastReadOf('Newcomers')).toBe(3000)
  })

  it('emits reader-navigate with the current message (#322)', async () => {
    const { wrapper } = await mountReader(
      [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], 1000)

    await new Promise(r => setTimeout(r, 10))
    const navs = wrapper.emitted('reader-navigate').map(e => e[0])
    expect(navs[navs.length - 1]).toBe('m2')

    wrapper.vm.goNext()
    await new Promise(r => setTimeout(r, 10))
    const after = wrapper.emitted('reader-navigate').map(e => e[0])
    expect(after[after.length - 1]).toBe('m3')
  })

  it('starts at the message from the URL (#322)', async () => {
    const wrapper = await mount(MessageList, {
      props: { echoName: 'Newcomers', lastRead: 3000, viewMode: 'reader', readerStartId: 'm2' },
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
    const echo = useEchoStore()
    echo.messages['Newcomers'] = [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)]
    await new Promise(r => setTimeout(r, 50))
    // The URL message wins over the normal start (everything is read → newest)
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m2')
  })
})

describe('reader thread ribbon (#322)', () => {
  beforeEach(() => {
    localStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    setActivePinia(createPinia())
  })

  async function mountThread() {
    const echo = useEchoStore()
    // A conversation: m1 (root), m2 and m3 reply to it; m4 is unrelated.
    const msgs = [
      msg('m1', 1000, { data: JSON.stringify({ subject: 'Re: Тема', body: 'root' }) }),
      msg('m2', 2000, { reply_to_message_id: 'm1', data: JSON.stringify({ subject: 'Re: Тема', body: 'reply 1' }) }),
      msg('m4', 4000, { data: JSON.stringify({ subject: 'Другое', body: 'unrelated' }) }),
      msg('m3', 3000, { reply_to_message_id: 'm1', data: JSON.stringify({ subject: 'Re: Тема', body: 'reply 2' }) }),
    ]
    echo.messages['Newcomers'] = msgs
    const wrapper = mount(MessageList, {
      props: { echoName: 'Newcomers', lastRead: 5000, viewMode: 'reader' },
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
    await new Promise(r => setTimeout(r, 40))
    return { wrapper, echo }
  }

  it('opens the second ribbon with the thread messages and pages through it', async () => {
    const { wrapper } = await mountThread()
    // The reader starts at the newest message (m4) — its conversation is itself.
    const threadBtn = () => Array.from(wrapper.findAll('button')).find(b => /Show thread|Hide thread/.test(b.text()))
    threadBtn().trigger('click')
    await new Promise(r => setTimeout(r, 30))

    // The second ribbon renders only m4 (its own thread of one message)
    const ribbons = wrapper.findAllComponents(MessageRibbon)
    expect(ribbons).toHaveLength(2)
    expect(ribbons[1].props('messages').map(m => m.message_id)).toEqual(['m4'])
    // The cursor moved to the second ribbon
    expect(ribbons[1].props('currentId')).toBe('m4')
    expect(ribbons[0].props('currentId')).toBeNull()

    // Jump to m2 from the general ribbon, then open the thread again:
    // the thread now contains m1, m2, m3.
    wrapper.vm.goToMessageById('m2')
    await new Promise(r => setTimeout(r, 30))
    const ribbons2 = wrapper.findAllComponents(MessageRibbon)
    expect(ribbons2[1].props('messages').map(m => m.message_id)).toEqual(['m1', 'm2', 'm3'])
    // The cursor is back on the general ribbon after the general click
    expect(ribbons2[0].props('currentId')).toBe('m2')
    expect(ribbons2[1].props('currentId')).toBeNull()

    // Clicking a thread ribbon tile moves the cursor to the second ribbon
    // and paging walks the thread.
    await ribbons2[1].find('[data-ribbon-id="m2"]').trigger('click')
    await new Promise(r => setTimeout(r, 30))
    const ribbons3 = wrapper.findAllComponents(MessageRibbon)
    expect(ribbons3[1].props('currentId')).toBe('m2')

    wrapper.vm.goNext()
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m3')

    wrapper.vm.goNext()
    await new Promise(r => setTimeout(r, 30))
    // End of the thread: stays on m3
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m3')

    // Hiding the thread returns the cursor to the general ribbon
    threadBtn().trigger('click')
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.findAllComponents(MessageRibbon)).toHaveLength(1)
  })

  it('highlights the thread tiles in the general ribbon while the thread is shown', async () => {
    const { wrapper } = await mountThread()
    wrapper.vm.goToMessageById('m2')
    await new Promise(r => setTimeout(r, 20))
    const threadBtn = () => Array.from(wrapper.findAll('button')).find(b => b.text().includes('Show thread'))
    threadBtn().trigger('click')
    await new Promise(r => setTimeout(r, 30))
    const general = wrapper.findAllComponents(MessageRibbon)[0]
    expect(general.props('threadKey')).not.toBe('')
    const inThread = general.findAll('.ribbon-tile-in-thread')
    expect(inThread).toHaveLength(3)
  })
})

describe('feed/reader pagination (#361)', () => {
  beforeEach(() => {
    localStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    setActivePinia(createPinia())
  })

  function manyMessages(count) {
    return Array.from({ length: count }, (_, i) => msg(`m${i + 1}`, i + 1))
  }

  it('loads only the newest 20 messages and exposes older pages on demand', async () => {
    const { wrapper } = await mountReader(manyMessages(25), 0)

    const loadOlder = () => Array.from(wrapper.findAll('button'))
      .find(b => b.text().includes('Load 20 older'))
    expect(loadOlder()).toBeTruthy()
    // Reader starts at the oldest message of the newest page.
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m6')

    await loadOlder().trigger('click')
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m6')
    expect(Array.from(wrapper.findAll('button')).find(b => b.text().includes('Load 20 older'))).toBeFalsy()

    wrapper.vm.goFirst()
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')
  })

  it('resets the page size when switching to another echo', async () => {
    const { wrapper, echo } = await mountReader(manyMessages(25), 0)
    await wrapper.setProps({ echoName: 'Other' })
    echo.messages['Other'] = manyMessages(3)
    await new Promise(r => setTimeout(r, 30))
    expect(wrapper.find('[data-message-id]').attributes('data-message-id')).toBe('m1')
  })
})
