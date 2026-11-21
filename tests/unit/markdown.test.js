import { describe, it, expect } from 'vitest'
import { unreferencedAttachments, renderMarkdown, parseAttachmentRef, splitBundleSlots } from '../../src/utils/markdown'

const atts = [
  { name: 'a.png', type: 'image/png', size: 10 },
  { name: 'b.pdf', type: 'application/pdf', size: 20 },
  { name: 'c.png', type: 'image/png', size: 30 },
]

describe('unreferencedAttachments', () => {
  it('returns all attachments when text has no attachment refs', () => {
    const out = unreferencedAttachments('plain text ![x](http://a) [y](http://b)', atts)
    expect(out).toHaveLength(3)
  })

  it('drops attachments referenced inline via attachment:N (link and image)', () => {
    const text = 'See ![a.png](attachment:0) and [b.pdf](attachment:1)'
    const out = unreferencedAttachments(text, atts)
    expect(out.map(a => a.name)).toEqual(['c.png'])
  })

  it('drops multiple references of the same index only once', () => {
    const text = '![a](attachment:0) and again ![a](attachment:0)'
    const out = unreferencedAttachments(text, atts)
    expect(out.map(a => a.name)).toEqual(['b.pdf', 'c.png'])
  })

  it('returns empty when all attachments are referenced', () => {
    const text = '[a](attachment:0) [b](attachment:1) [c](attachment:2)'
    const out = unreferencedAttachments(text, atts)
    expect(out).toHaveLength(0)
  })

  it('handles empty / missing text and attachments', () => {
    expect(unreferencedAttachments('', atts)).toHaveLength(3)
    expect(unreferencedAttachments('text', null)).toEqual([])
    expect(unreferencedAttachments('text', [])).toEqual([])
    expect(unreferencedAttachments('attachment:0', undefined)).toEqual([])
  })

  it('ignores out-of-range indices', () => {
    const out = unreferencedAttachments('[x](attachment:9)', atts)
    expect(out).toHaveLength(3)
  })

  it('does not mutate the input array', () => {
    const orig = atts.map(a => a.name)
    unreferencedAttachments('[a](attachment:0)', atts)
    expect(atts.map(a => a.name)).toEqual(orig)
  })
})

