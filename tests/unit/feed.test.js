import { describe, it, expect } from 'vitest'
import {
  authorBorderClass,
  conversationKey,
  conversationDepth,
  conversationSubject,
  isThreadable,
  groupByConversationSubject,
  buildFeedItems,
  normalizeSubject,
  buildMessageIndex,
  ancestorChain,
  conversationMessages,
  visibleThreadItems,
  moderationTargetId,
  effectiveParentId,
} from '../../src/utils/feed'
import { buildMessageTree } from '../../src/utils/tree'
import { markQuoteBlock, renderMarkdown } from '../../src/utils/markdown'

const msg = (id, replyTo, from, subject, body = 'text') => ({
  message_id: id,
  reply_to_message_id: replyTo || null,
  sender_address: from,
  timestamp: 1000,
  data: JSON.stringify({ subject, body }),
})

describe('conversationKey (#283)', () => {
  it('resolves a reply chain to its root message id', () => {
    const a = msg('a', null, ':0:1', 'Question')
    const b = msg('b', 'a', ':0:2', 'Re: Question')
    const c = msg('c', 'b', ':0:1', 'Re: Question')
    const byId = new Map([['a', a], ['b', b], ['c', c]])
    expect(conversationKey(c, byId)).toBe('a')
    expect(conversationKey(b, byId)).toBe('a')
    expect(conversationKey(a, byId)).toBe('a')
  })

  it('falls back to the normalized subject when the parent is missing', () => {
    const orphan = msg('d', 'missing', ':0:3', 'Re: Question')
    const byId = new Map([['d', orphan]])
    expect(conversationKey(orphan, byId)).toBe('subject:Question')
  })

  it('keeps messages without a parent as their own conversation', () => {
    const a = msg('a', null, ':0:1', 'Question')
    const byId = new Map([['a', a]])
    expect(conversationKey(a, byId)).toBe('a')
  })

  it('survives reply cycles', () => {
    const a = msg('a', 'b', ':0:1', 'Loop')
    const b = msg('b', 'a', ':0:2', 'Re: Loop')
    const byId = new Map([['a', a], ['b', b]])
    expect(conversationKey(a, byId)).toBeTruthy()
  })
})

describe('conversationDepth (#283)', () => {
  it('counts the reply depth and caps it', () => {
    const a = msg('a', null, ':0:1', 'Q')
    const b = msg('b', 'a', ':0:2', 'Re: Q')
    const c = msg('c', 'b', ':0:1', 'Re: Q')
    const d = msg('d', 'c', ':0:2', 'Re: Q')
    const byId = new Map([['a', a], ['b', b], ['c', c], ['d', d]])
    expect(conversationDepth(a, byId)).toBe(0)
    expect(conversationDepth(b, byId)).toBe(1)
    expect(conversationDepth(d, byId)).toBe(3)
    expect(conversationDepth(d, byId, 2)).toBe(2)
  })
})

describe('authorBorderClass (#283)', () => {
  it('is deterministic and a Tailwind border class', () => {
    expect(authorBorderClass(':0:1')).toBe(authorBorderClass(':0:1'))
    expect(authorBorderClass(':0:1')).toMatch(/^border-l-/)
    expect(authorBorderClass('')).toMatch(/^border-l-/)
  })
})

describe('buildFeedItems (#283)', () => {
  const a = msg('a', null, ':0:1', 'Question', 'root body')
  const b = msg('b', 'a', ':0:2', 'Re: Question', 'reply body')
  const c = msg('c', 'b', ':0:1', 'Re: Question', 'second reply')
  const other = msg('x', null, ':0:1', 'Another', 'other body')

  it('marks conversation starts and author changes', () => {
    // Feed order is newest-first.
    const items = buildFeedItems([c, b, a, other])
    const by = Object.fromEntries(items.map(i => [i.message_id, i._feed]))
    expect(by.c.startsConversation).toBe(true)
    expect(by.c.showAuthor).toBe(true)
    expect(by.b.startsConversation).toBe(false)
    expect(by.b.showAuthor).toBe(true) // different author
    expect(by.a.startsConversation).toBe(false)
    expect(by.a.showAuthor).toBe(true) // different author
    expect(by.x.startsConversation).toBe(true)
    expect(by.c.depth).toBe(2)
    expect(by.b.depth).toBe(1)
    expect(by.a.depth).toBe(0)
  })

  it('hides the author header for consecutive messages of the same author', () => {
    const e = msg('e', 'c', ':0:1', 'Re: Question', 'third reply')
    const items = buildFeedItems([e, c, b, a])
    const by = Object.fromEntries(items.map(i => [i.message_id, i._feed]))
    // Newest first: e (first item) starts the conversation group, c is the
    // same author right below it and must not repeat the header.
    expect(by.e.startsConversation).toBe(true)
    expect(by.c.startsConversation).toBe(false)
    expect(by.c.showAuthor).toBe(false)
    expect(by.b.showAuthor).toBe(true)
  })

  it('carries the conversation subject on the first message of the group', () => {
    const items = buildFeedItems([b, a])
    expect(items[0]._feed.conversationSubject).toBe('Question')
    expect(items[1]._feed.conversationSubject).toBe('')
  })
})

