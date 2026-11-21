import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import VoteProtocolCard from '../../src/components/VoteProtocolCard.vue'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

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

const voteFor = (id, address, variant) => ({
  message_id: id,
  type: 'vote',
  sender_address: address,
  timestamp: 1700000100,
  data: JSON.stringify({ proto: 'vote', type: 'vote', sender_name: address, vote: variant, poster_message: 'Tea or coffee?' }),
})

const result = {
  message_id: 'result-1',
  type: 'vote',
  echo_name: 'Newcomers',
  sender_address: ':0:0',
  timestamp: 1700000200,
  data: JSON.stringify({ proto: 'vote', type: 'result', result: 'success', variant: 'coffee', originalMessageId: 'poster-1' }),
}

function mountCard(props) {
  return mount(VoteProtocolCard, { props, global: { plugins: [i18n, createPinia()] } })
}

describe('VoteProtocolCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders an active vote poster with counts and vote buttons', () => {
    const wrapper = mountCard({
      msg: poster,
      allMessages: [poster, voteFor('v1', ':0:2', 'coffee')],
      pendingVariant: 'tea',
      showEcho: true,
    })
    const text = wrapper.text()
    expect(text).toContain('Tea or coffee?')
    expect(text).toContain('tea')
    expect(text).toContain('coffee')
    expect(text).toContain('(1)') // one vote for coffee
    expect(wrapper.findAll('button').length).toBeGreaterThan(0)
  })

  it('shows one votes list and marks unseen votes with a green dot (#348)', () => {
    const wrapper = mountCard({
      msg: poster,
      allMessages: [poster, voteFor('v1', ':0:2', 'coffee'), voteFor('v2', ':0:3', 'tea')],
      seenVoteIds: new Set(['v1']),
    })
    const text = wrapper.text()
    expect(text).toContain('All votes')
    expect(text).not.toContain('New votes')
    // Only v2 is unseen.
    expect(wrapper.findAll('.bg-green-500').length).toBe(1)
  })

  it('renders View Raw and Hide next to the reactions (#348)', async () => {
    const wrapper = mountCard({
      msg: poster,
      allMessages: [poster],
      showRaw: true,
      showHide: true,
    })
    const buttons = wrapper.findAll('button')
    const raw = buttons.find(b => b.text().includes('View Raw'))
    const hide = buttons.find(b => b.text().includes('Hide'))
    expect(raw).toBeTruthy()
    expect(hide).toBeTruthy()
    await raw.trigger('click')
    await hide.trigger('click')
    expect(wrapper.emitted('view-raw')).toHaveLength(1)
    expect(wrapper.emitted('hide')).toHaveLength(1)
  })

  it('renders a finished vote with the result and without vote buttons', () => {
    const wrapper = mountCard({
      msg: result,
      poster,
      allMessages: [poster, voteFor('v1', ':0:2', 'coffee')],
      readonly: true,
    })
    const text = wrapper.text()
    expect(text).toContain('Tea or coffee?')
    expect(text).toContain('coffee')
    expect(text).toContain('(1)')
    // Variant chips are disabled and there are no vote/retract actions.
    expect(text).not.toContain('Retract vote')
    expect(wrapper.findAll('button:not([disabled])').length).toBe(0)
    expect(wrapper.findAll('button[disabled]').length).toBe(2)
  })
})

describe('VoteProtocolCard reactions (#297)', () => {
  it('renders the reaction button only when showReactions is set', () => {
    const without = mountCard({ msg: poster, allMessages: [poster] })
    expect(without.find('.message-actions, button[title="Reactions"]').exists()).toBe(false)

    const withReactions = mountCard({ msg: poster, allMessages: [poster], showReactions: true })
    expect(withReactions.find('button[title="Reactions"]').exists()).toBe(true)
  })
})

describe('VoteProtocolCard feed form (#252)', () => {
  const now = Math.floor(Date.now() / 1000)

  const freshPoster = {
    message_id: 'poster-fresh',
    type: 'vote',
    echo_name: 'Newcomers',
    sender_address: ':0:1',
    timestamp: now - 3600,
    data: JSON.stringify({
      proto: 'vote', type: 'poster', from: ':0:1',
      message: 'Fresh question?', variants: ['yes', 'no'],
    }),
  }
  const freshVote = {
    message_id: 'v-fresh',
    type: 'vote',
    sender_address: ':0:2',
    timestamp: now - 1800,
    data: JSON.stringify({ proto: 'vote', type: 'vote', sender_name: ':0:2', vote: 'yes', poster_message: 'Fresh question?' }),
  }
  const freshResult = {
    message_id: 'result-fresh',
    type: 'vote',
    echo_name: 'Newcomers',
    sender_address: ':0:0',
    timestamp: now - 600,
    data: JSON.stringify({ proto: 'vote', type: 'result', result: 'success', variant: 'yes', poster_message: 'Fresh question?' }),
  }

  beforeEach(() => {
    localStorage.setItem('fm_policy_params', JSON.stringify({ voting_period: '10' }))
  })

  it('shows an active vote in the feed with its real phase, not as a result', () => {
    const wrapper = mountCard({
      msg: freshPoster,
      allMessages: [freshPoster, freshVote],
      readonly: true,
    })
    const text = wrapper.text()
    expect(text).toContain('Fresh question?')
    expect(text).toContain('Voting open')
    // No result banner / winner for an active vote.
    expect(text).not.toContain('Completed')
    expect(text).not.toContain('🏆')
    // Read-only feed: variant chips stay disabled, no vote actions.
    expect(wrapper.findAll('button:not([disabled])').length).toBe(0)
  })

  it('shows a finished vote with the result and the full card form', () => {
    const wrapper = mountCard({
      msg: freshResult,
      poster: freshPoster,
      allMessages: [freshPoster, freshVote, freshResult],
      readonly: true,
    })
    const text = wrapper.text()
    expect(text).toContain('Fresh question?')
    expect(text).toContain('Completed')
    expect(text).toContain('🏆')
    expect(text).toContain('yes')
    expect(text).toContain('(1)') // one vote for yes
    // Phase timeline is part of the form (same as the active list).
    expect(text).toContain('Voting open')
    expect(wrapper.findAll('button[disabled]').length).toBe(2)
  })
})
