import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import MessageRibbon from '../../src/components/MessageRibbon.vue'
import { stringToColor } from '../../src/utils/color'
import { conversationKey } from '../../src/utils/feed'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function msg(id, timestamp, extra = {}) {
  return {
    message_id: id,
    type: 'echomail',
    sender_address: ':0:7',
    timestamp,
    data: JSON.stringify({ subject: `Subject ${id}`, body: `Body ${id}`, sender_name: 'Ivan' }),
    ...extra,
  }
}

async function mountRibbon(props) {
  const wrapper = mount(MessageRibbon, { props, global: { plugins: [i18n] } })
  await new Promise(r => setTimeout(r, 10))
  return wrapper
}

describe('MessageRibbon tiles (#322)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders squares with the author initials and a per-thread border color', async () => {
    const m1 = msg('m1', 1000)
    const m2 = msg('m2', 2000, { reply_to_message_id: 'm1' })
    const wrapper = await mountRibbon({ messages: [m1, m2], currentId: 'm1', lastRead: 0 })
    const tiles = wrapper.findAll('.ribbon-tile')
    expect(tiles).toHaveLength(2)
    // Initials
    expect(tiles[0].text()).toContain('I')
    // No fill for a plain message; the border is the thread (conversation) color
    const faces = wrapper.findAll('.ribbon-tile-face')
    expect(faces[0].classes()).not.toContain('bg-green-200')
    const key = conversationKey(m2, new Map([[m1.message_id, m1], [m2.message_id, m2]]))
    // Browsers normalize hsl() to rgb() in computed styles — compare the computed color.
    const probe = document.createElement('span')
    probe.style.borderColor = stringToColor(key)
    document.body.appendChild(probe)
    const expectedColor = getComputedStyle(probe).borderColor
    probe.remove()
    expect(getComputedStyle(faces[1].element).borderColor).toBe(expectedColor)
  })

  it('marks the current tile with the cursor square', async () => {
    const wrapper = await mountRibbon({ messages: [msg('m1', 1000), msg('m2', 2000)], currentId: 'm2', lastRead: 0 })
    const tiles = wrapper.findAll('.ribbon-tile')
    expect(tiles[0].classes()).not.toContain('ribbon-tile-current')
    expect(tiles[1].classes()).toContain('ribbon-tile-current')
  })

  it('fills the tile per message type and shows the unread dot', async () => {
    const msgs = [
      msg('m1', 1000, { type: 'vote' }),
      msg('m2', 2000, { data: JSON.stringify({ severity: 'warning', body: 'x' }) }),
      msg('m3', 3000),
    ]
    const wrapper = await mountRibbon({ messages: msgs, currentId: 'm1', lastRead: 1000 })
    const faces = wrapper.findAll('.ribbon-tile-face')
    expect(faces[0].classes()).toContain('bg-green-200')
    expect(faces[1].classes()).toContain('bg-yellow-300')
    expect(faces[2].classes()).not.toContain('bg-')
    // m2 and m3 are unread (watermark = m1)
    expect(wrapper.findAll('.ribbon-tile-dot')).toHaveLength(2)
  })

  it('highlights the tiles of the active thread in the general ribbon', async () => {
    const m1 = msg('m1', 1000)
    const m2 = msg('m2', 2000, { reply_to_message_id: 'm1' })
    const m3 = msg('m3', 3000)
    const index = new Map([[m1.message_id, m1], [m2.message_id, m2], [m3.message_id, m3]])
    const threadKey = conversationKey(m2, index)
    const wrapper = await mountRibbon({ messages: [m1, m2, m3], currentId: 'm1', lastRead: 0, messageIndex: index, threadKey })
    const tiles = wrapper.findAll('.ribbon-tile')
    expect(tiles[0].classes()).toContain('ribbon-tile-in-thread')
    expect(tiles[1].classes()).toContain('ribbon-tile-in-thread')
    expect(tiles[2].classes()).not.toContain('ribbon-tile-in-thread')
  })

  it('positions the ribbon on the current tile on the first render (#322)', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    // The newest message is the current one: the cursor sits at the END of the
    // ribbon, but the scroll starts at the beginning.
    const wrapper = await mountRibbon({ messages: [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], currentId: 'm3', lastRead: 0 })
    expect(scrollIntoView).toHaveBeenCalled()
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-ribbon-id')).toBe('m3')
  })

  it('keeps the current tile in view while the cursor moves', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const wrapper = await mountRibbon({ messages: [msg('m1', 1000), msg('m2', 2000), msg('m3', 3000)], currentId: 'm1', lastRead: 0 })
    scrollIntoView.mockClear()
    await wrapper.setProps({ currentId: 'm2' })
    await new Promise(r => setTimeout(r, 20))
    expect(scrollIntoView).toHaveBeenCalled()
    const target = scrollIntoView.mock.instances[0]
    expect(target.getAttribute('data-ribbon-id')).toBe('m2')
  })

  it('emits select with the message id on click', async () => {
    const wrapper = await mountRibbon({ messages: [msg('m1', 1000)], currentId: null, lastRead: 0 })
    await wrapper.find('[data-ribbon-id="m1"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['m1']])
  })
})