describe('thread view helpers (#285)', () => {
  const a = msg('a', null, ':0:1', 'Q')
  const b = msg('b', 'a', ':0:2', 'Re: Q')
  const c = msg('c', 'b', ':0:1', 'Re: Q')
  const d = msg('d', 'a', ':0:2', 'Re: Q')
  const e = msg('e', 'd', ':0:1', 'Re: Q')
  const index = buildMessageIndex([a, b, c, d, e])

  it('returns the ancestor chain of a message (root first)', () => {
    expect(ancestorChain(a, index)).toEqual([])
    expect(ancestorChain(b, index)).toEqual(['a'])
    expect(ancestorChain(c, index)).toEqual(['a', 'b'])
    expect(ancestorChain(msg('x', 'missing', ':0:9', 'Re: X'), index)).toEqual([])
  })

  it('collects all messages of one conversation', () => {
    const other = msg('z', null, ':0:5', 'Other')
    const all = [a, b, c, d, e, other]
    const idx = buildMessageIndex(all)
    expect(conversationMessages('a', all, idx).map(m => m.message_id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(conversationMessages('z', all, idx).map(m => m.message_id)).toEqual(['z'])
  })

  it('hides replies of collapsed nodes', () => {
    const tree = buildMessageTree([a, b, c, d, e])
    const childrenCount = new Map([['a', 2], ['b', 1], ['d', 1]])
    // Only the root is expanded: its direct replies visible, deeper hidden.
    let visible = visibleThreadItems(tree, childrenCount, new Set(['a']))
    expect(visible.map(i => i.msg.message_id)).toEqual(['a', 'b', 'd'])
    // Branch of c expanded, branch of e collapsed.
    visible = visibleThreadItems(tree, childrenCount, new Set(['a', 'b', 'd']))
    expect(visible.map(i => i.msg.message_id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    visible = visibleThreadItems(tree, childrenCount, new Set(['a', 'b']))
    expect(visible.map(i => i.msg.message_id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

// Moderation message (severity + originalMessage copy), like the payload built
// by ModeratorMenu.vue.
function moderationMsg(id, from, target, severity = 'warning') {
  return {
    message_id: id,
    sender_address: from,
    timestamp: 2000,
    data: JSON.stringify({
      severity,
      to: target.sender_address,
      message: 'Moderation',
      originalMessage: {
        message_id: target.message_id,
        sender_address: target.sender_address,
        reply_to_message_id: target.reply_to_message_id || '',
        timestamp: target.timestamp,
        data: target.data,
      },
    }),
  }
}

describe('subjectless messages are not threads (#287)', () => {
  const noSubject = { message_id: 'w', sender_address: ':0:0', timestamp: 1000, data: JSON.stringify({ message: 'Welcome' }) }
  const withSubject = { message_id: 's', sender_address: ':0:1', timestamp: 900, data: JSON.stringify({ subject: 'Topic', body: 'x' }) }

  it('reports no conversation subject for a lone message without a subject', () => {
    const index = buildMessageIndex([noSubject])
    expect(conversationSubject(noSubject, index)).toBe('')
    expect(isThreadable(noSubject, index)).toBe(false)
  })

  it('is not threadable and gets no separator subject in the feed', () => {
    const items = buildFeedItems([noSubject, withSubject])
    const by = Object.fromEntries(items.map(i => [i.message_id, i._feed]))
    expect(by.w.hasThread).toBe(false)
    expect(by.w.conversationSubject).toBe('')
    expect(by.s.hasThread).toBe(true)
    expect(by.s.conversationSubject).toBe('Topic')
  })

  it('takes the subject from the root of the chain, not the newest message', () => {
    const root = { message_id: 'r', sender_address: ':0:1', timestamp: 100, data: JSON.stringify({ subject: 'Root topic' }) }
    const replyNoSubject = { message_id: 'n', reply_to_message_id: 'r', sender_address: ':0:2', timestamp: 200, data: JSON.stringify({ body: 'reply without subject' }) }
    const index = buildMessageIndex([root, replyNoSubject])
    expect(conversationSubject(replyNoSubject, index)).toBe('Root topic')
    expect(isThreadable(replyNoSubject, index)).toBe(true)
  })

  it('skips subjectless messages when grouping threads', () => {
    const groups = groupByConversationSubject([noSubject, withSubject])
    expect(groups.map(g => g.subject)).toEqual(['Topic'])
    expect(groups[0].messages.map(m => m.message_id)).toEqual(['s'])
  })
})

describe('moderation messages join the punished conversation (#287)', () => {
  const root = msg('a', null, ':0:1', 'Question', 'root body')
  const reply = msg('b', 'a', ':0:2', 'Re: Question', 'reply body')
  const mod = moderationMsg('m', ':0:9', reply)

  it('resolves the moderated message as the effective parent', () => {
    expect(moderationTargetId(mod)).toBe('b')
    expect(effectiveParentId(mod)).toBe('b')
    expect(moderationTargetId(root)).toBe('')
    expect(effectiveParentId(root)).toBe('')
  })

  it('belongs to the same conversation and nests under the punished message', () => {
    const all = [root, reply, mod]
    const index = buildMessageIndex(all)
    expect(conversationKey(mod, index)).toBe('a')
    expect(conversationMessages('a', all, index).map(m => m.message_id)).toEqual(['a', 'b', 'm'])
    expect(conversationDepth(mod, index)).toBe(2)
    expect(conversationSubject(mod, index)).toBe('Question')
    expect(isThreadable(mod, index)).toBe(true)
    const tree = buildMessageTree(all, effectiveParentId)
    expect(tree.map(i => [i.msg.message_id, i.depth])).toEqual([['a', 0], ['b', 1], ['m', 2]])
  })

  it('groups by the original subject when the punished message is not loaded', () => {
    const index = buildMessageIndex([mod])
    expect(conversationKey(mod, index)).toBe('subject:Question')
    expect(conversationSubject(mod, index)).toBe('Question')
    expect(isThreadable(mod, index)).toBe(true)
  })
})

describe('threads toggle: groupThreads false (#287)', () => {
  const root = msg('a', null, ':0:1', 'Question', 'root body')
  const reply = msg('b', 'a', ':0:2', 'Re: Question', 'reply body')
  const noSubject = { message_id: 'w', sender_address: ':0:0', timestamp: 300, data: JSON.stringify({ message: 'Welcome' }) }

  it('keeps a flat list: no separators, no indentation, threads still openable', () => {
    const items = buildFeedItems([reply, root, noSubject], undefined, { groupThreads: false })
    const by = Object.fromEntries(items.map(i => [i.message_id, i._feed]))
    expect(by.a.startsConversation).toBe(false)
    expect(by.b.startsConversation).toBe(false)
    expect(by.a.depth).toBe(0)
    expect(by.b.depth).toBe(0)
    expect(by.a.conversationSubject).toBe('')
    // "Open thread" stays available while grouping is off.
    expect(by.a.hasThread).toBe(true)
    expect(by.b.hasThread).toBe(true)
    expect(by.w.hasThread).toBe(false)
  })
})

describe('markQuoteBlock (#283)', () => {
  it('marks the leading FIDO quote block as a markdown quote', () => {
    const body = 'АБ> Привет\nАБ> как дела?\n\nМой ответ'
    const out = markQuoteBlock(body)
    expect(out).toBe('> АБ> Привет\n> АБ> как дела?\n\nМой ответ')
  })

  it('leaves bodies without a leading quote untouched', () => {
    const body = 'Просто текст\nАБ> цитата в середине'
    expect(markQuoteBlock(body)).toBe(body)
  })

  it('does not touch existing markdown quotes', () => {
    const body = '> обычная цитата\n\nтекст'
    expect(markQuoteBlock(body)).toBe(body)
  })

  it('renders the quote block as a blockquote', () => {
    const html = renderMarkdown('АБ> Привет\n\nОтвет')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('Привет')
    expect(html).toContain('Ответ')
  })
})
