import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import MarkdownRenderer from '../../src/components/MarkdownRenderer.vue'
import { useSettingsStore } from '../../src/stores/settings'
import { useSelectedMessages } from '../../src/composables/useSelectedMessages'
import en from '../../src/i18n/locales/en.json'
import { appBasePath } from '../../src/utils/appBase'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function jsonAttachment(value, name = 'bundle.json') {
  return { name, type: 'application/json', size: 1, data: `data:application/json;base64,${utf8Base64(value)}` }
}

function jwsWithPayload(payload) {
  const b64 = utf8Base64(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `header.${b64}.sig`
}

function bundleAttachment(messages, name = 'bundle.json') {
  return jsonAttachment({ type: 'fm-selected-messages', version: 1, generated_at: 1, messages }, name)
}

async function mountBody(content, attachments) {
  const wrapper = mount(MarkdownRenderer, {
    props: { content, attachments, messageId: 'outer-1' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  await new Promise(r => setTimeout(r, 60))
  return wrapper
}

describe('selected-message bundle cards (#306)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useSelectedMessages().clear()
  })

  it('renders a wire message as a regular card with meta, body and raw', async () => {
    const bundle = bundleAttachment([{
      message_id: 'm1',
      echo_id: 4,
      echo_name: 'Newcomers',
      type: 'echomail',
      sender_address: ':0:7',
      timestamp: 1700000000,
      jws: jwsWithPayload({ subject: 'Привет', body: '**тело** сообщения', sender_name: 'Иван', tagline: '— Иван' }),
    }])
    const wrapper = await mountBody('[m1.json](attachment:0)', [bundle])

    expect(wrapper.text()).toContain('Привет')
    expect(wrapper.text()).toContain('Иван (:0:7)')
    expect(wrapper.text()).toContain('Echo: Newcomers')
    // Body renders as markdown (bold), not as a raw pre block
    expect(wrapper.find('.markdown-content strong').exists()).toBe(true)
    expect(wrapper.text()).toContain('... — Иван')
    // The link is built on the runtime deployment base (jsdom: "/", #337)
    expect(wrapper.find(`a[href="${appBasePath()}echoes/4/m1"]`).exists()).toBe(true)
    // Raw source block
    const raw = wrapper.find('details.fm-json-raw')
    expect(raw.exists()).toBe(true)
    expect(raw.text()).toContain('"message_id": "m1"')
    expect(raw.text()).toContain('"subject": "Привет"')
  })

  it('renders a blog post from plain data (no JWS) with its attachments', async () => {
    const image = { name: 'pic.png', type: 'image/png', size: 3, data: 'data:image/png;base64,AAAA' }
    const bundle = bundleAttachment([{
      message_id: 'blog_1_ab',
      echo_name: 'My blog',
      type: 'echomail',
      sender_address: '',
      timestamp: 1700000200,
      data: JSON.stringify({
        subject: 'Blog title',
        body: 'Blog body text ![pic.png](attachment:0)',
        attachments: [image],
      }),
    }])
    const wrapper = await mountBody('[blog.json](attachment:0)', [bundle])

    expect(wrapper.text()).toContain('Blog title')
    expect(wrapper.text()).toContain('Blog body text')
    expect(wrapper.text()).toContain('Echo: My blog')
    // The blog's image renders inline from the bundled attachments
    expect(wrapper.find('img[src="data:image/png;base64,AAAA"]').exists()).toBe(true)
    // No sender line for a blog post
    expect(wrapper.find('.fm-json-message-meta').text().startsWith('Echo:')).toBe(true)
  })

  it('prefers data over the JWS payload (decrypted netmail)', async () => {
    const bundle = bundleAttachment([{
      message_id: 'n1',
      echo_name: '__netmail__',
      type: 'netmail',
      sender_address: ':0:9',
      timestamp: 1700000300,
      jws: jwsWithPayload({ jwe_sha256: 'abc' }),
      data: JSON.stringify({ subject: 'Netmail subject', body: 'netmail body' }),
    }])
    const wrapper = await mountBody('[n1.json](attachment:0)', [bundle])

    expect(wrapper.text()).toContain('Netmail subject')
    expect(wrapper.text()).toContain('netmail body')
  })

  it('shows unreferenced bundled attachments in a gallery without select buttons', async () => {
    const file = { name: 'doc.pdf', type: 'application/pdf', size: 10, data: 'data:application/pdf;base64,AAAA' }
    const bundle = bundleAttachment([{
      message_id: 'm2',
      echo_name: 'Newcomers',
      type: 'echomail',
      sender_address: ':0:7',
      timestamp: 1700000000,
      jws: jwsWithPayload({ subject: 'With file', body: 'see attached' }),
      attachments: undefined,
    }])
    // Attachment inside the payload
    bundle.data = `data:application/json;base64,${utf8Base64({
      type: 'fm-selected-messages', version: 1, generated_at: 1,
      messages: [{
        message_id: 'm2', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:7', timestamp: 1700000000,
        jws: jwsWithPayload({ subject: 'With file', body: 'see attached', attachments: [file] }),
      }],
    })}`
    const wrapper = await mountBody('[m2.json](attachment:0)', [bundle])

    const gallery = wrapper.find('.attachments-gallery')
    expect(gallery.exists()).toBe(true)
    expect(gallery.text()).toContain('PDF')
    expect(gallery.find('button[title="Add attachment to selected"]').exists()).toBe(false)
  })

  it('renders a legacy multi-message bundle with the list title', async () => {
    const bundle = bundleAttachment([
      { message_id: 'a', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:1', timestamp: 1700000000, jws: jwsWithPayload({ subject: 'First' }) },
      { message_id: 'b', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:2', timestamp: 1700000100, jws: jwsWithPayload({ subject: 'Second' }) },
    ])
    const wrapper = await mountBody('[bundle.json](attachment:0)', [bundle])

    expect(wrapper.text()).toContain('Selected (2)')
    expect(wrapper.findAll('.fm-json-message')).toHaveLength(2)
    expect(wrapper.text()).toContain('First')
    expect(wrapper.text()).toContain('Second')
  })

  it('hides the tearline unless enabled in the settings', async () => {
    const bundle = bundleAttachment([{
      message_id: 'm1', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:7', timestamp: 1700000000,
      jws: jwsWithPayload({ subject: 'Hi', body: 'body', tagline: '— Ivan', tearline: 'fm-app v1.2.3 :0:1' }),
    }])
    let wrapper = await mountBody('[b.json](attachment:0)', [bundle])
    expect(wrapper.text()).not.toContain('--- fm-app v1.2.3')

    useSettingsStore().userProfile.showTearline = true
    wrapper = await mountBody('[b.json](attachment:0)', [bundle])
    expect(wrapper.text()).toContain('--- fm-app v1.2.3 :0:1')
  })

  it('escapes HTML from the bundled content', async () => {
    const bundle = bundleAttachment([{
      message_id: 'm1', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:7', timestamp: 1700000000,
      jws: jwsWithPayload({ subject: '<script>alert(1)</script>', body: 'x' }),
    }])
    const wrapper = await mountBody('[b.json](attachment:0)', [bundle])
    expect(wrapper.html()).not.toContain('<script>alert(1)</script>')
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
  })

  it('offers the bundle select button with the outer attachment ref', async () => {
    const bundle = bundleAttachment([{
      message_id: 'm1', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:7', timestamp: 1700000000,
      jws: jwsWithPayload({ subject: 'Hi' }),
    }])
    const wrapper = await mountBody('[b.json](attachment:0)', [bundle])

    const button = wrapper.find('.fm-json-bundle-title button.fm-json-select')
    expect(button.exists()).toBe(true)
    await button.trigger('click')

    const events = wrapper.emitted('select-attachment')
    expect(events).toBeTruthy()
    expect(events[0][0]).toMatchObject({ ref: '0', messageId: 'outer-1', index: 0 })
    expect(events[0][0].attachment.name).toBe('bundle.json')
    expect(events[0][0].attachment.type).toBe('application/json')
  })

  it('renders bundles nested inside a bundled message (depth limited)', async () => {
    const inner = bundleAttachment([{
      message_id: 'inner1', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:3', timestamp: 1700000000,
      jws: jwsWithPayload({ subject: 'Inner subject' }),
    }], 'inner.json')
    const outer = bundleAttachment([{
      message_id: 'outer1', echo_name: 'Newcomers', type: 'echomail', sender_address: ':0:2', timestamp: 1700000100,
      jws: jwsWithPayload({ subject: 'Outer subject', body: '[inner.json](attachment:0)', attachments: [inner] }),
    }], 'outer.json')
    const wrapper = await mountBody('[outer.json](attachment:0)', [outer])

    expect(wrapper.text()).toContain('Outer subject')
    expect(wrapper.text()).toContain('Inner subject')
  })
})