describe('renderMarkdown message-scoped attachment refs (#268)', () => {
  const png = { name: 'img.png', type: 'image/png', data: 'data:image/png;base64,AAAA' }
  const pdf = { name: 'f.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,BBBB' }
  const other = [png, pdf]
  const resolver = (messageId) => (messageId === 'MSG_1' ? other : null)

  it('resolves refs scoped to another message via the resolver', () => {
    const html = renderMarkdown('see ![img](attachment:MSG_1:0)', null, resolver)
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('resolves scoped links with a download name', () => {
    const html = renderMarkdown('[doc](attachment:MSG_1:1)', null, resolver)
    expect(html).toContain('href="data:application/pdf;base64,BBBB"')
    expect(html).toContain('download="f.pdf"')
  })

  it('keeps plain refs working next to scoped ones', () => {
    const own = [{ name: 'own.png', type: 'image/png', data: 'data:image/png;base64,OWN' }]
    const html = renderMarkdown('![own](attachment:0) ![other](attachment:MSG_1:0)', own, resolver)
    expect(html).toContain('src="data:image/png;base64,OWN"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('leaves an unresolved scoped ref untouched', () => {
    const html = renderMarkdown('![x](attachment:UNKNOWN:0)', null, resolver)
    expect(html).toContain('src="attachment:UNKNOWN:0"')
  })

  it('leaves scoped refs untouched without a resolver', () => {
    const html = renderMarkdown('![x](attachment:MSG_1:0)')
    expect(html).toContain('src="attachment:MSG_1:0"')
  })
})

// ---------------------------------------------------------------------------
// JSON attachments (#306)
// ---------------------------------------------------------------------------

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function jsonAttachment(value, name = 'selected-messages.json') {
  return { name, type: 'application/json', size: 1, data: `data:application/json;base64,${utf8Base64(value)}` }
}

function jwsWithPayload(payload) {
  const b64 = utf8Base64(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `header.${b64}.sig`
}

const jsonLabels = { bundleTitle: 'Selected', showContent: 'Show content', noSubject: '(no subject)', rawLabel: 'Source', echoLabel: 'Echo' }

describe('JSON attachments rendering (#306)', () => {
  it('renders a selected-messages bundle as a component slot', () => {
    const bundle = {
      type: 'fm-selected-messages',
      version: 1,
      generated_at: 1,
      messages: [{
        message_id: 'm1',
        echo_id: 4,
        echo_name: 'Newcomers',
        type: 'echomail',
        sender_address: ':0:7',
        timestamp: 1700000000,
        jws: jwsWithPayload({ subject: 'Привет', body: 'тело сообщения', sender_name: 'Иван' }),
      }],
    }
    const html = renderMarkdown('[m1.json](attachment:0)', [jsonAttachment(bundle)], null, jsonLabels)

    // The bundle is rendered by the BundleMessages component at the slot
    expect(html).toContain('fm-bundle-slot')
    expect(html).toContain('data-fm-bundle-ref="0"')
    // The original download link is gone
    expect(html).not.toContain('href="attachment:0"')
  })

  it('leaves bundle links when nesting is too deep (labels.bundles = false)', () => {
    const bundle = { type: 'fm-selected-messages', version: 1, messages: [{ message_id: 'm1', jws: jwsWithPayload({ subject: 'Hi' }) }] }
    const html = renderMarkdown('[m1.json](attachment:0)', [jsonAttachment(bundle)], null, { ...jsonLabels, bundles: false })
    expect(html).not.toContain('fm-bundle-slot')
    expect(html).toContain('href="data:application/json;base64,')
  })

  it('renders any other JSON as a pretty-printed collapsible block', () => {
    const html = renderMarkdown('[data.json](attachment:0)', [jsonAttachment({ a: 1, b: [2, 3] }, 'data.json')], null, jsonLabels)
    expect(html).toContain('data.json')
    expect(html).toContain('&quot;a&quot;: 1')
    expect(html).toContain('<details>')
  })

  it('keeps non-JSON attachments as normal download links', () => {
    const att = { name: 'doc.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,AAAA' }
    const html = renderMarkdown('[doc.pdf](attachment:0)', [att], null, jsonLabels)
    expect(html).toContain('href="data:application/pdf;base64,AAAA"')
    expect(html).toContain('download="doc.pdf"')
    expect(html).not.toContain('fm-json-bundle')
  })

  it('resolves JSON attachments through the scoped resolver (quotes)', () => {
    const bundle = { type: 'fm-selected-messages', version: 1, messages: [{ message_id: 'm9', jws: jwsWithPayload({ subject: 'Quoted' }) }] }
    const resolver = (messageId) => (messageId === 'MSG_1' ? [jsonAttachment(bundle)] : null)
    const html = renderMarkdown('[b.json](attachment:MSG_1:0)', null, resolver, jsonLabels)
    expect(html).toContain('data-fm-bundle-ref="MSG_1:0"')
  })

  it('leaves broken JSON payloads untouched as a link', () => {
    const att = { name: 'bad.json', type: 'application/json', data: 'data:application/json;base64,bm90IGpzb24=' }
    const html = renderMarkdown('[bad.json](attachment:0)', [att], null, jsonLabels)
    // Invalid JSON still renders as a collapsible block with the raw text
    expect(html).toContain('fm-json-bundle')
    expect(html).toContain('not json')
  })
})

describe('splitBundleSlots (#306)', () => {
  it('splits HTML around bundle slots', () => {
    const segments = splitBundleSlots('<p>before</p><div class="fm-bundle-slot" data-fm-bundle-ref="0"></div><p>after</p>')
    expect(segments).toHaveLength(3)
    expect(segments[0].html).toContain('before')
    expect(segments[1]).toEqual({ ref: '0' })
    expect(segments[2].html).toContain('after')
  })

  it('returns a single HTML segment without slots', () => {
    expect(splitBundleSlots('<p>plain</p>')).toEqual([{ html: '<p>plain</p>' }])
  })
})

describe('attachment selection buttons (#306)', () => {
  it('parses plain and scoped attachment refs', () => {
    expect(parseAttachmentRef('2', 'MSG')).toEqual({ messageId: 'MSG', index: 2 })
    expect(parseAttachmentRef('OTHER:3', 'MSG')).toEqual({ messageId: 'OTHER', index: 3 })
    expect(parseAttachmentRef('nope', 'MSG')).toBeNull()
  })

  it('renders a select button with the attachment ref in JSON blocks', () => {
    const att = { name: 'd.json', type: 'application/json', data: 'data:application/json;base64,eyJhIjoxfQ==' }
    const html = renderMarkdown('[d.json](attachment:0)', [att], null, jsonLabels)
    expect(html).toContain('data-fm-attachment="0"')
    expect(html).toContain('fm-json-select')
  })

  it('renders the select button with a scoped ref for quoted JSON', () => {
    const att = { name: 'd.json', type: 'application/json', data: 'data:application/json;base64,eyJhIjoxfQ==' }
    const resolver = (id) => (id === 'MSG_1' ? [att] : null)
    const html = renderMarkdown('[d.json](attachment:MSG_1:0)', null, resolver, jsonLabels)
    expect(html).toContain('data-fm-attachment="MSG_1:0"')
  })

  it('collapses long data: URIs inside JSON block content into copy chips (#316)', () => {
    const inner = JSON.stringify({ file: 'data:image/png;base64,' + 'A'.repeat(400) })
    const att = { name: 'd.json', type: 'application/json', data: 'data:application/json;base64,' + btoa(inner) }
    const html = renderMarkdown('[d.json](attachment:0)', [att], null, jsonLabels)
    expect(html).toContain('fm-data-chip')
    expect(html).toContain('📋 image/png · 300 B')
  })

  it('does not add select buttons for non-JSON attachments', () => {
    const att = { name: 'a.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,AAAA' }
    const html = renderMarkdown('[a.pdf](attachment:0)', [att], null, jsonLabels)
    expect(html).not.toContain('fm-json-select')
  })
})
