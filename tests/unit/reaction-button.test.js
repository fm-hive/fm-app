import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import ReactionButton from '../../src/components/ReactionButton.vue'
import { useEchoStore } from '../../src/stores/echo'
import { useIdentityStore } from '../../src/stores/identity'
import en from '../../src/i18n/locales/en.json'

vi.mock('../../src/services/message', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchEchoMessages: vi.fn(async () => []) }
})

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const ECHO = 'Newcomers'
const TARGET = 'target-1'

function reaction(id, sender, emoji, ts) {
  return {
    message_id: id,
    type: 'echomail',
    echo_name: ECHO,
    sender_address: sender,
    timestamp: ts,
    data: JSON.stringify({ reaction: emoji, reactionMessageId: TARGET, echo: ECHO, message: '' }),
    jws: `jws-${id}`,
  }
}

function mountButton() {
  // Use the active pinia so the test can seed the echo store.
  return mount(ReactionButton, {
    props: { targetMessageId: TARGET, echoName: ECHO },
    global: { plugins: [i18n] },
  })
}

describe('ReactionButton (#297, #301)', () => {
  let echo
  let identity

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    echo = useEchoStore()
    identity = useIdentityStore()
  })

  it('shows no hover preview when there are no reactions', async () => {
    const wrapper = mountButton()
    await wrapper.trigger('mouseenter')
    expect(wrapper.text()).not.toContain('👍')
    expect(wrapper.text()).toContain('😊')
  })

  it('shows only existing reactions with counts on hover', async () => {
    await echo.addMessages(ECHO, [
      reaction('r1', ':0:2', '👍', 100),
      reaction('r2', ':0:3', '👍', 200),
      reaction('r3', ':0:4', '🎉', 300),
      reaction('r4', ':0:5', '', 400), // retraction: not counted
    ])
    const wrapper = mountButton()
    // Nothing until hovered.
    expect(wrapper.text()).not.toContain('👍')
    await wrapper.trigger('mouseenter')
    const text = wrapper.text()
    expect(text).toContain('👍')
    expect(text).toContain('2')
    expect(text).toContain('🎉')
    expect(text).toContain('1')
    // Only the reactions that exist: the picker emojis stay hidden.
    expect(text).not.toContain('👎')
    expect(text).not.toContain('❤️')
  })

  it('opens the full picker on click', async () => {
    await echo.addMessages(ECHO, [reaction('r1', ':0:2', '👍', 100)])
    const wrapper = mountButton()
    expect(wrapper.find('.fixed.inset-0').exists()).toBe(false)
    await wrapper.find('button').trigger('click')
    const picker = wrapper.find('.fixed.inset-0')
    expect(picker.exists()).toBe(true)
    // The full list is available in the picker, including unused emojis.
    expect(picker.text()).toContain('👎')
    expect(picker.text()).toContain('Reactions')
  })

  it('sends a reaction for the target message on select', async () => {
    const send = vi.spyOn(identity, 'sendReaction').mockResolvedValue()
    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')
    const emojiButtons = wrapper.findAll('.fixed.inset-0 button')
    // First button is the close "×", the rest are emojis.
    await emojiButtons[1].trigger('click')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe(TARGET)
    expect(send.mock.calls[0][2]).toBe('')
    expect(send.mock.calls[0][3]).toBe(ECHO)
  })

  it('retracts the reaction when the same emoji is selected again', async () => {
    const send = vi.spyOn(identity, 'sendReaction').mockResolvedValue()
    identity.user = { address: ':0:9', isAdmin: false }
    await echo.addMessages(ECHO, [reaction('r1', ':0:9', '👍', 100)])
    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')
    const picker = wrapper.find('.fixed.inset-0')
    const thumbs = picker.findAll('button').find(b => b.text().includes('👍'))
    await thumbs.trigger('click')
    expect(send.mock.calls[0][1]).toBe('') // empty reaction = retract
  })
})
