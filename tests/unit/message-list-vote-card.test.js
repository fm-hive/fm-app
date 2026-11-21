import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MessageList from '../../src/components/MessageList.vue'
import { useEchoStore } from '../../src/stores/echo'
import { useProtocolStore } from '../../src/stores/protocol'
import en from '../../src/i18n/locales/en.json'

vi.mock('../../src/services/message', () => ({
  fetchEchoMessages: vi.fn(async () => []),
}))
vi.mock('../../src/services/keyService', () => ({
  keyService: { hasPublicKey: () => true, hasRequestedKey: () => true, requestPublicKey: async () => {} },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const VoteCardStub = {
  name: 'VoteProtocolCard',
  props: ['msg', 'poster', 'readonly', 'pendingVariant', 'myVoteVariant', 'allMessages', 'showEcho'],
  template: '<div class="vote-card-stub" />',
}

const poster = {
  message_id: 'poster-1',
  type: 'vote',
  echo_name: 'Newcomers',
  sender_address: ':0:1',
  timestamp: 1700000000,
  data: JSON.stringify({
    proto: 'vote',
    type: 'poster',
    from: ':0:1',
    message: 'Tea or coffee?',
    variants: ['tea', 'coffee'],
  }),
}

const result = {
  message_id: 'result-1',
  type: 'vote',
  echo_name: 'Newcomers',
  sender_address: ':0:0',
  timestamp: 1700000100,
  data: JSON.stringify({
    proto: 'vote',
    type: 'result',
    result: 'success',
    poster_message: 'Tea or coffee?',
  }),
}

const ballot = {
  message_id: 'ballot-1',
  type: 'vote',
  echo_name: 'Newcomers',
  sender_address: ':0:2',
  timestamp: 1700000200,
  data: JSON.stringify({ proto: 'vote', type: 'vote', vote: 'tea', poster_message: 'Tea or coffee?' }),
}

async function mountFeed(messages) {
  const echo = useEchoStore()
  echo.messages['Newcomers'] = messages
  useProtocolStore().messages = messages
  const wrapper = mount(MessageList, {
    props: { echoName: 'Newcomers', viewMode: 'feed' },
    global: {
      plugins: [i18n],
      stubs: {
        VoteProtocolCard: VoteCardStub,
        MessageActions: true,
        CollapsibleContent: true,
        AttachmentsGallery: true,
        SenderLabel: true,
        MarkdownRenderer: true,
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

function voteCards(wrapper) {
  return wrapper.findAllComponents(VoteCardStub)
}

describe('vote cards in the feed (#346)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('keeps voting enabled for an active poster in the feed', async () => {
    const wrapper = await mountFeed([poster])
    const cards = voteCards(wrapper)
    expect(cards).toHaveLength(1)
    expect(cards[0].props('readonly')).toBe(false)
    wrapper.unmount()
  })

  it('renders a finished vote read-only', async () => {
    const wrapper = await mountFeed([poster, result])
    const resultCard = voteCards(wrapper).find(c => c.props('msg').message_id === 'result-1')
    expect(resultCard).toBeTruthy()
    expect(resultCard.props('readonly')).toBe(true)
    wrapper.unmount()
  })

  it('does not render a vote card for the ballot itself', async () => {
    const wrapper = await mountFeed([poster, ballot])
    const cards = voteCards(wrapper)
    expect(cards).toHaveLength(1)
    expect(cards[0].props('msg').message_id).toBe('poster-1')
    wrapper.unmount()
  })
})
